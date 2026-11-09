import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreditNature,
  InstitutionCategory,
  LiabilityStatus,
  ClassificationSource,
  GlobalLiabilityStatus,
  RuleApplied,
  type LiabilityCreditInput,
  type LiabilityCreditResult,
  type LiabilityCalculationResult,
} from './liability.types';
import {
  calculatePmCompanyCredit,
  calculatePmCompanyLiabilities,
  type PmCompanyCreditInput,
} from './pm-company-liability';

// ── Keyword sets for classification ───────────────────────────────────────

const REVOLVING_KEYWORDS = ['TARJETA', 'REVOLVENTE', 'LINEA'];
const FIXED_KEYWORDS = [
  'AUTO',
  'HIPOTECA',
  'HIPOTECARIO',
  'BIENES RAICES',
  'ARRENDAMIENTO',
  'PERSONAL',
  'NOMINA',
  'SERVICIO',
  'SIMPLE',
];
const EXTRACTED_FIXED_CLASSES = new Set([
  'FIXED_PAYMENT',
  'FIXED',
  'FIXED_INSTALLMENT',
  'MORTGAGE',
  'AUTO',
  'PERSONAL_LOAN',
]);

function normalizeClassText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

// ── Institution name → category mapping ──────────────────────────────────

const BANK_KEYWORDS = [
  'BANCO',
  'BANAMEX',
  'BBVA',
  'SANTANDER',
  'HSBC',
  'SCOTIAB',
  'BANORTE',
  'INBURSA',
  'CITI',
  'AMERICAN EXPRESS',
  'BARCLAYS',
];

const DEPARTMENT_STORE_KEYWORDS = [
  'LIVERPOOL',
  'PALACIO',
  'SEARS',
  'COSTCO',
  'WALMART',
  'SAMS',
  "SAM'S",
  'CARSO',
  'COPPEL',
  'ELECTRA',
  'FAMSA',
  'SUBURBIA',
  'FABRICA',
  'RICARDO',
];

const FINTECH_KEYWORDS = ['NU ', 'NU ', 'STP ', 'ALBO', 'KUOBO', 'CLIP', 'KONFIO'];

// ── Helpers ──────────────────────────────────────────────────────────────

/** Convert pesos (float) to integer cents. */
function pesosToCents(pesos: number): number {
  return Math.round(pesos * 100);
}

/** Convert integer cents to pesos for display. */
function centsToPesos(cents: number): number {
  return cents / 100;
}

/**
 * Apply the factor to a balance expressed in integer cents, returning
 * integer cents. Uses pure integer arithmetic: `cents × basisPoints / 10000`.
 */
function applyFactorCents(balanceCents: number, factor: number): number {
  const basisPoints = Math.round(factor * 10000);
  return Math.trunc((balanceCents * basisPoints) / 10000);
}

/** Check whether a value is a keyword in uppercased text. */
function textContainsKeyword(text: string, keyword: string): boolean {
  return text.toUpperCase().includes(keyword.toUpperCase());
}

// ── Service ───────────────────────────────────────────────────────────────

export interface OverrideCreditDto {
  creditNature?: CreditNature;
  currentBalance?: number;
  paymentDueAmountEffective?: number;
  reason?: string;
}

const SALARIED_REVOLVING_FACTOR = 0.06;
const PFAE_REVOLVING_FACTOR = 0.07;

/**
 * Calculates monthly liability debt from bureau-extracted credits (HU-11).
 *
 * All monetary arithmetic uses integer cents internally to avoid IEEE 754
 * floating-point accumulation errors. Pesos appear only on the display
 * surface (return values).
 */
