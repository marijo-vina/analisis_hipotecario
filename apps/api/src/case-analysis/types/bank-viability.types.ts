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

export interface ProductMatchCalculation {
  incomeUsed: string | null;
  maximumDebt: string | null;
  totalMonthlyLiabilities: string | null;
  availableCapacity: string | null;
  requestedLtv: string | null;
  maximumAmountByLtv: string | null;
  requiredReduction: string | null;
  currentAgeMonths: number | null;
  ageAtMaturityMonths: number | null;
  employmentTenureMonths: number | null;
  maximumTheoreticalTermMonths: number | null;
}

export interface CheckResult {
  status: CheckStatus;
  [key: string]: unknown;
}

export interface ProductMatch {
  bankCode: string;
  productCode: string;
  status: ProductMatchStatus;
  reasons: string[];
  policySnapshot: Record<string, unknown>;
  calculation: ProductMatchCalculation;
  checks: Record<string, CheckResult>;
}

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
  productMatches: ProductMatch[];
}
