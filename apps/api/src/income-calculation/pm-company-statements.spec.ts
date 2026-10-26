import { NotFoundException } from '@nestjs/common';
import { IncomeCalculationService } from './income-calculation.service';
import {
  groupCompanyStatementMonths,
  rollupCompanyStatements,
  selectLatestProcessedFiscal,
  type CompanyStatementInput,
} from './pm-company-statements';

function statement(
  month: string,
  validIncome: number,
  validDepositCount: number,
  incomplete = false,
  integrityStatus?: string,
): CompanyStatementInput {
  return {
    statementPeriod: {
      periodStartDate: `${month}-01`,
      periodEndDate: `${month}-28`,
      isCurrentIncompleteMonth: incomplete,
    },
    financialDepuration: {
      integrityCheck: integrityStatus ? { status: integrityStatus } : undefined,
      depurationSummary: {
        totalValidIncome: validIncome,
        validDepositsCount: validDepositCount,
      },
    },
  };
}

describe('groupCompanyStatementMonths', () => {
  it('sums valid income and deposit counts from several accounts in the same month', () => {
    const months = groupCompanyStatementMonths([
      statement('2026-05', 100.5, 3),
      statement('2026-05', 50.25, 2),
      statement('2026-06', 10, 5),
    ]);

    expect(months).toEqual([
      {
        monthKey: '2026-05',
        validIncome: 150.75,
        validDepositCount: 5,
        statementCount: 2,
      },
      {
        monthKey: '2026-06',
        validIncome: 10,
        validDepositCount: 5,
        statementCount: 1,
      },
    ]);
  });

  it('skips the incomplete current month', () => {
    const months = groupCompanyStatementMonths([
      statement('2026-06', 10, 5),
      statement('2026-07', 99, 1, true),
    ]);

    expect(months.map((month) => month.monthKey)).toEqual(['2026-06']);
  });

  it('leaves out a month whose movements do not match the cover', () => {
    const months = groupCompanyStatementMonths([
      statement('2026-04', 9_737_732.26, 45, false, 'CRITICAL_DISCREPANCY'),
      statement('2026-05', 1_640_304.67, 40, false, 'MATCHED'),
      statement('2026-06', 100, 5, false, 'MINOR_DIFFERENCE'),
    ]);

    expect(months.map((month) => month.monthKey)).toEqual([
      '2026-05',
      '2026-06',
    ]);
    expect(months[0].validIncome).toBe(1_640_304.67);
  });

  it('keeps a matching account when another account in the same month does not match the cover', () => {
    const months = groupCompanyStatementMonths([
      statement('2026-05', 9_000_000, 40, false, 'CRITICAL_DISCREPANCY'),
      statement('2026-05', 80, 5, false, 'MATCHED'),
    ]);

    expect(months).toEqual([
      {
        monthKey: '2026-05',
        validIncome: 80,
        validDepositCount: 5,
        statementCount: 1,
      },
    ]);
  });
});

describe('rollupCompanyStatements', () => {
  it('treats five valid deposits as viable and four as below the Santander minimum', () => {
    const rollup = rollupCompanyStatements(
      [statement('2026-04', 10, 4), statement('2026-05', 10, 5)],
      [],
    );

    expect(rollup.activity.windowMonths).toBe(6);
    expect(rollup.santanderDepositGate).toMatchObject({
      minimumValidDeposits: 5,
      windowMonths: 6,
      windowComplete: false,
      status: 'BELOW_MINIMUM',
      viable: false,
      evaluatedMonths: ['2026-04', '2026-05'],
      failingMonths: ['2026-04'],
    });
  });

  it('ignores a short month that falls outside the six-month window', () => {
    const months = [
      '2025-01',
      '2025-02',
      '2025-03',
      '2025-04',
      '2025-05',
      '2025-06',
      '2025-07',
    ];
    const rollup = rollupCompanyStatements(
      months.map((month, index) =>
        statement(month, 100, index === 0 ? 1 : 5),
      ),
      [],
    );

    expect(rollup.santanderDepositGate.windowComplete).toBe(true);
    expect(rollup.santanderDepositGate.viable).toBe(true);
    expect(rollup.santanderDepositGate.evaluatedMonths).toEqual([
      '2025-02',
      '2025-03',
      '2025-04',
      '2025-05',
      '2025-06',
      '2025-07',
    ]);
    expect(rollup.months[0]).toMatchObject({
      monthKey: '2025-01',
      validDepositCount: 1,
    });
  });

  it('uses a 12-month window when the company activity is a restaurant', () => {
    const rollup = rollupCompanyStatements(
      [statement('2026-05', 10, 6)],
      [{ description: 'Restaurante', percentage: 100 }],
    );

    expect(rollup.activity.windowMonths).toBe(12);
    expect(rollup.santanderDepositGate.windowMonths).toBe(12);
    expect(rollup.santanderDepositGate.status).toBe('VIABLE');
    expect(rollup.santanderDepositGate.windowComplete).toBe(false);
  });

  it('reports no months when every statement is incomplete or undated', () => {
    const rollup = rollupCompanyStatements(
      [statement('2026-07', 99, 8, true), { statementPeriod: {} }],
      [],
    );

    expect(rollup.santanderDepositGate).toMatchObject({
      status: 'NO_MONTHS',
      viable: false,
      windowComplete: false,
      failingMonths: [],
    });
  });
});

