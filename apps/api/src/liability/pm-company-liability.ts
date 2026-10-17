import {
  ClassificationSource,
  CreditNature,
  InstitutionCategory,
  LiabilityStatus,
  RuleApplied,
  type LiabilityCreditResult,
} from './liability.types';

/**
 * Company-bureau credit used by the persona moral formulas.
 * Amounts are pesos. `sharePercentage` is applied by the caller, in
 * percentage points (50 means 50%).
 */
export interface PmCompanyCreditInput {
  creditReference: string;
  institution: string;
  creditType: string;
  classification: string;
  isClosed: boolean;
  originalAmount: number | null;
  currentBalance: number | null;
  termDays: number | null;
}

export interface PmCompanyLiabilityResult {
  credits: LiabilityCreditResult[];
  /** Null when the share percentage is missing or a credit cannot be totaled. */
  pmMonthlyDebt: number | null;
  hasIncomplete: boolean;
  hasRequiresReview: boolean;
}

const REVOLVING_MARKERS = ['REVOLVING', 'REVOLVENTE', 'TARJETA'];

/**
 * Simple: (monto original / (plazo días / 30)) × %PA
 * Revolving: MAX(monto original, monto vigente) × 10% × %PA
 *
 * Each credit is rounded to cents. The fixture at 50% is
 * 4,571.92 + 12,000 + 1,400 = 17,971.92.
 */
export function calculatePmCompanyLiabilities(
  credits: PmCompanyCreditInput[],
  sharePercentage: number | null,
): PmCompanyLiabilityResult {
  const results = credits.map((credit) =>
    calculatePmCompanyCredit(credit, sharePercentage),
  );
  const hasIncomplete = results.some(
    (credit) => credit.liabilityStatus === LiabilityStatus.INCOMPLETE,
  );
  const hasRequiresReview = results.some(
    (credit) => credit.liabilityStatus === LiabilityStatus.REQUIRES_REVIEW,
  );
  return {
    credits: results,
    pmMonthlyDebt: hasIncomplete ? null : sumContributions(results),
    hasIncomplete,
    hasRequiresReview,
  };
}

export function calculatePmCompanyCredit(
  credit: PmCompanyCreditInput,
  sharePercentage: number | null,
): LiabilityCreditResult {
  const base = {
    creditReference: credit.creditReference,
    institution: credit.institution,
    creditType: credit.creditType,
    classification: credit.classification,
    status: credit.isClosed ? 'CLOSED' : 'ACTIVE',
    currentBalance: credit.currentBalance,
    paymentDueAmountEffective: null,
    isClosed: credit.isClosed,
    institutionCategory: InstitutionCategory.NON_BANK_SERVICE,
    classificationSource: ClassificationSource.EXTRACTED,
    liabilityBag: 'PM' as const,
    originalAmount: credit.originalAmount,
    termDays: credit.termDays,
    sharePercentage,
  };

  if (credit.isClosed) {
    return {
      ...base,
      monthlyDebtContribution: 0,
      creditNature: CreditNature.UNKNOWN,
      ruleApplied: RuleApplied.CLOSED_ZERO,
      liabilityStatus: LiabilityStatus.CALCULATED,
      classificationReason: null,
    };
  }

  if (sharePercentage == null || !Number.isFinite(sharePercentage)) {
    return incomplete(base, 'Falta el porcentaje de acciones para prorratear la deuda de la empresa.');
  }

  if (isRevolving(credit)) {
    return calculateRevolving(base, credit, sharePercentage);
  }

  return calculateSimple(base, credit, sharePercentage);
}

function calculateSimple(
  base: Omit<
    LiabilityCreditResult,
    'monthlyDebtContribution' | 'creditNature' | 'ruleApplied' | 'liabilityStatus' | 'classificationReason'
  >,
  credit: PmCompanyCreditInput,
  sharePercentage: number,
): LiabilityCreditResult {
  if (
    credit.originalAmount == null ||
    !Number.isFinite(credit.originalAmount) ||
    credit.termDays == null ||
    !Number.isFinite(credit.termDays) ||
    credit.termDays <= 0
  ) {
    return incomplete(
      base,
      'El crédito simple de la empresa necesita monto original y plazo en días.',
    );
  }

  return {
    ...base,
    monthlyDebtContribution: centsToPesos(
      simpleCents(credit.originalAmount, credit.termDays, sharePercentage),
    ),
    creditNature: CreditNature.FIXED,
    ruleApplied: RuleApplied.PM_SIMPLE,
    liabilityStatus: LiabilityStatus.CALCULATED,
    classificationReason: null,
  };
}

function calculateRevolving(
  base: Omit<
    LiabilityCreditResult,
    'monthlyDebtContribution' | 'creditNature' | 'ruleApplied' | 'liabilityStatus' | 'classificationReason'
  >,
  credit: PmCompanyCreditInput,
  sharePercentage: number,
): LiabilityCreditResult {
  const original = finiteOrNull(credit.originalAmount);
  const current = finiteOrNull(credit.currentBalance);

  if (original == null && current == null) {
    return incomplete(
      base,
      'El crédito revolvente de la empresa necesita monto original o saldo vigente.',
    );
  }

  const amount = Math.max(original ?? 0, current ?? 0);
  const partial = original == null || current == null;
  return {
    ...base,
    monthlyDebtContribution: centsToPesos(revolvingCents(amount, sharePercentage)),
    creditNature: CreditNature.REVOLVING,
    ruleApplied: RuleApplied.PM_REVOLVING,
    liabilityStatus: partial
      ? LiabilityStatus.REQUIRES_REVIEW
      : LiabilityStatus.CALCULATED,
    classificationReason: partial
      ? 'Falta monto original o saldo vigente. Se usó el monto disponible.'
      : null,
  };
}

function incomplete(
  base: Omit<
    LiabilityCreditResult,
    'monthlyDebtContribution' | 'creditNature' | 'ruleApplied' | 'liabilityStatus' | 'classificationReason'
  >,
  reason: string,
): LiabilityCreditResult {
  return {
    ...base,
    monthlyDebtContribution: null,
    creditNature: CreditNature.UNKNOWN,
    ruleApplied: RuleApplied.INCOMPLETE_DATA,
    liabilityStatus: LiabilityStatus.INCOMPLETE,
    classificationReason: reason,
  };
}

export function isRevolving(credit: Pick<PmCompanyCreditInput, 'classification' | 'creditType'>): boolean {
  const text = `${credit.classification} ${credit.creditType}`.toUpperCase();
  return REVOLVING_MARKERS.some((marker) => text.includes(marker));
}

/** (original / (days / 30)) × share%, in integer cents. */
function simpleCents(originalPesos: number, termDays: number, sharePercentage: number): number {
  const originalCents = Math.round(originalPesos * 100);
  return Math.round((originalCents * 30 * sharePercentage) / (termDays * 100));
}

/** MAX(original, vigente) × 10% × share%, in integer cents. */
function revolvingCents(amountPesos: number, sharePercentage: number): number {
  const amountCents = Math.round(amountPesos * 100);
  return Math.round((amountCents * 10 * sharePercentage) / 10000);
}

function sumContributions(credits: LiabilityCreditResult[]): number {
  const cents = credits.reduce(
    (total, credit) => total + Math.round((credit.monthlyDebtContribution ?? 0) * 100),
    0,
  );
  return cents / 100;
}

function centsToPesos(cents: number): number {
  return cents / 100;
}

function finiteOrNull(value: number | null): number | null {
  return value != null && Number.isFinite(value) ? value : null;
}
