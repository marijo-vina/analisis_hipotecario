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
}
