import { Prisma } from '../generated/prisma/client';
import type { BankIncomeBase, IncomeBase } from './income-calculation.types';
import {
  calculatePmCapacities,
  pmTaxBase,
  resolvePmSantanderFactor,
  smoothCompanyDeposits,
} from './pm-capacity';
import type { CompanyStatementMonth } from './pm-company-statements';

/**
 * Six company months that smooth to the filled Excel average 11,183,203.42.
 * Min 7,800,000 and max 14,780,000 drop. The kept fourth month is the
 * remainder that makes the mean exact (the plan rounds 10.61M).
 */
const FIXTURE_MONTHS: CompanyStatementMonth[] = [
  month('2026-01', 11_940_000),
  month('2026-02', 12_710_000),
  month('2026-03', 7_800_000),
  month('2026-04', 9_480_000),
  month('2026-05', 14_780_000),
  month('2026-06', 10_602_813.68),
];

const PM_DEBT = 17_971.92;
const PF_DEBT = 157_423.88;
const ACCUMULABLE = 99_791_348.16;

function month(monthKey: string, validIncome: number): CompanyStatementMonth {
  return {
    monthKey,
    validIncome,
    validDepositCount: 5,
    statementCount: 1,
  };
}

function calculatedBank(monthly: number): BankIncomeBase {
  return {
    valid: true,
    invalidReason: null,
    monthlyGross: monthly,
    monthlyNet: monthly,
    windowMonths: 6,
    monthsUsed: ['2026-01', '2026-02', '2026-04', '2026-06'],
    droppedMax: '2026-05',
    droppedMin: '2026-03',
  };
}

function invalidBank(): BankIncomeBase {
  return {
    valid: false,
    invalidReason: 'INSUFFICIENT_MONTHS',
    monthlyGross: null,
    monthlyNet: null,
    windowMonths: 6,
    monthsUsed: [],
    droppedMax: null,
    droppedMin: null,
  };
}

describe('PM capacity fixture', () => {
  const bank = smoothCompanyDeposits(FIXTURE_MONTHS, 6);
  const tax = pmTaxBase({
    fiscalResult: { accumulableIncomeTotal: ACCUMULABLE, fiscalProfit: 1 },
    hasTaxLoss: false,
  });

  it('smooths the company deposits to 11,183,203.42', () => {
    expect(bank.valid).toBe(true);
    expect(bank.monthlyGross).toBe(11_183_203.42);
    expect(bank.droppedMin).toBe('2026-03');
    expect(bank.droppedMax).toBe('2026-05');
  });

  it('reproduces Santander statement and tax capacities', () => {
    const result = calculatePmCapacities({
      bank,
      tax,
      depositGateViable: true,
      activityDescription: 'Servicios',
      sharePercentage: 50,
      pmMonthlyDebt: PM_DEBT,
      pfMonthlyDebt: PF_DEBT,
    });

    expect(result.activityFactor).toBe(0.5);
    expect(result.santanderStatements).toEqual({
      status: 'CALCULATED',
      reason: null,
      admissibleIncome: 2_795_800.86,
      incomeToConsider: 2_777_828.94,
      maximumDebt: 1_388_914.47,
      capacity: 1_231_490.59,
    });
    expect(result.santanderTaxReturn).toEqual({
      status: 'CALCULATED',
      reason: null,
      admissibleIncome: 2_078_986.42,
      incomeToConsider: 2_061_014.5,
      maximumDebt: 1_030_507.25,
      capacity: 873_083.37,
    });
    expect(result.scotiabank.status).toBe('CALCULATED');
    expect(result.scotiabank.capacity).toBe(2_079_216.8);
    expect(result.banorte).toMatchObject({
      status: 'REQUIRES_REVIEW',
      reason: 'BANORTE_PM_INCOME_OPEN',
      capacity: null,
    });
    expect(result.hsbc).toMatchObject({
      status: 'REQUIRES_REVIEW',
      reason: 'HSBC_PM_INCOME_OPEN',
      capacity: null,
    });
  });

  it('lets a 50% shareholder through Scotiabank', () => {
    const result = calculatePmCapacities({
      bank,
      tax,
      depositGateViable: true,
      activityDescription: 'Servicios',
      sharePercentage: 50,
      pmMonthlyDebt: PM_DEBT,
      pfMonthlyDebt: PF_DEBT,
    });

    expect(result.scotiabank.status).toBe('CALCULATED');
    expect(result.scotiabank.reason).toBeNull();
  });
});

