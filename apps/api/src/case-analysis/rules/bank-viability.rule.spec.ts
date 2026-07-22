// Tests unitarios para BankViabilityRule (HU-13).
// PrismaService se mockea; se verifica la resolución de inputs,
// los 7 controles por producto, la precedencia de status, el
// resultado agregado y la estructura del snapshot de auditoría.

import { BankViabilityRule } from './bank-viability.rule';
import type { PrismaService } from '../../prisma/prisma.service';
import type { CaseAnalysisContext, BankViabilitySnapshot } from '../types/bank-viability.types';

// ── Helpers ──────────────────────────────────────────────────────────────

/** Extract bankViability snapshot from RuleResult.detail with proper typing. */
function getBv(result: { detail: Record<string, unknown> }): BankViabilitySnapshot {
  return (result.detail as Record<string, unknown>).bankViability as BankViabilitySnapshot;
}

function makePrismaMock() {
  return {
    mortgageCase: { findUnique: jest.fn() },
    incomeCalculation: { findFirst: jest.fn() },
    liabilitySnapshot: { findFirst: jest.fn() },
    creditType: { findUnique: jest.fn() },
    bankProductPolicy: { findMany: jest.fn() },
    document: { findMany: jest.fn() },
  };
}

const CALCULATED_AT = new Date('2026-07-20T15:00:00Z');
const SOURCE_VERSION = 'ANAQUEL_MAYO_2026';

/** Default case with viable values for BANORTE_ADQ_HF. */
function defaultCase() {
  return {
    id: 'case-1',
    requestedAmount: { toString: () => '1600000.00' },
    propertyValue: { toString: () => '2000000.00' },
    estimatedTermMonths: 240,
    personType: 'SALARIED',
    creditTypeId: 1,
    clientId: 'client-1',
  };
}

function defaultIncomeCalculation() {
  return {
    id: 'inc-1',
    confirmedGrossIncome: { toString: () => '83427.21' },
    confirmedNetIncome: { toString: () => '56976.33' },
    averageGrossIncome: { toString: () => '80000.00' },
    averageNetIncome: { toString: () => '55000.00' },
    receiptResults: JSON.stringify([
      { documentId: 'doc-payroll-1' },
    ]),
    calculatedAt: CALCULATED_AT,
  };
}

function defaultLiabilitySnapshot() {
  return {
    id: 'liab-1',
    grossCurrentMonthlyDebt: { toString: () => '19304.74' },
    calculatedAt: CALCULATED_AT,
  };
}

function defaultCreditType() {
  return { id: 1, code: 'COMPRA', destination: 'ACQUISITION' };
}

function makeBank(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bank-banorte',
    code: 'BANORTE',
    name: 'Banorte',
    debtCommitmentFactor: { toString: () => '0.60' },
    incomeCriterion: 'NET',
    isActive: true,
    sourceVersion: SOURCE_VERSION,
    ...overrides,
  };
}

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prod-1',
    bankId: 'bank-banorte',
    code: 'BANORTE_ADQ_HF',
    name: 'Adquisición Hipoteca Fija',
    destination: 'ACQUISITION',
    personType: 'SALARIED',
    minimumEmploymentTenureMonths: 6,
    minimumApplicantAgeMonths: 300,
    maximumApplicationAgeMonths: 839,
    maximumMaturityAgeMonths: 960,
    maximumLtv: { toString: () => '0.90' },
    isActive: true,
    sourceVersion: SOURCE_VERSION,
    bank: makeBank(),
    ...overrides,
  };
}

function defaultContext(flags?: { hasPagadoraIncome?: boolean; scotiabankExcluded?: boolean }): CaseAnalysisContext {
  return {
    client: { id: 'client-1', fullName: 'JOSE PEREZ' },
    caseId: 'case-1',
    ...(flags ? { bankarizationFlags: { hasPagadoraIncome: flags.hasPagadoraIncome ?? false, scotiabankExcluded: flags.scotiabankExcluded ?? false } } : {}),
  } as CaseAnalysisContext;
}

function defaultDocuments() {
  return [
    {
      documentType: { code: 'INE' },
      extractedData: { identity: { fullName: 'JOSE PEREZ', birthDate: '1992-06-14' } },
      processingResults: { identity: { birthDate: '1992-06-14' } },
    },
  ];
}

