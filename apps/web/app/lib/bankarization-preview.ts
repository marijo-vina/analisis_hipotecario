// ---------------------------------------------------------------------------
// Vista previa de conciliacion de bancarizacion (HU-10) — lado web.
//
// Calcula por recibo de nomina el mejor deposito conciliado usando el mismo
// algoritmo determinista del backend (RFC-first, fallback 3 reglas + score,
// bidireccionalidad 1:1, deteccion de pagadora y regla Scotiabank).
//
// NOTA: Esta vista es PRELIMINAR (mismo caracter que la conciliacion Sprint 2).
// La fuente de verdad auditable es la regla `bankarization-validation` del
// backend (persistida en AnalysisRun). Esta funcion replica la logica para
// ofrecer una vista en vivo en la UI sin esperar la ejecucion del analisis.
//
// Limitaciones de la vista previa (vs backend):
//  - No aplica MANUAL_REVIEW por cuenta mancomunada (no se recibe isJointAccount).
//  - RFC nulo en el recibo se representa como "—" (parsePayroll).
// ---------------------------------------------------------------------------

/**
 * @fileoverview Replica PRELIMINAR del algoritmo de bancarizacion del backend.
 *
 * ADVERTENCIA DE DUPLICACION: Este archivo replica funciones de normalizacion
 * y matching que ya existen en el backend (`PayrollBankMatchingService` y
 * `PagadoraDetectionService`). LA FUENTE DE VERDAD es el backend; este codigo
 * existe unicamente para ofrecer una vista previa en la UI sin esperar la
 * ejecucion del analisis persistido.
 *
 * Si modificas la logica de matching en el backend, DEBES sincronizar los
 * cambios aqui tambien. Las funciones duplicadas estan marcadas con comentarios
 * que indican su equivalente en el backend:
 *
 *   - normalizeRfc           ↔ PayrollBankMatchingService.normalizeRfc
 *   - dateDiffDays           ↔ PayrollBankMatchingService.dateDiffDays
 *   - amountDiffPct          ↔ PayrollBankMatchingService.amountDiffPercent
 *   - normalizeConceptLower  ↔ PayrollBankMatchingService.normalizeConcept
 *   - normalizeConceptUpper  ↔ PagadoraDetectionService.normalizeConceptUpper
 *   - CONCEPT_KEYWORDS       ↔ bankarization.types.CONCEPT_CATALOG_KEYWORDS
 *
 * Consideracion futura: extraer estas funciones a un modulo compartido entre
 * frontend y backend para eliminar la duplicacion (ver SUGGESTION en verify-report).
 */

import type {
  ParsedBankStatementDeposit,
  ParsedPayrollReceipt,
} from "@/app/lib/extraction";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type PreviewStatus =
  | "MATCHED"
  | "NOT_MATCHED"
  | "DISCREPANCY"
  | "RFC_INCOMPATIBLE"
  | "AMBIGUOUS"
  | "PROVIDER_CANDIDATE"
  | "PROVIDER_MIRROR_CONFIRMED"
  | "MANUAL_REVIEW";

export type PreviewMethod = "RFC" | "FALLBACK" | "PROVIDER_MIRROR" | "NONE";

export interface PreviewReceiptResult {
  receiptOriginalName: string;
  receiptIndex: number;
  period: string | null;
  netIncome: number | null;
  status: PreviewStatus;
  method: PreviewMethod;
  /** Mejor deposito candidato vinculado (null si no hay). */
  candidate: {
    amount: number | null;
    date: string | null;
    concept: string | null;
    employerRfc: string | null;
    employerName: string | null;
  } | null;
  amountDiffPct: number | null;
  score: number | null;
  scotiabankExcluded: boolean;
  /** Fecha usada para el matching (resuelta con trazabilidad). */
  usedPaymentDate: string | null;
  /** Origen de la fecha usada: EXPLICIT | PERIOD_END | INFERRED_QUINCENA | MANUAL_OVERRIDE. */
  paymentDateSource: string | null;
  /** true si la fecha fue inferida (requiere confirmacion del asesor). */
  paymentDateEstimated: boolean;
  alerts: { code: string; message: string }[];
  /** Keyword del catálogo que activó el match de concepto (solo en FALLBACK). */
  conceptKeyword: string | null;
}

