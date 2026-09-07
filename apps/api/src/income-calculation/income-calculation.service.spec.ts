import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { IncomeCalculationService } from './income-calculation.service';
import {
  IncomeCalculationStatus,
  type IncomeReceiptResult,
  type PfaeIncomeBases,
} from './income-calculation.types';

// ── Test helpers ──────────────────────────────────────────────────────────

/**
 * Build a minimal payroll-receipt Document with a realistic
 * `extractedData` shape (nested `employer`, `payrollPeriod`, `income`).
 */
function makePayrollDoc(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'doc-1',
    mortgageCaseId: 'case-1',
    createdAt: new Date('2025-05-10'),
    extractedData: {
      employer: { legalName: 'ACME CORP', rfc: 'ACME123456789' },
      payrollPeriod: { periodLabel: 'Mayo 2025', paymentDate: '2025-05-15' },
      income: { grossIncome: 15000, netIncome: 12000 },
    },
    processingResults: null,
    ...overrides,
  };
}

/** A pre-built `IncomeReceiptResult[]` for 3 receipts. */
function makeThreeReceipts(): IncomeReceiptResult[] {
  return [
    {
      documentId: 'doc-1',
      period: 'Mayo 2025',
      paymentDate: '2025-05-15',
      employer: 'ACME CORP',
      employerRfc: 'ACME123456789',
      grossIncome: 10000,
      netIncome: 8000,
      conciliationStatus: null,
      reviewStatus: null,
      included: true,
    },
    {
      documentId: 'doc-2',
      period: 'Junio 2025',
      paymentDate: '2025-06-15',
      employer: 'ACME CORP',
      employerRfc: 'ACME123456789',
      grossIncome: 20000,
      netIncome: 16000,
      conciliationStatus: null,
      reviewStatus: null,
      included: true,
    },
    {
      documentId: 'doc-3',
      period: 'Julio 2025',
      paymentDate: '2025-07-15',
      employer: 'ACME CORP',
      employerRfc: 'ACME123456789',
      grossIncome: 30000,
      netIncome: 24000,
      conciliationStatus: null,
      reviewStatus: null,
      included: true,
    },
  ];
}

/** A persisted snapshot shape returned by the Prisma `incomeCalculation.create` mock. */
function makeSnapshot(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'inc-1',
    mortgageCaseId: 'case-1',
    calculatedAt: new Date('2026-07-16T10:00:00.000Z'),
    receiptResults: makeThreeReceipts(),
    averageGrossIncome: 20000,
    averageNetIncome: 16000,
    confirmedGrossIncome: null,
    confirmedNetIncome: null,
    confirmedBy: null,
    confirmedAt: null,
    observations: null,
    status: IncomeCalculationStatus.CALCULATED,
    ...overrides,
  };
}

