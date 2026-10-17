/**
 * Liability domain types — enums and interfaces for the credit-bureau
 * liability calculation engine (HU-11).
 *
 * All monetary calculations use integer cents internally; pesos only appear
 * on the display surfaces. See design.md "Algoritmo de clasificacion".
 */

// ── Enums ────────────────────────────────────────────────────────────────

export enum CreditNature {
  REVOLVING = 'REVOLVING',
  FIXED = 'FIXED',
  UNKNOWN = 'UNKNOWN',
}

export enum InstitutionCategory {
  BANK = 'BANK',
  DEPARTMENT_STORE = 'DEPARTMENT_STORE',
  FINTECH = 'FINTECH',
  NON_BANK_SERVICE = 'NON_BANK_SERVICE',
}

export enum LiabilityStatus {
  CALCULATED = 'CALCULATED',
  REQUIRES_REVIEW = 'REQUIRES_REVIEW',
  INCOMPLETE = 'INCOMPLETE',
}

export enum ClassificationSource {
  EXTRACTED = 'EXTRACTED',
  KEYWORD = 'KEYWORD',
  MANUAL = 'MANUAL',
  FALLBACK = 'FALLBACK',
}

export enum GlobalLiabilityStatus {
  CALCULATED = 'CALCULATED',
  PARTIAL = 'PARTIAL',
  INCOMPLETE = 'INCOMPLETE',
}

export enum RuleApplied {
  REVOLVING_STANDARD = 'REVOLVING_STANDARD',
  FIXED_DIRECT = 'FIXED_DIRECT',
  UNKNOWN_PROVISIONAL = 'UNKNOWN_PROVISIONAL',
  CLOSED_ZERO = 'CLOSED_ZERO',
  INCOMPLETE_DATA = 'INCOMPLETE_DATA',
  PM_SIMPLE = 'PM_SIMPLE',
  PM_REVOLVING = 'PM_REVOLVING',
}

// ── Interfaces ───────────────────────────────────────────────────────────

/**
 * Input credit as extracted from the bureau report.
 * `creditReference` is a mandatory stable identifier from raw extraction.
 * `productName` is optional — used for keyword matching when available.
 * Monetary values are in pesos (number | null); the engine converts to
 * integer cents internally.
 */
export interface LiabilityCreditInput {
  creditReference: string;
  institution: string;
  creditType: string;
  /** Optional product-name from bureau extraction; expands keyword search. */
  productName?: string;
  /** Gemini's initial classification ("REVOLVING", "FIXED_PAYMENT", "UNKNOWN", etc.) */
  classification: string;
  status: string;
  currentBalance: number | null;
  paymentDueAmountEffective: number | null;
  isClosed: boolean;
}

/**
 * Enriched credit result with classification, calculation and status.
 * Extends the input so the engine output is self-contained.
 */
export interface LiabilityCreditResult extends LiabilityCreditInput {
  /** Monthly debt contribution in pesos (null = incomplete data). */
  monthlyDebtContribution: number | null;
  creditNature: CreditNature;
  institutionCategory: InstitutionCategory;
  ruleApplied: RuleApplied;
  liabilityStatus: LiabilityStatus;
  classificationSource: ClassificationSource;
  /** Human-readable reason for classification choices (collisions, fallbacks, etc.) */
  classificationReason: string | null;
  /** PF = shareholder bureau. PM = company bureau prorated by share %. */
  liabilityBag?: 'PF' | 'PM';
  originalAmount?: number | null;
  termDays?: number | null;
  /** Share percentage points stored on the case, e.g. 50 means 50%. */
  sharePercentage?: number | null;
}

/**
 * Full calculation result persisted as a LiabilitySnapshot.
 */
export interface LiabilityCalculationResult {
  id: string;
  caseId: string;
  calculatedAt: string;
  factorUsed: number;
  rulesVersion: string;
  credits: LiabilityCreditResult[];
  globalStatus: GlobalLiabilityStatus;
  /** Sum of monthlyDebtContribution across all credits, in pesos. */
  grossCurrentMonthlyDebt: number;
  /**
   * Company-bureau debt prorated by share percentage.
   * Null on salaried and PFAE snapshots, and when the company bag
   * cannot be totaled.
   */
  pmMonthlyDebt?: number | null;
  /** Simple arithmetic sum of currentBalance across non-closed credits, in pesos. */
  totalCurrentBalance: number;
}