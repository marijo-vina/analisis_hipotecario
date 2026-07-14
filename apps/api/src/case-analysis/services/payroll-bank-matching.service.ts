// ---------------------------------------------------------------------------
// PayrollBankMatchingService (HU-10)
//
// Algoritmo de conciliacion individual recibo de nomina vs deposito bancario.
// Determinista (sin ML, sin fuzzy). Cada decision es trazable via MatchTrace.
//
// Flujo de 9 pasos (por recibo), segun proposal/spec payroll-bank-matching:
//   1. Pre-filtro de depositos dentro de ±7 dias de la fecha de pago.
//   2. RFC coincide (ambos presentes) → validar fecha (±2d) + monto (≤5%).
//      - monto ≤5% → MATCHED, method RFC
//      - monto >5% → DISCREPANCY (conserva candidato)
//      - sin deposito con fecha compatible → NOT_MATCHED (no fallback)
//   3. RFC presente en ambos pero difieren → RFC_INCOMPATIBLE (no fallback).
//   4. Falta RFC en al menos un lado → fallback 3 reglas OBLIGATORIAS:
//      monto ≤5%, fecha ±2d, concepto compatible (catalogo deterministico).
//   5. Multiples candidatos fallback → score (monto 40 + fecha 30 + concepto 30)
//      ordena; empate exacto → AMBIGUOUS.
//   6. Ningun candidato pasa las 3 reglas → NOT_MATCHED.
//   7. Bidireccionalidad 1:1: el primer recibo que reclama un deposito lo bloquea.
//   8. Cuenta mancomunada → forzar MANUAL_REVIEW (preserva el metodo aplicado).
//   9. Trazabilidad: cada resultado incluye el estado, metodo, candidato, score
//      y MatchTrace (regla aplicada, valores comparados).
// ---------------------------------------------------------------------------

import { Injectable } from '@nestjs/common';
import { normalizeText } from '../normalize';
import { CONCEPT_CATALOG_KEYWORDS } from '../types/bankarization.types';
import type {
  PayrollDeposit,
  PayrollMatchResult,
  PayrollReceipt,
  MatchTrace,
  PayrollReconciliationStatus,
  PayrollMatchMethod,
} from '../types/bankarization.types';

// ── Constantes de tolerancia (deterministicas) ──────────────────────────────
const PREFILTER_DAYS = 7; // ventana de pre-filtro ± dias
const DATE_TOLERANCE_DAYS = 2; // tolerancia de fecha RFC/fallback
const AMOUNT_TOLERANCE_PCT = 5; // tolerancia de monto %
const AMOUNT_TOLERANCE = AMOUNT_TOLERANCE_PCT / 100; // 0.05

// ── Pesos del score de fallback (monto 40 + fecha 30 + concepto 30) ──────────
const SCORE_WEIGHT_AMOUNT = 40;
const SCORE_WEIGHT_DATE = 30;
const SCORE_WEIGHT_CONCEPT = 30;

// Epsilon para considerar empate de score (AMBIGUOUS).
const SCORE_TIE_EPSILON = 0.01;

// ── Helpers puros (exportados para reutilizacion/testeo) ─────────────────────

/** Normaliza un RFC: trim + mayusculas, eliminando guiones/slashes/puntos. */
export function normalizeRfc(rfc: string | null | undefined): string | null {
  if (rfc == null) return null;
  const norm = normalizeText(rfc, 'identifier').toUpperCase().trim();
  return norm === '' ? null : norm;
}

/** Diferencia en dias absoluta entre dos fechas ISO YYYY-MM-DD (b - a). */
export function dateDiffDays(
  a: string | null,
  b: string | null,
): number | null {
  if (!a || !b) return null;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null;
  const MS_PER_DAY = 86400000;
  return Math.round(Math.abs(tb - ta) / MS_PER_DAY);
}

/**
 * Diferencia porcentual de monto respecto al ingreso neto del recibo.
 * Devuelve el porcentaje absoluto (0 si el ingreso es 0/invalido y el monto
 * tambien lo es; 100 si el ingreso es 0 pero el monto no).
 */
export function amountDiffPercent(
  netIncome: number | null,
  amount: number | null,
): number | null {
  if (netIncome == null || amount == null) return null;
  if (netIncome === 0) {
    return amount === 0 ? 0 : 100;
  }
  return (Math.abs(amount - netIncome) / netIncome) * 100;
}

/**
 * Normaliza un concepto bancario para matching contra el catalogo:
 * eliminar acentos, minusculas, compactar espacios, trim.
 *
 * El helper `normalizeText` opera en mayusculas; aqui revertimos a minusculas
 * porque el catalogo se guarda normalizado en minusculas.
 */
