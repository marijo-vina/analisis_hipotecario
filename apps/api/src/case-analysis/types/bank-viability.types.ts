/**
 * Flags carried from Phase A (bankarization-validation) to Phase C
 * (bank-viability) without querying the database.
 */
export interface BankarizationFlags {
  hasPagadoraIncome: boolean;
  scotiabankExcluded: boolean;
}

export type CheckStatus = 'PASS' | 'FAIL' | 'REQUIRES_REVIEW' | 'NOT_APPLICABLE';

export type ProductMatchStatus =
  | 'PRELIMINARY_VIABLE'
  | 'CONDITIONED'
  | 'NOT_COMPATIBLE'
  | 'REQUIRES_REVIEW';

/** @deprecated Use BankResultStatus instead. Kept for backward compat. */
export type BankResultStatus = ProductMatchStatus;

export interface BankViabilityInputs {
  confirmedGrossIncome: string | null;
  confirmedNetIncome: string | null;
  totalMonthlyLiabilities: string | null;
  requestedAmount: string | null;
  propertyValue: string | null;
  estimatedTermMonths: number | null;
  birthDate: string | null;
  employmentStartDate: string | null;
  hasPagadoraIncome: boolean;
  scotiabankExcluded: boolean;
}

export interface BankResultCalculation {
  incomeUsed: string | null;
  maximumDebt: string | null;
  totalMonthlyLiabilities: string | null;
  availableCapacity: string | null;
  currentAgeMonths: number | null;
  ageAtMaturityMonths: number | null;
  employmentTenureMonths: number | null;
}

/** @deprecated Use BankResultCalculation instead. Kept for backward compat. */
export type ProductMatchCalculation = BankResultCalculation;

export interface CheckResult {
  status: CheckStatus;
  [key: string]: unknown;
}

export interface BankPolicySnapshot {
  bankName: string;
  incomeCriterion: string;
  debtCommitmentFactor: string;
  minimumEmploymentTenureMonths: number | null;
  minimumApplicantAgeMonths: number | null;
  maximumApplicationAgeMonths: number | null;
  minimumIncome: string | null;
  minimumPropertyValue: string | null;
}

export interface BankResult {
  bankCode: string;
  productCode: string;
  status: ProductMatchStatus;
  reasons: string[];
  policySnapshot: BankPolicySnapshot;
  calculation: BankResultCalculation;
  checks: Record<string, CheckResult>;
}

/** @deprecated Use BankResult instead. Kept for backward compat. */
export type ProductMatch = BankResult;

export interface CaseAnalysisContext {
  client: Record<string, unknown>;
  caseId: string;
  [key: string]: unknown;
}

export interface BankViabilitySnapshot {
  sourceVersion: string;
  creditTypeCode: string;
  destination: string | null;
  calculatedAt: string;
  warningLegend: string;
  reasons: string[];
  inputs: BankViabilityInputs;
  bankResults: BankResult[];
}
