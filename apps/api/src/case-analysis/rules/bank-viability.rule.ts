import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { AnalysisOutcome } from '../../generated/prisma/client';
import type {
  AnalysisRule,
  RuleResult,
  Severity,
} from '../analysis-rule.interface';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  BankViabilitySnapshot,
  BankViabilityInputs,
  BankarizationFlags,
  BankResult,
  BankResultCalculation,
  BankPolicySnapshot,
  ProductMatchStatus,
  CheckResult,
  CaseAnalysisContext,
} from '../types/bank-viability.types';
import { completeMonthsBetween } from '../../shared/utils/dates';

const WARNING_LEGEND =
  'Evaluación preliminar basada en la información disponible y en políticas internas registradas. No constituye una aprobación o autorización de crédito por parte del banco.';

const SOURCE_VERSION = 'ANAQUEL_MAYO_2026';

// ── Policy shape from Prisma findMany ────────────────────────────────────

interface PolicyWithBank {
  id: string;
  bankId: string;
  code: string;
  name: string;
  destination: string;
  personType: string;
  minimumIncome: Prisma.Decimal | null;
  minimumPropertyValue: Prisma.Decimal | null;
  minimumEmploymentTenureMonths: number | null;
  minimumApplicantAgeMonths: number | null;
  maximumApplicationAgeMonths: number | null;
  isActive: boolean;
  sourceVersion: string;
  bank: {
    id: string;
    code: string;
    name: string;
    debtCommitmentFactor: Prisma.Decimal;
    incomeCriterion: string;
    isActive: boolean;
    sourceVersion: string;
  };
}

/** Round a Decimal to 2 decimal places (financial precision). */
function d2(v: Prisma.Decimal): string {
  return v.toFixed(2);
}

@Injectable()
export class BankViabilityRule implements AnalysisRule {
  readonly ruleId = 'bank-viability';

  constructor(private readonly prisma: PrismaService) {}

