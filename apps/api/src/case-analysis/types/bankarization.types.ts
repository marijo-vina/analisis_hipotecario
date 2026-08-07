// ---------------------------------------------------------------------------
// Tipos de validacion de bancarizacion (HU-10).
//
// Conciliacion individualrecibo de nominas vs deposito bancario con matching
// determinista: prioridad RFC, fallback obligatorio (monto + fecha + concepto),
// deteccion de pagadoras y regla limitativa Scotiabank.
//
// Sin ML ni fuzzy: cada decision trazable via MatchTrace.
// ---------------------------------------------------------------------------

// ── Estados de conciliacion (8 valores del proposal) ───────────────────────
export const PAYROLL_RECONCILIATION_STATUSES = [
  'MATCHED',
  'MATCHED_2_OF_3',
  'NOT_MATCHED',
  'DISCREPANCY',
  'RFC_INCOMPATIBLE',
  'AMBIGUOUS',
  'PROVIDER_CANDIDATE',
  'PROVIDER_MIRROR_CONFIRMED',
  'MANUAL_REVIEW',
] as const;

export type PayrollReconciliationStatus =
  (typeof PAYROLL_RECONCILIATION_STATUSES)[number];

// ── Metodos de matching (4 valores) ────────────────────────────────────────
export const PAYROLL_MATCH_METHODS = [
  'RFC',
  'FALLBACK',
  'PROVIDER_MIRROR',
  'NONE',
] as const;

export type PayrollMatchMethod = (typeof PAYROLL_MATCH_METHODS)[number];

// ── Catalogo deterministico de conceptos (normalizados, lowercase) ─────────
// Un deposito es COMPATIBLE si su concepto normalizado contiene al menos una
// de estas keywords. Definicion del spec payroll-bank-matching.
export const CONCEPT_CATALOG_KEYWORDS = [
  'nomina',
  'sueldo',
  'pago de haberes',
  'haberes',
  'pago empleado',
  'spei empleador',
] as const;

// NOTA: el spec lista 7 keywords crudos, pero "nómina" y "nomina" colapsan a
// "nomina" tras normalizacion (strip acentos + lowercase). El algoritmo opera
// sobre conceptos ya normalizados, por lo que el catalogo guarda las 6
// entradas unicas normalizadas. La trazabilidad reporta la keyword normalizada
// matcheada (e.g. conceptKeyword = "nomina").

// ── Entradas del matching ───────────────────────────────────────────────────

/** Origen de la fecha de pago resuelta para un recibo. */
export type PayrollPaymentDateSource =
  | 'EXPLICIT'
  | 'PERIOD_END'
  | 'INFERRED_QUINCENA'
  | 'MANUAL_OVERRIDE';

/** Fecha de pago resuelta con trazabilidad de origen. */
export interface ResolvedPayrollDate {
  resolvedPaymentDate: string | null;
  source: PayrollPaymentDateSource;
  estimated: boolean;
  originalPeriodLabel: string | null;
}

/** Recibo de nomina minimamente estructurado para el algoritmo de matching. */
export interface PayrollReceipt {
  index: number;
  netIncome: number | null;
  /** Fecha de pago ISO `YYYY-MM-DD` (campo crudo de la extraccion). */
  paymentDate: string | null;
  /** Fecha de pago resuelta con trazabilidad (usada por el matching). */
  resolvedPaymentDate: ResolvedPayrollDate;
  employerRfc: string | null;
  employerName: string | null;
  /** Nombre original del documento para inferencia de periodo. */
  originalName: string | null;
}

/** Deposito bancario (SPEI / transferencia) detectado en estado de cuenta. */
export interface PayrollDeposit {
  id: string;
  /** Fecha del deposito ISO `YYYY-MM-DD`. */
  date: string | null;
  amount: number | null;
  originalConcept: string | null;
  detectedPayerRfc: string | null;
  detectedPayerName: string | null;
}

/** Entrada agregada del algoritmo de matching. */
export interface PayrollMatchInput {
  receipts: PayrollReceipt[];
  deposits: PayrollDeposit[];
  isJointAccount: boolean;
}

// ── Trazabilidad ─────────────────────────────────────────────────────────────

/** Razon por la que un candidato fue descartado. */
export interface DiscardReason {
  depositId: string;
  reason: 'RFC_MISMATCH' | 'DATE_OUT_OF_RANGE' | 'AMOUNT_EXCEEDS_TOLERANCE' | 'CONCEPT_NOT_COMPATIBLE';
  detail: string;
}

/** Regla aplicada para llegar al resultado, con valores comparados. */
export interface MatchTrace {
  rule: 'RFC_MATCH' | 'FALLBACK_3RULES' | 'NONE';
  rfcUsed?: string;
  dateDiff?: number;
  amountDiffPercent?: number;
  conceptKeyword?: string;
  /** Candidatos evaluados y descartados antes de llegar al resultado final. */
  discardReasons: DiscardReason[];
}

// ── Resultado ───────────────────────────────────────────────────────────────

/** Resultado individual por recibo: estado, metodo, candidato y trazabilidad. */
export interface PayrollMatchResult {
  receiptIndex: number;
  status: PayrollReconciliationStatus;
  method: PayrollMatchMethod;
  candidateDepositId: string | null;
  candidateAmount: number | null;
  candidateDate: string | null;
  candidateConcept: string | null;
  score: number | null;
  /** true cuando el deposito de pagadora se excluye para calculos Scotiabank. */
  scotiabankExcluded: boolean;
  /** Fecha usada para el matching (resuelta con trazabilidad). */
  usedPaymentDate: string | null;
  traceability: MatchTrace;
}

// ── Evaluacion de pagadora ──────────────────────────────────────────────────

/**
 * Evaluacion de esquema de pagadora para un recibo con RFC incompatible.
 * Producido por PagadoraDetectionService; la regla lo aplica al resultado.
 */
export interface PagadoraEvaluation {
  receiptIndex: number;
  isProviderCandidate: boolean;
  isMirrorConfirmed: boolean;
  providerRfc: string | null;
  employerDepositFound: boolean;
  providerDepositFound: boolean;
  scotiabankExcluded: boolean;
}