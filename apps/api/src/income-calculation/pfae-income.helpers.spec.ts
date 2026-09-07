import { Prisma } from '../generated/prisma/client';
import {
  assembleMonths,
  chooseSource,
  resolveActivity,
  smooth,
  taxMonthly,
} from './pfae-income.helpers';
import type { BankIncomeBase, IncomeBase } from './income-calculation.types';

function month(monthKey: string, total: number) {
  return { monthKey, total: new Prisma.Decimal(total) };
}

function bankStatement(opts: {
  start?: string | null;
  end?: string | null;
  incomplete?: boolean;
  income?: number;
}) {
  return {
    statementPeriod: {
      periodStartDate: opts.start ?? null,
      periodEndDate: opts.end ?? null,
      isCurrentIncompleteMonth: opts.incomplete ?? false,
    },
    financialDepuration: {
      depurationSummary: {
        totalValidIncome: opts.income ?? 0,
      },
    },
  };
}

function validBank(overrides: Partial<BankIncomeBase> = {}): BankIncomeBase {
  return {
    valid: true,
    invalidReason: null,
    monthlyGross: 15000,
    monthlyNet: 15000,
    windowMonths: 6,
    monthsUsed: ['2024-02', '2024-03', '2024-04', '2024-05'],
    droppedMax: '2024-06',
    droppedMin: '2024-01',
    ...overrides,
  };
}

function validTax(overrides: Partial<IncomeBase> = {}): IncomeBase {
  return {
    valid: true,
    invalidReason: null,
    monthlyGross: 20000,
    monthlyNet: 10000,
    ...overrides,
  };
}

describe('smooth', () => {
  it('six-month window drops max and min: [10,12,14,16,18,100] → 15, not 28.33', () => {
    const result = smooth(
      [
        month('2024-01', 10),
        month('2024-02', 12),
        month('2024-03', 14),
        month('2024-04', 16),
        month('2024-05', 18),
        month('2024-06', 100),
      ],
      6,
    );

    expect(result.valid).toBe(true);
    expect(result.monthlyNet).toBe(15);
    expect(result.monthlyGross).toBe(15);
    expect(result.monthlyNet).not.toBeCloseTo(28.33, 1);
    expect(result.droppedMin).toBe('2024-01');
    expect(result.droppedMax).toBe('2024-06');
    expect(result.monthsUsed).toEqual([
      '2024-02',
      '2024-03',
      '2024-04',
      '2024-05',
    ]);
  });

  it('twelve-month window drops max and min: [1..11,100] → 6.5, not 13.83', () => {
    const months = [
      month('2024-01', 1),
      month('2024-02', 2),
      month('2024-03', 3),
      month('2024-04', 4),
      month('2024-05', 5),
      month('2024-06', 6),
      month('2024-07', 7),
      month('2024-08', 8),
      month('2024-09', 9),
      month('2024-10', 10),
      month('2024-11', 11),
      month('2024-12', 100),
    ];

    const result = smooth(months, 12);

    expect(result.valid).toBe(true);
    expect(result.monthlyNet).toBe(6.5);
    expect(result.monthlyGross).toBe(6.5);
    expect(result.monthlyNet).not.toBeCloseTo(13.83, 1);
    expect(result.droppedMin).toBe('2024-01');
    expect(result.droppedMax).toBe('2024-12');
    expect(result.windowMonths).toBe(12);
  });

  it('short window is INVALID with INSUFFICIENT_MONTHS when unique months < N', () => {
    const result = smooth(
      [
        month('2024-01', 10),
        month('2024-02', 12),
        month('2024-03', 14),
        month('2024-04', 16),
        month('2024-05', 18),
      ],
      6,
    );

    expect(result.valid).toBe(false);
    expect(result.invalidReason).toBe('INSUFFICIENT_MONTHS');
    expect(result.monthlyGross).toBeNull();
    expect(result.monthlyNet).toBeNull();
    expect(result.monthsUsed).toEqual([]);
    expect(result.droppedMax).toBeNull();
    expect(result.droppedMin).toBeNull();
    expect(result.windowMonths).toBe(6);
  });

  it('uses the most recent N months when more than N unique months exist', () => {
    const result = smooth(
      [
        month('2023-11', 1),
        month('2023-12', 1),
        month('2024-01', 10),
        month('2024-02', 12),
        month('2024-03', 14),
        month('2024-04', 16),
        month('2024-05', 18),
        month('2024-06', 100),
      ],
      6,
    );

    expect(result.valid).toBe(true);
    expect(result.monthlyNet).toBe(15);
    expect(result.droppedMin).toBe('2024-01');
    expect(result.droppedMax).toBe('2024-06');
  });

  it('tie-breaks min/max by monthKey ASC so duplicate totals drop exactly one each', () => {
    const result = smooth(
      [
        month('2024-01', 10),
        month('2024-02', 10),
        month('2024-03', 14),
        month('2024-04', 16),
        month('2024-05', 100),
        month('2024-06', 100),
      ],
      6,
    );

    expect(result.valid).toBe(true);
    expect(result.droppedMin).toBe('2024-01');
    expect(result.droppedMax).toBe('2024-06');
    expect(result.monthsUsed).toEqual([
      '2024-02',
      '2024-03',
      '2024-04',
      '2024-05',
    ]);
    expect(result.monthlyNet).toBe(35);
  });
});