describe('calculatePmCapacities gates', () => {
  const tax: IncomeBase = {
    valid: true,
    invalidReason: null,
    monthlyGross: 1000,
    monthlyNet: 1000,
  };
  const bank = calculatedBank(10_000);

  it('knocks out only the tax path on a fiscal loss', () => {
    const result = calculatePmCapacities({
      bank,
      tax: pmTaxBase({
        fiscalResult: { accumulableIncomeTotal: 12_000 },
        hasTaxLoss: true,
      }),
      depositGateViable: true,
      activityDescription: 'Servicios de consultoría',
      sharePercentage: 50,
      pmMonthlyDebt: 0,
      pfMonthlyDebt: 0,
    });

    expect(result.santanderTaxReturn).toMatchObject({
      status: 'NOT_VIABLE',
      reason: 'TAX_LOSS',
    });
    expect(result.santanderStatements.status).toBe('CALCULATED');
  });

  it('knocks out only Santander statements when a month has fewer than 5 deposits', () => {
    const result = calculatePmCapacities({
      bank,
      tax,
      depositGateViable: false,
      activityDescription: 'Servicios',
      sharePercentage: 50,
      pmMonthlyDebt: 0,
      pfMonthlyDebt: 100,
    });

    expect(result.santanderStatements).toMatchObject({
      status: 'NOT_VIABLE',
      reason: 'SANTANDER_DEPOSIT_MINIMUM',
    });
    expect(result.santanderTaxReturn.status).toBe('CALCULATED');
    expect(result.scotiabank.status).toBe('CALCULATED');
  });

  it('does not invent a Santander factor for an unmapped giro', () => {
    expect(resolvePmSantanderFactor('Comercio al por menor')).toBeNull();

    const result = calculatePmCapacities({
      bank,
      tax,
      depositGateViable: true,
      activityDescription: 'Comercio al por menor',
      sharePercentage: 50,
      pmMonthlyDebt: 0,
      pfMonthlyDebt: 0,
    });

    expect(result.santanderStatements.reason).toBe('ACTIVITY_UNMAPPED');
    expect(result.santanderTaxReturn.reason).toBe('ACTIVITY_UNMAPPED');
    expect(result.scotiabank.status).toBe('CALCULATED');
  });

  it('asks for company debt before subtracting it on Santander', () => {
    const result = calculatePmCapacities({
      bank,
      tax,
      depositGateViable: true,
      activityDescription: 'Servicios',
      sharePercentage: 50,
      pmMonthlyDebt: null,
      pfMonthlyDebt: 0,
    });

    expect(result.santanderStatements.reason).toBe('MISSING_COMPANY_DEBT');
    expect(result.scotiabank.status).toBe('CALCULATED');
  });

  it('does not calculate statement paths without a full window', () => {
    const result = calculatePmCapacities({
      bank: invalidBank(),
      tax,
      depositGateViable: false,
      activityDescription: 'Servicios',
      sharePercentage: 50,
      pmMonthlyDebt: 0,
      pfMonthlyDebt: 0,
    });

    expect(result.santanderStatements.reason).toBe('INSUFFICIENT_MONTHS');
    expect(result.scotiabank.reason).toBe('INSUFFICIENT_MONTHS');
    expect(result.santanderTaxReturn.status).toBe('CALCULATED');
  });
});

describe('pmTaxBase', () => {
  it('uses accumulable income divided by 12', () => {
    const base = pmTaxBase({
      fiscalResult: {
        fiscalProfit: 12,
        accumulableIncomeTotal: ACCUMULABLE,
      },
      hasTaxLoss: false,
    });

    expect(base.monthlyGross).toBe(
      Number(new Prisma.Decimal(ACCUMULABLE).div(12).toDecimalPlaces(2)),
    );
    expect(base.monthlyGross).not.toBe(1);
  });
});