// ── Constantes (espejo del backend) ──────────────────────────────────────────
// @duplicate PayrollBankMatchingService — estos valores deben coincidir con las
// constantes del backend. Si cambias una tolerancia o peso aca, cambiala alla.

const PREFILTER_DAYS = 7;
const DATE_TOLERANCE_DAYS = 3;
const AMOUNT_TOLERANCE_PCT = 5;
const MIN_RECURRENCE = 2;

const SCORE_WEIGHT_AMOUNT = 40;
const SCORE_WEIGHT_DATE = 30;
const SCORE_WEIGHT_CONCEPT = 30;
const SCORE_TIE_EPSILON = 0.01;

const CONCEPT_KEYWORDS = [
  "nomina",
  "sueldo",
  "pago de haberes",
  "haberes",
  "pago empleado",
  "spei empleador",
] as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Convierte DD-MM-YYYY (salida de formatDateDisplay) → ISO YYYY-MM-DD. */
function reverseDate(formatted: string | null): string | null {
  if (!formatted) return null;
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(formatted.trim());
  if (!m) {
    // Quizas ya viene en ISO u otro formato; intentar parseo directo.
    const t = Date.parse(formatted);
    return Number.isNaN(t) ? null : formatted;
  }
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/**
 * Diferencia en dias entre dos fechas ISO.
 * @duplicate PayrollBankMatchingService.dateDiffDays (backend) — misma logica.
 */
function dateDiffDays(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null;
  return Math.round(Math.abs(tb - ta) / 86400000);
}

/**
 * Porcentaje de diferencia entre ingreso neto y monto del deposito.
 * @duplicate PayrollBankMatchingService.amountDiffPercent (backend) — misma logica.
 */
function amountDiffPct(
  netIncome: number | null,
  amount: number | null,
): number | null {
  if (netIncome == null || amount == null) return null;
  if (netIncome === 0) return amount === 0 ? 0 : 100;
  return (Math.abs(amount - netIncome) / netIncome) * 100;
}

/**
 * Normaliza un RFC: uppercase, quita acentos, guiones y espacios.
 * @duplicate PayrollBankMatchingService.normalizeRfc (backend) — misma logica.
 */
function normalizeRfc(rfc: string | null | undefined): string | null {
  if (rfc == null || rfc === "—") return null;
  const norm = rfc
    .toUpperCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-/._]/g, "");
  return norm === "" ? null : norm;
}

/**
 * Normaliza concepto a minusculas (NFD + strip acentos + colapsar espacios).
 * @duplicate PayrollBankMatchingService.normalizeConcept (backend) — misma logica.
 */