describe('assembleMonths', () => {
  it('keys by YYYY-MM of periodStartDate and sums totalValidIncome per month', () => {
    const months = assembleMonths([
      bankStatement({ start: '2024-03-01', income: 10 }),
      bankStatement({ start: '2024-03-15', income: 5 }),
      bankStatement({ start: '2024-04-01', income: 20 }),
    ]);

    expect(months).toHaveLength(2);
    expect(months[0].monthKey).toBe('2024-03');
    expect(months[0].total.toNumber()).toBe(15);
    expect(months[1].monthKey).toBe('2024-04');
    expect(months[1].total.toNumber()).toBe(20);
  });

  it('falls back to periodEndDate when periodStartDate is missing', () => {
    const months = assembleMonths([
      bankStatement({ start: null, end: '2024-05-31', income: 40 }),
    ]);

    expect(months).toHaveLength(1);
    expect(months[0].monthKey).toBe('2024-05');
    expect(months[0].total.toNumber()).toBe(40);
  });

  it('skips statements flagged isCurrentIncompleteMonth', () => {
    const months = assembleMonths([
      bankStatement({ start: '2024-05-01', income: 40 }),
      bankStatement({ start: '2024-06-01', income: 99, incomplete: true }),
    ]);

    expect(months).toHaveLength(1);
    expect(months[0].monthKey).toBe('2024-05');
  });
});

describe('resolveActivity', () => {
  it('selects N=12 when the resolved CSF activity matches restaurantero', () => {
    const result = resolveActivity([
      {
        order: 1,
        description: 'Servicios de restaurantero y similar',
        percentage: 80,
        endDate: null,
      },
    ]);

    expect(result.windowMonths).toBe(12);
    expect(result.matchedKeyword).toBe('restaurantero');
    expect(result.description).toBe('Servicios de restaurantero y similar');
  });

  it('selects N=6 for a generic activity without 12-month keywords', () => {
    const result = resolveActivity([
      {
        order: 1,
        description: 'Consultorios de medicina especializada',
        percentage: 70,
        endDate: null,
      },
    ]);

    expect(result.windowMonths).toBe(6);
    expect(result.matchedKeyword).toBeNull();
    expect(result.description).toBe(
      'Consultorios de medicina especializada',
    );
  });

  it('selects N=12 for primaria and alimentos-y-bebidas keywords', () => {
    const primaria = resolveActivity([
      {
        order: 1,
        description: 'Educación primaria particular',
        percentage: 100,
        endDate: null,
      },
    ]);
    expect(primaria.windowMonths).toBe(12);
    expect(primaria.matchedKeyword).toBe('primaria');

    const alimentos = resolveActivity([
      {
        order: 1,
        description: 'Preparación de alimentos y bebidas',
        percentage: 100,
        endDate: null,
      },
    ]);
    expect(alimentos.windowMonths).toBe(12);
    expect(alimentos.matchedKeyword).toBe('alimentos y bebidas');
  });

  it('selects N=12 when the resolved CSF activity is cultivo', () => {
    const result = resolveActivity([
      {
        order: 1,
        description: 'cultivo de hortalizas',
        percentage: 100,
        endDate: null,
      },
    ]);

    expect(result.windowMonths).toBe(12);
    expect(result.matchedKeyword).toBe('cultivo');
    expect(result.description).toBe('cultivo de hortalizas');
  });

  it('strips NFD marks so ganadería matches ganaderia (N=12)', () => {
    const result = resolveActivity([
      {
        order: 1,
        description: 'Cría y explotación de ganadería bovina',
        percentage: 100,
        endDate: null,
      },
    ]);

    expect(result.windowMonths).toBe(12);
    expect(result.matchedKeyword).toBe('ganaderia');
    expect(result.description).toBe('Cría y explotación de ganadería bovina');
  });

  it('selects N=12 for pecuario, pesca, agrícola, and restaurante synonyms', () => {
    const pecuario = resolveActivity([
      {
        order: 1,
        description: 'Explotación pecuario independiente',
        percentage: 100,
        endDate: null,
      },
    ]);
    expect(pecuario.windowMonths).toBe(12);
    expect(pecuario.matchedKeyword).toBe('pecuario');

    const pesca = resolveActivity([
      {
        order: 1,
        description: 'Pesca de camarón en altamar',
        percentage: 100,
        endDate: null,
      },
    ]);
    expect(pesca.windowMonths).toBe(12);
    expect(pesca.matchedKeyword).toBe('pesca');

    const agricola = resolveActivity([
      {
        order: 1,
        description: 'Actividad agrícola de temporal',
        percentage: 100,
        endDate: null,
      },
    ]);
    expect(agricola.windowMonths).toBe(12);
    expect(agricola.matchedKeyword).toBe('agricola');

    const restaurante = resolveActivity([
      {
        order: 1,
        description: 'Servicios de restaurante de comida corrida',
        percentage: 100,
        endDate: null,
      },
    ]);
    expect(restaurante.windowMonths).toBe(12);
    expect(restaurante.matchedKeyword).toBe('restaurante');
  });

  it('uses the active activity with highest percentage; tie → lower order', () => {
    const result = resolveActivity([
      {
        order: 2,
        description: 'Actividad B restaurantero',
        percentage: 50,
        endDate: null,
      },
      {
        order: 1,
        description: 'Actividad A genérica',
        percentage: 50,
        endDate: null,
      },
      {
        order: 3,
        description: 'Actividad cerrada primaria',
        percentage: 90,
        endDate: '2023-12-31',
      },
    ]);

    expect(result.order).toBe(1);
    expect(result.description).toBe('Actividad A genérica');
    expect(result.percentage).toBe(50);
    expect(result.windowMonths).toBe(6);
    expect(result.matchedKeyword).toBeNull();
  });
});