  async execute(
    context: Record<string, unknown>,
    documents: Record<string, unknown>[],
  ): Promise<RuleResult> {
    const ctx = context as unknown as CaseAnalysisContext;
    const caseId = ctx.caseId;
    const calculatedAt = new Date();

    // ── 1. Input Resolution ──────────────────────────────────────────────
    const mortgageCase = await this.prisma.mortgageCase.findUnique({
      where: { id: caseId },
      select: {
        requestedAmount: true,
        propertyValue: true,
        estimatedTermMonths: true,
        creditTypeId: true,
      },
    });

    const creditTypeId = mortgageCase?.creditTypeId ?? 0;

    const [incomeCalc, liabilitySnap, creditType] = await Promise.all([
      this.prisma.incomeCalculation.findFirst({
        where: { mortgageCaseId: caseId },
        orderBy: { calculatedAt: 'desc' },
        select: {
          confirmedGrossIncome: true,
          confirmedNetIncome: true,
          averageGrossIncome: true,
          averageNetIncome: true,
          receiptResults: true,
          calculatedAt: true,
        },
      }),
      this.prisma.liabilitySnapshot.findFirst({
        where: { mortgageCaseId: caseId },
        orderBy: { calculatedAt: 'desc' },
      }),
      this.prisma.creditType.findUnique({
        where: { id: creditTypeId },
      }),
    ]);

    const destination = (creditType?.destination as string) ?? null;
    const creditTypeCode = creditType?.code ?? 'UNKNOWN';

    const requestedAmount = mortgageCase?.requestedAmount ?? null;
    const propertyValue = mortgageCase?.propertyValue ?? null;
    const estimatedTermMonths = mortgageCase?.estimatedTermMonths ?? null;

    // Income fallback: confirmed → average → null
    const confirmedGrossIncome = incomeCalc?.confirmedGrossIncome ?? incomeCalc?.averageGrossIncome ?? null;
    const confirmedNetIncome = incomeCalc?.confirmedNetIncome ?? incomeCalc?.averageNetIncome ?? null;
    const totalMonthlyLiabilities = liabilitySnap?.grossCurrentMonthlyDebt ?? null;

    // ── Derive birthDate from INE extraction (documents array) ─────────
    const birthDate = this.deriveBirthDate(documents);

    // ── Derive employmentStartDate from payroll receipts ─────────────
    const { employmentStartDate, conflictingDates } =
      await this.deriveEmploymentStartDate(caseId, incomeCalc);

    // ── Derive Scotiabank flags from Phase A context ────────────────────
    const bankarizationFlags = (ctx as Record<string, unknown>).bankarizationFlags as BankarizationFlags | undefined;
    const { hasPagadoraIncome, scotiabankExcluded } =
      this.deriveScotiabankFlags(bankarizationFlags);

    // ── Build inputs ─────────────────────────────────────────────────
    const inputs: BankViabilityInputs = {
      confirmedGrossIncome: confirmedGrossIncome?.toString() ?? null,
      confirmedNetIncome: confirmedNetIncome?.toString() ?? null,
      totalMonthlyLiabilities: totalMonthlyLiabilities?.toString() ?? null,
      requestedAmount: requestedAmount?.toString() ?? null,
      propertyValue: propertyValue?.toString() ?? null,
      estimatedTermMonths,
      birthDate,
      employmentStartDate,
      hasPagadoraIncome,
      scotiabankExcluded,
    };

    // ── Global reasons ───────────────────────────────────────────────
    const globalReasons: string[] = [];
    if (!destination) globalReasons.push('UNSUPPORTED_DESTINATION');
    if (!birthDate) globalReasons.push('MISSING_BIRTH_DATE');
    if (conflictingDates) globalReasons.push('CONFLICTING_EMPLOYMENT_DATES');

    // ── 2. Policy Query ────────────────────────────────────────────────
    let policies: PolicyWithBank[] = [];
    if (destination) {
      policies = await this.prisma.bankPolicy.findMany({
        where: {
          isActive: true,
          destination: destination as never,
          bank: { isActive: true },
        },
        include: { bank: true },
      });
    }

    // ── 3. Evaluate each policy ──────────────────────────────────────
    const currentAgeMonths = birthDate
      ? completeMonthsBetween(birthDate, calculatedAt)
      : null;

    const bankResults: BankResult[] = [];

    for (const policy of policies) {
      const result = this.evaluateBank(
        policy,
        inputs,
        currentAgeMonths,
        employmentStartDate,
        calculatedAt,
        hasPagadoraIncome,
        scotiabankExcluded,
      );
      bankResults.push(result);
    }

    // ── 4. Aggregate Outcome ─────────────────────────────────────────
    const outcome = this.computeAggregateOutcome(bankResults, destination);

    // ── 5. Build Snapshot ────────────────────────────────────────────
    const snapshot: BankViabilitySnapshot = {
      sourceVersion: SOURCE_VERSION,
      creditTypeCode,
      destination,
      calculatedAt: calculatedAt.toISOString(),
      warningLegend: WARNING_LEGEND,
      reasons: globalReasons,
      inputs,
      bankResults,
    };

    const severity: Severity =
      outcome === 'FAIL' ? 'ERROR' : outcome === 'PARTIAL' ? 'WARNING' : 'INFO';

    return {
      ruleId: this.ruleId,
      outcome,
      severity,
      detail: {
        sources: ['mortgage-case', 'income-calculation', 'liability-snapshot', 'bank-catalog'],
        fields: [],
        bankViability: snapshot,
      } as never,
      alerts: [],
    };
  }

  // ── Birth Date Derivation (from documents array) ───────────────────

  private deriveBirthDate(documents: Record<string, unknown>[]): string | null {
    for (const doc of documents) {
      const pr = doc.processingResults as Record<string, unknown> | null;
      const ed = doc.extractedData as Record<string, unknown> | null;

      const prIdentity = pr?.identity as Record<string, unknown> | undefined;
      const edIdentity = ed?.identity as Record<string, unknown> | undefined;

      const bd = (prIdentity?.birthDate as string) ?? (edIdentity?.birthDate as string) ?? null;
      if (bd) return bd;
    }
    return null;
  }

