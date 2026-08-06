// Tests unitarios para BankViabilityRule (HU-13).
// PrismaService se mockea; se verifica la resolución de inputs,
// los 5 controles por policy (capacity, minimum age, maximum application
// age, employment tenure, scotiabank pagadora), la precedencia de status,
// el resultado agregado y la estructura del snapshot de auditoría.

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
    bankPolicy: { findMany: jest.fn() },
    document: { findMany: jest.fn() },
  };
}

const CALCULATED_AT = new Date('2026-07-20T15:00:00Z');
const SOURCE_VERSION = 'ANAQUEL_AGOSTO_2026';

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

function makePolicy(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prod-1',
    bankId: 'bank-banorte',
    code: 'BANORTE_ADQ_HF',
    destination: 'ACQUISITION',
    minimumIncome: null,
    minimumPropertyValue: null,
    minimumEmploymentTenureMonths: 6,
    minimumApplicantAgeMonths: 300,
    maximumApplicationAgeMonths: 839,
    isActive: true,
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
  prisma.bankPolicy.findMany.mockResolvedValue([makePolicy()]);
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
      prisma.bankPolicy.findMany.mockResolvedValue([
        makePolicy(),
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
      prisma.bankPolicy.findMany.mockResolvedValue([makePolicy()]);

      const result = await rule.execute(defaultContext(), docs);
      expect(getBv(result).inputs.birthDate).toBe('1990-01-15');
    });

    it('returns MISSING_BIRTH_DATE when no birthDate found', async () => {
      const { rule, prisma } = makeRuleAndMock();
      prisma.document.findMany.mockResolvedValue([]);
      prisma.bankPolicy.findMany.mockResolvedValue([makePolicy()]);

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
            employment: { hireDate: '2024-01-15' },
          },
          processingResults: null,
        },
      ]);
      prisma.bankPolicy.findMany.mockResolvedValue([makePolicy()]);

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
          extractedData: { employment: { hireDate: '2024-01-15' } },
          processingResults: null,
        },
        {
          id: 'doc-payroll-2',
          documentType: { code: 'PAYROLL_RECEIPT' },
          extractedData: { employment: { hireDate: '2023-06-01' } },
          processingResults: null,
        },
      ]);
      prisma.bankPolicy.findMany.mockResolvedValue([makePolicy()]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      expect(getBv(result).reasons).toContain('CONFLICTING_EMPLOYMENT_DATES');
    });

    it('reads hasPagadoraIncome and scotiabankExcluded from bankarizationFlags context', async () => {
      const { rule, prisma } = makeRuleAndMock();
      prisma.bankPolicy.findMany.mockResolvedValue([
        makePolicy({ bank: makeBank({ code: 'SCOTIABANK' }) }),
      ]);

      const result = await rule.execute(
        defaultContext({ hasPagadoraIncome: true, scotiabankExcluded: true }),
        defaultDocuments(),
      );
      // Scotiabank + pagadora → REQUIRES_REVIEW
      expect(getBv(result).bankResults[0].status).toBe('REQUIRES_REVIEW');
      expect(getBv(result).bankResults[0].reasons).toContain(
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
      prisma.bankPolicy.findMany.mockResolvedValue([
        makePolicy({ bank: makeBank({ incomeCriterion: 'NET', debtCommitmentFactor: { toString: () => '0.60' } }) }),
      ]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      const calc = getBv(result).bankResults[0].calculation;
      expect(calc.incomeUsed).toBe('56976.33');
    });

    it('selects GROSS income when bank incomeCriterion is GROSS', async () => {
      const { rule, prisma } = makeRuleAndMock();
      prisma.bankPolicy.findMany.mockResolvedValue([
        makePolicy({ bank: makeBank({ incomeCriterion: 'GROSS', debtCommitmentFactor: { toString: () => '0.55' } }) }),
      ]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      const calc = getBv(result).bankResults[0].calculation;
      expect(calc.incomeUsed).toBe('83427.21');
    });

    it('returns REQUIRES_REVIEW when selected income is null', async () => {
      const { rule, prisma } = makeRuleAndMock();
      prisma.incomeCalculation.findFirst.mockResolvedValue({
        ...defaultIncomeCalculation(),
        confirmedNetIncome: null,
        averageNetIncome: null,
      });
      prisma.bankPolicy.findMany.mockResolvedValue([
        makePolicy({ bank: makeBank({ incomeCriterion: 'NET' }) }),
      ]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      expect(getBv(result).bankResults[0].status).toBe('REQUIRES_REVIEW');
      expect(getBv(result).bankResults[0].reasons).toContain('UNCONFIRMED_INCOME');
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
      prisma.bankPolicy.findMany.mockResolvedValue([
        makePolicy({ bank: makeBank({ incomeCriterion: 'NET', debtCommitmentFactor: { toString: () => '0.60' } }) }),
      ]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      const calc = getBv(result).bankResults[0].calculation;
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
      prisma.bankPolicy.findMany.mockResolvedValue([
        makePolicy({ bank: makeBank({ incomeCriterion: 'GROSS', debtCommitmentFactor: { toString: () => '0.55' } }) }),
      ]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      const calc = getBv(result).bankResults[0].calculation;
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
      const checks = getBv(result).bankResults[0].checks;
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
      prisma.bankPolicy.findMany.mockResolvedValue([makePolicy()]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      expect(getBv(result).bankResults[0].status).toBe('NOT_COMPATIBLE');
      expect(getBv(result).bankResults[0].reasons).toContain(
        'NEGATIVE_CAPACITY',
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 4. Minimum Age Control
  // ─────────────────────────────────────────────────────────────────────
  describe('minimum age control', () => {
    it('passes when age is above minimum', async () => {
      const { rule } = makeRuleAndMock();
      // birthDate 1992-06-14, calculatedAt 2026-07-20 = 409 months > 300
      const result = await rule.execute(defaultContext(), defaultDocuments());
      expect(getBv(result).bankResults[0].checks.minimumApplicantAge.status).toBe(
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
      prisma.bankPolicy.findMany.mockResolvedValue([
        makePolicy({ minimumApplicantAgeMonths: 300 }),
      ]);

      const result = await rule.execute(defaultContext(), docs);
      expect(getBv(result).bankResults[0].status).toBe('NOT_COMPATIBLE');
      expect(getBv(result).bankResults[0].reasons).toContain(
        'MINIMUM_AGE_NOT_MET',
      );
    });

    it('returns NOT_APPLICABLE when minimumApplicantAgeMonths is null', async () => {
      const { rule, prisma } = makeRuleAndMock();
      prisma.bankPolicy.findMany.mockResolvedValue([
        makePolicy({ minimumApplicantAgeMonths: null }),
      ]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      expect(
        getBv(result).bankResults[0].checks.minimumApplicantAge.status,
      ).toBe('NOT_APPLICABLE');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 5. Maximum Application Age Control
  // ─────────────────────────────────────────────────────────────────────
  describe('maximum application age control', () => {
    it('passes when age is within limit', async () => {
      const { rule } = makeRuleAndMock();
      // birthDate 1992-06-14, calculatedAt 2026-07-20 = 409 months < 839
      const result = await rule.execute(defaultContext(), defaultDocuments());
      expect(
        getBv(result).bankResults[0].checks.maximumApplicationAge.status,
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
      prisma.bankPolicy.findMany.mockResolvedValue([
        makePolicy({ maximumApplicationAgeMonths: 839 }),
      ]);

      const result = await rule.execute(defaultContext(), docs);
      expect(getBv(result).bankResults[0].status).toBe('NOT_COMPATIBLE');
      expect(getBv(result).bankResults[0].reasons).toContain(
        'MAXIMUM_APPLICATION_AGE_EXCEEDED',
      );
    });

    it('returns NOT_APPLICABLE when maximumApplicationAgeMonths is null', async () => {
      const { rule, prisma } = makeRuleAndMock();
      prisma.bankPolicy.findMany.mockResolvedValue([
        makePolicy({ maximumApplicationAgeMonths: null }),
      ]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      expect(
        getBv(result).bankResults[0].checks.maximumApplicationAge.status,
      ).toBe('NOT_APPLICABLE');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 6. Employment Tenure Control
  // ─────────────────────────────────────────────────────────────────────
  describe('employment tenure control', () => {
    it('passes when tenure is sufficient', async () => {
      const { rule, prisma } = makeRuleAndMock();
      // hireDate 2024-01-15, calculatedAt 2026-07-20 = 30 months > 6
      prisma.document.findMany.mockResolvedValue([
        {
          id: 'doc-payroll-1',
          documentType: { code: 'PAYROLL_RECEIPT' },
          extractedData: { employment: { hireDate: '2024-01-15' } },
          processingResults: null,
        },
      ]);
      prisma.bankPolicy.findMany.mockResolvedValue([
        makePolicy({ minimumEmploymentTenureMonths: 6 }),
      ]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      expect(
        getBv(result).bankResults[0].checks.employmentTenure.status,
      ).toBe('PASS');
    });

    it('returns NOT_COMPATIBLE when tenure is insufficient', async () => {
      const { rule, prisma } = makeRuleAndMock();
      // hireDate 2026-06-01, calculatedAt 2026-07-20 = 1 month < 6
      prisma.document.findMany.mockResolvedValue([
        {
          id: 'doc-payroll-1',
          documentType: { code: 'PAYROLL_RECEIPT' },
          extractedData: { employment: { hireDate: '2026-06-01' } },
          processingResults: null,
        },
      ]);
      prisma.bankPolicy.findMany.mockResolvedValue([
        makePolicy({ minimumEmploymentTenureMonths: 6 }),
      ]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      expect(getBv(result).bankResults[0].status).toBe('NOT_COMPATIBLE');
      expect(getBv(result).bankResults[0].reasons).toContain(
        'INSUFFICIENT_EMPLOYMENT_TENURE',
      );
    });

    it('returns NOT_APPLICABLE when minimumEmploymentTenureMonths is null', async () => {
      const { rule, prisma } = makeRuleAndMock();
      prisma.bankPolicy.findMany.mockResolvedValue([
        makePolicy({ minimumEmploymentTenureMonths: null }),
      ]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      expect(
        getBv(result).bankResults[0].checks.employmentTenure.status,
      ).toBe('NOT_APPLICABLE');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 7. Scotiabank Pagadora Rule
  // ─────────────────────────────────────────────────────────────────────
  describe('Scotiabank pagadora rule', () => {
    it('returns REQUIRES_REVIEW for Scotiabank when hasPagadoraIncome and scotiabankExcluded are true', async () => {
      const { rule, prisma } = makeRuleAndMock();
      prisma.bankPolicy.findMany.mockResolvedValue([
        makePolicy({ bank: makeBank({ code: 'SCOTIABANK', debtCommitmentFactor: { toString: () => '0.55' }, incomeCriterion: 'GROSS' }) }),
      ]);

      const result = await rule.execute(
        defaultContext({ hasPagadoraIncome: true, scotiabankExcluded: true }),
        defaultDocuments(),
      );
      expect(getBv(result).bankResults[0].status).toBe('REQUIRES_REVIEW');
      expect(getBv(result).bankResults[0].reasons).toContain(
        'SCOTIABANK_PAGADORA_EXCLUSION',
      );
    });

    it('does not flag Scotiabank when scotiabankExcluded is false', async () => {
      const { rule, prisma } = makeRuleAndMock();
      prisma.bankPolicy.findMany.mockResolvedValue([
        makePolicy({ bank: makeBank({ code: 'SCOTIABANK', debtCommitmentFactor: { toString: () => '0.55' }, incomeCriterion: 'GROSS' }) }),
      ]);

      const result = await rule.execute(
        defaultContext({ hasPagadoraIncome: true, scotiabankExcluded: false }),
        defaultDocuments(),
      );
      // Not REQUIRES_REVIEW due to Scotiabank (may be PRELIMINARY_VIABLE or other)
      expect(getBv(result).bankResults[0].reasons).not.toContain(
        'SCOTIABANK_PAGADORA_EXCLUSION',
      );
    });

    it('does not affect non-Scotiabank products when flags are true', async () => {
      const { rule, prisma } = makeRuleAndMock();
      prisma.bankPolicy.findMany.mockResolvedValue([
        makePolicy({ bank: makeBank({ code: 'BANORTE' }) }),
      ]);

      const result = await rule.execute(
        defaultContext({ hasPagadoraIncome: true, scotiabankExcluded: true }),
        defaultDocuments(),
      );
      expect(getBv(result).bankResults[0].reasons).not.toContain(
        'SCOTIABANK_PAGADORA_EXCLUSION',
      );
    });

    it('defaults to { false, false } when deriveScotiabankFlags receives undefined (no bankarizationFlags in context)', async () => {
      // Exercises the `deriveScotiabankFlags(undefined)` branch of
      // BankViabilityRule.deriveScotiabankFlags(): when the orchestrator does
      // not pass `bankarizationFlags` in the Phase C context, the rule MUST
      // treat both Scotiabank flags as false rather than crashing or
      // reading stale data from the DB.
      const { rule, prisma } = makeRuleAndMock();
      prisma.bankPolicy.findMany.mockResolvedValue([
        makePolicy({ bank: makeBank({ code: 'SCOTIABANK' }) }),
      ]);

      // defaultContext() with no args yields a context that does NOT
      // include `bankarizationFlags` — exactly the undefined-flags case.
      const result = await rule.execute(defaultContext(), defaultDocuments());

      const inputs = getBv(result).inputs;
      expect(inputs.hasPagadoraIncome).toBe(false);
      expect(inputs.scotiabankExcluded).toBe(false);
      // Scotiabank without pagadora → must not be flagged for exclusion
      expect(getBv(result).bankResults[0].reasons).not.toContain(
        'SCOTIABANK_PAGADORA_EXCLUSION',
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 8. Status Precedence
  // ─────────────────────────────────────────────────────────────────────
  describe('status precedence', () => {
    it('NOT_COMPATIBLE takes precedence over REQUIRES_REVIEW', async () => {
      const { rule, prisma } = makeRuleAndMock();
      // Negative capacity (NOT_COMPATIBLE) AND missing employment data (REQUIRES_REVIEW)
      prisma.liabilitySnapshot.findFirst.mockResolvedValue({
        ...defaultLiabilitySnapshot(),
        grossCurrentMonthlyDebt: { toString: () => '40000.00' },
      });
      prisma.bankPolicy.findMany.mockResolvedValue([
        makePolicy({ minimumEmploymentTenureMonths: 6 }),
      ]);
      // No employment data → REQUIRES_REVIEW; negative capacity → NOT_COMPATIBLE
      prisma.document.findMany.mockResolvedValue([]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      // NOT_COMPATIBLE beats REQUIRES_REVIEW
      expect(getBv(result).bankResults[0].status).toBe('NOT_COMPATIBLE');
    });

    it('REQUIRES_REVIEW when income is missing and other checks pass', async () => {
      const { rule, prisma } = makeRuleAndMock();
      prisma.incomeCalculation.findFirst.mockResolvedValue({
        ...defaultIncomeCalculation(),
        confirmedNetIncome: null,
        averageNetIncome: null,
      });
      prisma.bankPolicy.findMany.mockResolvedValue([
        makePolicy({ bank: makeBank({ incomeCriterion: 'NET' }) }),
      ]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      expect(getBv(result).bankResults[0].status).toBe('REQUIRES_REVIEW');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 9. Aggregate Outcome
  // ─────────────────────────────────────────────────────────────────────
  describe('aggregate outcome', () => {
    it('returns PASS when at least one policy is PRELIMINARY_VIABLE', async () => {
      const { rule, prisma } = makeRuleAndMock();
      // Provide employment data so tenure check passes (otherwise REQUIRES_REVIEW prevents PRELIMINARY_VIABLE)
      prisma.document.findMany.mockResolvedValue([
        {
          id: 'doc-payroll-1',
          documentType: { code: 'PAYROLL_RECEIPT' },
          extractedData: { employment: { hireDate: '2024-01-15' } },
          processingResults: null,
        },
      ]);
      const result = await rule.execute(defaultContext(), defaultDocuments());
      expect(result.outcome).toBe('PASS');
    });

    it('returns PARTIAL when no viable but at least one REQUIRES_REVIEW', async () => {
      const { rule, prisma } = makeRuleAndMock();
      // Missing employment data → REQUIRES_REVIEW
      prisma.bankPolicy.findMany.mockResolvedValue([
        makePolicy({ minimumEmploymentTenureMonths: 6 }),
      ]);
      // No employment data provided → REQUIRES_REVIEW
      prisma.document.findMany.mockResolvedValue([]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      expect(result.outcome).toBe('PARTIAL');
    });

    it('returns FAIL when all policies are NOT_COMPATIBLE', async () => {
      const { rule, prisma } = makeRuleAndMock();
      // Negative capacity → NOT_COMPATIBLE for all
      prisma.liabilitySnapshot.findFirst.mockResolvedValue({
        ...defaultLiabilitySnapshot(),
        grossCurrentMonthlyDebt: { toString: () => '50000.00' },
      });
      prisma.bankPolicy.findMany.mockResolvedValue([makePolicy()]);

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
      prisma.bankPolicy.findMany.mockResolvedValue([]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      expect(result.outcome).toBe('PARTIAL');
      expect(getBv(result).reasons).toContain('UNSUPPORTED_DESTINATION');
      expect(getBv(result).bankResults).toHaveLength(0);
    });

    it('returns PARTIAL when destination is valid but no active policies exist', async () => {
      const { rule, prisma } = makeRuleAndMock();
      prisma.bankPolicy.findMany.mockResolvedValue([]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      expect(result.outcome).toBe('PARTIAL');
      expect(getBv(result).bankResults).toHaveLength(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 10. Bureau Knockout Rules
  // ─────────────────────────────────────────────────────────────────────
  describe('bureau knockout rules', () => {
    // Universal knockouts (short-circuit)
    describe('universal knockouts', () => {
      it('FAIL with BUREAU_SCORE_UNIVERSAL_REJECTION when bureau score < 500', async () => {
        const { rule, prisma } = makeRuleAndMock();
        const docs = [
          ...defaultDocuments(),
          {
            documentType: { code: 'CREDIT_BUREAU' },
            extractedData: { creditData: { score: 499 } },
            processingResults: null,
          },
        ];
        prisma.bankPolicy.findMany.mockResolvedValue([makePolicy()]);

        const result = await rule.execute(defaultContext(), docs);
        expect(result.outcome).toBe('FAIL');
        expect(getBv(result).reasons).toContain('BUREAU_SCORE_UNIVERSAL_REJECTION');
      });

      it('skip check when bureau score is null/undefined', async () => {
        const { rule, prisma } = makeRuleAndMock();
        const docs = [
          ...defaultDocuments(),
          {
            documentType: { code: 'CREDIT_BUREAU' },
            extractedData: { creditData: { score: null } },
            processingResults: null,
          },
        ];
        prisma.bankPolicy.findMany.mockResolvedValue([makePolicy()]);

        const result = await rule.execute(defaultContext(), docs);
        expect(result.outcome).not.toBe('FAIL');
        expect(getBv(result).reasons).not.toContain('BUREAU_SCORE_UNIVERSAL_REJECTION');
      });

      it('FAIL with QUITA_QUEBRANTO_REJECTED when hasQuita=true', async () => {
        const { rule, prisma } = makeRuleAndMock();
        const docs = [
          ...defaultDocuments(),
          {
            documentType: { code: 'CREDIT_BUREAU' },
            extractedData: { creditData: { score: 700, hasQuita: true } },
            processingResults: null,
          },
        ];
        prisma.bankPolicy.findMany.mockResolvedValue([makePolicy()]);

        const result = await rule.execute(defaultContext(), docs);
        expect(result.outcome).toBe('FAIL');
        expect(getBv(result).reasons).toContain('QUITA_QUEBRANTO_REJECTED');
      });

      it('FAIL with QUITA_QUEBRANTO_REJECTED when hasQuebranto=true', async () => {
        const { rule, prisma } = makeRuleAndMock();
        const docs = [
          ...defaultDocuments(),
          {
            documentType: { code: 'CREDIT_BUREAU' },
            extractedData: { creditData: { score: 700, hasQuebranto: true } },
            processingResults: null,
          },
        ];
        prisma.bankPolicy.findMany.mockResolvedValue([makePolicy()]);

        const result = await rule.execute(defaultContext(), docs);
        expect(result.outcome).toBe('FAIL');
        expect(getBv(result).reasons).toContain('QUITA_QUEBRANTO_REJECTED');
      });
    });

    // Bank-specific knockouts
    describe('bank-specific knockouts', () => {
      it('Santander: score < 542 → NOT_COMPATIBLE', async () => {
        const { rule, prisma } = makeRuleAndMock();
        const docs = [
          ...defaultDocuments(),
          {
            documentType: { code: 'CREDIT_BUREAU' },
            extractedData: { creditData: { score: 541 } },
            processingResults: null,
          },
        ];
        prisma.bankPolicy.findMany.mockResolvedValue([
          makePolicy({ bank: makeBank({ code: 'SANTANDER', minimumBureauScore: 541 }) }),
        ]);

        const result = await rule.execute(defaultContext(), docs);
        expect(getBv(result).bankResults[0].status).toBe('NOT_COMPATIBLE');
        expect(getBv(result).bankResults[0].reasons).toContain('SANTANDER_SCORE_BELOW_THRESHOLD');
      });

      it('Santander: score = 542 → passes boundary', async () => {
        const { rule, prisma } = makeRuleAndMock();
        const docs = [
          ...defaultDocuments(),
          {
            documentType: { code: 'CREDIT_BUREAU' },
            extractedData: { creditData: { score: 542 } },
            processingResults: null,
          },
        ];
        prisma.bankPolicy.findMany.mockResolvedValue([
          makePolicy({ bank: makeBank({ code: 'SANTANDER', minimumBureauScore: 541 }) }),
        ]);

        const result = await rule.execute(defaultContext(), docs);
        expect(getBv(result).bankResults[0].reasons).not.toContain('SANTANDER_SCORE_BELOW_THRESHOLD');
      });

      it('Banregio: score < 629 → NOT_COMPATIBLE', async () => {
        const { rule, prisma } = makeRuleAndMock();
        const docs = [
          ...defaultDocuments(),
          {
            documentType: { code: 'CREDIT_BUREAU' },
            extractedData: { creditData: { score: 628 } },
            processingResults: null,
          },
        ];
        prisma.bankPolicy.findMany.mockResolvedValue([
          makePolicy({ bank: makeBank({ code: 'BANREGIO', minimumBureauScore: 629 }) }),
        ]);

        const result = await rule.execute(defaultContext(), docs);
        expect(getBv(result).bankResults[0].status).toBe('NOT_COMPATIBLE');
        expect(getBv(result).bankResults[0].reasons).toContain('BANREGIO_SCORE_BELOW_THRESHOLD');
      });

      it('Banregio: score = 629 → rejected (≤ cutoff)', async () => {
        const { rule, prisma } = makeRuleAndMock();
        const docs = [
          ...defaultDocuments(),
          {
            documentType: { code: 'CREDIT_BUREAU' },
            extractedData: { creditData: { score: 629 } },
            processingResults: null,
          },
        ];
        prisma.bankPolicy.findMany.mockResolvedValue([
          makePolicy({ bank: makeBank({ code: 'BANREGIO', minimumBureauScore: 629 }) }),
        ]);

        const result = await rule.execute(defaultContext(), docs);
        expect(getBv(result).bankResults[0].status).toBe('NOT_COMPATIBLE');
        expect(getBv(result).bankResults[0].reasons).toContain('BANREGIO_SCORE_BELOW_THRESHOLD');
      });

      it('Banregio: score = 630 → passes boundary', async () => {
        const { rule, prisma } = makeRuleAndMock();
        const docs = [
          ...defaultDocuments(),
          {
            documentType: { code: 'CREDIT_BUREAU' },
            extractedData: { creditData: { score: 630 } },
            processingResults: null,
          },
        ];
        prisma.bankPolicy.findMany.mockResolvedValue([
          makePolicy({ bank: makeBank({ code: 'BANREGIO', minimumBureauScore: 629 }) }),
        ]);

        const result = await rule.execute(defaultContext(), docs);
        expect(getBv(result).bankResults[0].reasons).not.toContain('BANREGIO_SCORE_BELOW_THRESHOLD');
      });

      it('Santander MOP: 2 PV with total > $3K → NOT_COMPATIBLE', async () => {
        const { rule, prisma } = makeRuleAndMock();
        const docs = [
          ...defaultDocuments(),
          {
            documentType: { code: 'CREDIT_BUREAU' },
            extractedData: { creditData: { score: 700, pastDueMonths: 2, pastDueTotalAmount: 3500 } },
            processingResults: null,
          },
        ];
        prisma.bankPolicy.findMany.mockResolvedValue([
          makePolicy({ bank: makeBank({ code: 'SANTANDER', minimumBureauScore: 541 }) }),
        ]);

        const result = await rule.execute(defaultContext(), docs);
        expect(getBv(result).bankResults[0].status).toBe('NOT_COMPATIBLE');
        expect(getBv(result).bankResults[0].reasons).toContain('SANTANDER_MOP_KNOCKOUT');
      });

      it('Santander MOP: 3 PV any amount → NOT_COMPATIBLE', async () => {
        const { rule, prisma } = makeRuleAndMock();
        const docs = [
          ...defaultDocuments(),
          {
            documentType: { code: 'CREDIT_BUREAU' },
            extractedData: { creditData: { score: 700, pastDueMonths: 3, pastDueTotalAmount: 100 } },
            processingResults: null,
          },
        ];
        prisma.bankPolicy.findMany.mockResolvedValue([
          makePolicy({ bank: makeBank({ code: 'SANTANDER', minimumBureauScore: 541 }) }),
        ]);

        const result = await rule.execute(defaultContext(), docs);
        expect(getBv(result).bankResults[0].status).toBe('NOT_COMPATIBLE');
        expect(getBv(result).bankResults[0].reasons).toContain('SANTANDER_MOP_KNOCKOUT');
      });

      it('Santander MOP: 2 PV with total ≤ $3K → passes', async () => {
        const { rule, prisma } = makeRuleAndMock();
        const docs = [
          ...defaultDocuments(),
          {
            documentType: { code: 'CREDIT_BUREAU' },
            extractedData: { creditData: { score: 700, pastDueMonths: 2, pastDueTotalAmount: 3000 } },
            processingResults: null,
          },
        ];
        prisma.bankPolicy.findMany.mockResolvedValue([
          makePolicy({ bank: makeBank({ code: 'SANTANDER', minimumBureauScore: 541 }) }),
        ]);

        const result = await rule.execute(defaultContext(), docs);
        expect(getBv(result).bankResults[0].reasons).not.toContain('SANTANDER_MOP_KNOCKOUT');
      });
    });

    // CMA checks
    describe('CMA checks', () => {
      it('minimumIncome: income < minimum → NOT_COMPATIBLE', async () => {
        const { rule, prisma } = makeRuleAndMock();
        prisma.incomeCalculation.findFirst.mockResolvedValue({
          ...defaultIncomeCalculation(),
          confirmedNetIncome: { toString: () => '5000.00' },
        });
        prisma.bankPolicy.findMany.mockResolvedValue([
          makePolicy({ minimumIncome: { toString: () => '7500.00' } }),
        ]);

        const result = await rule.execute(defaultContext(), defaultDocuments());
        expect(getBv(result).bankResults[0].status).toBe('NOT_COMPATIBLE');
        expect(getBv(result).bankResults[0].reasons).toContain('INCOME_BELOW_MINIMUM');
        expect(getBv(result).bankResults[0].checks.minimumIncome.status).toBe('FAIL');
      });

      it('minimumIncome: income >= minimum → passes', async () => {
        const { rule, prisma } = makeRuleAndMock();
        prisma.incomeCalculation.findFirst.mockResolvedValue({
          ...defaultIncomeCalculation(),
          confirmedNetIncome: { toString: () => '7500.00' },
        });
        prisma.bankPolicy.findMany.mockResolvedValue([
          makePolicy({ minimumIncome: { toString: () => '7500.00' } }),
        ]);

        const result = await rule.execute(defaultContext(), defaultDocuments());
        expect(getBv(result).bankResults[0].reasons).not.toContain('INCOME_BELOW_MINIMUM');
        expect(getBv(result).bankResults[0].checks.minimumIncome.status).toBe('PASS');
      });

      it('minimumPropertyValue: propertyValue < minimum → NOT_COMPATIBLE', async () => {
        const { rule, prisma } = makeRuleAndMock();
        prisma.mortgageCase.findUnique.mockResolvedValue({
          ...defaultCase(),
          propertyValue: { toString: () => '200000.00' },
        });
        prisma.bankPolicy.findMany.mockResolvedValue([
          makePolicy({ minimumPropertyValue: { toString: () => '250000.00' } }),
        ]);

        const result = await rule.execute(defaultContext(), defaultDocuments());
        expect(getBv(result).bankResults[0].status).toBe('NOT_COMPATIBLE');
        expect(getBv(result).bankResults[0].reasons).toContain('PROPERTY_VALUE_BELOW_MINIMUM');
        expect(getBv(result).bankResults[0].checks.minimumPropertyValue.status).toBe('FAIL');
      });

      it('minimumPropertyValue: propertyValue >= minimum → passes', async () => {
        const { rule, prisma } = makeRuleAndMock();
        prisma.mortgageCase.findUnique.mockResolvedValue({
          ...defaultCase(),
          propertyValue: { toString: () => '250000.00' },
        });
        prisma.bankPolicy.findMany.mockResolvedValue([
          makePolicy({ minimumPropertyValue: { toString: () => '250000.00' } }),
        ]);

        const result = await rule.execute(defaultContext(), defaultDocuments());
        expect(getBv(result).bankResults[0].reasons).not.toContain('PROPERTY_VALUE_BELOW_MINIMUM');
        expect(getBv(result).bankResults[0].checks.minimumPropertyValue.status).toBe('PASS');
      });

      it('minimumIncome: null → skip check', async () => {
        const { rule, prisma } = makeRuleAndMock();
        prisma.bankPolicy.findMany.mockResolvedValue([
          makePolicy({ minimumIncome: null }),
        ]);

        const result = await rule.execute(defaultContext(), defaultDocuments());
        expect(getBv(result).bankResults[0].checks.minimumIncome).toBeUndefined();
      });
    });

    // Edge cases
    describe('edge cases', () => {
      it('no bureau document → skip all bureau checks', async () => {
        const { rule, prisma } = makeRuleAndMock();
        prisma.bankPolicy.findMany.mockResolvedValue([
          makePolicy({ bank: makeBank({ code: 'SANTANDER', minimumBureauScore: 541 }) }),
        ]);

        const result = await rule.execute(defaultContext(), defaultDocuments());
        expect(getBv(result).bankResults[0].reasons).not.toContain('SANTANDER_SCORE_BELOW_THRESHOLD');
        expect(getBv(result).bankResults[0].reasons).not.toContain('SANTANDER_MOP_KNOCKOUT');
      });

      it('universal knockout short-circuits (no per-bank eval)', async () => {
        const { rule, prisma } = makeRuleAndMock();
        const docs = [
          ...defaultDocuments(),
          {
            documentType: { code: 'CREDIT_BUREAU' },
            extractedData: { creditData: { score: 499 } },
            processingResults: null,
          },
        ];
        prisma.bankPolicy.findMany.mockResolvedValue([makePolicy()]);

        const result = await rule.execute(defaultContext(), docs);
        expect(getBv(result).bankResults).toHaveLength(0);
        expect(result.outcome).toBe('FAIL');
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 11. Audit Snapshot
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
      expect(Array.isArray(bv.bankResults)).toBe(true);
    });

    it('serializes all Decimal values as strings', async () => {
      const { rule } = makeRuleAndMock();
      const result = await rule.execute(defaultContext(), defaultDocuments());
      const calc = getBv(result).bankResults[0].calculation;

      expect(typeof calc.incomeUsed).toBe('string');
      expect(typeof calc.maximumDebt).toBe('string');
      expect(typeof calc.totalMonthlyLiabilities).toBe('string');
      expect(typeof calc.availableCapacity).toBe('string');

      // Verify actual computed values
      // incomeUsed = 56976.33, maximumDebt = 56976.33 * 0.60 = 34185.798 → 34185.80
      expect(calc.maximumDebt).toBe('34185.80');
      expect(calc.incomeUsed).toBe('56976.33');
      expect(calc.totalMonthlyLiabilities).toBe('19304.74');
      // availableCapacity = 34185.80 - 19304.74 = 14881.06
      expect(calc.availableCapacity).toBe('14881.06');
    });

    it('places warningLegend at bankViability level, not per policy', async () => {
      const { rule } = makeRuleAndMock();
      const result = await rule.execute(defaultContext(), defaultDocuments());
      const bv = getBv(result);

      expect(bv.warningLegend).toBeTruthy();
      // warningLegend should NOT be inside bankResults
      for (const br of bv.bankResults) {
        expect((br as unknown as Record<string, unknown>).warningLegend).toBeUndefined();
      }
    });

    it('uses two-level reasons: global vs per-policy', async () => {
      const { rule, prisma } = makeRuleAndMock();
      // Null destination → global reason
      prisma.creditType.findUnique.mockResolvedValue({
        id: 1,
        code: 'TERRENO',
        destination: null,
      });
      prisma.bankPolicy.findMany.mockResolvedValue([]);

      const result = await rule.execute(defaultContext(), defaultDocuments());
      // Global reasons
      expect(getBv(result).reasons).toContain('UNSUPPORTED_DESTINATION');
      // No bank results when destination is null
      expect(getBv(result).bankResults).toHaveLength(0);
    });

    it('includes policySnapshot with bank policy data', async () => {
      const { rule } = makeRuleAndMock();
      const result = await rule.execute(defaultContext(), defaultDocuments());
      const br = getBv(result).bankResults[0];

      expect(br.policySnapshot).toBeDefined();
      expect(br.policySnapshot.incomeCriterion).toBe('NET');
      expect(br.policySnapshot.debtCommitmentFactor).toBe('0.60');
      expect(br.policySnapshot.bankName).toBe('Banorte');
      expect(br.policySnapshot.minimumIncome).toBeNull();
      expect(br.policySnapshot.minimumPropertyValue).toBeNull();
    });

    it('includes policy-level checks with status and values', async () => {
      const { rule } = makeRuleAndMock();
      const result = await rule.execute(defaultContext(), defaultDocuments());
      const checks = getBv(result).bankResults[0].checks;

      expect(checks.capacity).toBeDefined();
      expect(checks.capacity.status).toBe('PASS');
      expect(checks.minimumApplicantAge).toBeDefined();
      expect(checks.maximumApplicationAge).toBeDefined();
      expect(checks.employmentTenure).toBeDefined();
    });
  });
});