describe('taxMonthly', () => {
  it('converts fiscalProfit/12 to net and accumulableIncomeTotal/12 to gross', () => {
    const result = taxMonthly({
      fiscalResult: {
        fiscalProfit: 120000,
        accumulableIncomeTotal: 240000,
      },
      hasTaxLoss: false,
    });

    expect(result.valid).toBe(true);
    expect(result.monthlyNet).toBe(10000);
    expect(result.monthlyGross).toBe(20000);
    expect(result.invalidReason).toBeNull();
  });

  it('triangulates a different fiscal year: 60000 / 120000 → 5000 net, 10000 gross', () => {
    const result = taxMonthly({
      fiscalResult: {
        fiscalProfit: 60000,
        accumulableIncomeTotal: 120000,
      },
      hasTaxLoss: false,
    });

    expect(result.monthlyNet).toBe(5000);
    expect(result.monthlyGross).toBe(10000);
  });

  it('marks the tax base INVALID with TAX_LOSS when hasTaxLoss is true', () => {
    const result = taxMonthly({
      fiscalResult: {
        fiscalProfit: 0,
        accumulableIncomeTotal: 240000,
      },
      hasTaxLoss: true,
    });

    expect(result.valid).toBe(false);
    expect(result.invalidReason).toBe('TAX_LOSS');
    expect(result.monthlyGross).toBeNull();
    expect(result.monthlyNet).toBeNull();
  });
});

describe('chooseSource', () => {
  it('defaults to BANK_STATEMENTS when the bank base is valid', () => {
    expect(chooseSource(validBank(), validTax())).toBe('BANK_STATEMENTS');
  });

  it('falls back to TAX_RETURN when bank is invalid and tax is valid', () => {
    const bank = validBank({
      valid: false,
      invalidReason: 'INSUFFICIENT_MONTHS',
      monthlyGross: null,
      monthlyNet: null,
    });
    expect(chooseSource(bank, validTax())).toBe('TAX_RETURN');
  });

  it('returns null when both bases are invalid', () => {
    const bank = validBank({
      valid: false,
      invalidReason: 'INSUFFICIENT_MONTHS',
      monthlyGross: null,
      monthlyNet: null,
    });
    const tax = validTax({
      valid: false,
      invalidReason: 'TAX_LOSS',
      monthlyGross: null,
      monthlyNet: null,
    });
    expect(chooseSource(bank, tax)).toBeNull();
  });
});
