import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { AnalysisOutcome } from '../../generated/prisma/client';
import type {
  AnalysisRule,
  RuleResult,
  Severity,
} from '../analysis-rule.interface';
import type { PrismaService } from '../../prisma/prisma.service';
import type {
  BankViabilitySnapshot,
  BankViabilityInputs,
  ProductMatch,
  ProductMatchCalculation,
  ProductMatchStatus,
  CheckResult,
  CaseAnalysisContext,
} from '../types/bank-viability.types';
import { completeMonthsBetween } from '../../shared/utils/dates';

const WARNING_LEGEND =
  'Evaluación preliminar basada en la información disponible y en políticas internas registradas. No constituye una aprobación o autorización de crédito por parte del banco.';

const SOURCE_VERSION = 'ANAQUEL_MAYO_2026';

// ── Product policy shape from Prisma findMany ────────────────────────────

interface ProductWithBank {
  id: string;
  bankId: string;
  code: string;
  name: string;
  destination: string;
  personType: string;
  minimumEmploymentTenureMonths: number | null;
  minimumApplicantAgeMonths: number | null;
  maximumApplicationAgeMonths: number | null;
  maximumMaturityAgeMonths: number | null;
  maximumLtv: Prisma.Decimal | null;
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
        personType: true,
        creditTypeId: true,
      },
    });

    const creditTypeId = mortgageCase?.creditTypeId ?? 0;

    const [incomeCalc, liabilitySnap, creditType] = await Promise.all([
      this.prisma.incomeCalculation.findFirst({
        where: { mortgageCaseId: caseId },
        orderBy: { calculatedAt: 'desc' },
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
    const personType = (mortgageCase?.personType as string) ?? 'SALARIED';

    const confirmedGrossIncome = incomeCalc?.confirmedGrossIncome ?? null;
    const confirmedNetIncome = incomeCalc?.confirmedNetIncome ?? null;
    const totalMonthlyLiabilities = liabilitySnap?.grossCurrentMonthlyDebt ?? null;

    // ── Derive birthDate from INE extraction (documents array) ─────────
    const birthDate = this.deriveBirthDate(documents);

    // ── Derive employmentStartDate from payroll receipts ─────────────
    const { employmentStartDate, conflictingDates } =
      await this.deriveEmploymentStartDate(caseId, incomeCalc);

    // ── Derive Scotiabank flags from bankarization run ───────────────
    const { hasPagadoraIncome, scotiabankExcluded } =
      await this.deriveScotiabankFlags(caseId);

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

    // ── 2. Product Query ─────────────────────────────────────────────
    let products: ProductWithBank[] = [];
    if (destination) {
      products = await this.prisma.bankProductPolicy.findMany({
        where: {
          isActive: true,
          destination: destination as never,
          personType: personType as never,
          bank: { isActive: true },
        },
        include: { bank: true },
      });
    }

    // ── 3. Evaluate each product ─────────────────────────────────────
    const currentAgeMonths = birthDate
      ? completeMonthsBetween(birthDate, calculatedAt)
      : null;

    const productMatches: ProductMatch[] = [];

    for (const product of products) {
      const match = this.evaluateProduct(
        product,
        inputs,
        currentAgeMonths,
        employmentStartDate,
        calculatedAt,
        hasPagadoraIncome,
        scotiabankExcluded,
      );
      productMatches.push(match);
    }

    // ── 4. Aggregate Outcome ─────────────────────────────────────────
    const outcome = this.computeAggregateOutcome(productMatches, destination);

    // ── 5. Build Snapshot ────────────────────────────────────────────
    const snapshot: BankViabilitySnapshot = {
      sourceVersion: SOURCE_VERSION,
      creditTypeCode,
      destination,
      calculatedAt: calculatedAt.toISOString(),
      warningLegend: WARNING_LEGEND,
      reasons: globalReasons,
      inputs,
      productMatches,
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
      const employee = ed?.employee as Record<string, unknown> | undefined;
      const hireDate = employee?.hireDate as string | undefined;
      if (hireDate) hireDates.add(hireDate);
    }

    if (hireDates.size === 0) return { employmentStartDate: null, conflictingDates: false };
    if (hireDates.size > 1) return { employmentStartDate: null, conflictingDates: true };

    return { employmentStartDate: Array.from(hireDates)[0], conflictingDates: false };
  }

  // ── Scotiabank Flags Derivation ────────────────────────────────────

  private async deriveScotiabankFlags(
    caseId: string,
  ): Promise<{ hasPagadoraIncome: boolean; scotiabankExcluded: boolean }> {
    const latestRun = await this.prisma.analysisRun.findFirst({
      where: { mortgageCaseId: caseId },
      orderBy: { createdAt: 'desc' },
      select: { detail: true },
    });

    if (!latestRun) return { hasPagadoraIncome: false, scotiabankExcluded: false };

    const detail = latestRun.detail as Record<string, unknown> | null;
    const ruleResults = (detail?.ruleResults ?? []) as Record<string, unknown>[];
    const bankarizationResult = ruleResults.find(
      (r) => r.ruleId === 'bankarization-validation',
    );

    if (!bankarizationResult) return { hasPagadoraIncome: false, scotiabankExcluded: false };

    const bankDetail = bankarizationResult.detail as Record<string, unknown> | undefined;
    return {
      hasPagadoraIncome: (bankDetail?.hasPagadoraIncome as boolean) ?? false,
      scotiabankExcluded: (bankDetail?.scotiabankExcluded as boolean) ?? false,
    };
  }

  // ── Product Evaluation ─────────────────────────────────────────────

  private evaluateProduct(
    product: ProductWithBank,
    inputs: BankViabilityInputs,
    currentAgeMonths: number | null,
    employmentStartDate: string | null,
    calculatedAt: Date,
    hasPagadoraIncome: boolean,
    scotiabankExcluded: boolean,
  ): ProductMatch {
    const reasons: string[] = [];
    const checks: Record<string, CheckResult> = {};

    const incomeCriterion = product.bank.incomeCriterion as 'NET' | 'GROSS';
    const debtCommitmentFactor = new Prisma.Decimal(product.bank.debtCommitmentFactor.toString());

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

    // ── LTV Control ──────────────────────────────────────────────────
    const reqAmount = inputs.requestedAmount ? new Prisma.Decimal(inputs.requestedAmount) : null;
    const propValue = inputs.propertyValue ? new Prisma.Decimal(inputs.propertyValue) : null;
    const maxLtv = product.maximumLtv ? new Prisma.Decimal(product.maximumLtv.toString()) : null;

    let requestedLtv: Prisma.Decimal | null = null;
    let maximumAmountByLtv: Prisma.Decimal | null = null;
    let requiredReduction: Prisma.Decimal | null = null;

    if (maxLtv === null) {
      checks.ltv = { status: 'NOT_APPLICABLE' };
    } else if (!reqAmount || reqAmount.lte(0)) {
      checks.ltv = { status: 'REQUIRES_REVIEW', reason: 'INVALID_REQUESTED_AMOUNT' };
      reasons.push('INVALID_REQUESTED_AMOUNT');
    } else if (!propValue || propValue.lte(0)) {
      checks.ltv = { status: 'REQUIRES_REVIEW', reason: 'INVALID_PROPERTY_VALUE' };
      reasons.push('INVALID_PROPERTY_VALUE');
    } else {
      requestedLtv = reqAmount.div(propValue);
      maximumAmountByLtv = propValue.mul(maxLtv);
      requiredReduction = reqAmount.gt(maximumAmountByLtv)
        ? reqAmount.minus(maximumAmountByLtv)
        : new Prisma.Decimal(0);

      const ltvExceeded = requestedLtv.gt(maxLtv);
      checks.ltv = {
        status: ltvExceeded ? 'FAIL' : 'PASS',
        requestedLtv: d2(requestedLtv),
        maximumLtv: d2(maxLtv),
      };
      if (ltvExceeded) reasons.push('LTV_EXCEEDED');
    }

    // ── Maturity Age Control ─────────────────────────────────────────
    let ageAtMaturityMonths: number | null = null;
    let maximumTheoreticalTermMonths: number | null = null;

    if (currentAgeMonths !== null && product.maximumMaturityAgeMonths !== null) {
      ageAtMaturityMonths = currentAgeMonths + (inputs.estimatedTermMonths ?? 0);
      maximumTheoreticalTermMonths = Math.max(
        0,
        product.maximumMaturityAgeMonths - currentAgeMonths,
      );

      if (maximumTheoreticalTermMonths <= 0) {
        checks.maturityAge = {
          status: 'FAIL',
          actualMonths: ageAtMaturityMonths,
          maximumMonths: product.maximumMaturityAgeMonths,
          reason: 'NO_VALID_TERM_AVAILABLE',
        };
        reasons.push('NO_VALID_TERM_AVAILABLE');
      } else if (ageAtMaturityMonths > product.maximumMaturityAgeMonths) {
        checks.maturityAge = {
          status: 'FAIL',
          actualMonths: ageAtMaturityMonths,
          maximumMonths: product.maximumMaturityAgeMonths,
        };
        reasons.push('MATURITY_AGE_EXCEEDED');
      } else {
        checks.maturityAge = {
          status: 'PASS',
          actualMonths: ageAtMaturityMonths,
          maximumMonths: product.maximumMaturityAgeMonths,
        };
      }
    } else {
      checks.maturityAge = { status: 'NOT_APPLICABLE' };
    }

    // ── Minimum Applicant Age Control ────────────────────────────────
    if (currentAgeMonths !== null && product.minimumApplicantAgeMonths !== null) {
      if (currentAgeMonths < product.minimumApplicantAgeMonths) {
        checks.minimumApplicantAge = {
          status: 'FAIL',
          actualMonths: currentAgeMonths,
          requiredMonths: product.minimumApplicantAgeMonths,
        };
        reasons.push('MINIMUM_AGE_NOT_MET');
      } else {
        checks.minimumApplicantAge = {
          status: 'PASS',
          actualMonths: currentAgeMonths,
          requiredMonths: product.minimumApplicantAgeMonths,
        };
      }
    } else {
      checks.minimumApplicantAge = { status: 'NOT_APPLICABLE' };
    }

    // ── Maximum Application Age Control ──────────────────────────────
    if (currentAgeMonths !== null && product.maximumApplicationAgeMonths !== null) {
      if (currentAgeMonths > product.maximumApplicationAgeMonths) {
        checks.maximumApplicationAge = {
          status: 'FAIL',
          actualMonths: currentAgeMonths,
          maximumMonths: product.maximumApplicationAgeMonths,
        };
        reasons.push('MAXIMUM_APPLICATION_AGE_EXCEEDED');
      } else {
        checks.maximumApplicationAge = {
          status: 'PASS',
          actualMonths: currentAgeMonths,
          maximumMonths: product.maximumApplicationAgeMonths,
        };
      }
    } else {
      checks.maximumApplicationAge = { status: 'NOT_APPLICABLE' };
    }

    // ── Employment Tenure Control ────────────────────────────────────
    if (employmentStartDate !== null && product.minimumEmploymentTenureMonths !== null) {
      const tenureMonths = completeMonthsBetween(employmentStartDate, calculatedAt);
      if (tenureMonths < product.minimumEmploymentTenureMonths) {
        checks.employmentTenure = {
          status: 'FAIL',
          actualMonths: tenureMonths,
          requiredMonths: product.minimumEmploymentTenureMonths,
        };
        reasons.push('INSUFFICIENT_EMPLOYMENT_TENURE');
      } else {
        checks.employmentTenure = {
          status: 'PASS',
          actualMonths: tenureMonths,
          requiredMonths: product.minimumEmploymentTenureMonths,
        };
      }
    } else {
      checks.employmentTenure = { status: 'NOT_APPLICABLE' };
    }

    // ── Scotiabank Pagadora Exclusion ────────────────────────────────
    if (product.bank.code === 'SCOTIABANK' && hasPagadoraIncome && scotiabankExcluded) {
      reasons.push('SCOTIABANK_PAGADORA_EXCLUSION');
    }

    // ── Status Precedence ────────────────────────────────────────────
    const status = this.resolveProductStatus(checks, reasons, !incomeUsed, currentAgeMonths === null);

    // ── Calculation ──────────────────────────────────────────────────
    const calculation: ProductMatchCalculation = {
      incomeUsed: incomeUsed ? d2(incomeUsed) : null,
      maximumDebt: maximumDebt ? d2(maximumDebt) : null,
      totalMonthlyLiabilities: inputs.totalMonthlyLiabilities,
      availableCapacity: availableCapacity ? d2(availableCapacity) : null,
      requestedLtv: requestedLtv ? d2(requestedLtv) : null,
      maximumAmountByLtv: maximumAmountByLtv ? d2(maximumAmountByLtv) : null,
      requiredReduction: requiredReduction ? d2(requiredReduction) : null,
      currentAgeMonths,
      ageAtMaturityMonths,
      employmentTenureMonths:
        employmentStartDate !== null
          ? completeMonthsBetween(employmentStartDate, calculatedAt)
          : null,
      maximumTheoreticalTermMonths,
    };

    // ── Policy Snapshot ──────────────────────────────────────────────
    const policySnapshot = {
      incomeCriterion: product.bank.incomeCriterion,
      debtCommitmentFactor: d2(new Prisma.Decimal(product.bank.debtCommitmentFactor.toString())),
      minimumEmploymentTenureMonths: product.minimumEmploymentTenureMonths,
      minimumApplicantAgeMonths: product.minimumApplicantAgeMonths,
      maximumApplicationAgeMonths: product.maximumApplicationAgeMonths,
      maximumMaturityAgeMonths: product.maximumMaturityAgeMonths,
      maximumLtv: product.maximumLtv ? d2(new Prisma.Decimal(product.maximumLtv.toString())) : null,
    };

    return {
      bankCode: product.bank.code,
      productCode: product.code,
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
      reasons.includes('NO_VALID_TERM_AVAILABLE') ||
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
      reasons.includes('INVALID_REQUESTED_AMOUNT') ||
      reasons.includes('INVALID_PROPERTY_VALUE') ||
      reasons.includes('SCOTIABANK_PAGADORA_EXCLUSION') ||
      reasons.includes('CONFLICTING_EMPLOYMENT_DATES') ||
      Object.values(checks).some((c) => c.status === 'REQUIRES_REVIEW');

    if (hasRequiresReview) return 'REQUIRES_REVIEW';

    // CONDITIONED: correctable fails
    const hasConditioned =
      reasons.includes('LTV_EXCEEDED') || reasons.includes('MATURITY_AGE_EXCEEDED');

    if (hasConditioned) return 'CONDITIONED';

    return 'PRELIMINARY_VIABLE';
  }

  // ── Aggregate Outcome ──────────────────────────────────────────────

  private computeAggregateOutcome(
    productMatches: ProductMatch[],
    destination: string | null,
  ): AnalysisOutcome {
    if (!destination) return 'PARTIAL';
    if (productMatches.length === 0) return 'PARTIAL';

    const hasViable = productMatches.some((m) => m.status === 'PRELIMINARY_VIABLE');
    if (hasViable) return 'PASS';

    const hasConditionedOrReview = productMatches.some(
      (m) => m.status === 'CONDITIONED' || m.status === 'REQUIRES_REVIEW',
    );
    if (hasConditionedOrReview) return 'PARTIAL';

    return 'FAIL';
  }
}
