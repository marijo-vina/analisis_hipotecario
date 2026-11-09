/**
 * Income calculation domain types — enums and interfaces for the
 * admissible monthly income calculation engine (HU-12).
 *
 * Monetary averages use Decimal arithmetic (Prisma.Decimal) with
 * 2 decimal places, per design.md "Decimal vs integer cents" decision.
 */

// ── Enums ────────────────────────────────────────────────────────────────

export enum IncomeCalculationStatus {
  CALCULATED = 'CALCULATED',
  CONFIRMED = 'CONFIRMED',
  REQUIRES_REVIEW = 'REQUIRES_REVIEW',
}

export type IncomeSource = 'PAYROLL' | 'BANK_STATEMENTS' | 'TAX_RETURN';

export interface IncomeBase {
  valid: boolean;
  invalidReason: string | null;
  monthlyGross: number | null;
  monthlyNet: number | null;
}

export interface BankIncomeBase extends IncomeBase {
  windowMonths: 6 | 12;
  monthsUsed: string[];
  droppedMax: string | null;
  droppedMin: string | null;
  /** Set when the average used fewer months than the activity window. */
  statementNotice?: string | null;
}

export interface ActivityResolution {
  description: string | null;
  percentage: number | null;
  order: number | null;
  matchedKeyword: string | null;
  windowMonths: 6 | 12;
}

export interface PfaeIncomeBases {
  bank: BankIncomeBase;
  taxReturn: IncomeBase;
  activity: ActivityResolution;
}

export interface PmBankCapacity {
  status: 'CALCULATED' | 'NOT_VIABLE' | 'REQUIRES_REVIEW';
  reason: string | null;
  admissibleIncome: number | null;
  incomeToConsider: number | null;
  maximumDebt: number | null;
  capacity: number | null;
}

/** Capacities for the closed PM formulas. Banorte and HSBC stay in review. */
export interface PmIncomeBases {
  profile: 'PM';
  sharePercentage: number | null;
  activityFactor: number | null;
  /** 0.50 when the company is already a Banorte client, otherwise 0.40. */
  banorteClientFactor: number | null;
  bank: BankIncomeBase;
  taxReturn: IncomeBase;
  activity: ActivityResolution;
  capacities: {
    santanderStatements: PmBankCapacity;
    santanderTaxReturn: PmBankCapacity;
    scotiabank: PmBankCapacity;
    banorteStatements: PmBankCapacity;
    banorteTaxReturn: PmBankCapacity;
    hsbcStatements: PmBankCapacity;
    hsbcTaxReturn: PmBankCapacity;
    banregioStatements: PmBankCapacity;
    banregioTaxReturn: PmBankCapacity;
    banamexStatements: PmBankCapacity;
    banamexTaxReturn: PmBankCapacity;
  };
}

// ── Interfaces ───────────────────────────────────────────────────────────

/**
 * Per-receipt result stored inside `receiptResults` (JSON column).
 * Mirrors the 9-column table the advisor sees, plus the `included`
 * flag that controls whether the receipt contributes to averages.
 */
export interface IncomeReceiptResult {
  /** Stable document ID from the Document table (used for toggle operations). */
  documentId: string;
  period: string | null;
  paymentDate: string | null;
  employer: string | null;
  employerRfc: string | null;
  grossIncome: number | null;
  netIncome: number | null;
  /** Conciliation status from HU-10 bankarization (mirrored for immutability). */
  conciliationStatus: string | null;
  /** Review status from HU-10 (mirrored; future use). */
  reviewStatus: string | null;
  /** Whether this receipt is included in the average calculation. */
  included: boolean;
}

/**
 * Full calculation result persisted as an IncomeCalculation snapshot.
 */
export interface IncomeCalculationResult {
  id: string;
  caseId: string;
  calculatedAt: string;
  receiptResults: IncomeReceiptResult[];
  averageGrossIncome: number;
  averageNetIncome: number;
  confirmedGrossIncome: number | null;
  confirmedNetIncome: number | null;
  receiptCount: number;
  includedCount: number;
  status: IncomeCalculationStatus;
  confirmedBy: string | null;
  confirmedAt: string | null;
  observations: string | null;
  source?: IncomeSource;
  bases?: PfaeIncomeBases | PmIncomeBases | null;
}
