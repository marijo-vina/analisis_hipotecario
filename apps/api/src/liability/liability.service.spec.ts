import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { LiabilityCalculationService } from './liability.service';
import {
  CreditNature,
  InstitutionCategory,
  LiabilityStatus,
  ClassificationSource,
  GlobalLiabilityStatus,
  RuleApplied,
  type LiabilityCreditInput,
  type LiabilityCreditResult,
} from './liability.types';

// ── Test helpers ──────────────────────────────────────────────────────────

/** Build a minimal valid LiabilityCreditInput. */
function makeCredit(overrides: Partial<LiabilityCreditInput> = {}): LiabilityCreditInput {
  return {
    creditReference: 'CR-001',
    institution: 'BANCO EJEMPLO',
    creditType: 'TARJETA DE CREDITO',
    classification: 'UNKNOWN',
    status: 'ACTIVE',
    currentBalance: 100000,
    paymentDueAmountEffective: 5000,
    isClosed: false,
    ...overrides,
  };
}

/** Minimal Prisma mock — snapshot.create just echoes an ID + timestamp. */
function makeMockPrisma() {
  return {
    liabilitySnapshot: {
      create: jest.fn().mockImplementation((args: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'snap-1',
          calculatedAt: new Date('2025-01-01T00:00:00.000Z'),
          ...args.data,
        }),
      ),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('LiabilityCalculationService', () => {
  let service: LiabilityCalculationService;
  let mockPrisma: ReturnType<typeof makeMockPrisma>;

  beforeEach(async () => {
    mockPrisma = makeMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LiabilityCalculationService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<LiabilityCalculationService>(LiabilityCalculationService);
  });

  // ── REVOLVING ──────────────────────────────────────────────────────────

  describe('REVOLVING calculation', () => {
    it('6% greater than payment → MAX(6000, 2000) = 6000, CALCULATED', async () => {
      const result = await service.calculate('case-1', [
        makeCredit({
          creditType: 'TARJETA DE CREDITO',
          classification: 'REVOLVING',
          currentBalance: 100000,
          paymentDueAmountEffective: 2000,
        }),
      ]);

      const credit = result.credits[0];
      expect(credit.monthlyDebtContribution).toBe(6000);
      expect(credit.liabilityStatus).toBe(LiabilityStatus.CALCULATED);
      expect(credit.creditNature).toBe(CreditNature.REVOLVING);
      expect(credit.classificationSource).toBe(ClassificationSource.EXTRACTED);
    });

    it('payment greater than 6% → MAX(6000, 8000) = 8000, CALCULATED', async () => {
      const result = await service.calculate('case-1', [
        makeCredit({
          creditType: 'TARJETA DE CREDITO',
          classification: 'REVOLVING',
          currentBalance: 100000,
          paymentDueAmountEffective: 8000,
        }),
      ]);

      const credit = result.credits[0];
      expect(credit.monthlyDebtContribution).toBe(8000);
      expect(credit.liabilityStatus).toBe(LiabilityStatus.CALCULATED);
    });

    it('only saldo present → saldo × 6% = 6000, REQUIRES_REVIEW', async () => {
      const result = await service.calculate('case-1', [
        makeCredit({
          creditType: 'TARJETA',
          classification: 'REVOLVING',
          currentBalance: 100000,
          paymentDueAmountEffective: null,
        }),
      ]);

      const credit = result.credits[0];
      expect(credit.monthlyDebtContribution).toBe(6000);
      expect(credit.liabilityStatus).toBe(LiabilityStatus.REQUIRES_REVIEW);
    });

    it('no data at all → null, INCOMPLETE', async () => {
      const result = await service.calculate('case-1', [
        makeCredit({
          creditType: 'TARJETA',
          classification: 'REVOLVING',
          currentBalance: null,
          paymentDueAmountEffective: null,
        }),
      ]);

      const credit = result.credits[0];
      expect(credit.monthlyDebtContribution).toBeNull();
      expect(credit.liabilityStatus).toBe(LiabilityStatus.INCOMPLETE);
    });
  });

  // ── FIXED ──────────────────────────────────────────────────────────────

  describe('FIXED calculation', () => {
    it('normal fixed payment → 5000, CALCULATED', async () => {
      const result = await service.calculate('case-1', [
        makeCredit({
          creditType: 'CREDITO AUTO',
          classification: 'FIXED_PAYMENT',
          currentBalance: 200000,
          paymentDueAmountEffective: 5000,
        }),
      ]);

      const credit = result.credits[0];
      expect(credit.monthlyDebtContribution).toBe(5000);
      expect(credit.liabilityStatus).toBe(LiabilityStatus.CALCULATED);
      expect(credit.creditNature).toBe(CreditNature.FIXED);
      expect(credit.classificationSource).toBe(ClassificationSource.EXTRACTED);
    });

    it('payment > balance → payment, CALCULATED, warning reason', async () => {
      const result = await service.calculate('case-1', [
        makeCredit({
          creditType: 'CREDITO AUTO',
          classification: 'FIXED_PAYMENT',
          currentBalance: 10000,
          paymentDueAmountEffective: 15000,
        }),
      ]);

      const credit = result.credits[0];
      expect(credit.monthlyDebtContribution).toBe(15000);
      expect(credit.liabilityStatus).toBe(LiabilityStatus.CALCULATED);
      expect(credit.classificationReason).toContain('pago > saldo');
    });

    it('balance > 0, explicit $0 payment → null, INCOMPLETE', async () => {
      const result = await service.calculate('case-1', [
        makeCredit({
          creditType: 'CREDITO AUTO',
          classification: 'FIXED_PAYMENT',
          currentBalance: 150000,
          paymentDueAmountEffective: 0,
        }),
      ]);

      const credit = result.credits[0];
      expect(credit.monthlyDebtContribution).toBeNull();
      expect(credit.liabilityStatus).toBe(LiabilityStatus.INCOMPLETE);
    });

    it('balance > 0, payment null → null, INCOMPLETE', async () => {
      const result = await service.calculate('case-1', [
        makeCredit({
          creditType: 'CREDITO AUTO',
          classification: 'FIXED_PAYMENT',
          currentBalance: 150000,
          paymentDueAmountEffective: null,
        }),
      ]);

      const credit = result.credits[0];
      expect(credit.monthlyDebtContribution).toBeNull();
      expect(credit.liabilityStatus).toBe(LiabilityStatus.INCOMPLETE);
    });
  });

  // ── UNKNOWN ────────────────────────────────────────────────────────────

  describe('UNKNOWN calculation', () => {
    it('both amounts → MAX(1800, 1500) = 1800, REQUIRES_REVIEW, FALLBACK', async () => {
      const result = await service.calculate('case-1', [
        makeCredit({
          creditType: 'CREDITO GENERICO',
          classification: 'UNKNOWN',
          currentBalance: 30000,
          paymentDueAmountEffective: 1500,
        }),
      ]);

      const credit = result.credits[0];
      expect(credit.monthlyDebtContribution).toBe(1800);
      expect(credit.liabilityStatus).toBe(LiabilityStatus.REQUIRES_REVIEW);
      expect(credit.classificationSource).toBe(ClassificationSource.FALLBACK);
      expect(credit.ruleApplied).toBe(RuleApplied.UNKNOWN_PROVISIONAL);
    });

    it('only balance → 3000, REQUIRES_REVIEW, FALLBACK', async () => {
      const result = await service.calculate('case-1', [
        makeCredit({
          creditType: 'CREDITO GENERICO',
          classification: 'UNKNOWN',
          currentBalance: 50000,
          paymentDueAmountEffective: null,
        }),
      ]);

      const credit = result.credits[0];
      expect(credit.monthlyDebtContribution).toBe(3000);
      expect(credit.liabilityStatus).toBe(LiabilityStatus.REQUIRES_REVIEW);
      expect(credit.classificationSource).toBe(ClassificationSource.FALLBACK);
    });

    it('only payment → 2000, REQUIRES_REVIEW, FALLBACK', async () => {
      const result = await service.calculate('case-1', [
        makeCredit({
          creditType: 'CREDITO GENERICO',
          classification: 'UNKNOWN',
          currentBalance: null,
          paymentDueAmountEffective: 2000,
        }),
      ]);

      const credit = result.credits[0];
      expect(credit.monthlyDebtContribution).toBe(2000);
      expect(credit.liabilityStatus).toBe(LiabilityStatus.REQUIRES_REVIEW);
      expect(credit.classificationSource).toBe(ClassificationSource.FALLBACK);
    });

    it('neither amount → null, INCOMPLETE, FALLBACK', async () => {
      const result = await service.calculate('case-1', [
        makeCredit({
          creditType: 'CREDITO GENERICO',
          classification: 'UNKNOWN',
          currentBalance: null,
          paymentDueAmountEffective: null,
        }),
      ]);

      const credit = result.credits[0];
      expect(credit.monthlyDebtContribution).toBeNull();
      expect(credit.liabilityStatus).toBe(LiabilityStatus.INCOMPLETE);
      expect(credit.classificationSource).toBe(ClassificationSource.FALLBACK);
    });
  });

  // ── Keyword collision ──────────────────────────────────────────────────

  describe('keyword collision', () => {
    it('colliding keywords TARJETA + PERSONAL → UNKNOWN, REQUIRES_REVIEW', async () => {
      const result = await service.calculate('case-1', [
        makeCredit({
          creditType: 'TARJETA DE CREDITO PERSONAL',
          classification: 'UNKNOWN',
          currentBalance: 100000,
          paymentDueAmountEffective: 5000,
        }),
      ]);

      const credit = result.credits[0];
      expect(credit.creditNature).toBe(CreditNature.UNKNOWN);
      expect(credit.liabilityStatus).toBe(LiabilityStatus.REQUIRES_REVIEW);
      expect(credit.classificationReason).toContain('colisión de keywords');
      expect(credit.classificationReason).toContain('TARJETA');
      expect(credit.classificationReason).toContain('PERSONAL');
    });
  });

  // ── Closed credit ──────────────────────────────────────────────────────

  describe('closed credit', () => {
    it('closed credit → contribution 0, CLOSED_ZERO, CALCULATED', async () => {
      const result = await service.calculate('case-1', [
        makeCredit({
          creditType: 'TARJETA DE CREDITO',
          classification: 'REVOLVING',
          currentBalance: 50000,
          paymentDueAmountEffective: 3000,
          isClosed: true,
        }),
      ]);

      const credit = result.credits[0];
      expect(credit.monthlyDebtContribution).toBe(0);
      expect(credit.ruleApplied).toBe(RuleApplied.CLOSED_ZERO);
      expect(credit.liabilityStatus).toBe(LiabilityStatus.CALCULATED);
    });
  });

  // ── Global status aggregation ──────────────────────────────────────────

  describe('global status aggregation', () => {
    it('all CALCULATED → CALCULATED', async () => {
      const result = await service.calculate('case-1', [
        makeCredit({
          creditType: 'TARJETA',
          classification: 'REVOLVING',
          currentBalance: 100000,
          paymentDueAmountEffective: 2000,
        }),
        makeCredit({
          creditType: 'CREDITO AUTO',
          classification: 'FIXED_PAYMENT',
          currentBalance: 200000,
          paymentDueAmountEffective: 5000,
        }),
      ]);

      expect(result.globalStatus).toBe(GlobalLiabilityStatus.CALCULATED);
    });

    it('one REQUIRES_REVIEW, zero INCOMPLETE → PARTIAL', async () => {
      const result = await service.calculate('case-1', [
        makeCredit({
          creditType: 'TARJETA',
          classification: 'REVOLVING',
          currentBalance: 100000,
          paymentDueAmountEffective: 2000,
        }),
        makeCredit({
          creditReference: 'CR-002',
          creditType: 'CREDITO GENERICO',
          classification: 'UNKNOWN',
          currentBalance: 50000,
          paymentDueAmountEffective: null,
        }),
      ]);

      expect(result.globalStatus).toBe(GlobalLiabilityStatus.PARTIAL);
    });

    it('one INCOMPLETE → INCOMPLETE', async () => {
      const result = await service.calculate('case-1', [
        makeCredit({
          creditType: 'TARJETA',
          classification: 'REVOLVING',
          currentBalance: 100000,
          paymentDueAmountEffective: 2000,
        }),
        makeCredit({
          creditReference: 'CR-002',
          creditType: 'TARJETA',
          classification: 'REVOLVING',
          currentBalance: null,
          paymentDueAmountEffective: null,
        }),
      ]);

      expect(result.globalStatus).toBe(GlobalLiabilityStatus.INCOMPLETE);
    });
  });

  // ── Exact monetary calculation (no float error) ────────────────────────

  describe('exact monetary calculation', () => {
    it('1333.33 + 1333.33 + 1333.34 = exactly 4000.00', async () => {
      const result = await service.calculate('case-1', [
        makeCredit({
          creditReference: 'CR-001',
          creditType: 'CREDITO AUTO',
          classification: 'FIXED_PAYMENT',
          currentBalance: 100000,
          paymentDueAmountEffective: 1333.33,
        }),
        makeCredit({
          creditReference: 'CR-002',
          creditType: 'CREDITO AUTO',
          classification: 'FIXED_PAYMENT',
          currentBalance: 100000,
          paymentDueAmountEffective: 1333.33,
        }),
        makeCredit({
          creditReference: 'CR-003',
          creditType: 'CREDITO AUTO',
          classification: 'FIXED_PAYMENT',
          currentBalance: 100000,
          paymentDueAmountEffective: 1333.34,
        }),
      ]);

      expect(result.grossCurrentMonthlyDebt).toBe(4000);
    });
  });

  // ── creditReference passthrough ─────────────────────────────────────────

  describe('creditReference passthrough', () => {
    it('creditReference preserved through calculation', async () => {
      const result = await service.calculate('case-1', [
        makeCredit({
          creditReference: 'CR-001234-ABC',
          creditType: 'TARJETA',
          classification: 'REVOLVING',
          currentBalance: 100000,
          paymentDueAmountEffective: 2000,
        }),
      ]);

      expect(result.credits[0].creditReference).toBe('CR-001234-ABC');
    });
  });

  // ── totalCurrentBalance aggregate ──────────────────────────────────────

  describe('totalCurrentBalance aggregate', () => {
    it('sums non-closed currentBalance, null and closed contribute 0', async () => {
      const result = await service.calculate('case-1', [
        makeCredit({
          creditReference: 'CR-001',
          creditType: 'CREDITO AUTO',
          classification: 'FIXED_PAYMENT',
          currentBalance: 150000,
          paymentDueAmountEffective: 5000,
        }),
        makeCredit({
          creditReference: 'CR-002',
          creditType: 'TARJETA',
          classification: 'REVOLVING',
          currentBalance: 30000,
          paymentDueAmountEffective: 2000,
        }),
        makeCredit({
          creditReference: 'CR-003',
          creditType: 'TARJETA',
          classification: 'REVOLVING',
          currentBalance: null,
          paymentDueAmountEffective: null,
        }),
        makeCredit({
          creditReference: 'CR-004',
          creditType: 'TARJETA',
          classification: 'REVOLVING',
          currentBalance: 99999,
          paymentDueAmountEffective: 1000,
          isClosed: true,
        }),
      ]);

      expect(result.totalCurrentBalance).toBe(180000);
    });
  });

  // ── Null vs zero distinction ──────────────────────────────────────────

  describe('null vs zero distinction', () => {
    it('currentBalance: null → INCOMPLETE, not $0', async () => {
      const result = await service.calculate('case-1', [
        makeCredit({
          creditType: 'TARJETA',
          classification: 'REVOLVING',
          currentBalance: null,
          paymentDueAmountEffective: 5000,
        }),
      ]);

      // Only pago present → REQUIRES_REVIEW (not $0)
      expect(result.credits[0].liabilityStatus).toBe(LiabilityStatus.REQUIRES_REVIEW);
      expect(result.credits[0].monthlyDebtContribution).toBe(5000);
    });

    it('currentBalance: 0 (explicit) → treated as $0, not missing', async () => {
      const result = await service.calculate('case-1', [
        makeCredit({
          creditType: 'TARJETA',
          classification: 'REVOLVING',
          currentBalance: 0,
          paymentDueAmountEffective: 5000,
        }),
      ]);

      // Both present, MAX(0 × 6%, 5000) = 5000 → CALCULATED
      expect(result.credits[0].liabilityStatus).toBe(LiabilityStatus.CALCULATED);
      expect(result.credits[0].monthlyDebtContribution).toBe(5000);
    });
  });

  // ── Institution category ──────────────────────────────────────────────

  describe('institution category mapping', () => {
    it('classifies as BANK', async () => {
      const result = await service.calculate('case-1', [
        makeCredit({ institution: 'BBVA BANCOMER' }),
      ]);
      expect(result.credits[0].institutionCategory).toBe(InstitutionCategory.BANK);
    });

    it('classifies as DEPARTMENT_STORE', async () => {
      const result = await service.calculate('case-1', [
        makeCredit({ institution: 'LIVERPOOL' }),
      ]);
      expect(result.credits[0].institutionCategory).toBe(InstitutionCategory.DEPARTMENT_STORE);
    });

    it('classifies as NON_BANK_SERVICE fallback', async () => {
      const result = await service.calculate('case-1', [
        makeCredit({ institution: 'CFE' }),
      ]);
      expect(result.credits[0].institutionCategory).toBe(InstitutionCategory.NON_BANK_SERVICE);
    });
  });

  // ── Keyword classification (KEYWORD source) ────────────────────────────

  describe('keyword classification', () => {
    it('resolves to REVOLVING via keyword when Gemini says UNKNOWN', async () => {
      const result = await service.calculate('case-1', [
        makeCredit({
          creditType: 'TARJETA DE CREDITO',
          classification: 'UNKNOWN',
          currentBalance: 100000,
          paymentDueAmountEffective: 2000,
        }),
      ]);

      const credit = result.credits[0];
      expect(credit.creditNature).toBe(CreditNature.REVOLVING);
      expect(credit.classificationSource).toBe(ClassificationSource.KEYWORD);
    });

    it('resolves to FIXED via keyword when Gemini says UNKNOWN', async () => {
      const result = await service.calculate('case-1', [
        makeCredit({
          creditType: 'CREDITO AUTO NISSAN',
          classification: 'UNKNOWN',
          currentBalance: 200000,
          paymentDueAmountEffective: 5000,
        }),
      ]);

      const credit = result.credits[0];
      expect(credit.creditNature).toBe(CreditNature.FIXED);
      expect(credit.classificationSource).toBe(ClassificationSource.KEYWORD);
    });

    it('resolves to FIXED via "SIMPLE" keyword for crédito simple', async () => {
      const result = await service.calculate('case-1', [
        makeCredit({
          creditType: 'CRÉDITO SIMPLE',
          classification: 'UNKNOWN',
          currentBalance: 50000,
          paymentDueAmountEffective: 2500,
        }),
      ]);

      const credit = result.credits[0];
      expect(credit.creditNature).toBe(CreditNature.FIXED);
      expect(credit.classificationSource).toBe(ClassificationSource.KEYWORD);
    });

    it('falls back to UNKNOWN when no keywords match', async () => {
      const result = await service.calculate('case-1', [
        makeCredit({
          creditType: 'CREDITO GENERICO',
          classification: 'UNKNOWN',
          currentBalance: 30000,
          paymentDueAmountEffective: 1500,
        }),
      ]);

      const credit = result.credits[0];
      expect(credit.creditNature).toBe(CreditNature.UNKNOWN);
      expect(credit.classificationSource).toBe(ClassificationSource.FALLBACK);
    });
  });

  // ── No automatic exclusion (mortgage included) ────────────────────────

  describe('no automatic exclusion', () => {
    it('mortgage credit included in grossCurrentMonthlyDebt', async () => {
      const result = await service.calculate('case-1', [
        makeCredit({
          creditReference: 'CR-MORTGAGE',
          creditType: 'HIPOTECA CASA',
          classification: 'FIXED_PAYMENT',
          currentBalance: 500000,
          paymentDueAmountEffective: 12000,
        }),
        makeCredit({
          creditReference: 'CR-REV1',
          creditType: 'TARJETA',
          classification: 'REVOLVING',
          currentBalance: 100000,
          paymentDueAmountEffective: 2000,
        }),
        makeCredit({
          creditReference: 'CR-REV2',
          creditType: 'TARJETA',
          classification: 'REVOLVING',
          currentBalance: 30000,
          paymentDueAmountEffective: 1000,
        }),
      ]);

      // Mortgage 12000 + revolving MAX(6000, 2000)=6000 + MAX(1800, 1000)=1800
      expect(result.grossCurrentMonthlyDebt).toBe(12000 + 6000 + 1800);
    });
  });

  // ── Snapshot persistence ──────────────────────────────────────────────

  describe('snapshot persistence', () => {
    it('creates a new LiabilitySnapshot on calculate', async () => {
      await service.calculate('case-1', [
        makeCredit({ creditReference: 'CR-001' }),
      ]);

      expect(mockPrisma.liabilitySnapshot.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.liabilitySnapshot.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mortgageCaseId: 'case-1',
            rulesVersion: expect.any(String),
            globalStatus: expect.any(String),
          }),
        }),
      );
    });

    it('persists factorUsed from the request', async () => {
      await service.calculate('case-1', [makeCredit()], 0.08);

      const call = mockPrisma.liabilitySnapshot.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(call.data.factorUsed).toBe(0.08);
    });
  });

  // ── getLatest ──────────────────────────────────────────────────────────

  describe('getLatest', () => {
    it('returns null when no snapshot exists', async () => {
      mockPrisma.liabilitySnapshot.findFirst.mockResolvedValue(null);

      const result = await service.getLatest('case-1');

      expect(result).toBeNull();
    });

    it('returns the most recent snapshot', async () => {
      const mockSnapshot = {
        id: 'snap-9',
        calculatedAt: new Date('2025-07-15T00:00:00.000Z'),
        factorUsed: 0.06,
        rulesVersion: '2024.1',
        credits: [
          {
            creditReference: 'CR-001',
            institution: 'BANCO',
            creditType: 'TARJETA',
            classification: 'REVOLVING',
            status: 'ACTIVE',
            currentBalance: 100000,
            paymentDueAmountEffective: 2000,
            isClosed: false,
            monthlyDebtContribution: 6000,
            creditNature: CreditNature.REVOLVING,
            institutionCategory: InstitutionCategory.BANK,
            ruleApplied: RuleApplied.REVOLVING_STANDARD,
            liabilityStatus: LiabilityStatus.CALCULATED,
            classificationSource: ClassificationSource.EXTRACTED,
            classificationReason: null,
          },
        ],
        globalStatus: GlobalLiabilityStatus.CALCULATED,
        grossCurrentMonthlyDebt: 6000,
        totalCurrentBalance: 100000,
      };
      mockPrisma.liabilitySnapshot.findFirst.mockResolvedValue(mockSnapshot);

      const result = await service.getLatest('case-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('snap-9');
      expect(result!.credits[0].creditReference).toBe('CR-001');
    });
  });

  // ── overrideCredit ────────────────────────────────────────────────────

  describe('overrideCredit', () => {
    it('throws NotFoundException when no snapshot exists', async () => {
      await expect(
        service.overrideCredit('case-1', 0, { reason: 'manual override' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for invalid credit index', async () => {
      const mockSnapshot = {
        id: 'snap-1',
        calculatedAt: new Date('2025-01-01'),
        factorUsed: 0.06,
        rulesVersion: '2024.1',
        credits: [{} as LiabilityCreditResult],
        globalStatus: GlobalLiabilityStatus.CALCULATED,
        grossCurrentMonthlyDebt: 6000,
        totalCurrentBalance: 100000,
      };
      mockPrisma.liabilitySnapshot.findFirst.mockResolvedValue(mockSnapshot);

      await expect(
        service.overrideCredit('case-1', 5, { reason: 'test override' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('overrides creditNature to FIXED and recalculates', async () => {
      const existingCredit: LiabilityCreditResult = {
        creditReference: 'CR-001',
        institution: 'BANCO',
        creditType: 'TARJETA',
        classification: 'UNKNOWN',
        status: 'ACTIVE',
        currentBalance: 200000,
        paymentDueAmountEffective: 5000,
        isClosed: false,
        monthlyDebtContribution: 12000, // was REVOLVING: MAX(200000×6%, ...)
        creditNature: CreditNature.REVOLVING,
        institutionCategory: InstitutionCategory.BANK,
        ruleApplied: RuleApplied.REVOLVING_STANDARD,
        liabilityStatus: LiabilityStatus.CALCULATED,
        classificationSource: ClassificationSource.KEYWORD,
        classificationReason: null,
      };

      mockPrisma.liabilitySnapshot.findFirst.mockResolvedValue({
        id: 'snap-1',
        calculatedAt: new Date('2025-01-01'),
        factorUsed: 0.06,
        rulesVersion: '2024.1',
        credits: [existingCredit],
        globalStatus: GlobalLiabilityStatus.CALCULATED,
        grossCurrentMonthlyDebt: 12000,
        totalCurrentBalance: 200000,
      });

      const result = await service.overrideCredit('case-1', 0, {
        creditNature: CreditNature.FIXED,
        reason: 'Advisor confirmed this is a fixed payment loan',
      });

      const credit = result.credits[0];
      expect(credit.creditNature).toBe(CreditNature.FIXED);
      expect(credit.classificationSource).toBe(ClassificationSource.MANUAL);
      expect(credit.classificationReason).toBe('Advisor confirmed this is a fixed payment loan');
      // FIXED uses payment directly → 5000
      expect(credit.monthlyDebtContribution).toBe(5000);
      expect(credit.ruleApplied).toBe(RuleApplied.FIXED_DIRECT);
      // New snapshot created
      expect(mockPrisma.liabilitySnapshot.create).toHaveBeenCalledTimes(1);
    });
  });
});