  // ── Employment Start Date Derivation ───────────────────────────────

  private async deriveEmploymentStartDate(
    caseId: string,
    incomeCalc: Record<string, unknown> | null,
  ): Promise<{ employmentStartDate: string | null; conflictingDates: boolean }> {
    if (!incomeCalc) {
      return { employmentStartDate: null, conflictingDates: false };
    }

    const receiptResults = incomeCalc.receiptResults;
    let receiptIds: string[] = [];

    if (typeof receiptResults === 'string') {
      try {
        const parsed = JSON.parse(receiptResults) as Record<string, unknown>[];
        receiptIds = parsed.map((r) => r.documentId as string).filter(Boolean);
      } catch {
        return { employmentStartDate: null, conflictingDates: false };
      }
    } else if (Array.isArray(receiptResults)) {
      receiptIds = (receiptResults as Record<string, unknown>[])
        .map((r) => r.documentId as string)
        .filter(Boolean);
    }

    if (receiptIds.length === 0) {
      return { employmentStartDate: null, conflictingDates: false };
    }

    const receipts = await this.prisma.document.findMany({
      where: { id: { in: receiptIds } },
      select: { id: true, extractedData: true },
    });

    const hireDates = new Set<string>();

    for (const receipt of receipts) {
      const ed = receipt.extractedData as Record<string, unknown> | null;
      // Payroll extraction normalizes to employment.hireDate; also check raw employee path
      const employment = ed?.employment as Record<string, unknown> | undefined;
      const employee = ed?.employee as Record<string, unknown> | undefined;
      const hireDate = (employment?.hireDate ?? employee?.hireDate) as string | undefined;
      if (hireDate) hireDates.add(hireDate);
    }

    if (hireDates.size === 0) return { employmentStartDate: null, conflictingDates: false };
    if (hireDates.size > 1) return { employmentStartDate: null, conflictingDates: true };

    return { employmentStartDate: Array.from(hireDates)[0], conflictingDates: false };
  }

  // ── Scotiabank Flags Derivation ────────────────────────────────────

  private deriveScotiabankFlags(
    flags?: BankarizationFlags,
  ): { hasPagadoraIncome: boolean; scotiabankExcluded: boolean } {
    return {
      hasPagadoraIncome: flags?.hasPagadoraIncome ?? false,
      scotiabankExcluded: flags?.scotiabankExcluded ?? false,
    };
  }

  // ── Bank Evaluation ────────────────────────────────────────────────