describe('IncomeCalculationService.evaluateCompanyStatements', () => {
  function serviceWith(prisma: {
    mortgageCase: { findUnique: jest.Mock };
    document: { findMany: jest.Mock };
  }) {
    return new IncomeCalculationService(prisma as never);
  }

  it('throws when the case does not exist', async () => {
    const service = serviceWith({
      mortgageCase: { findUnique: jest.fn().mockResolvedValue(null) },
      document: { findMany: jest.fn() },
    });

    await expect(service.evaluateCompanyStatements('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rolls up company statements using the company CSF and leaves shareholder documents out', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        documentType: { code: 'CSF' },
        documentStatus: { code: 'PROCESSED' },
        processedAt: new Date('2026-05-01'),
        createdAt: new Date('2026-05-01'),
        extractedData: {
          activities: [{ description: 'Servicios de consultoría', percentage: 100 }],
        },
      },
      {
        documentType: { code: 'BANK_STATEMENT' },
        extractedData: statement('2026-05', 100, 3),
      },
      {
        documentType: { code: 'BANK_STATEMENT' },
        extractedData: statement('2026-05', 40, 2),
      },
    ]);
    const service = serviceWith({
      mortgageCase: {
        findUnique: jest.fn().mockResolvedValue({ id: 'case-1' }),
      },
      document: { findMany },
    });

    const rollup = await service.evaluateCompanyStatements('case-1');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          mortgageCaseId: 'case-1',
          owner: 'COMPANY',
        }),
      }),
    );
    expect(rollup.activity.windowMonths).toBe(6);
    expect(rollup.months).toEqual([
      {
        monthKey: '2026-05',
        validIncome: 140,
        validDepositCount: 5,
        statementCount: 2,
      },
    ]);
    expect(rollup.santanderDepositGate.viable).toBe(true);
  });

  it('uses the newest processed company CSF and ignores an older or unprocessed one', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        documentType: { code: 'CSF' },
        documentStatus: { code: 'PROCESSED' },
        processedAt: new Date('2026-01-01'),
        createdAt: new Date('2026-01-01'),
        extractedData: {
          activities: [{ description: 'Restaurante', percentage: 100 }],
        },
      },
      {
        documentType: { code: 'CSF' },
        documentStatus: { code: 'PROCESSED' },
        processedAt: new Date('2026-06-01'),
        createdAt: new Date('2026-06-01'),
        extractedData: {
          activities: [{ description: 'Servicios de consultoría', percentage: 100 }],
        },
      },
      {
        documentType: { code: 'CSF' },
        documentStatus: { code: 'PROCESSING' },
        processedAt: new Date('2026-07-01'),
        createdAt: new Date('2026-07-01'),
        extractedData: {
          activities: [{ description: 'Restaurante', percentage: 100 }],
        },
      },
      {
        documentType: { code: 'BANK_STATEMENT' },
        documentStatus: { code: 'PROCESSED' },
        processedAt: new Date('2026-06-02'),
        createdAt: new Date('2026-06-02'),
        extractedData: statement('2026-05', 100, 5),
      },
    ]);
    const service = serviceWith({
      mortgageCase: {
        findUnique: jest.fn().mockResolvedValue({ id: 'case-1' }),
      },
      document: { findMany },
    });

    const rollup = await service.evaluateCompanyStatements('case-1');

    expect(rollup.activity.windowMonths).toBe(6);
  });
});

describe('selectLatestProcessedFiscal', () => {
  it('picks the later processed constancia and skips one that is not processed', () => {
    const chosen = selectLatestProcessedFiscal([
      {
        typeCode: 'CSF',
        statusCode: 'PROCESSED',
        processedAt: '2026-01-01',
        createdAt: '2026-01-01',
        value: 'older',
      },
      {
        typeCode: 'TAX_SITUATION_PROOF',
        statusCode: 'PROCESSED',
        processedAt: '2026-03-01',
        createdAt: '2026-01-01',
        value: 'newer-proof',
      },
      {
        typeCode: 'CSF',
        statusCode: 'PROCESSING',
        processedAt: '2026-08-01',
        createdAt: '2026-08-01',
        value: 'in-flight',
      },
    ]);

    expect(chosen).toBe('newer-proof');
  });
});