function normalizeConceptLower(concept: string | null | undefined): string {
  if (!concept) return "";
  return concept
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normaliza concepto a mayusculas (NFD + strip acentos + colapsar espacios).
 * @duplicate PagadoraDetectionService.normalizeConceptUpper (backend) — misma logica.
 */
function normalizeConceptUpper(concept: string | null | undefined): string {
  if (!concept) return "";
  return concept
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchKeyword(concept: string): string | null {
  for (const kw of CONCEPT_KEYWORDS) {
    if (concept.includes(kw)) return kw;
  }
  return null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Algoritmo principal ──────────────────────────────────────────────────────

type PayDateSource = "EXPLICIT" | "PERIOD_END" | "INFERRED_QUINCENA" | "MANUAL_OVERRIDE";

interface ResolvedPayDate {
  resolvedPaymentDate: string | null;
  source: PayDateSource;
  estimated: boolean;
  originalPeriodLabel: string | null;
}

/**
 * Resuelve la fecha de pago con trazabilidad de origen.
 * @duplicate BankarizationValidationRule.resolvePayrollPaymentDate (backend).
 */
function resolvePaymentDate(
  explicitDate: string | null,
  periodEndDate: string | null,
  periodLabel: string | null,
): ResolvedPayDate {
  if (explicitDate) {
    return { resolvedPaymentDate: explicitDate, source: "EXPLICIT", estimated: false, originalPeriodLabel: periodLabel };
  }
  if (periodEndDate) {
    return { resolvedPaymentDate: periodEndDate, source: "PERIOD_END", estimated: false, originalPeriodLabel: periodLabel };
  }
  if (periodLabel) {
    const inferred = inferDateFromLabel(periodLabel);
    if (inferred) {
      return { resolvedPaymentDate: inferred, source: "INFERRED_QUINCENA", estimated: true, originalPeriodLabel: periodLabel };
    }
  }
  return { resolvedPaymentDate: null, source: "INFERRED_QUINCENA", estimated: true, originalPeriodLabel: periodLabel };
}

function inferDateFromLabel(label: string): string | null {
  const n = label.toUpperCase();
  const monthYearPatterns = [
    /(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\s*(\d{4})/i,
    /(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)[-.\s]*(\d{4})/i,
    /(\d{1,2})[-.\/](\d{4})/,
    /(\d{4})[-.\/](\d{1,2})/,
  ];
  let month: number | null = null;
  let year: number | null = null;
  for (const p of monthYearPatterns) {
    const m = p.exec(n);
    if (m) {
      const g1 = m[1].toUpperCase();
      const g2 = m[2];
      const names: Record<string, number> = {
        ENERO:1,FEBRERO:2,MARZO:3,ABRIL:4,MAYO:5,JUNIO:6,
        JULIO:7,AGOSTO:8,SEPTIEMBRE:9,OCTUBRE:10,NOVIEMBRE:11,DICIEMBRE:12,
        ENE:1,FEB:2,MAR:3,ABR:4,MAY:5,JUN:6,JUL:7,AGO:8,SEP:9,OCT:10,NOV:11,DIC:12,
      };
      const pm = names[g1];
      if (pm) { month = pm; year = parseInt(g2,10); }
      else {
        const a = parseInt(g1,10), b = parseInt(g2,10);
        if (a>=1 && a<=12 && b>=2000) { month=a; year=b; }
        else if (b>=1 && b<=12 && a>=2000) { month=b; year=a; }
      }
      break;
    }
  }
  if (!month || !year) return null;
  const is1 = /1[AaRrQq]|1ra|1er|primera|1a\s|1er\s|\.1\./i.test(n);
  const is2 = /2[AaRrQq]|2da|2do|segunda|2a\s|2do\s|\.2\./i.test(n);
  const pad = (x: number) => String(x).padStart(2, "0");
  if (is1 && !is2) return `${year}-${pad(month)}-15`;
  if (is2 && !is1) {
    const last = new Date(year, month, 0).getDate();
    return `${year}-${pad(month)}-${pad(last)}`;
  }
  return null;
}

interface NormalizedReceipt {
  index: number;
  netIncome: number | null;
  paymentDate: string | null;
  employerRfc: string | null;
  employerName: string | null;
  originalName: string;
  period: string | null;
  resolvedPaymentDate: {
    resolvedPaymentDate: string | null;
    source: string;
    estimated: boolean;
    originalPeriodLabel: string | null;
  };
}

interface NormalizedDeposit {
  id: string;
  date: string | null;
  amount: number | null;
  concept: string | null;
  payerRfc: string | null;
  payerName: string | null;
}

/**
 * Reconcilia cada recibo contra los depositos disponibles. Determinista y
 * bidireccional (1:1): el primer recibo que reclama un deposito lo bloquea.
 */
export function reconcilePreview(
  receipts: ParsedPayrollReceipt[],
  deposits: ParsedBankStatementDeposit[],
): PreviewReceiptResult[] {
  const normReceipts: NormalizedReceipt[] = receipts.map((r, i) => {
    const explicitDate = reverseDate(r.fechaPago);
    const periodEnd = null; // no disponible en el frontend parseado
    const periodLabel = r.periodo ?? r.originalName ?? null;
    const resolved = resolvePaymentDate(explicitDate, periodEnd, periodLabel);

    return {
      index: i,
      netIncome: r.ingresoNeto,
      paymentDate: resolved.resolvedPaymentDate,
      employerRfc: normalizeRfc(r.empleador?.rfc ?? null),
      employerName: r.empleador?.nombre ?? null,
      originalName: r.originalName,
      period: r.periodo,
      resolvedPaymentDate: resolved,
    };
  });

  const normDeposits: NormalizedDeposit[] = deposits.map((d, i) => ({
    id: `dep-${i}`,
    date: d.date,
    amount: d.amount,
    concept: d.originalConcept,
    payerRfc: normalizeRfc(d.employerRfc),
    payerName: d.employerName,
  }));

  const used = new Set<string>();
  const raw = normReceipts.map((r) => matchOne(r, normDeposits, used));

  // Resolucion de pagadora sobre los RFC_INCOMPATIBLE.
  return raw.map((res, i) => resolvePagadora(res, normReceipts[i], normDeposits));
}

// ── Matching individual de un recibo ────────────────────────────────────────

interface RawResult {
  status: PreviewStatus;
  method: PreviewMethod;
  candidate: NormalizedDeposit | null;
  amountDiffPctVal: number | null;
  dateDiffVal: number | null;
  scoreVal: number | null;
  conceptKeyword: string | null;
}

const EMPTY: RawResult = {
  status: "NOT_MATCHED",
  method: "NONE",
  candidate: null,
  amountDiffPctVal: null,
  dateDiffVal: null,
  scoreVal: null,
  conceptKeyword: null,
};

function matchOne(
  receipt: NormalizedReceipt,
  deposits: NormalizedDeposit[],
  used: Set<string>,
): RawResult {
  if (!receipt.netIncome || !receipt.paymentDate) {
    return EMPTY;
  }

  const candidates = deposits.filter((d) => {
    if (used.has(d.id)) return false;
    const dd = dateDiffDays(receipt.paymentDate, d.date);
    return dd != null && dd <= PREFILTER_DAYS;
  });

  if (candidates.length === 0) return EMPTY;

  const receiptRfc = receipt.employerRfc;

  if (receiptRfc) {
    const sameRfc = candidates.filter((d) => d.payerRfc === receiptRfc);
    if (sameRfc.length > 0) {
      return matchByRfc(receipt, sameRfc, used);
    }

    // Separar candidatos con RFC diferente vs sin RFC.
    const diffRfc = candidates.filter((d) => d.payerRfc != null);
    const noRfc = candidates.filter((d) => d.payerRfc == null);

    // Intentar fallback con depositos SIN RFC primero (comun: el edo de cuenta no muestra RFC).
    if (noRfc.length > 0) {
      return matchByFallback(receipt, noRfc, used);
    }

    // Todos los depositos tienen RFC diferente → RFC_INCOMPATIBLE.
    if (diffRfc.length > 0) {
      const sorted = [...diffRfc].sort(
        (a, b) =>
          (dateDiffDays(receipt.paymentDate, a.date) ?? Infinity) -
          (dateDiffDays(receipt.paymentDate, b.date) ?? Infinity),
      );
      const best = sorted[0];
      used.add(best.id);
      return {
        status: "RFC_INCOMPATIBLE",
        method: "NONE",
        candidate: best,
        amountDiffPctVal: amountDiffPct(receipt.netIncome, best.amount),
        dateDiffVal: dateDiffDays(receipt.paymentDate, best.date),
        scoreVal: null,
        conceptKeyword: null,
      };
    }
    // receipt con RFC pero depositos sin RFC → fallback.
    return matchByFallback(receipt, candidates, used);
  }

  return matchByFallback(receipt, candidates, used);
}

function matchByRfc(
  receipt: NormalizedReceipt,
  sameRfc: NormalizedDeposit[],
  used: Set<string>,
): RawResult {
  const compatible = sameRfc
    .map((d) => ({
      d,
      dd: dateDiffDays(receipt.paymentDate, d.date) ?? Infinity,
      ad: amountDiffPct(receipt.netIncome, d.amount) ?? Infinity,
    }))
    .filter((c) => c.dd <= DATE_TOLERANCE_DAYS)
    .sort((a, b) => a.ad - b.ad);

  if (compatible.length === 0) return EMPTY;

  const best = compatible[0];
  used.add(best.d.id);
  const status: PreviewStatus =
    best.ad <= AMOUNT_TOLERANCE_PCT ? "MATCHED" : "DISCREPANCY";
  return {
    status,
    method: "RFC",
    candidate: best.d,
    amountDiffPctVal: round2(best.ad),
    dateDiffVal: best.dd,
    scoreVal: null,
    conceptKeyword: null,
  };
}

function matchByFallback(
  receipt: NormalizedReceipt,
  candidates: NormalizedDeposit[],
  used: Set<string>,
): RawResult {
  const scored = candidates
    .map((d) => {
      const dd = dateDiffDays(receipt.paymentDate, d.date) ?? Infinity;
      const ad = amountDiffPct(receipt.netIncome, d.amount) ?? Infinity;
      const concept = normalizeConceptLower(d.concept);
      const kw = matchKeyword(concept);
      return { d, dd, ad, kw };
    })
    .filter(
      (c) =>
        c.dd <= DATE_TOLERANCE_DAYS &&
        c.ad <= AMOUNT_TOLERANCE_PCT &&
        c.kw != null,
    )
    .map((c) => ({
      ...c,
      score:
        Math.max(0, SCORE_WEIGHT_AMOUNT * (1 - c.ad / AMOUNT_TOLERANCE_PCT)) +
        SCORE_WEIGHT_DATE +
        (c.kw != null ? SCORE_WEIGHT_CONCEPT : 0),
    }))
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return EMPTY;

  const top = scored[0];
  const runner = scored[1];
  const ambiguous =
    runner != null &&
    Math.abs(round2(runner.score) - round2(top.score)) <= SCORE_TIE_EPSILON;

  used.add(top.d.id);
  return {
    status: ambiguous ? "AMBIGUOUS" : "MATCHED",
    method: "FALLBACK",
    candidate: top.d,
    amountDiffPctVal: round2(top.ad),
    dateDiffVal: top.dd,
    scoreVal: round2(top.score),
    conceptKeyword: top.kw,
  };
}

// ── Resolucion de pagadora + regla Scotiabank ────────────────────────────────

function resolvePagadora(
  res: RawResult,
  receipt: NormalizedReceipt,
  deposits: NormalizedDeposit[],
): PreviewReceiptResult {
  let status: PreviewStatus = res.status;

  if (res.status === "RFC_INCOMPATIBLE" && receipt.employerRfc) {
    // Provider candidate: RFC distinto recurrente (≥2 depositos).
    const distinctCounts = new Map<string, number>();
    for (const d of deposits) {
      if (d.payerRfc && d.payerRfc !== receipt.employerRfc) {
        distinctCounts.set(d.payerRfc, (distinctCounts.get(d.payerRfc) ?? 0) + 1);
      }
    }
    let providerRfc: string | null = null;
    let max = 0;
    for (const [rfc, count] of distinctCounts) {
      if (count > max) {
        max = count;
        providerRfc = rfc;
      }
    }

    if (providerRfc && max >= MIN_RECURRENCE) {
      const employerFound = deposits.some(
        (d) =>
          d.payerRfc === receipt.employerRfc &&
          (dateDiffDays(receipt.paymentDate, d.date) ?? Infinity) <=
            DATE_TOLERANCE_DAYS &&
          (amountDiffPct(receipt.netIncome, d.amount) ?? Infinity) <=
            AMOUNT_TOLERANCE_PCT,
      );
      const providerDeposits = deposits.filter(
        (d) => d.payerRfc === providerRfc,
      );
      const providerFound = providerDeposits.some(
        (d) =>
          (dateDiffDays(receipt.paymentDate, d.date) ?? Infinity) <=
            DATE_TOLERANCE_DAYS &&
          (amountDiffPct(receipt.netIncome, d.amount) ?? Infinity) <=
            AMOUNT_TOLERANCE_PCT,
      );

      if (employerFound && providerFound) {
        status = "PROVIDER_MIRROR_CONFIRMED";
      } else {
        status = "PROVIDER_CANDIDATE";
      }
    }
  }

  // Regla Scotiabank: pagadora detectada (RFC distinto) + concepto sin "NOMINA".
  const scotiabankExcluded =
    (status === "PROVIDER_CANDIDATE" ||
      status === "PROVIDER_MIRROR_CONFIRMED") &&
    res.candidate != null &&
    res.candidate.payerRfc != null &&
    res.candidate.payerRfc !== receipt.employerRfc &&
    !normalizeConceptUpper(res.candidate.concept).includes("NOMINA");

  return {
    receiptOriginalName: receipt.originalName,
    receiptIndex: receipt.index,
    period: receipt.period,
    netIncome: receipt.netIncome,
    status,
    method:
      status === "PROVIDER_MIRROR_CONFIRMED" ? "PROVIDER_MIRROR" : res.method,
    candidate: res.candidate
      ? {
          amount: res.candidate.amount,
          date: res.candidate.date,
          concept: res.candidate.concept,
          employerRfc: res.candidate.payerRfc,
          employerName: res.candidate.payerName,
        }
      : null,
    amountDiffPct: res.amountDiffPctVal,
    score: res.scoreVal,
    scotiabankExcluded,
    usedPaymentDate: receipt.resolvedPaymentDate.resolvedPaymentDate,
    paymentDateSource: receipt.resolvedPaymentDate.source,
    paymentDateEstimated: receipt.resolvedPaymentDate.estimated,
    alerts: buildAlerts(status, scotiabankExcluded, res.amountDiffPctVal),
    conceptKeyword: res.conceptKeyword ?? null,
  };
}

function buildAlerts(
  status: PreviewStatus,
  scotiabankExcluded: boolean,
  amountDiffPctVal: number | null,
): { code: string; message: string }[] {
  const out: { code: string; message: string }[] = [];
  if (status === "DISCREPANCY") {
    out.push({
      code: "DISCREPANCY_5PCT",
      message: `Monto difiere ${amountDiffPctVal ?? "?"}% (tolerancia 5%)`,
    });
  }
  if (status === "RFC_INCOMPATIBLE") {
    out.push({
      code: "BANK_PAYROLL_MISMATCH",
      message: "RFC incompatible sin resolución",
    });
  }
  if (status === "PROVIDER_MIRROR_CONFIRMED") {
    out.push({
      code: "PAYROLL_PROVIDER_MIRROR",
      message: "Doble espejo confirmado (empleador + pagadora)",
    });
  }
  if (scotiabankExcluded) {
    out.push({
      code: "PAYROLL_PROVIDER_SCOTIABANK",
      message: "No aplicable para Scotiabank",
    });
  }
  return out;
}

// ── Etiquetas para la UI ────────────────────────────────────────────────────

export const STATUS_LABELS: Record<PreviewStatus, string> = {
  MATCHED: "Conciliado",
  NOT_MATCHED: "Sin conciliar",
  DISCREPANCY: "Discrepancia",
  RFC_INCOMPATIBLE: "RFC incompatible",
  AMBIGUOUS: "Ambiguo",
  PROVIDER_CANDIDATE: "Pagadora (candidata)",
  PROVIDER_MIRROR_CONFIRMED: "Doble espejo",
  MANUAL_REVIEW: "Revisión manual",
};

export const METHOD_LABELS: Record<PreviewMethod, string> = {
  RFC: "RFC",
  FALLBACK: "Fallback (3 reglas)",
  PROVIDER_MIRROR: "Espejo",
  NONE: "—",
};