export function normalizeConcept(concept: string | null | undefined): string {
  if (concept == null) return '';
  return normalizeText(concept)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Devuelve la keyword del catalogo contenida en el concepto, o null. */
export function matchConceptKeyword(
  normalizedConcept: string,
): string | null {
  if (normalizedConcept === '') return null;
  for (const keyword of CONCEPT_CATALOG_KEYWORDS) {
    if (normalizedConcept.includes(keyword)) {
      return keyword;
    }
  }
  return null;
}

export {};

/**
 * Servicio de matching recibo→deposito. Sin estado: cada llamada a `match`
 * recibe los datos y devuelve resultados deterministas.
 */
@Injectable()
export class PayrollBankMatchingService {
  /**
   * Ejecuta el matching para todos los recibos contra los depositos disponibles.
   *
   * @param receipts   recibos de nomina a conciliar.
   * @param deposits   depositos bancarios candidatos.
   * @param isJointAccount true → fuerza MANUAL_REVIEW en todo resultado.
   * @returns un PayrollMatchResult por cada recibo (mismo orden e indices).
   */
  match(
    receipts: PayrollReceipt[],
    deposits: PayrollDeposit[],
    isJointAccount: boolean,
  ): PayrollMatchResult[] {
    // Depositos reclamados (bidireccionalidad 1:1).
    const usedDepositIds = new Set<string>();

    return receipts.map((r) => {
      const base = this.matchOne(r, deposits, usedDepositIds);
      if (isJointAccount) {
        // Cuenta mancomunada: forzar MANUAL_REVIEW preservando el metodo.
        return { ...base, status: 'MANUAL_REVIEW' as PayrollReconciliationStatus };
      }
      return base;
    });
  }

  // ── Matching individual de un recibo ───────────────────────────────────────
  private matchOne(
    receipt: PayrollReceipt,
    deposits: PayrollDeposit[],
    used: Set<string>,
  ): PayrollMatchResult {
    const receiptRfc = normalizeRfc(receipt.employerRfc);

    // Si el recibo no tiene ingreso ni fecha, no puede matchear.
    if (receipt.netIncome == null || receipt.paymentDate == null) {
      return this.notMatched(receipt.index);
    }

    // Pre-filtro: depositos disponibles dentro de ±PREFILTER_DAYS dias.
    const candidates = deposits.filter((d) => {
      if (used.has(d.id)) return false;
      const dd = dateDiffDays(receipt.paymentDate, d.date);
      return dd != null && dd <= PREFILTER_DAYS;
    });

    if (candidates.length === 0) {
      return this.notMatched(receipt.index);
    }

    // ── Paso 2: RFC coincide ──────────────────────────────────────────────
    if (receiptRfc != null) {
      const sameRfc = candidates.filter(
        (d) => normalizeRfc(d.detectedPayerRfc) === receiptRfc,
      );
      if (sameRfc.length > 0) {
        return this.matchByRfc(receipt, sameRfc, used, receiptRfc);
      }

      // ── Paso 3: RFC presente pero difiere en todos los depositos con RFC ──
      const diffRfc = candidates.filter(
        (d) => normalizeRfc(d.detectedPayerRfc) != null,
      );
      if (diffRfc.length > 0) {
        // RFC_INCOMPATIBLE: enlazamos el candidato mas proximo (mejor fecha)
        // para que PagadoraDetectionService lo evalúe. No se hace fallback.
        return this.rfcIncompatible(receipt, diffRfc, used, receiptRfc);
      }

      // ── Paso 4: receipt tiene RFC pero ningun deposito tiene RFC ──────────
      // "Falta RFC en el deposito" → fallback.
      return this.matchByFallback(receipt, candidates, used);
    }

    // receipt sin RFC → fallback obligatorio.
    return this.matchByFallback(receipt, candidates, used);
  }

  // ── Camino RFC (triangular: RFC + fecha ±2d + monto ≤5%) ───────────────────
  private matchByRfc(
    receipt: PayrollReceipt,
    sameRfcDeposits: PayrollDeposit[],
    used: Set<string>,
    receiptRfc: string,
  ): PayrollMatchResult {
    // Fecha-compatible (±2d), ordenados por proximidad de monto (menor diff).
    const compatible = sameRfcDeposits
      .map((d) => ({
        d,
        dd: dateDiffDays(receipt.paymentDate, d.date) ?? Infinity,
        ad: amountDiffPercent(receipt.netIncome, d.amount) ?? Infinity,
      }))
      .filter((c) => c.dd <= DATE_TOLERANCE_DAYS)
      .sort((a, b) => a.ad - b.ad);

    if (compatible.length === 0) {
      // RFC coincide pero ningun deposito con fecha compatible → NOT_MATCHED.
      return this.notMatched(receipt.index, {
        rule: 'RFC_MATCH',
        rfcUsed: receiptRfc,
      });
    }

    const best = compatible[0];
    used.add(best.d.id);

    const status: PayrollReconciliationStatus =
      best.ad <= AMOUNT_TOLERANCE_PCT ? 'MATCHED' : 'DISCREPANCY';

    return {
      receiptIndex: receipt.index,
      status,
      method: 'RFC',
      candidateDepositId: best.d.id,
      candidateAmount: best.d.amount,
      candidateDate: best.d.date,
      candidateConcept: best.d.originalConcept,
      score: null,
      scotiabankExcluded: false,
      traceability: {
        rule: 'RFC_MATCH',
        rfcUsed: receiptRfc,
        dateDiff: best.dd,
        amountDiffPercent: round2(best.ad),
      },
    };
  }

  // ── Camino RFC incompatible (enlaza el candidato para pagadora) ─────────────
  private rfcIncompatible(
    receipt: PayrollReceipt,
    diffRfcDeposits: PayrollDeposit[],
    used: Set<string>,
    receiptRfc: string,
  ): PayrollMatchResult {
    // Tomamos el dif-RFC mas proximo por fecha para que la pagadora lo evalúe.
    const sorted = [...diffRfcDeposits].sort(
      (a, b) =>
        (dateDiffDays(receipt.paymentDate, a.date) ?? Infinity) -
        (dateDiffDays(receipt.paymentDate, b.date) ?? Infinity),
    );
    const best = sorted[0];
    used.add(best.id);

    return {
      receiptIndex: receipt.index,
      status: 'RFC_INCOMPATIBLE',
      method: 'NONE',
      candidateDepositId: best.id,
      candidateAmount: best.amount,
      candidateDate: best.date,
      candidateConcept: best.originalConcept,
      score: null,
      scotiabankExcluded: false,
      traceability: {
        rule: 'NONE',
        rfcUsed: receiptRfc,
      },
    };
  }

  // ── Camino fallback (3 reglas obligatorias + score) ────────────────────────
  private matchByFallback(
    receipt: PayrollReceipt,
    candidates: PayrollDeposit[],
    used: Set<string>,
  ): PayrollMatchResult {
    // Cada candidato debe pasar las 3 reglas obligatorias.
    const scored = candidates
      .map((d) => {
        const dd = dateDiffDays(receipt.paymentDate, d.date) ?? Infinity;
        const ad =
          amountDiffPercent(receipt.netIncome, d.amount) ?? Infinity;
        const concept = normalizeConcept(d.originalConcept);
        const keyword = matchConceptKeyword(concept);
        return { d, dd, ad, keyword };
      })
      .filter(
        (c) =>
          c.dd <= DATE_TOLERANCE_DAYS &&
          c.ad <= AMOUNT_TOLERANCE_PCT &&
          c.keyword != null,
      )
      .map((c) => ({
        ...c,
        score: this.computeScore(c.ad, c.dd, c.keyword != null),
      }))
      .sort((a, b) => b.score - a.score); // mayor score primero

    if (scored.length === 0) {
      return this.notMatched(receipt.index, { rule: 'NONE' });
    }

    // Empate exacto (top 2 con mismo score redondeado) → AMBIGUOUS.
    const top = scored[0];
    const runner = scored[1];
    const isAmbiguous =
      runner != null &&
      Math.abs(round2(runner.score) - round2(top.score)) <= SCORE_TIE_EPSILON;

    used.add(top.d.id);

    return {
      receiptIndex: receipt.index,
      status: isAmbiguous ? 'AMBIGUOUS' : 'MATCHED',
      method: 'FALLBACK',
      candidateDepositId: top.d.id,
      candidateAmount: top.d.amount,
      candidateDate: top.d.date,
      candidateConcept: top.d.originalConcept,
      score: round2(top.score),
      scotiabankExcluded: false,
      traceability: {
        rule: 'FALLBACK_3RULES',
        dateDiff: top.dd,
        amountDiffPercent: round2(top.ad),
        conceptKeyword: top.keyword ?? undefined,
      },
    };
  }

  // ── Score de fallback (monto 40 + fecha 30 + concepto 30) ──────────────────
  /**
   * monto: escalado 0..40 segun cercania (1 - diff/5%).
   * fecha: binario 0/30 (pasa ±2d = 30; siempre pasa por ser obligatoria).
   * concepto: binario 0/30 (matchea keyword = 30; siempre pasa por ser obligatoria).
   *
   * Como las 3 reglas son obligatorias, fecha y concepto siempre contribuyen 30
   * cada una; el score ordena principalmente por cercania de monto. Esto es
   * coherente con la "propuesta binaria" del open question del diseno.
   */
  private computeScore(
    amountDiffPct: number,
    _dateDiff: number,
    conceptMatch: boolean,
  ): number {
    const amountScore = Math.max(
      0,
      SCORE_WEIGHT_AMOUNT * (1 - amountDiffPct / AMOUNT_TOLERANCE_PCT),
    );
    const dateScore = SCORE_WEIGHT_DATE; // binario: pasa ±2d
    const conceptScore = conceptMatch ? SCORE_WEIGHT_CONCEPT : 0;
    return amountScore + dateScore + conceptScore;
  }

  // ── Constructor de resultado NOT_MATCHED ────────────────────────────────────
  private notMatched(
    receiptIndex: number,
    trace: MatchTrace = { rule: 'NONE' },
  ): PayrollMatchResult {
    return {
      receiptIndex,
      status: 'NOT_MATCHED',
      method: 'NONE' as PayrollMatchMethod,
      candidateDepositId: null,
      candidateAmount: null,
      candidateDate: null,
      candidateConcept: null,
      score: null,
      scotiabankExcluded: false,
      traceability: trace,
    };
  }
}

// ── Util local ──────────────────────────────────────────────────────────────
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}