function makeRuleAndMock() {
  const prisma = makePrismaMock();
  const rule = new BankViabilityRule(prisma as unknown as PrismaService);

  // Default successful mocks
  prisma.mortgageCase.findUnique.mockResolvedValue(defaultCase());
  prisma.incomeCalculation.findFirst.mockResolvedValue(defaultIncomeCalculation());
  prisma.liabilitySnapshot.findFirst.mockResolvedValue(defaultLiabilitySnapshot());
  prisma.creditType.findUnique.mockResolvedValue(defaultCreditType());
  prisma.bankProductPolicy.findMany.mockResolvedValue([makeProduct()]);
  prisma.document.findMany.mockResolvedValue([]);

  return { rule, prisma };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('BankViabilityRule', () => {
  it('has ruleId "bank-viability"', () => {
    const { rule } = makeRuleAndMock();
    expect(rule.ruleId).toBe('bank-viability');
  });

  // ─────────────────────────────────────────────────────────────────────
  // 1. Input Resolution
  // ─────────────────────────────────────────────────────────────────────
  describe('input resolution', () => {
    it('reads MortgageCase, IncomeCalculation, LiabilitySnapshot, and CreditType', async () => {
      const { rule, prisma } = makeRuleAndMock();
      await rule.execute(defaultContext(), defaultDocuments());

      expect(prisma.mortgageCase.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'case-1' } }),
      );
      expect(prisma.incomeCalculation.findFirst).toHaveBeenCalled();
      expect(prisma.liabilitySnapshot.findFirst).toHaveBeenCalled();
      expect(prisma.creditType.findUnique).toHaveBeenCalled();
    });

    it('derives birthDate from INE processingResults', async () => {
      const { rule, prisma } = makeRuleAndMock();
      prisma.bankProductPolicy.findMany.mockResolvedValue([
        makeProduct({ maximumMaturityAgeMonths: 960 }),
      ]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      const snapshot = getBv(result);
      expect(snapshot.inputs.birthDate).toBe('1992-06-14');
    });

    it('falls back to extractedData when processingResults lacks birthDate', async () => {
      const { rule, prisma } = makeRuleAndMock();
      const docs = [
        {
          documentType: { code: 'INE' },
          extractedData: { identity: { birthDate: '1990-01-15' } },
          processingResults: null,
        },
      ];
      prisma.bankProductPolicy.findMany.mockResolvedValue([makeProduct()]);

      const result = await rule.execute(defaultContext(), docs);
      expect(getBv(result).inputs.birthDate).toBe('1990-01-15');
    });

    it('returns MISSING_BIRTH_DATE when no birthDate found', async () => {
      const { rule, prisma } = makeRuleAndMock();
      prisma.document.findMany.mockResolvedValue([]);
      prisma.bankProductPolicy.findMany.mockResolvedValue([makeProduct()]);

      const result = await rule.execute(defaultContext(), []);
      expect(getBv(result).reasons).toContain('MISSING_BIRTH_DATE');
    });

    it('derives employmentStartDate from payroll receipt hireDate', async () => {
      const { rule, prisma } = makeRuleAndMock();
      const incomeCalc = {
        ...defaultIncomeCalculation(),
        receiptResults: JSON.stringify([{ documentId: 'doc-payroll-1' }]),
      };
      prisma.incomeCalculation.findFirst.mockResolvedValue(incomeCalc);
      prisma.document.findMany.mockResolvedValue([
        {
          id: 'doc-payroll-1',
          documentType: { code: 'PAYROLL_RECEIPT' },
          extractedData: {
            employee: { hireDate: '2024-01-15' },
          },
          processingResults: null,
        },
      ]);
      prisma.bankProductPolicy.findMany.mockResolvedValue([makeProduct()]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      expect(getBv(result).inputs.employmentStartDate).toBe('2024-01-15');
    });

    it('returns CONFLICTING_EMPLOYMENT_DATES when receipts have different hireDates', async () => {
      const { rule, prisma } = makeRuleAndMock();
      const incomeCalc = {
        ...defaultIncomeCalculation(),
        receiptResults: JSON.stringify([
          { documentId: 'doc-payroll-1' },
          { documentId: 'doc-payroll-2' },
        ]),
      };
      prisma.incomeCalculation.findFirst.mockResolvedValue(incomeCalc);
      prisma.document.findMany.mockResolvedValue([
        {
          id: 'doc-payroll-1',
          documentType: { code: 'PAYROLL_RECEIPT' },
          extractedData: { employee: { hireDate: '2024-01-15' } },
          processingResults: null,
        },
        {
          id: 'doc-payroll-2',
          documentType: { code: 'PAYROLL_RECEIPT' },
          extractedData: { employee: { hireDate: '2023-06-01' } },
          processingResults: null,
        },
      ]);
      prisma.bankProductPolicy.findMany.mockResolvedValue([makeProduct()]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      expect(getBv(result).reasons).toContain('CONFLICTING_EMPLOYMENT_DATES');
    });

    it('reads hasPagadoraIncome and scotiabankExcluded from bankarizationFlags context', async () => {
      const { rule, prisma } = makeRuleAndMock();
      prisma.bankProductPolicy.findMany.mockResolvedValue([
        makeProduct({ bank: makeBank({ code: 'SCOTIABANK' }) }),
      ]);

      const result = await rule.execute(
        defaultContext({ hasPagadoraIncome: true, scotiabankExcluded: true }),
        defaultDocuments(),
      );
      // Scotiabank + pagadora → REQUIRES_REVIEW
      expect(getBv(result).productMatches[0].status).toBe('REQUIRES_REVIEW');
      expect(getBv(result).productMatches[0].reasons).toContain(
        'SCOTIABANK_PAGADORA_EXCLUSION',
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 2. Income Selection
  // ─────────────────────────────────────────────────────────────────────
  describe('income selection', () => {
    it('selects NET income when bank incomeCriterion is NET', async () => {
      const { rule, prisma } = makeRuleAndMock();
      prisma.bankProductPolicy.findMany.mockResolvedValue([
        makeProduct({ bank: makeBank({ incomeCriterion: 'NET', debtCommitmentFactor: { toString: () => '0.60' } }) }),
      ]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      const calc = getBv(result).productMatches[0].calculation;
      expect(calc.incomeUsed).toBe('56976.33');
    });

    it('selects GROSS income when bank incomeCriterion is GROSS', async () => {
      const { rule, prisma } = makeRuleAndMock();
      prisma.bankProductPolicy.findMany.mockResolvedValue([
        makeProduct({ bank: makeBank({ incomeCriterion: 'GROSS', debtCommitmentFactor: { toString: () => '0.55' } }) }),
      ]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      const calc = getBv(result).productMatches[0].calculation;
      expect(calc.incomeUsed).toBe('83427.21');
    });

    it('returns REQUIRES_REVIEW when selected income is null', async () => {
      const { rule, prisma } = makeRuleAndMock();
      prisma.incomeCalculation.findFirst.mockResolvedValue({
        ...defaultIncomeCalculation(),
        confirmedNetIncome: null,
        averageNetIncome: null,
      });
      prisma.bankProductPolicy.findMany.mockResolvedValue([
        makeProduct({ bank: makeBank({ incomeCriterion: 'NET' }) }),
      ]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      expect(getBv(result).productMatches[0].status).toBe('REQUIRES_REVIEW');
      expect(getBv(result).productMatches[0].reasons).toContain('UNCONFIRMED_INCOME');
    });

    it('falls back to averageNetIncome when confirmedNetIncome is null', async () => {
      const { rule, prisma } = makeRuleAndMock();
      prisma.incomeCalculation.findFirst.mockResolvedValue({
        ...defaultIncomeCalculation(),
        confirmedGrossIncome: null,
        confirmedNetIncome: null,
        averageGrossIncome: { toString: () => '75000.00' },
        averageNetIncome: { toString: () => '50000.00' },
      });
      prisma.bankProductPolicy.findMany.mockResolvedValue([
        makeProduct({ bank: makeBank({ incomeCriterion: 'NET', debtCommitmentFactor: { toString: () => '0.60' } }) }),
      ]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      const calc = getBv(result).productMatches[0].calculation;
      // Should use averageNetIncome = 50000.00 as fallback
      expect(calc.incomeUsed).toBe('50000.00');
    });

    it('falls back to averageGrossIncome when confirmedGrossIncome is null', async () => {
      const { rule, prisma } = makeRuleAndMock();
      prisma.incomeCalculation.findFirst.mockResolvedValue({
        ...defaultIncomeCalculation(),
        confirmedGrossIncome: null,
        confirmedNetIncome: null,
        averageGrossIncome: { toString: () => '75000.00' },
        averageNetIncome: { toString: () => '50000.00' },
      });
      prisma.bankProductPolicy.findMany.mockResolvedValue([
        makeProduct({ bank: makeBank({ incomeCriterion: 'GROSS', debtCommitmentFactor: { toString: () => '0.55' } }) }),
      ]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      const calc = getBv(result).productMatches[0].calculation;
      // Should use averageGrossIncome = 75000.00 as fallback
      expect(calc.incomeUsed).toBe('75000.00');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 3. Capacity Control
  // ─────────────────────────────────────────────────────────────────────
  describe('capacity control', () => {
    it('passes when available capacity is positive', async () => {
      const { rule } = makeRuleAndMock();
      const result = await rule.execute(defaultContext(), defaultDocuments());
      const checks = getBv(result).productMatches[0].checks;
      expect(checks.capacity.status).toBe('PASS');
    });

    it('returns NOT_COMPATIBLE when capacity is zero or negative', async () => {
      const { rule, prisma } = makeRuleAndMock();
      // High liabilities to exhaust capacity: income 56976.33 * 0.60 = 34185.80
      // liabilities > 34185.80 → capacity < 0
      prisma.liabilitySnapshot.findFirst.mockResolvedValue({
        ...defaultLiabilitySnapshot(),
        grossCurrentMonthlyDebt: { toString: () => '40000.00' },
      });
      prisma.bankProductPolicy.findMany.mockResolvedValue([makeProduct()]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      expect(getBv(result).productMatches[0].status).toBe('NOT_COMPATIBLE');
      expect(getBv(result).productMatches[0].reasons).toContain(
        'NEGATIVE_CAPACITY',
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 4. LTV Control
  // ─────────────────────────────────────────────────────────────────────
  describe('ltv control', () => {
    it('passes when LTV is within limit', async () => {
      const { rule } = makeRuleAndMock();
      // requestedAmount=1,600,000 / propertyValue=2,000,000 = 0.80 < 0.90
      const result = await rule.execute(defaultContext(), defaultDocuments());
      const checks = getBv(result).productMatches[0].checks;
      expect(checks.ltv.status).toBe('PASS');
    });

    it('returns CONDITIONED when LTV exceeds maximum', async () => {
      const { rule, prisma } = makeRuleAndMock();
      prisma.mortgageCase.findUnique.mockResolvedValue({
        ...defaultCase(),
        requestedAmount: { toString: () => '1900000.00' },
        propertyValue: { toString: () => '2000000.00' },
      });
      prisma.bankProductPolicy.findMany.mockResolvedValue([
        makeProduct({ maximumLtv: { toString: () => '0.90' } }),
      ]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      // LTV = 0.95 > 0.90 → CONDITIONED
      expect(getBv(result).productMatches[0].status).toBe('CONDITIONED');
      expect(getBv(result).productMatches[0].reasons).toContain('LTV_EXCEEDED');
    });

    it('returns REQUIRES_REVIEW when requestedAmount is null', async () => {
      const { rule, prisma } = makeRuleAndMock();
      prisma.mortgageCase.findUnique.mockResolvedValue({
        ...defaultCase(),
        requestedAmount: null,
      });
      prisma.bankProductPolicy.findMany.mockResolvedValue([makeProduct()]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      expect(getBv(result).productMatches[0].checks.ltv.status).toBe(
        'REQUIRES_REVIEW',
      );
      expect(getBv(result).productMatches[0].reasons).toContain(
        'INVALID_REQUESTED_AMOUNT',
      );
    });

    it('returns REQUIRES_REVIEW when propertyValue is zero', async () => {
      const { rule, prisma } = makeRuleAndMock();
      prisma.mortgageCase.findUnique.mockResolvedValue({
        ...defaultCase(),
        propertyValue: { toString: () => '0' },
      });
      prisma.bankProductPolicy.findMany.mockResolvedValue([makeProduct()]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      expect(getBv(result).productMatches[0].checks.ltv.status).toBe(
        'REQUIRES_REVIEW',
      );
      expect(getBv(result).productMatches[0].reasons).toContain(
        'INVALID_PROPERTY_VALUE',
      );
    });

    it('returns NOT_APPLICABLE when maximumLtv policy is null', async () => {
      const { rule, prisma } = makeRuleAndMock();
      prisma.bankProductPolicy.findMany.mockResolvedValue([
        makeProduct({ maximumLtv: null }),
      ]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      expect(getBv(result).productMatches[0].checks.ltv.status).toBe(
        'NOT_APPLICABLE',
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 5. Minimum Age Control
  // ─────────────────────────────────────────────────────────────────────
  describe('minimum age control', () => {
    it('passes when age is above minimum', async () => {
      const { rule } = makeRuleAndMock();
      // birthDate 1992-06-14, calculatedAt 2026-07-20 = 409 months > 300
      const result = await rule.execute(defaultContext(), defaultDocuments());
      expect(getBv(result).productMatches[0].checks.minimumApplicantAge.status).toBe(
        'PASS',
      );
    });

    it('returns NOT_COMPATIBLE when age is below minimum', async () => {
      const { rule, prisma } = makeRuleAndMock();
      // Young person: born 2005-01-01 → ~258 months < 300
      const docs = [
        {
          documentType: { code: 'INE' },
          extractedData: { identity: { birthDate: '2005-01-01' } },
          processingResults: { identity: { birthDate: '2005-01-01' } },
        },
      ];
      prisma.bankProductPolicy.findMany.mockResolvedValue([
        makeProduct({ minimumApplicantAgeMonths: 300 }),
      ]);

      const result = await rule.execute(defaultContext(), docs);
      expect(getBv(result).productMatches[0].status).toBe('NOT_COMPATIBLE');
      expect(getBv(result).productMatches[0].reasons).toContain(
        'MINIMUM_AGE_NOT_MET',
      );
    });

    it('returns NOT_APPLICABLE when minimumApplicantAgeMonths is null', async () => {
      const { rule, prisma } = makeRuleAndMock();
      prisma.bankProductPolicy.findMany.mockResolvedValue([
        makeProduct({ minimumApplicantAgeMonths: null }),
      ]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      expect(
        getBv(result).productMatches[0].checks.minimumApplicantAge.status,
      ).toBe('NOT_APPLICABLE');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 6. Maximum Application Age Control
  // ─────────────────────────────────────────────────────────────────────
  describe('maximum application age control', () => {
    it('passes when age is within limit', async () => {
      const { rule } = makeRuleAndMock();
      // birthDate 1992-06-14, calculatedAt 2026-07-20 = 409 months < 839
      const result = await rule.execute(defaultContext(), defaultDocuments());
      expect(
        getBv(result).productMatches[0].checks.maximumApplicationAge.status,
      ).toBe('PASS');
    });

    it('returns NOT_COMPATIBLE when age exceeds maximum', async () => {
      const { rule, prisma } = makeRuleAndMock();
      // Old person: born 1950-01-01 → ~918 months > 839
      const docs = [
        {
          documentType: { code: 'INE' },
          extractedData: { identity: { birthDate: '1950-01-01' } },
          processingResults: { identity: { birthDate: '1950-01-01' } },
        },
      ];
      prisma.bankProductPolicy.findMany.mockResolvedValue([
        makeProduct({ maximumApplicationAgeMonths: 839 }),
      ]);

      const result = await rule.execute(defaultContext(), docs);
      expect(getBv(result).productMatches[0].status).toBe('NOT_COMPATIBLE');
      expect(getBv(result).productMatches[0].reasons).toContain(
        'MAXIMUM_APPLICATION_AGE_EXCEEDED',
      );
    });

    it('returns NOT_APPLICABLE when maximumApplicationAgeMonths is null', async () => {
      const { rule, prisma } = makeRuleAndMock();
      prisma.bankProductPolicy.findMany.mockResolvedValue([
        makeProduct({ maximumApplicationAgeMonths: null }),
      ]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      expect(
        getBv(result).productMatches[0].checks.maximumApplicationAge.status,
      ).toBe('NOT_APPLICABLE');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 7. Maturity Age Control
  // ─────────────────────────────────────────────────────────────────────
  describe('maturity age control', () => {
    it('passes when age at maturity is within limit', async () => {
      const { rule } = makeRuleAndMock();
      // currentAgeMonths=409, estimatedTermMonths=240 → ageAtMaturity=649 < 960
      const result = await rule.execute(defaultContext(), defaultDocuments());
      expect(getBv(result).productMatches[0].checks.maturityAge.status).toBe('PASS');
    });

    it('returns CONDITIONED when maturity age is exceeded but theoretical term > 0', async () => {
      const { rule, prisma } = makeRuleAndMock();
      // currentAgeMonths=409, estimatedTermMonths=600 → ageAtMaturity=1009 > 960
      // maxTheoreticalTerm = 960 - 409 = 551 > 0 → CONDITIONED
      prisma.mortgageCase.findUnique.mockResolvedValue({
        ...defaultCase(),
        estimatedTermMonths: 600,
      });
      prisma.bankProductPolicy.findMany.mockResolvedValue([
        makeProduct({ maximumMaturityAgeMonths: 960 }),
      ]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      expect(getBv(result).productMatches[0].status).toBe('CONDITIONED');
      expect(getBv(result).productMatches[0].reasons).toContain(
        'MATURITY_AGE_EXCEEDED',
      );
    });

    it('returns NOT_COMPATIBLE when maximumTheoreticalTermMonths is 0', async () => {
      const { rule, prisma } = makeRuleAndMock();
      // currentAgeMonths=409, maximumMaturityAgeMonths=400 → theoretical=0
      prisma.bankProductPolicy.findMany.mockResolvedValue([
        makeProduct({ maximumMaturityAgeMonths: 400 }),
      ]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      expect(getBv(result).productMatches[0].status).toBe('NOT_COMPATIBLE');
      expect(getBv(result).productMatches[0].reasons).toContain(
        'NO_VALID_TERM_AVAILABLE',
      );
    });

    it('returns NOT_APPLICABLE when maximumMaturityAgeMonths is null', async () => {
      const { rule, prisma } = makeRuleAndMock();
      prisma.bankProductPolicy.findMany.mockResolvedValue([
        makeProduct({ maximumMaturityAgeMonths: null }),
      ]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      expect(getBv(result).productMatches[0].checks.maturityAge.status).toBe(
        'NOT_APPLICABLE',
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 8. Employment Tenure Control
  // ─────────────────────────────────────────────────────────────────────
  describe('employment tenure control', () => {
    it('passes when tenure is sufficient', async () => {
      const { rule, prisma } = makeRuleAndMock();
      // hireDate 2024-01-15, calculatedAt 2026-07-20 = 30 months > 6
      prisma.document.findMany.mockResolvedValue([
        {
          id: 'doc-payroll-1',
          documentType: { code: 'PAYROLL_RECEIPT' },
          extractedData: { employee: { hireDate: '2024-01-15' } },
          processingResults: null,
        },
      ]);
      prisma.bankProductPolicy.findMany.mockResolvedValue([
        makeProduct({ minimumEmploymentTenureMonths: 6 }),
      ]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      expect(
        getBv(result).productMatches[0].checks.employmentTenure.status,
      ).toBe('PASS');
    });

    it('returns NOT_COMPATIBLE when tenure is insufficient', async () => {
      const { rule, prisma } = makeRuleAndMock();
      // hireDate 2026-06-01, calculatedAt 2026-07-20 = 1 month < 6
      prisma.document.findMany.mockResolvedValue([
        {
          id: 'doc-payroll-1',
          documentType: { code: 'PAYROLL_RECEIPT' },
          extractedData: { employee: { hireDate: '2026-06-01' } },
          processingResults: null,
        },
      ]);
      prisma.bankProductPolicy.findMany.mockResolvedValue([
        makeProduct({ minimumEmploymentTenureMonths: 6 }),
      ]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      expect(getBv(result).productMatches[0].status).toBe('NOT_COMPATIBLE');
      expect(getBv(result).productMatches[0].reasons).toContain(
        'INSUFFICIENT_EMPLOYMENT_TENURE',
      );
    });

    it('returns NOT_APPLICABLE when minimumEmploymentTenureMonths is null', async () => {
      const { rule, prisma } = makeRuleAndMock();
      prisma.bankProductPolicy.findMany.mockResolvedValue([
        makeProduct({ minimumEmploymentTenureMonths: null }),
      ]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      expect(
        getBv(result).productMatches[0].checks.employmentTenure.status,
      ).toBe('NOT_APPLICABLE');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 9. Scotiabank Pagadora Rule
  // ─────────────────────────────────────────────────────────────────────
  describe('Scotiabank pagadora rule', () => {
    it('returns REQUIRES_REVIEW for Scotiabank when hasPagadoraIncome and scotiabankExcluded are true', async () => {
      const { rule, prisma } = makeRuleAndMock();
      prisma.bankProductPolicy.findMany.mockResolvedValue([
        makeProduct({ bank: makeBank({ code: 'SCOTIABANK', debtCommitmentFactor: { toString: () => '0.55' }, incomeCriterion: 'GROSS' }) }),
      ]);

      const result = await rule.execute(
        defaultContext({ hasPagadoraIncome: true, scotiabankExcluded: true }),
        defaultDocuments(),
      );
      expect(getBv(result).productMatches[0].status).toBe('REQUIRES_REVIEW');
      expect(getBv(result).productMatches[0].reasons).toContain(
        'SCOTIABANK_PAGADORA_EXCLUSION',
      );
    });

    it('does not flag Scotiabank when scotiabankExcluded is false', async () => {
      const { rule, prisma } = makeRuleAndMock();
      prisma.bankProductPolicy.findMany.mockResolvedValue([
        makeProduct({ bank: makeBank({ code: 'SCOTIABANK', debtCommitmentFactor: { toString: () => '0.55' }, incomeCriterion: 'GROSS' }) }),
      ]);

      const result = await rule.execute(
        defaultContext({ hasPagadoraIncome: true, scotiabankExcluded: false }),
        defaultDocuments(),
      );
      // Not REQUIRES_REVIEW due to Scotiabank (may be PRELIMINARY_VIABLE or other)
      expect(getBv(result).productMatches[0].reasons).not.toContain(
        'SCOTIABANK_PAGADORA_EXCLUSION',
      );
    });

    it('does not affect non-Scotiabank products when flags are true', async () => {
      const { rule, prisma } = makeRuleAndMock();
      prisma.bankProductPolicy.findMany.mockResolvedValue([
        makeProduct({ bank: makeBank({ code: 'BANORTE' }) }),
      ]);

      const result = await rule.execute(
        defaultContext({ hasPagadoraIncome: true, scotiabankExcluded: true }),
        defaultDocuments(),
      );
      expect(getBv(result).productMatches[0].reasons).not.toContain(
        'SCOTIABANK_PAGADORA_EXCLUSION',
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 10. Status Precedence
  // ─────────────────────────────────────────────────────────────────────
  describe('status precedence', () => {
    it('NOT_COMPATIBLE takes precedence over CONDITIONED', async () => {
      const { rule, prisma } = makeRuleAndMock();
      // Make capacity negative (NOT_COMPATIBLE) AND LTV exceeded (CONDITIONED)
      prisma.mortgageCase.findUnique.mockResolvedValue({
        ...defaultCase(),
        requestedAmount: { toString: () => '1900000.00' },
        propertyValue: { toString: () => '2000000.00' },
      });
      prisma.liabilitySnapshot.findFirst.mockResolvedValue({
        ...defaultLiabilitySnapshot(),
        grossCurrentMonthlyDebt: { toString: () => '40000.00' },
      });
      prisma.bankProductPolicy.findMany.mockResolvedValue([
        makeProduct({ maximumLtv: { toString: () => '0.90' } }),
      ]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      // Negative capacity → NOT_COMPATIBLE (beats CONDITIONED from LTV)
      expect(getBv(result).productMatches[0].status).toBe('NOT_COMPATIBLE');
    });

    it('REQUIRES_REVIEW takes precedence over CONDITIONED', async () => {
      const { rule, prisma } = makeRuleAndMock();
      // Null net income AND null average → REQUIRES_REVIEW, AND LTV exceeded → CONDITIONED
      prisma.incomeCalculation.findFirst.mockResolvedValue({
        ...defaultIncomeCalculation(),
        confirmedNetIncome: null,
        averageNetIncome: null,
      });
      prisma.mortgageCase.findUnique.mockResolvedValue({
        ...defaultCase(),
        requestedAmount: { toString: () => '1900000.00' },
        propertyValue: { toString: () => '2000000.00' },
      });
      prisma.bankProductPolicy.findMany.mockResolvedValue([
        makeProduct({ maximumLtv: { toString: () => '0.90' } }),
      ]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      expect(getBv(result).productMatches[0].status).toBe('REQUIRES_REVIEW');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 11. Aggregate Outcome
  // ─────────────────────────────────────────────────────────────────────
  describe('aggregate outcome', () => {
    it('returns PASS when at least one product is PRELIMINARY_VIABLE', async () => {
      const { rule } = makeRuleAndMock();
      const result = await rule.execute(defaultContext(), defaultDocuments());
      expect(result.outcome).toBe('PASS');
    });

    it('returns PARTIAL when no viable but at least one CONDITIONED', async () => {
      const { rule, prisma } = makeRuleAndMock();
      // LTV exceeded → CONDITIONED, all other checks pass
      prisma.mortgageCase.findUnique.mockResolvedValue({
        ...defaultCase(),
        requestedAmount: { toString: () => '1900000.00' },
        propertyValue: { toString: () => '2000000.00' },
      });
      prisma.bankProductPolicy.findMany.mockResolvedValue([
        makeProduct({ maximumLtv: { toString: () => '0.80' } }),
      ]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      expect(result.outcome).toBe('PARTIAL');
    });

    it('returns FAIL when all products are NOT_COMPATIBLE', async () => {
      const { rule, prisma } = makeRuleAndMock();
      // Negative capacity → NOT_COMPATIBLE for all
      prisma.liabilitySnapshot.findFirst.mockResolvedValue({
        ...defaultLiabilitySnapshot(),
        grossCurrentMonthlyDebt: { toString: () => '50000.00' },
      });
      prisma.bankProductPolicy.findMany.mockResolvedValue([makeProduct()]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      expect(result.outcome).toBe('FAIL');
    });

    it('returns PARTIAL when destination is null', async () => {
      const { rule, prisma } = makeRuleAndMock();
      prisma.creditType.findUnique.mockResolvedValue({
        id: 1,
        code: 'TERRENO',
        destination: null,
      });
      prisma.bankProductPolicy.findMany.mockResolvedValue([]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      expect(result.outcome).toBe('PARTIAL');
      expect(getBv(result).reasons).toContain('UNSUPPORTED_DESTINATION');
      expect(getBv(result).productMatches).toHaveLength(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 12. Audit Snapshot
  // ─────────────────────────────────────────────────────────────────────
  describe('audit snapshot', () => {
    it('includes all required fields in the snapshot structure', async () => {
      const { rule } = makeRuleAndMock();
      const result = await rule.execute(defaultContext(), defaultDocuments());
      const bv = getBv(result);

      expect(bv.sourceVersion).toBe(SOURCE_VERSION);
      expect(bv.creditTypeCode).toBe('COMPRA');
      expect(bv.destination).toBe('ACQUISITION');
      expect(bv.calculatedAt).toBeDefined();
      expect(bv.warningLegend).toBeDefined();
      expect(Array.isArray(bv.reasons)).toBe(true);
      expect(bv.inputs).toBeDefined();
      expect(Array.isArray(bv.productMatches)).toBe(true);
    });

    it('serializes all Decimal values as strings', async () => {
      const { rule } = makeRuleAndMock();
      const result = await rule.execute(defaultContext(), defaultDocuments());
      const calc = getBv(result).productMatches[0].calculation;

      expect(typeof calc.incomeUsed).toBe('string');
      expect(typeof calc.maximumDebt).toBe('string');
      expect(typeof calc.totalMonthlyLiabilities).toBe('string');
      expect(typeof calc.availableCapacity).toBe('string');
      expect(typeof calc.requestedLtv).toBe('string');
      expect(typeof calc.maximumAmountByLtv).toBe('string');
      expect(typeof calc.requiredReduction).toBe('string');

      // Verify actual computed values
      // incomeUsed = 56976.33, maximumDebt = 56976.33 * 0.60 = 34185.798 → 34185.80
      expect(calc.maximumDebt).toBe('34185.80');
      expect(calc.incomeUsed).toBe('56976.33');
      expect(calc.totalMonthlyLiabilities).toBe('19304.74');
      // availableCapacity = 34185.80 - 19304.74 = 14881.06
      expect(calc.availableCapacity).toBe('14881.06');
      // requestedLtv = 1600000 / 2000000 = 0.80
      expect(calc.requestedLtv).toBe('0.80');
    });

    it('places warningLegend at bankViability level, not per product', async () => {
      const { rule } = makeRuleAndMock();
      const result = await rule.execute(defaultContext(), defaultDocuments());
      const bv = getBv(result);

      expect(bv.warningLegend).toBeTruthy();
      // warningLegend should NOT be inside productMatches
      for (const pm of bv.productMatches) {
        expect((pm as unknown as Record<string, unknown>).warningLegend).toBeUndefined();
      }
    });

    it('uses two-level reasons: global vs per-product', async () => {
      const { rule, prisma } = makeRuleAndMock();
      // Null destination → global reason
      prisma.creditType.findUnique.mockResolvedValue({
        id: 1,
        code: 'TERRENO',
        destination: null,
      });
      prisma.bankProductPolicy.findMany.mockResolvedValue([]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      // Global reasons
      expect(getBv(result).reasons).toContain('UNSUPPORTED_DESTINATION');
      // No product matches when destination is null
      expect(getBv(result).productMatches).toHaveLength(0);
    });

    it('includes policySnapshot with bank and product policy data', async () => {
      const { rule } = makeRuleAndMock();
      const result = await rule.execute(defaultContext(), defaultDocuments());
      const pm = getBv(result).productMatches[0];

      expect(pm.policySnapshot).toBeDefined();
      expect(pm.policySnapshot.incomeCriterion).toBe('NET');
      expect(pm.policySnapshot.debtCommitmentFactor).toBe('0.60');
      expect(pm.policySnapshot.maximumLtv).toBe('0.90');
    });

    it('includes product-level checks with status and values', async () => {
      const { rule } = makeRuleAndMock();
      const result = await rule.execute(defaultContext(), defaultDocuments());
      const checks = getBv(result).productMatches[0].checks;

      expect(checks.capacity).toBeDefined();
      expect(checks.capacity.status).toBe('PASS');
      expect(checks.ltv).toBeDefined();
      expect(checks.ltv.status).toBe('PASS');
      expect(checks.maturityAge).toBeDefined();
      expect(checks.minimumApplicantAge).toBeDefined();
      expect(checks.maximumApplicationAge).toBeDefined();
      expect(checks.employmentTenure).toBeDefined();
    });
  });
});