  private evaluateBank(
    policy: PolicyWithBank,
    inputs: BankViabilityInputs,
    currentAgeMonths: number | null,
    employmentStartDate: string | null,
    calculatedAt: Date,
    hasPagadoraIncome: boolean,
    scotiabankExcluded: boolean,
  ): BankResult {
    const reasons: string[] = [];
    const checks: Record<string, CheckResult> = {};

    const incomeCriterion = policy.bank.incomeCriterion as 'NET' | 'GROSS';
    const debtCommitmentFactor = new Prisma.Decimal(policy.bank.debtCommitmentFactor.toString());

    // ── Income Selection ─────────────────────────────────────────────
    const incomeUsedStr =
      incomeCriterion === 'NET' ? inputs.confirmedNetIncome : inputs.confirmedGrossIncome;
    const incomeUsed = incomeUsedStr ? new Prisma.Decimal(incomeUsedStr) : null;

    if (!incomeUsed) reasons.push('UNCONFIRMED_INCOME');

    // ── Capacity Control ─────────────────────────────────────────────
    let maximumDebt: Prisma.Decimal | null = null;
    let availableCapacity: Prisma.Decimal | null = null;
    const liabilities = inputs.totalMonthlyLiabilities
      ? new Prisma.Decimal(inputs.totalMonthlyLiabilities)
      : new Prisma.Decimal(0);

    if (incomeUsed) {
      maximumDebt = incomeUsed.mul(debtCommitmentFactor);
      availableCapacity = maximumDebt.minus(liabilities);
    }

    const capacityPass = incomeUsed && availableCapacity && availableCapacity.gt(0);
    checks.capacity = {
      status: capacityPass ? 'PASS' : incomeUsed ? 'FAIL' : 'REQUIRES_REVIEW',
      availableCapacity: availableCapacity ? d2(availableCapacity) : null,
    };

    // Add NEGATIVE_CAPACITY reason when capacity check fails
    if (!capacityPass && incomeUsed) {
      reasons.push('NEGATIVE_CAPACITY');
    }

    // ── Minimum Applicant Age Control ────────────────────────────────
    if (currentAgeMonths !== null && policy.minimumApplicantAgeMonths !== null) {
      if (currentAgeMonths < policy.minimumApplicantAgeMonths) {
        checks.minimumApplicantAge = {
          status: 'FAIL',
          actualMonths: currentAgeMonths,
          requiredMonths: policy.minimumApplicantAgeMonths,
        };
        reasons.push('MINIMUM_AGE_NOT_MET');
      } else {
        checks.minimumApplicantAge = {
          status: 'PASS',
          actualMonths: currentAgeMonths,
          requiredMonths: policy.minimumApplicantAgeMonths,
        };
      }
    } else if (policy.minimumApplicantAgeMonths !== null) {
      // Policy exists but birth date data missing
      checks.minimumApplicantAge = { status: 'REQUIRES_REVIEW', reason: 'MISSING_BIRTH_DATE' };
    } else {
      checks.minimumApplicantAge = { status: 'NOT_APPLICABLE' };
    }

    // ── Maximum Application Age Control ──────────────────────────────
    if (currentAgeMonths !== null && policy.maximumApplicationAgeMonths !== null) {
      if (currentAgeMonths > policy.maximumApplicationAgeMonths) {
        checks.maximumApplicationAge = {
          status: 'FAIL',
          actualMonths: currentAgeMonths,
          maximumMonths: policy.maximumApplicationAgeMonths,
        };
        reasons.push('MAXIMUM_APPLICATION_AGE_EXCEEDED');
      } else {
        checks.maximumApplicationAge = {
          status: 'PASS',
          actualMonths: currentAgeMonths,
          maximumMonths: policy.maximumApplicationAgeMonths,
        };
      }
    } else if (policy.maximumApplicationAgeMonths !== null) {
      // Policy exists but birth date data missing
      checks.maximumApplicationAge = { status: 'REQUIRES_REVIEW', reason: 'MISSING_BIRTH_DATE' };
    } else {
      checks.maximumApplicationAge = { status: 'NOT_APPLICABLE' };
    }

    // ── Employment Tenure Control ────────────────────────────────────
    if (employmentStartDate !== null && policy.minimumEmploymentTenureMonths !== null) {
      const tenureMonths = completeMonthsBetween(employmentStartDate, calculatedAt);
      if (tenureMonths < policy.minimumEmploymentTenureMonths) {
        checks.employmentTenure = {
          status: 'FAIL',
          actualMonths: tenureMonths,
          requiredMonths: policy.minimumEmploymentTenureMonths,
        };
        reasons.push('INSUFFICIENT_EMPLOYMENT_TENURE');
      } else {
        checks.employmentTenure = {
          status: 'PASS',
          actualMonths: tenureMonths,
          requiredMonths: policy.minimumEmploymentTenureMonths,
        };
      }
    } else if (policy.minimumEmploymentTenureMonths !== null) {
      // Policy exists but employment data missing
      checks.employmentTenure = { status: 'REQUIRES_REVIEW', reason: 'MISSING_EMPLOYMENT_DATA' };
      reasons.push('MISSING_EMPLOYMENT_DATA');
    } else {
      checks.employmentTenure = { status: 'NOT_APPLICABLE' };
    }

    // ── Scotiabank Pagadora Exclusion ────────────────────────────────
    if (policy.bank.code === 'SCOTIABANK' && hasPagadoraIncome && scotiabankExcluded) {
      reasons.push('SCOTIABANK_PAGADORA_EXCLUSION');
    }

    // ── Status Precedence ────────────────────────────────────────────
    const status = this.resolveProductStatus(checks, reasons, !incomeUsed, currentAgeMonths === null);

    // ── Calculation ──────────────────────────────────────────────────
    const ageAtMaturityMonths =
      currentAgeMonths !== null ? currentAgeMonths + (inputs.estimatedTermMonths ?? 0) : null;

    const calculation: BankResultCalculation = {
      incomeUsed: incomeUsed ? d2(incomeUsed) : null,
      maximumDebt: maximumDebt ? d2(maximumDebt) : null,
      totalMonthlyLiabilities: inputs.totalMonthlyLiabilities,
      availableCapacity: availableCapacity ? d2(availableCapacity) : null,
      currentAgeMonths,
      ageAtMaturityMonths,
      employmentTenureMonths:
        employmentStartDate !== null
          ? completeMonthsBetween(employmentStartDate, calculatedAt)
          : null,
    };

    // ── Policy Snapshot ──────────────────────────────────────────────
    const policySnapshot: BankPolicySnapshot = {
      bankName: policy.bank.name,
      incomeCriterion: policy.bank.incomeCriterion,
      debtCommitmentFactor: d2(new Prisma.Decimal(policy.bank.debtCommitmentFactor.toString())),
      minimumEmploymentTenureMonths: policy.minimumEmploymentTenureMonths,
      minimumApplicantAgeMonths: policy.minimumApplicantAgeMonths,
      maximumApplicationAgeMonths: policy.maximumApplicationAgeMonths,
      minimumIncome: policy.minimumIncome ? policy.minimumIncome.toString() : null,
      minimumPropertyValue: policy.minimumPropertyValue ? policy.minimumPropertyValue.toString() : null,
    };

    return {
      bankCode: policy.bank.code,
      productCode: policy.code,
      status,
      reasons,
      policySnapshot,
      calculation,
      checks,
    };
  }

