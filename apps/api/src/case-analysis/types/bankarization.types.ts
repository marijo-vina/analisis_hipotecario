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

/** Recibo de nomina minimamente estructurado para el algoritmo de matching. */
export interface PayrollReceipt {
  index: number;
  netIncome: number | null;
  /** Fecha de pago ISO `YYYY-MM-DD`. */
  paymentDate: string | null;
  employerRfc: string | null;
  employerName: string | null;
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

/** Regla aplicada para llegar al resultado, con valores comparados. */
export interface MatchTrace {
  rule: 'RFC_MATCH' | 'FALLBACK_3RULES' | 'NONE';
  rfcUsed?: string;
  dateDiff?: number;
  amountDiffPercent?: number;
  conceptKeyword?: string;
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