/** Minimal Prisma mock — document.findMany + incomeCalculation.create/findFirst. */
function makeMockPrisma() {
  return {
    mortgageCase: {
      findUnique: jest.fn().mockResolvedValue({ personType: 'SALARIED' }),
    },
    document: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    incomeCalculation: {
      create: jest
        .fn()
        .mockImplementation((args: { data: Record<string, unknown> }) =>
          Promise.resolve({
            id: 'inc-1',
            calculatedAt: new Date('2026-07-16T10:00:00.000Z'),
            confirmedGrossIncome: null,
            confirmedNetIncome: null,
            confirmedBy: null,
            confirmedAt: null,
            observations: null,
            ...args.data,
          }),
        ),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
}

type DocTypeCode = 'PAYROLL_RECEIPT' | 'CSF' | 'BANK_STATEMENT' | 'TAX_RETURN';

function makeTypedDoc(
  code: DocTypeCode,
  extractedData: Record<string, unknown>,
  id = `doc-${code.toLowerCase()}`,
): Record<string, unknown> {
  return {
    id,
    mortgageCaseId: 'case-1',
    createdAt: new Date('2025-05-10'),
    documentType: { code },
    extractedData,
    processingResults: null,
  };
}

function makeCsfDoc(
  activities: Array<{
    description: string;
    percentage?: number | null;
    order?: number | null;
    endDate?: string | null;
  }>,
) {
  return makeTypedDoc('CSF', { activities }, 'doc-csf');
}

function makeBankDoc(month: string, totalValidIncome: number, id?: string) {
  return makeTypedDoc(
    'BANK_STATEMENT',
    {
      statementPeriod: {
        periodStartDate: `${month}-01`,
        periodEndDate: `${month}-28`,
        isCurrentIncompleteMonth: false,
      },
      financialDepuration: {
        depurationSummary: { totalValidIncome },
      },
    },
    id ?? `doc-bank-${month}`,
  );
}

function makeTaxDoc(opts: {
  fiscalProfit?: number | null;
  accumulableIncomeTotal?: number | null;
  hasTaxLoss?: boolean;
}) {
  return makeTypedDoc(
    'TAX_RETURN',
    {
      fiscalResult: {
        fiscalProfit: opts.fiscalProfit ?? null,
        accumulableIncomeTotal: opts.accumulableIncomeTotal ?? null,
      },
      hasTaxLoss: opts.hasTaxLoss ?? false,
    },
    'doc-tax',
  );
}

const SIX_MONTH_BANK = [
  makeBankDoc('2024-01', 10),
  makeBankDoc('2024-02', 12),
  makeBankDoc('2024-03', 14),
  makeBankDoc('2024-04', 16),
  makeBankDoc('2024-05', 18),
  makeBankDoc('2024-06', 100),
];

const GENERIC_CSF = makeCsfDoc([
  {
    description: 'Consultoría profesional',
    percentage: 100,
    order: 1,
    endDate: null,
  },
]);

const VALID_TAX = makeTaxDoc({
  fiscalProfit: 120000,
  accumulableIncomeTotal: 240000,
});

function stubDocumentsByType(
  mockPrisma: ReturnType<typeof makeMockPrisma>,
  docs: Array<Record<string, unknown>>,
) {
  mockPrisma.document.findMany.mockImplementation(
    (args: {
      where?: { documentType?: { code?: string | { in?: string[] } } };
    }) => {
      const code = args?.where?.documentType?.code;
      let filtered = docs;
      if (typeof code === 'string') {
        filtered = docs.filter(
          (d) => (d.documentType as { code: string }).code === code,
        );
      } else if (code && typeof code === 'object' && Array.isArray(code.in)) {
        const allowed = new Set(code.in);
        filtered = docs.filter((d) =>
          allowed.has((d.documentType as { code: string }).code),
        );
      }
      return Promise.resolve(filtered);
    },
  );
}

function samplePfaeBases(): PfaeIncomeBases {
  return {
    bank: {
      valid: true,
      invalidReason: null,
      monthlyGross: 15,
      monthlyNet: 15,
      windowMonths: 6,
      monthsUsed: ['2024-02', '2024-03', '2024-04', '2024-05'],
      droppedMax: '2024-06',
      droppedMin: '2024-01',
    },
    taxReturn: {
      valid: true,
      invalidReason: null,
      monthlyGross: 20000,
      monthlyNet: 10000,
    },
    activity: {
      description: 'Consultoría profesional',
      percentage: 100,
      order: 1,
      matchedKeyword: null,
      windowMonths: 6,
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('IncomeCalculationService', () => {
  let service: IncomeCalculationService;
  let mockPrisma: ReturnType<typeof makeMockPrisma>;

  beforeEach(async () => {
    mockPrisma = makeMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IncomeCalculationService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<IncomeCalculationService>(IncomeCalculationService);
  });

  // ── calculate() ───────────────────────────────────────────────────────

  describe('calculate()', () => {
    it('1 receipt → averages equal the single receipt values', async () => {
      mockPrisma.document.findMany.mockResolvedValue([
        makePayrollDoc({
          id: 'doc-1',
          extractedData: {
            income: { grossIncome: 18000, netIncome: 15000 },
            payrollPeriod: {
              periodLabel: 'Mayo 2025',
              paymentDate: '2025-05-15',
            },
            employer: { legalName: 'ACME', rfc: 'RFC1' },
          },
        }),
      ]);

      const result = await service.calculate('case-1');

      expect(result.averageGrossIncome).toBe(18000);
      expect(result.averageNetIncome).toBe(15000);
      expect(result.receiptCount).toBe(1);
      expect(result.includedCount).toBe(1);
    });

    it('3 receipts → correct averages (gross 10000+20000+30000)/3 = 20000', async () => {
      mockPrisma.document.findMany.mockResolvedValue([
        makePayrollDoc({
          id: 'doc-1',
          extractedData: {
            income: { grossIncome: 10000, netIncome: 8000 },
            payrollPeriod: {
              periodLabel: 'Mayo 2025',
              paymentDate: '2025-05-15',
            },
            employer: { legalName: 'ACME', rfc: 'RFC1' },
          },
        }),
        makePayrollDoc({
          id: 'doc-2',
          extractedData: {
            income: { grossIncome: 20000, netIncome: 16000 },
            payrollPeriod: {
              periodLabel: 'Junio 2025',
              paymentDate: '2025-06-15',
            },
            employer: { legalName: 'ACME', rfc: 'RFC1' },
          },
        }),
        makePayrollDoc({
          id: 'doc-3',
          extractedData: {
            income: { grossIncome: 30000, netIncome: 24000 },
            payrollPeriod: {
              periodLabel: 'Julio 2025',
              paymentDate: '2025-07-15',
            },
            employer: { legalName: 'ACME', rfc: 'RFC1' },
          },
        }),
      ]);

      const result = await service.calculate('case-1');

      expect(result.averageGrossIncome).toBe(20000);
      expect(result.averageNetIncome).toBe(16000);
      expect(result.receiptCount).toBe(3);
      expect(result.includedCount).toBe(3);
    });

    it('Decimal rounding: gross [15000.50, 14999.50] → averageGrossIncome = 15000.00', async () => {
      mockPrisma.document.findMany.mockResolvedValue([
        makePayrollDoc({
          id: 'doc-1',
          extractedData: {
            income: { grossIncome: 15000.5, netIncome: 12000.33 },
            payrollPeriod: {},
            employer: {},
          },
        }),
        makePayrollDoc({
          id: 'doc-2',
          extractedData: {
            income: { grossIncome: 14999.5, netIncome: 11999.67 },
            payrollPeriod: {},
            employer: {},
          },
        }),
      ]);

      const result = await service.calculate('case-1');

      expect(result.averageGrossIncome).toBe(15000);
      expect(result.averageNetIncome).toBe(12000);
    });

    it('creates snapshot with status CALCULATED', async () => {
      mockPrisma.document.findMany.mockResolvedValue([
        makePayrollDoc({ id: 'doc-1' }),
      ]);

      const result = await service.calculate('case-1');

      expect(result.status).toBe(IncomeCalculationStatus.CALCULATED);
      expect(mockPrisma.incomeCalculation.create).toHaveBeenCalledTimes(1);
      const call = mockPrisma.incomeCalculation.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(call.data.mortgageCaseId).toBe('case-1');
      expect(call.data.status).toBe(IncomeCalculationStatus.CALCULATED);
    });

    it('excluded docs are NOT included: gross [10000, 20000, 30000] exclude doc-3 → avg 15000', async () => {
      mockPrisma.document.findMany.mockResolvedValue([
        makePayrollDoc({
          id: 'doc-1',
          extractedData: { income: { grossIncome: 10000, netIncome: 8000 } },
        }),
        makePayrollDoc({
          id: 'doc-2',
          extractedData: { income: { grossIncome: 20000, netIncome: 16000 } },
        }),
        makePayrollDoc({
          id: 'doc-3',
          extractedData: { income: { grossIncome: 30000, netIncome: 24000 } },
        }),
      ]);

      const result = await service.calculate('case-1', ['doc-3']);

      expect(result.averageGrossIncome).toBe(15000);
      expect(result.averageNetIncome).toBe(12000);
      expect(result.includedCount).toBe(2);
      expect(result.receiptCount).toBe(3);
    });

    it('throws NotFoundException when no PAYROLL_RECEIPT docs found', async () => {
      mockPrisma.document.findMany.mockResolvedValue([]);

      await expect(service.calculate('case-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when zero receipts included', async () => {
      mockPrisma.document.findMany.mockResolvedValue([
        makePayrollDoc({ id: 'doc-1' }),
        makePayrollDoc({ id: 'doc-2' }),
      ]);

      await expect(
        service.calculate('case-1', ['doc-1', 'doc-2']),
      ).rejects.toThrow(BadRequestException);
    });

    it('builds receiptResults with included=true by default', async () => {
      mockPrisma.document.findMany.mockResolvedValue([
        makePayrollDoc({ id: 'doc-1' }),
        makePayrollDoc({ id: 'doc-2' }),
      ]);

      const result = await service.calculate('case-1');

      expect(result.receiptResults).toHaveLength(2);
      expect(result.receiptResults[0].included).toBe(true);
      expect(result.receiptResults[1].included).toBe(true);
    });

    it('handles missing extractedData fields gracefully (null period/paymentDate)', async () => {
      mockPrisma.document.findMany.mockResolvedValue([
        makePayrollDoc({
          id: 'doc-1',
          extractedData: {
            income: { grossIncome: 18000, netIncome: 15000 },
          },
        }),
      ]);

      const result = await service.calculate('case-1');

      const receipt = result.receiptResults[0];
      expect(receipt.period).toBeNull();
      expect(receipt.paymentDate).toBeNull();
      expect(receipt.employer).toBeNull();
      expect(receipt.employerRfc).toBeNull();
      // Income still computed
      expect(result.averageGrossIncome).toBe(18000);
    });
  });

  // ── getLatest() ───────────────────────────────────────────────────────

  describe('getLatest()', () => {
    it('returns the most recent snapshot', async () => {
      mockPrisma.incomeCalculation.findFirst.mockResolvedValue(
        makeSnapshot({ id: 'inc-9' }),
      );

      const result = await service.getLatest('case-1');

      expect(result.id).toBe('inc-9');
      expect(result.caseId).toBe('case-1');
      expect(result.averageGrossIncome).toBe(20000);
      expect(result.status).toBe(IncomeCalculationStatus.CALCULATED);
    });

    it('throws NotFoundException when no snapshot exists', async () => {
      mockPrisma.incomeCalculation.findFirst.mockResolvedValue(null);

      await expect(service.getLatest('case-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('queries ordered by calculatedAt desc, take 1', async () => {
      mockPrisma.incomeCalculation.findFirst.mockResolvedValue(makeSnapshot());

      await service.getLatest('case-1');

      expect(mockPrisma.incomeCalculation.findFirst).toHaveBeenCalledWith({
        where: { mortgageCaseId: 'case-1' },
        orderBy: { calculatedAt: 'desc' },
      });
    });
  });

  // ── toggleReceipt() ───────────────────────────────────────────────────

  describe('toggleReceipt()', () => {
    it('excludes one receipt and recalculates averages', async () => {
      // Start with 3 receipts: gross 10k, 20k, 30k → avg 20k
      mockPrisma.incomeCalculation.findFirst.mockResolvedValue(
        makeSnapshot({
          receiptResults: makeThreeReceipts(),
          averageGrossIncome: 20000,
          averageNetIncome: 16000,
        }),
      );

      // Toggle index 2 (doc-3) to included=false → new avg (10k+20k)/2 = 15k
      const result = await service.toggleReceipt('case-1', 2, false);

      expect(result.averageGrossIncome).toBe(15000);
      expect(result.averageNetIncome).toBe(12000);
      expect(result.includedCount).toBe(2);
      expect(result.receiptCount).toBe(3);
      expect(result.status).toBe(IncomeCalculationStatus.CALCULATED);
      // New snapshot created (immutable pattern)
      expect(mockPrisma.incomeCalculation.create).toHaveBeenCalledTimes(1);
    });

    it('includes a previously excluded receipt and recalculates', async () => {
      const receipts = makeThreeReceipts();
      receipts[2].included = false; // doc-3 excluded → avg was (10k+20k)/2=15k
      mockPrisma.incomeCalculation.findFirst.mockResolvedValue(
        makeSnapshot({
          receiptResults: receipts,
          averageGrossIncome: 15000,
          averageNetIncome: 12000,
        }),
      );

      // Re-include doc-3 → avg back to (10k+20k+30k)/3 = 20k
      const result = await service.toggleReceipt('case-1', 2, true);

      expect(result.averageGrossIncome).toBe(20000);
      expect(result.averageNetIncome).toBe(16000);
      expect(result.includedCount).toBe(3);
    });

    it('throws NotFoundException when no snapshot exists', async () => {
      mockPrisma.incomeCalculation.findFirst.mockResolvedValue(null);

      await expect(service.toggleReceipt('case-1', 0, false)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException for out-of-range receipt index', async () => {
      mockPrisma.incomeCalculation.findFirst.mockResolvedValue(
        makeSnapshot({ receiptResults: makeThreeReceipts() }),
      );

      await expect(service.toggleReceipt('case-1', 99, false)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when all receipts excluded via toggle', async () => {
      // Only 1 receipt → toggling it off leaves zero included
      mockPrisma.incomeCalculation.findFirst.mockResolvedValue(
        makeSnapshot({
          receiptResults: [makeThreeReceipts()[0]],
        }),
      );

      await expect(service.toggleReceipt('case-1', 0, false)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ── Conciliation NOT called verification (Task 4.5) ────────────────

  describe('Conciliation isolation', () => {
    it('getLatest returns identical snapshot on repeated calls (case reload simulation)', async () => {
      const snapshot = makeSnapshot({ id: 'inc-stable' });
      mockPrisma.incomeCalculation.findFirst.mockResolvedValue(snapshot);

      const first = await service.getLatest('case-1');
      const second = await service.getLatest('case-1');

      expect(first).toEqual(second);
      expect(first.id).toBe('inc-stable');
      expect(second.id).toBe('inc-stable');
      // Both calls hit Prisma with the same query
      expect(mockPrisma.incomeCalculation.findFirst).toHaveBeenCalledTimes(2);
      expect(mockPrisma.incomeCalculation.findFirst).toHaveBeenCalledWith({
        where: { mortgageCaseId: 'case-1' },
        orderBy: { calculatedAt: 'desc' },
      });
    });

    it('IncomeCalculationService has ZERO imports from conciliation modules', () => {
      // Read the service source and verify no conciliation-related imports
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const path = require('path');
      const servicePath = path.resolve(__dirname, 'income-calculation.service.ts');
      const source = fs.readFileSync(servicePath, 'utf-8');

      // Must NOT import from payroll-bank-matching or any conciliation module
      expect(source).not.toMatch(/from\s+['"].*payroll-bank-matching/);
      expect(source).not.toMatch(/from\s+['"].*bank-reconciliation/);
      expect(source).not.toMatch(/from\s+['"].*conciliation-service/);
      expect(source).not.toMatch(/from\s+['"].*conciliation\.service/);

      // Must NOT reference conciliation service classes
      expect(source).not.toMatch(/ConciliationService/);
      expect(source).not.toMatch(/BankReconciliationService/);
      expect(source).not.toMatch(/PayrollBankMatchingService/);
    });

    it('calculate() does not invoke any conciliation service', async () => {
      mockPrisma.document.findMany.mockResolvedValue([
        makePayrollDoc({ id: 'doc-1' }),
      ]);

      // Spy on Prisma to verify only expected calls happen
      const createSpy = mockPrisma.incomeCalculation.create;

      await service.calculate('case-1');

      // Only document.findMany + incomeCalculation.create should be called
      expect(mockPrisma.document.findMany).toHaveBeenCalledTimes(1);
      expect(createSpy).toHaveBeenCalledTimes(1);

      // No other Prisma models should be touched (no conciliation-related tables)
      // Verify the create call is for IncomeCalculation only
      const createArg = createSpy.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(createArg.data.mortgageCaseId).toBe('case-1');
      expect(createArg.data.status).toBe(IncomeCalculationStatus.CALCULATED);
    });
  });

  // ── PFAE dual-base calculate() (HU-18 Unit 2) ────────────────────────

  describe('PFAE calculate()', () => {
    beforeEach(() => {
      mockPrisma.mortgageCase.findUnique.mockResolvedValue({
        personType: 'PFAE',
      });
    });

    it('default source projection: both valid → BANK_STATEMENTS and averages equal bank figures', async () => {
      stubDocumentsByType(mockPrisma, [
        GENERIC_CSF,
        ...SIX_MONTH_BANK,
        VALID_TAX,
      ]);

      const result = await service.calculate('case-1');

      expect(result.source).toBe('BANK_STATEMENTS');
      expect(result.averageGrossIncome).toBe(15);
      expect(result.averageNetIncome).toBe(15);
      expect(result.status).toBe(IncomeCalculationStatus.CALCULATED);
      expect(result.bases?.bank.valid).toBe(true);
      expect(result.bases?.bank.monthlyNet).toBe(15);
      expect(result.bases?.taxReturn.valid).toBe(true);
      expect(result.bases?.taxReturn.monthlyGross).toBe(20000);
      expect(result.bases?.taxReturn.monthlyNet).toBe(10000);
    });

    it('tax source when bank invalid: TAX_RETURN and averages equal tax figures', async () => {
      stubDocumentsByType(mockPrisma, [
        GENERIC_CSF,
        makeBankDoc('2024-01', 10),
        makeBankDoc('2024-02', 12),
        makeBankDoc('2024-03', 14),
        makeBankDoc('2024-04', 16),
        makeBankDoc('2024-05', 18),
        VALID_TAX,
      ]);

      const result = await service.calculate('case-1');

      expect(result.source).toBe('TAX_RETURN');
      expect(result.averageGrossIncome).toBe(20000);
      expect(result.averageNetIncome).toBe(10000);
      expect(result.bases?.bank.valid).toBe(false);
      expect(result.bases?.bank.invalidReason).toBe('INSUFFICIENT_MONTHS');
      expect(result.bases?.taxReturn.valid).toBe(true);
    });

    it('fiscal loss knocks out tax only: tax INVALID, source BANK_STATEMENTS', async () => {
      stubDocumentsByType(mockPrisma, [
        GENERIC_CSF,
        ...SIX_MONTH_BANK,
        makeTaxDoc({
          fiscalProfit: 0,
          accumulableIncomeTotal: 240000,
          hasTaxLoss: true,
        }),
      ]);

      const result = await service.calculate('case-1');

      expect(result.source).toBe('BANK_STATEMENTS');
      expect(result.averageGrossIncome).toBe(15);
      expect(result.averageNetIncome).toBe(15);
      expect(result.bases?.bank.valid).toBe(true);
      expect(result.bases?.taxReturn.valid).toBe(false);
      expect(result.bases?.taxReturn.invalidReason).toBe('TAX_LOSS');
    });

    it('both invalid → REQUIRES_REVIEW, averages 0, no throw, GET latest succeeds', async () => {
      stubDocumentsByType(mockPrisma, [
        GENERIC_CSF,
        makeBankDoc('2024-01', 10),
        makeBankDoc('2024-02', 12),
        makeBankDoc('2024-03', 14),
        makeBankDoc('2024-04', 16),
        makeBankDoc('2024-05', 18),
        makeTaxDoc({ hasTaxLoss: true }),
      ]);

      const result = await service.calculate('case-1');

      expect(result.status).toBe(IncomeCalculationStatus.REQUIRES_REVIEW);
      expect(result.source).toBe('BANK_STATEMENTS');
      expect(result.averageGrossIncome).toBe(0);
      expect(result.averageNetIncome).toBe(0);
      expect(result.bases?.bank.valid).toBe(false);
      expect(result.bases?.taxReturn.valid).toBe(false);

      const persisted = await mockPrisma.incomeCalculation.create.mock
        .results[0].value;
      mockPrisma.incomeCalculation.findFirst.mockResolvedValue(persisted);

      await expect(service.getLatest('case-1')).resolves.toMatchObject({
        status: IncomeCalculationStatus.REQUIRES_REVIEW,
        source: 'BANK_STATEMENTS',
        averageGrossIncome: 0,
        averageNetIncome: 0,
        id: result.id,
      });
    });

    it('PFAE analyze without payroll MUST NOT 404 and both bases are computed', async () => {
      stubDocumentsByType(mockPrisma, [
        GENERIC_CSF,
        ...SIX_MONTH_BANK,
        VALID_TAX,
      ]);

      await expect(service.calculate('case-1')).resolves.toMatchObject({
        source: 'BANK_STATEMENTS',
        bases: expect.objectContaining({
          bank: expect.objectContaining({ valid: true }),
          taxReturn: expect.objectContaining({ valid: true }),
        }),
      });
    });

    it('triangulates 12-month restaurantero window: [1..11,100] → 6.5 not 13.83', async () => {
      const twelveMonths = [
        makeBankDoc('2024-01', 1),
        makeBankDoc('2024-02', 2),
        makeBankDoc('2024-03', 3),
        makeBankDoc('2024-04', 4),
        makeBankDoc('2024-05', 5),
        makeBankDoc('2024-06', 6),
        makeBankDoc('2024-07', 7),
        makeBankDoc('2024-08', 8),
        makeBankDoc('2024-09', 9),
        makeBankDoc('2024-10', 10),
        makeBankDoc('2024-11', 11),
        makeBankDoc('2024-12', 100),
      ];
      stubDocumentsByType(mockPrisma, [
        makeCsfDoc([
          {
            description: 'Servicios de restaurantero',
            percentage: 100,
            order: 1,
            endDate: null,
          },
        ]),
        ...twelveMonths,
        VALID_TAX,
      ]);

      const result = await service.calculate('case-1');

      expect(result.source).toBe('BANK_STATEMENTS');
      expect(result.averageGrossIncome).toBe(6.5);
      expect(result.averageNetIncome).toBe(6.5);
      expect(result.averageNetIncome).not.toBeCloseTo(13.83, 1);
      expect(result.bases?.activity.windowMonths).toBe(12);
      expect(result.bases?.activity.matchedKeyword).toBe('restaurantero');
    });
  });

  describe('SALARIED regression (HU-18)', () => {
    it('payroll [15000.50, 14999.50] → averageGrossIncome 15000.00 and source PAYROLL', async () => {
      mockPrisma.document.findMany.mockResolvedValue([
        makePayrollDoc({
          id: 'doc-1',
          extractedData: {
            income: { grossIncome: 15000.5, netIncome: 12000.33 },
            payrollPeriod: {},
            employer: {},
          },
        }),
        makePayrollDoc({
          id: 'doc-2',
          extractedData: {
            income: { grossIncome: 14999.5, netIncome: 11999.67 },
            payrollPeriod: {},
            employer: {},
          },
        }),
      ]);

      const result = await service.calculate('case-1');

      expect(result.averageGrossIncome).toBe(15000);
      expect(result.averageNetIncome).toBe(12000);
      expect(result.source).toBe('PAYROLL');
      expect(result.bases ?? null).toBeNull();
    });
  });

  describe('switchSource()', () => {
    function stubPfaeLatest(overrides: Record<string, unknown> = {}) {
      mockPrisma.mortgageCase.findUnique.mockResolvedValue({
        personType: 'PFAE',
      });
      mockPrisma.incomeCalculation.findFirst.mockResolvedValue(
        makeSnapshot({
          id: 'inc-prior',
          source: 'BANK_STATEMENTS',
          averageGrossIncome: 15,
          averageNetIncome: 15,
          receiptResults: [],
          bases: samplePfaeBases(),
          ...overrides,
        }),
      );
    }

    it('clones bases, stores TAX_RETURN, and projects tax averages', async () => {
      stubPfaeLatest();

      const result = await service.switchSource('case-1', 'TAX_RETURN');

      expect(result.source).toBe('TAX_RETURN');
      expect(result.averageGrossIncome).toBe(20000);
      expect(result.averageNetIncome).toBe(10000);
      expect(result.status).toBe(IncomeCalculationStatus.CALCULATED);
      expect(result.bases).toEqual(samplePfaeBases());
      expect(mockPrisma.incomeCalculation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mortgageCaseId: 'case-1',
            source: 'TAX_RETURN',
            bases: samplePfaeBases(),
          }),
        }),
      );
    });

    it('projects bank averages when switching back to BANK_STATEMENTS', async () => {
      stubPfaeLatest({
        source: 'TAX_RETURN',
        averageGrossIncome: 20000,
        averageNetIncome: 10000,
      });

      const result = await service.switchSource('case-1', 'BANK_STATEMENTS');

      expect(result.source).toBe('BANK_STATEMENTS');
      expect(result.averageGrossIncome).toBe(15);
      expect(result.averageNetIncome).toBe(15);
      expect(result.bases).toEqual(samplePfaeBases());
    });

    it('throws 400 when the chosen bank base is invalid', async () => {
      const bases = samplePfaeBases();
      bases.bank = {
        ...bases.bank,
        valid: false,
        invalidReason: 'INSUFFICIENT_MONTHS',
        monthlyGross: null,
        monthlyNet: null,
      };
      stubPfaeLatest({ bases, source: 'TAX_RETURN' });

      await expect(
        service.switchSource('case-1', 'BANK_STATEMENTS'),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.incomeCalculation.create).not.toHaveBeenCalled();
    });

    it('throws 400 when switching to TAX_RETURN on a tax-loss base', async () => {
      const bases = samplePfaeBases();
      bases.taxReturn = {
        valid: false,
        invalidReason: 'TAX_LOSS',
        monthlyGross: null,
        monthlyNet: null,
      };
      stubPfaeLatest({ bases });

      await expect(
        service.switchSource('case-1', 'TAX_RETURN'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockPrisma.incomeCalculation.create).not.toHaveBeenCalled();
    });

    it('throws 400 when the case is SALARIED', async () => {
      mockPrisma.mortgageCase.findUnique.mockResolvedValue({
        personType: 'SALARIED',
      });
      mockPrisma.incomeCalculation.findFirst.mockResolvedValue(
        makeSnapshot({ source: 'PAYROLL' }),
      );

      await expect(
        service.switchSource('case-1', 'TAX_RETURN'),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.incomeCalculation.create).not.toHaveBeenCalled();
    });
  });

  describe('GET latest source/bases contract', () => {
    it('exposes source and bases JSON from the persisted snapshot', async () => {
      const bases = samplePfaeBases();
      mockPrisma.incomeCalculation.findFirst.mockResolvedValue(
        makeSnapshot({
          id: 'inc-pfae',
          source: 'BANK_STATEMENTS',
          bases,
        }),
      );

      const result = await service.getLatest('case-1');

      expect(result.source).toBe('BANK_STATEMENTS');
      expect(result.bases).toEqual(bases);
      expect(result.bases?.bank.monthsUsed).toEqual([
        '2024-02',
        '2024-03',
        '2024-04',
        '2024-05',
      ]);
    });
  });
});