  // ── Status Precedence ──────────────────────────────────────────────

  private resolveProductStatus(
    checks: Record<string, CheckResult>,
    reasons: string[],
    incomeMissing: boolean,
    birthDateMissing: boolean,
  ): ProductMatchStatus {
    // NOT_COMPATIBLE: non-correctable fails
    const hasNotCompatible =
      reasons.includes('NEGATIVE_CAPACITY') ||
      reasons.includes('MINIMUM_AGE_NOT_MET') ||
      reasons.includes('MAXIMUM_APPLICATION_AGE_EXCEEDED') ||
      reasons.includes('INSUFFICIENT_EMPLOYMENT_TENURE') ||
      checks.capacity.status === 'FAIL';

    if (hasNotCompatible) return 'NOT_COMPATIBLE';

    // REQUIRES_REVIEW: data missing
    const hasRequiresReview =
      incomeMissing ||
      birthDateMissing ||
      reasons.includes('UNCONFIRMED_INCOME') ||
      reasons.includes('SCOTIABANK_PAGADORA_EXCLUSION') ||
      reasons.includes('CONFLICTING_EMPLOYMENT_DATES') ||
      Object.values(checks).some((c) => c.status === 'REQUIRES_REVIEW');

    if (hasRequiresReview) return 'REQUIRES_REVIEW';

    return 'PRELIMINARY_VIABLE';
  }

  // ── Aggregate Outcome ──────────────────────────────────────────────

  private computeAggregateOutcome(
    bankResults: BankResult[],
    destination: string | null,
  ): AnalysisOutcome {
    if (!destination) return 'PARTIAL';
    if (bankResults.length === 0) return 'PARTIAL';

    const hasViable = bankResults.some((m) => m.status === 'PRELIMINARY_VIABLE');
    if (hasViable) return 'PASS';

    const hasConditionedOrReview = bankResults.some(
      (m) => m.status === 'CONDITIONED' || m.status === 'REQUIRES_REVIEW',
    );
    if (hasConditionedOrReview) return 'PARTIAL';

    return 'FAIL';
  }
}