@Injectable()
export class LiabilityCalculationService {
  private readonly rulesVersion = '2024.1';

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Default revolving factor from `personType` when the caller omits `factorUsed`.
   * PFAE → 0.07. SALARIED, persona moral, or absent → 0.06.
   */
  private async resolveFactor(
    caseId: string,
    factorUsed?: number,
  ): Promise<number> {
    if (factorUsed !== undefined) {
      return factorUsed;
    }

    const mortgageCase = await this.prisma.mortgageCase.findUnique({
      where: { id: caseId },
      select: { personType: true },
    });

    return mortgageCase?.personType === 'PFAE'
      ? PFAE_REVOLVING_FACTOR
      : SALARIED_REVOLVING_FACTOR;
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * Calculate liability for all credits in a case and persist a new
   * immutable LiabilitySnapshot.
   */
  async calculate(
    caseId: string,
    credits: LiabilityCreditInput[],
    factorUsed?: number,
  ): Promise<LiabilityCalculationResult> {
    const factor = await this.resolveFactor(caseId, factorUsed);

    const results = credits.map((c) => this.processCredit(c, factor));

    const grossCents = this.sumContributionsCents(results);
    const balanceCents = this.sumBalancesCents(results);
    const globalStatus = this.aggregateGlobalStatus(results);

    const snapshot = await this.prisma.liabilitySnapshot.create({
      data: {
        mortgageCaseId: caseId,
        factorUsed: factor,
        rulesVersion: this.rulesVersion,
        credits: results as unknown as never,
        globalStatus,
        grossCurrentMonthlyDebt: centsToPesos(grossCents),
        totalCurrentBalance: centsToPesos(balanceCents),
      },
    });

    return {
      id: snapshot.id,
      caseId,
      calculatedAt: snapshot.calculatedAt.toISOString(),
      factorUsed: factor,
      rulesVersion: this.rulesVersion,
      credits: results,
      globalStatus,
      grossCurrentMonthlyDebt: centsToPesos(grossCents),
      totalCurrentBalance: centsToPesos(balanceCents),
    };
  }

  /**
   * Persona moral: shareholder credits keep MAX(saldo × 6%, pago).
   * Company credits use the simple and revolving formulas × share %.
   * `grossCurrentMonthlyDebt` stays the shareholder bag. Company debt
   * is `pmMonthlyDebt` and is not subtracted from capacity here.
   */
  async calculatePersonaMoral(
    caseId: string,
    shareholderCredits: LiabilityCreditInput[],
    companyCredits: PmCompanyCreditInput[],
    sharePercentage: number | null,
  ): Promise<LiabilityCalculationResult> {
    const pfResults = shareholderCredits.map((credit) =>
      this.processCredit(credit, SALARIED_REVOLVING_FACTOR),
    );
    const company = calculatePmCompanyLiabilities(companyCredits, sharePercentage);
    const credits = [...pfResults, ...company.credits];
    const grossCents = this.sumContributionsCents(pfResults);
    const balanceCents = this.sumBalancesCents(pfResults);
    const globalStatus = this.aggregateGlobalStatus(credits);

    const snapshot = await this.prisma.liabilitySnapshot.create({
      data: {
        mortgageCaseId: caseId,
        factorUsed: SALARIED_REVOLVING_FACTOR,
        rulesVersion: this.rulesVersion,
        credits: credits as unknown as never,
        globalStatus,
        grossCurrentMonthlyDebt: centsToPesos(grossCents),
        pmMonthlyDebt: company.pmMonthlyDebt,
        totalCurrentBalance: centsToPesos(balanceCents),
      },
    });

    return {
      id: snapshot.id,
      caseId,
      calculatedAt: snapshot.calculatedAt.toISOString(),
      factorUsed: SALARIED_REVOLVING_FACTOR,
      rulesVersion: this.rulesVersion,
      credits,
      globalStatus,
      grossCurrentMonthlyDebt: centsToPesos(grossCents),
      pmMonthlyDebt: company.pmMonthlyDebt,
      totalCurrentBalance: centsToPesos(balanceCents),
    };
  }

  /**
   * Return the most recent LiabilitySnapshot for a case, or null.
   */
  async getLatest(
    caseId: string,
  ): Promise<LiabilityCalculationResult | null> {
    const snapshot = await this.prisma.liabilitySnapshot.findFirst({
      where: { mortgageCaseId: caseId },
      orderBy: { calculatedAt: 'desc' },
    });

    if (!snapshot) return null;

    return this.snapshotToResult(snapshot, caseId);
  }

  /**
   * Apply a manual override to a single credit within the latest snapshot.
   * Recalculates that credit, recomputes aggregates, and creates a new
   * snapshot with `classificationSource = MANUAL`.
   */
  async overrideCredit(
    caseId: string,
    creditIndex: number,
    dto: OverrideCreditDto,
  ): Promise<LiabilityCalculationResult> {
    const latest = await this.getLatest(caseId);
    if (!latest) {
      throw new NotFoundException('No liability snapshot found for this case');
    }

    if (creditIndex < 0 || creditIndex >= latest.credits.length) {
      throw new NotFoundException(`Credit index ${creditIndex} out of range`);
    }

    const factor = latest.factorUsed;
    const credits: LiabilityCreditResult[] = [...latest.credits];

    // Apply overrides to the target credit
    const target = { ...credits[creditIndex] };

    if (dto.creditNature !== undefined) {
      target.creditNature = dto.creditNature;
    }
    if (dto.currentBalance !== undefined) {
      target.currentBalance = dto.currentBalance;
    }
    if (dto.paymentDueAmountEffective !== undefined) {
      target.paymentDueAmountEffective = dto.paymentDueAmountEffective;
    }
    target.classificationSource = ClassificationSource.MANUAL;
    target.classificationReason = dto.reason ?? null;

    if (target.liabilityBag === 'PM') {
      const recomputed = calculatePmCompanyCredit(
        {
          creditReference: target.creditReference,
          institution: target.institution,
          creditType:
            target.creditNature === CreditNature.REVOLVING
              ? 'REVOLVENTE'
              : target.creditType,
          classification:
            target.creditNature === CreditNature.REVOLVING
              ? 'REVOLVING'
              : target.creditNature === CreditNature.FIXED
                ? 'FIXED_PAYMENT'
                : target.classification,
          isClosed: target.isClosed,
          originalAmount: target.originalAmount ?? null,
          currentBalance: target.currentBalance,
          termDays: target.termDays ?? null,
        },
        target.sharePercentage ?? null,
      );
      credits[creditIndex] = {
        ...recomputed,
        classificationSource: ClassificationSource.MANUAL,
        classificationReason: dto.reason ?? recomputed.classificationReason,
      };
    } else {
      this.recalculateCredit(target, factor);
      credits[creditIndex] = target;
    }

    const pfCredits = credits.filter((credit) => credit.liabilityBag !== 'PM');
    const pmCredits = credits.filter((credit) => credit.liabilityBag === 'PM');
    const grossCents = this.sumContributionsCents(pfCredits);
    const balanceCents = this.sumBalancesCents(pfCredits);
    const pmMonthlyDebt =
      pmCredits.length === 0
        ? (latest.pmMonthlyDebt ?? null)
        : pmCredits.some(
              (credit) => credit.liabilityStatus === LiabilityStatus.INCOMPLETE,
            )
          ? null
          : centsToPesos(this.sumContributionsCents(pmCredits));
    const globalStatus = this.aggregateGlobalStatus(credits);

    const snapshot = await this.prisma.liabilitySnapshot.create({
      data: {
        mortgageCaseId: caseId,
        factorUsed: factor,
        rulesVersion: this.rulesVersion,
        credits: credits as unknown as never,
        globalStatus,
        grossCurrentMonthlyDebt: centsToPesos(grossCents),
        pmMonthlyDebt,
        totalCurrentBalance: centsToPesos(balanceCents),
      },
    });

    return {
      id: snapshot.id,
      caseId,
      calculatedAt: snapshot.calculatedAt.toISOString(),
      factorUsed: factor,
      rulesVersion: this.rulesVersion,
      credits,
      globalStatus,
      grossCurrentMonthlyDebt: centsToPesos(grossCents),
      pmMonthlyDebt,
      totalCurrentBalance: centsToPesos(balanceCents),
    };
  }

  // ── Credit processing ──────────────────────────────────────────────────

  /**
   * Full pipeline for a single credit: classify → calculate → build result.
   */
  private processCredit(
    input: LiabilityCreditInput,
    factor: number,
  ): LiabilityCreditResult {
    const institutionCategory = this.classifyInstitution(input.institution);

    // Closed credits contribute $0 — no classification needed
    if (input.isClosed) {
      return {
        ...input,
        monthlyDebtContribution: 0,
        creditNature: CreditNature.UNKNOWN,
        institutionCategory,
        ruleApplied: RuleApplied.CLOSED_ZERO,
        liabilityStatus: LiabilityStatus.CALCULATED,
        classificationSource: ClassificationSource.EXTRACTED,
        classificationReason: null,
      };
    }

    const classification = this.classifyNature(input);
    const calc = this.calculateContribution(
      classification.nature,
      input.currentBalance,
      input.paymentDueAmountEffective,
      factor,
    );

    return {
      ...input,
      monthlyDebtContribution: calc.contribution,
      creditNature: classification.nature,
      institutionCategory,
      ruleApplied: calc.rule,
      liabilityStatus: calc.status,
      classificationSource: classification.source,
      classificationReason: calc.reason ?? classification.reason,
    };
  }

  /**
   * Recalculate an existing LiabilityCreditResult in-place (after override).
   * Uses the credit's existing creditNature rather than re-classifying.
   */
  private recalculateCredit(
    credit: LiabilityCreditResult,
    factor: number,
  ): void {
    if (credit.isClosed) {
      credit.monthlyDebtContribution = 0;
      credit.ruleApplied = RuleApplied.CLOSED_ZERO;
      credit.liabilityStatus = LiabilityStatus.CALCULATED;
      return;
    }

    const calc = this.calculateContribution(
      credit.creditNature,
      credit.currentBalance,
      credit.paymentDueAmountEffective,
      factor,
    );

    credit.monthlyDebtContribution = calc.contribution;
    credit.ruleApplied = calc.rule;
    credit.liabilityStatus = calc.status;
    if (calc.reason) {
      credit.classificationReason = calc.reason;
    }
  }

  // ── Classification ───────────────────────────────────────────────────────

  /**
   * 3-step classification: EXTRACTED → KEYWORD → FALLBACK.
   * Returns creditNature, classificationSource, and reason.
   */
  private classifyNature(input: LiabilityCreditInput): {
    nature: CreditNature;
    source: ClassificationSource;
    reason: string | null;
  } {
    // Step 1: Gemini explicit classification
    const geminiClass = normalizeClassText(input.classification ?? '');
    if (geminiClass === 'REVOLVING') {
      return {
        nature: CreditNature.REVOLVING,
        source: ClassificationSource.EXTRACTED,
        reason: null,
      };
    }
    if (EXTRACTED_FIXED_CLASSES.has(geminiClass)) {
      return {
        nature: CreditNature.FIXED,
        source: ClassificationSource.EXTRACTED,
        reason: null,
      };
    }

    // Step 2: Keyword matching on creditType + productName + institution
    const searchText = normalizeClassText(
      [input.creditType, input.productName ?? '', input.institution ?? ''].join(' '),
    );

    const revolvingMatches = REVOLVING_KEYWORDS.filter((kw) =>
      searchText.includes(kw),
    );
    const fixedMatches = FIXED_KEYWORDS.filter((kw) =>
      searchText.includes(kw),
    );

    // Collision — if both revolving and fixed keywords match, return UNKNOWN
    if (revolvingMatches.length > 0 && fixedMatches.length > 0) {
      const allMatches = [...revolvingMatches, ...fixedMatches];
      return {
        nature: CreditNature.UNKNOWN,
        source: ClassificationSource.FALLBACK,
        reason: `colisión de keywords: ${allMatches.join(', ')}`,
      };
    }

    if (revolvingMatches.length > 0) {
      return {
        nature: CreditNature.REVOLVING,
        source: ClassificationSource.KEYWORD,
        reason: null,
      };
    }

    if (fixedMatches.length > 0) {
      return {
        nature: CreditNature.FIXED,
        source: ClassificationSource.KEYWORD,
        reason: null,
      };
    }

    // Step 3: Non-revolving "Otros" / "NON_BANK_SERVICE" / "SKY" → Default to FIXED per user requirement
    const isOtros =
      geminiClass === 'OTHER' ||
      geminiClass === 'OTROS' ||
      geminiClass === 'OTRO' ||
      geminiClass === 'NON_BANK_SERVICE' ||
      searchText.includes('OTRO') ||
      searchText.includes('OTROS') ||
      searchText.includes('OTHER') ||
      searchText.includes('SKY') ||
      searchText.includes('CABLE') ||
      searchText.includes('TELEFON');

    if (isOtros) {
      return {
        nature: CreditNature.FIXED,
        source: ClassificationSource.FALLBACK,
        reason: 'Crédito tipo "Otros" o servicio clasificado como FIJO por defecto',
      };
    }

    // Step 4: Fallback conservador — UNKNOWN
    return {
      nature: CreditNature.UNKNOWN,
      source: ClassificationSource.FALLBACK,
      reason: null,
    };
  }

  /**
   * Deterministic institution category mapping from institution name.
   */
  private classifyInstitution(institution: string): InstitutionCategory {
    const name = (institution ?? '').toUpperCase();

    if (BANK_KEYWORDS.some((kw) => name.includes(kw))) {
      return InstitutionCategory.BANK;
    }
    if (DEPARTMENT_STORE_KEYWORDS.some((kw) => name.includes(kw))) {
      return InstitutionCategory.DEPARTMENT_STORE;
    }
    if (FINTECH_KEYWORDS.some((kw) => name.includes(kw))) {
      return InstitutionCategory.FINTECH;
    }

    return InstitutionCategory.NON_BANK_SERVICE;
  }

  // ── Calculation rules ──────────────────────────────────────────────────

  /**
   * Calculate monthly debt contribution for a credit by its nature.
   * Returns contribution in pesos, status, and rule applied.
   */
  private calculateContribution(
    nature: CreditNature,
    currentBalance: number | null,
    paymentDueAmountEffective: number | null,
    factor: number,
  ): {
    contribution: number | null;
    status: LiabilityStatus;
    rule: RuleApplied;
    reason?: string | null;
  } {
    switch (nature) {
      case CreditNature.REVOLVING:
        return this.calculateRevolving(
          currentBalance,
          paymentDueAmountEffective,
          factor,
        );
      case CreditNature.FIXED:
        return this.calculateFixed(currentBalance, paymentDueAmountEffective);
      case CreditNature.UNKNOWN:
        return this.calculateUnknown(
          currentBalance,
          paymentDueAmountEffective,
          factor,
        );
      default:
        return {
          contribution: null,
          status: LiabilityStatus.INCOMPLETE,
          rule: RuleApplied.INCOMPLETE_DATA,
        };
    }
  }

  /**
   * REVOLVING: MAX(balance × factor, payment) in integer cents.
   * Missing data → REQUIRES_REVIEW; both missing → INCOMPLETE.
   */
  private calculateRevolving(
    balance: number | null,
    payment: number | null,
    factor: number,
  ): {
    contribution: number | null;
    status: LiabilityStatus;
    rule: RuleApplied;
  } {
    const balanceCents = balance !== null ? pesosToCents(balance) : null;
    const paymentCents = payment !== null ? pesosToCents(payment) : null;

    if (balanceCents !== null && paymentCents !== null) {
      const revolvingCents = applyFactorCents(balanceCents, factor);
      const contributionCents = Math.max(revolvingCents, paymentCents);
      return {
        contribution: centsToPesos(contributionCents),
        status: LiabilityStatus.CALCULATED,
        rule: RuleApplied.REVOLVING_STANDARD,
      };
    }

    if (balanceCents !== null && paymentCents === null) {
      const revolvingCents = applyFactorCents(balanceCents, factor);
      return {
        contribution: centsToPesos(revolvingCents),
        status: LiabilityStatus.REQUIRES_REVIEW,
        rule: RuleApplied.REVOLVING_STANDARD,
      };
    }

    if (balanceCents === null && paymentCents !== null) {
      return {
        contribution: centsToPesos(paymentCents),
        status: LiabilityStatus.REQUIRES_REVIEW,
        rule: RuleApplied.REVOLVING_STANDARD,
      };
    }

    // Both null → INCOMPLETE
    return {
      contribution: null,
      status: LiabilityStatus.INCOMPLETE,
      rule: RuleApplied.INCOMPLETE_DATA,
    };
  }

  /**
   * FIXED: use payment directly. saldo > 0 + pago = 0/null → INCOMPLETE.
   * pago > saldo → CALCULATED + warning (in reason).
   */
  private calculateFixed(
    balance: number | null,
    payment: number | null,
  ): {
    contribution: number | null;
    status: LiabilityStatus;
    rule: RuleApplied;
    reason?: string | null;
  } {
    const balanceCents = balance !== null ? pesosToCents(balance) : null;
    const paymentCents = payment !== null ? pesosToCents(payment) : null;

    if (paymentCents !== null && paymentCents > 0) {
      // Normal: use payment directly
      const reason =
        balanceCents !== null && paymentCents > balanceCents
          ? 'pago > saldo — verificar que el monto a pagar no incluya liquidación anticipada'
          : null;
      return {
        contribution: centsToPesos(paymentCents),
        status: LiabilityStatus.CALCULATED,
        rule: RuleApplied.FIXED_DIRECT,
        reason,
      };
    }

    if (paymentCents === 0) {
      // Explicit $0 payment — calculated contribution is $0
      return {
        contribution: 0,
        status: LiabilityStatus.CALCULATED,
        rule: RuleApplied.FIXED_DIRECT,
      };
    }

    // paymentCents === null
    if (balanceCents !== null && balanceCents > 0) {
      return {
        contribution: null,
        status: LiabilityStatus.INCOMPLETE,
        rule: RuleApplied.INCOMPLETE_DATA,
      };
    }

    if (balanceCents === 0) {
      return {
        contribution: 0,
        status: LiabilityStatus.CALCULATED,
        rule: RuleApplied.FIXED_DIRECT,
      };
    }

    // balance = null, payment = null → missing data
    return {
      contribution: null,
      status: LiabilityStatus.INCOMPLETE,
      rule: RuleApplied.INCOMPLETE_DATA,
    };
  }

  /**
   * UNKNOWN: conservative MAX(saldo × factor, pago) + REQUIRES_REVIEW.
   * Uses the same personType factor as revolving (PFAE 0.07, else 0.06).
   */
  private calculateUnknown(
    balance: number | null,
    payment: number | null,
    factor: number,
  ): {
    contribution: number | null;
    status: LiabilityStatus;
    rule: RuleApplied;
  } {
    const balanceCents = balance !== null ? pesosToCents(balance) : null;
    const paymentCents = payment !== null ? pesosToCents(payment) : null;

    if (balanceCents !== null && paymentCents !== null) {
      const provisionalCents = applyFactorCents(balanceCents, factor);
      const maxCents = Math.max(provisionalCents, paymentCents);
      return {
        contribution: centsToPesos(maxCents),
        status: LiabilityStatus.REQUIRES_REVIEW,
        rule: RuleApplied.UNKNOWN_PROVISIONAL,
      };
    }

    if (balanceCents !== null && paymentCents === null) {
      const provisionalCents = applyFactorCents(balanceCents, factor);
      return {
        contribution: centsToPesos(provisionalCents),
        status: LiabilityStatus.REQUIRES_REVIEW,
        rule: RuleApplied.UNKNOWN_PROVISIONAL,
      };
    }

    if (balanceCents === null && paymentCents !== null) {
      return {
        contribution: centsToPesos(paymentCents),
        status: LiabilityStatus.REQUIRES_REVIEW,
        rule: RuleApplied.UNKNOWN_PROVISIONAL,
      };
    }

    // Both null → INCOMPLETE
    return {
      contribution: null,
      status: LiabilityStatus.INCOMPLETE,
      rule: RuleApplied.INCOMPLETE_DATA,
    };
  }

  // ── Aggregation ─────────────────────────────────────────────────────────

  /**
   * Sum monthlyDebtContribution across all credits in integer cents.
   * null contributions and closed-credit zeros contribute 0 cents.
   */
  private sumContributionsCents(credits: LiabilityCreditResult[]): number {
    let totalCents = 0;
    for (const c of credits) {
      if (c.monthlyDebtContribution !== null) {
        totalCents += pesosToCents(c.monthlyDebtContribution);
      }
    }
    return totalCents;
  }

  /**
   * Sum currentBalance across non-closed credits in integer cents.
   * null balances contribute 0; closed credits excluded entirely.
   */
  private sumBalancesCents(credits: LiabilityCreditResult[]): number {
    let totalCents = 0;
    for (const c of credits) {
      if (c.isClosed) continue;
      if (c.currentBalance !== null) {
        totalCents += pesosToCents(c.currentBalance);
      }
    }
    return totalCents;
  }

  /**
   * Aggregate individual credit statuses into a global status.
   * all CALCULATED → CALCULATED; ≥1 REQUIRES_REVIEW no INCOMPLETE → PARTIAL;
   * ≥1 INCOMPLETE → INCOMPLETE.
   */
  private aggregateGlobalStatus(
    credits: LiabilityCreditResult[],
  ): GlobalLiabilityStatus {
    const hasIncomplete = credits.some(
      (c) => c.liabilityStatus === LiabilityStatus.INCOMPLETE,
    );
    if (hasIncomplete) return GlobalLiabilityStatus.INCOMPLETE;

    const hasRequiresReview = credits.some(
      (c) => c.liabilityStatus === LiabilityStatus.REQUIRES_REVIEW,
    );
    if (hasRequiresReview) return GlobalLiabilityStatus.PARTIAL;

    return GlobalLiabilityStatus.CALCULATED;
  }

  // ── Snapshot conversion ─────────────────────────────────────────────────

  /**
   * Convert a raw Prisma LiabilitySnapshot row to the typed result.
   */
  private snapshotToResult(
    snapshot: Record<string, unknown>,
    caseId: string,
  ): LiabilityCalculationResult {
    const factorUsed =
      typeof snapshot.factorUsed === 'number'
        ? snapshot.factorUsed
        : Number(snapshot.factorUsed);

    const gross =
      typeof snapshot.grossCurrentMonthlyDebt === 'number'
        ? snapshot.grossCurrentMonthlyDebt
        : Number(snapshot.grossCurrentMonthlyDebt);

    const total =
      typeof snapshot.totalCurrentBalance === 'number'
        ? snapshot.totalCurrentBalance
        : Number(snapshot.totalCurrentBalance);

    const calculatedAt =
      snapshot.calculatedAt instanceof Date
        ? (snapshot.calculatedAt as Date).toISOString()
        : String(snapshot.calculatedAt);

    return {
      id: snapshot.id as string,
      caseId,
      calculatedAt,
      factorUsed,
      rulesVersion: snapshot.rulesVersion as string,
      credits: snapshot.credits as LiabilityCreditResult[],
      globalStatus: snapshot.globalStatus as GlobalLiabilityStatus,
      grossCurrentMonthlyDebt: gross,
      pmMonthlyDebt:
        snapshot.pmMonthlyDebt == null ? null : Number(snapshot.pmMonthlyDebt),
      totalCurrentBalance: total,
    };
  }
}