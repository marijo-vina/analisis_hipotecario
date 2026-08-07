// ---------------------------------------------------------------------------
// BankarizationValidationRule (HU-10)
//
// Regla de analisis que valida la bancarizacion: concilia cada recibo de
// nomina con un deposito bancario. Orquesta PayrollBankMatchingService
// (matching determinista RFC-first + fallback) y PagadoraDetectionService
// (pagadoras, doble espejo, regla Scotiabank), y produce un RuleResult con
// outcome (PASS/PARTIAL/FAIL) y las alertas del catalogo de bancarizacion.
//
// La alerta BANK_JOINT_ACCOUNT se emite aqui cuando isJointAccount = true y
// hay resultados en MANUAL_REVIEW (la unica causa de MANUAL_REVIEW es la cuenta
// mancomunada, forzada por PayrollBankMatchingService).
// ---------------------------------------------------------------------------

import { Injectable, Logger } from '@nestjs/common';
import type { AnalysisOutcome } from '../../generated/prisma/client';
import type {
  AnalysisRule,
  RuleAlert,
  RuleResult,
  Severity,
} from '../analysis-rule.interface';
import type { PrismaDocumentLike } from './identity-match.rule';
import { PayrollBankMatchingService } from '../services/payroll-bank-matching.service';
import { PagadoraDetectionService } from '../services/pagadora-detection.service';
import type {
  PayrollDeposit,
  PayrollMatchResult,
  PayrollPaymentDateSource,
  PayrollReceipt,
  PayrollReconciliationStatus,
  ResolvedPayrollDate,
} from '../types/bankarization.types';

// ── Resolvedor de fecha de pago ────────────────────────────────────────────────

/**
 * Resuelve la fecha de pago de un recibo de nomina con trazabilidad de origen.
 *
 * Prioridad:
 *   1. paymentDate explícita extraída → source = EXPLICIT
 *   2. periodEndDate → source = PERIOD_END
 *   3. Inferencia desde periodLabel extraído por Gemini (ej. "1A Quincena Mayo 2025"):
 *      - "1A", "1ra", "1Q", "primera", "1a quincena" → día 15 del mes
 *      - "2A", "2da", "2Q", "segunda", "2a quincena" → último día del mes
 *      source = INFERRED_QUINCENA
 *
 * NUNCA usa la fecha de timbrado/certificación SAT.
 */
export function resolvePayrollPaymentDate(
  paymentDate: string | null,
  periodEndDate: string | null,
  periodLabel: string | null,
): ResolvedPayrollDate {
  const label = periodLabel ?? null;

  // 1. paymentDate explícita
  if (paymentDate) {
    return {
      resolvedPaymentDate: paymentDate,
      source: 'EXPLICIT',
      estimated: false,
      originalPeriodLabel: label,
    };
  }

  // 2. periodEndDate
  if (periodEndDate) {
    return {
      resolvedPaymentDate: periodEndDate,
      source: 'PERIOD_END',
      estimated: false,
      originalPeriodLabel: label,
    };
  }

  // 3. Inferencia desde periodLabel extraído
  if (label) {
    const inferred = inferDateFromLabel(label);
    if (inferred) {
      return {
        resolvedPaymentDate: inferred,
        source: 'INFERRED_QUINCENA',
        estimated: true,
        originalPeriodLabel: label,
      };
    }
  }

  return {
    resolvedPaymentDate: null,
    source: 'INFERRED_QUINCENA' as PayrollPaymentDateSource,
    estimated: true,
    originalPeriodLabel: label,
  };
}

/** Infiere fecha desde patrones de quincena en el nombre del archivo. */
function inferDateFromLabel(label: string): string | null {
  const n = label.toUpperCase();

  // Extraer mes y año del patron: "MAYO 2025", "MAY-2025", "05-2025", "2025-05"
  const monthYearPatterns = [
    /(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\s*(\d{4})/i,
    /(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)[-.\s]*(\d{4})/i,
    /(\d{1,2})[-.\/](\d{4})/,
    /(\d{4})[-.\/](\d{1,2})/,
  ];

  let month: number | null = null;
  let year: number | null = null;

  for (const pattern of monthYearPatterns) {
    const m = pattern.exec(n);
    if (m) {
      // Detectar formato: mes textual o numerico
      const g1 = m[1].toUpperCase();
      const g2 = m[2];

      const monthNames: Record<string, number> = {
        ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6,
        JULIO: 7, AGOSTO: 8, SEPTIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12,
        ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6,
        JUL: 7, AGO: 8, SEP: 9, OCT: 10, NOV: 11, DIC: 12,
      };

      const parsedMonth = monthNames[g1];
      if (parsedMonth) {
        month = parsedMonth;
        year = parseInt(g2, 10);
      } else {
        // Numerico: g1 puede ser mes o año, g2 lo contrario
        const a = parseInt(g1, 10);
        const b = parseInt(g2, 10);
        if (a >= 1 && a <= 12 && b >= 2000) { month = a; year = b; }
        else if (b >= 1 && b <= 12 && a >= 2000) { month = b; year = a; }
      }
      break;
    }
  }

  if (!month || !year) return null;

  // Detectar quincena: 1A, 1ra, 1Q, primera → dia 15
  //                   2A, 2da, 2Q, segunda → ultimo dia del mes
  const isFirst = /1[AaRrQq]|1ra|1er|primera|1a\s|1er\s|\.1\./i.test(n);
  const isSecond = /2[AaRrQq]|2da|2do|segunda|2a\s|2do\s|\.2\./i.test(n);

  if (isFirst && !isSecond) {
    const d = pad(15);
    return `${year}-${pad(month)}-${d}`;
  }
  if (isSecond && !isFirst) {
    const lastDay = new Date(year, month, 0).getDate(); // month is 1-based, Date uses 0-indexed
    return `${year}-${pad(month)}-${pad(lastDay)}`;
  }

  return null;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

/**
 * Regla de bancarizacion. Sin estado: cada ejecucion produce un resultado
 * determinista a partir de los documentos del caso.
 */
@Injectable()
export class BankarizationValidationRule implements AnalysisRule {
  readonly ruleId = 'bankarization-validation';
  private readonly logger = new Logger(BankarizationValidationRule.name);

  constructor(
    private readonly matching: PayrollBankMatchingService,
    private readonly pagadora: PagadoraDetectionService,
  ) {}

  async execute(
    client: Record<string, unknown>,
    documents: Record<string, unknown>[],
  ): Promise<RuleResult> {
    const docs = documents as unknown as PrismaDocumentLike[];

    // 1. Extraer recibos y depositos de los documentos.
    const { receipts, deposits, isJointAccount } = this.extract(docs);

    // 2. Matching determinista recibo→deposito.
    const matchResults = this.matching.match(receipts, deposits, isJointAccount);

    // 3. Evaluacion de pagadoras sobre los resultados.
    const evaluations = this.pagadora.evaluate(matchResults, receipts, deposits);

    // 4. Fusionar evaluaciones: degradar/mejorar status y propagar flags.
    const merged = this.merge(matchResults, evaluations);

    // 5. Mapear a alertas + outcome. Los resultados por recibo van en los alerts,
    //    no en detail.fields (que es para la tabla de identidad cross-document).
    //    La UI de conciliación (estados-conciliacion.tsx) muestra los resultados
    //    por recibo consumiendo los documentos extraídos, no los FieldComparison.
    const alerts = this.buildAlerts(merged, isJointAccount);
    const outcome = this.computeOutcome(merged);
    const severity = this.computeSeverity(outcome);

    const matchedCount = merged.filter(
      (r) => r.status === 'MATCHED' || r.status === 'PROVIDER_MIRROR_CONFIRMED',
    ).length;

    this.logger.log(
      `[BankarizationValidationRule] Finalizado: ${matchedCount}/${merged.length} recibos conciliados. Outcome=${outcome}, Severity=${severity}`,
    );

    // 6. Compute case-level bankarization flags for Phase C (bank-viability).
    const hasPagadoraIncome = merged.some(
      (r) => (r as unknown as Record<string, unknown>).hasPagadoraIncome === true,
    );
    const scotiabankExcluded = merged.some((r) => r.scotiabankExcluded);

    return {
      ruleId: this.ruleId,
      outcome,
      severity,
      detail: {
        sources: ['payroll', 'bank-statement', 'client'],
        fields: [],
        hasPagadoraIncome,
        scotiabankExcluded,
      },
      alerts,
    };
  }

  // ── Extraccion de documentos ───────────────────────────────────────────────
  private extract(docs: PrismaDocumentLike[]): {
    receipts: PayrollReceipt[];
    deposits: PayrollDeposit[];
    isJointAccount: boolean;
  } {
    const receipts: PayrollReceipt[] = [];
    const deposits: PayrollDeposit[] = [];
    let isJointAccount = false;

    let receiptIndex = 0;
    let depositCounter = 0;

    for (const d of docs) {
      const code = d.documentType?.code;
      const ed = (d.extractedData as Record<string, unknown> | null) ?? {};

      if (code === 'PAYROLL_RECEIPT') {
        const employer = (ed.employer as Record<string, unknown>) ?? {};
        const income = (ed.income as Record<string, unknown>) ?? {};
        const period = (ed.payrollPeriod as Record<string, unknown>) ?? {};
        const originalName = (d.originalName as string) ?? null;

        const explicitPaymentDate = (period.paymentDate as string) ?? null;
        const periodEndDate = (period.periodEndDate as string) ?? null;
        // periodLabel viene de la extraccion (ej. "1A Quincena Mayo 2025").
        // Es la fuente autoritativa para inferir la quincena, no el nombre del archivo.
        const periodLabel =
          (period.periodLabel as string) ??
          (period.periodRaw as string) ??
          originalName ??
          null;

        const resolved = resolvePayrollPaymentDate(
          explicitPaymentDate,
          periodEndDate,
          periodLabel,
        );

        receipts.push({
          index: receiptIndex++,
          netIncome: (income.netIncome as number) ?? null,
          paymentDate: explicitPaymentDate,
          resolvedPaymentDate: resolved,
          employerRfc: (employer.rfc as string) ?? null,
          employerName: (employer.legalName as string) ?? null,
          originalName,
        });
      } else if (code === 'BANK_STATEMENT') {
        const holder = (ed.accountHolder as Record<string, unknown>) ?? {};
        if (holder.isJointAccount === true) isJointAccount = true;

        const arr = (ed.payrollDeposits as Record<string, unknown>[]) ?? [];
        for (const dep of arr) {
          deposits.push({
            id: `${d.id ?? 'doc'}-${depositCounter++}`,
            date: (dep.date as string) ?? null,
            amount: (dep.amount as number) ?? null,
            originalConcept: (dep.originalConcept as string) ?? null,
            detectedPayerRfc: (dep.detectedPayerRfc as string) ?? null,
            detectedPayerName:
              (dep.detectedEmployerOrPayerName as string) ?? null,
          });
        }
      }
    }

    return { receipts, deposits, isJointAccount };
  }

  // ── Fusion de resultados con evaluaciones de pagadora ──────────────────────
  private merge(
    results: PayrollMatchResult[],
    evaluations: { isProviderCandidate: boolean; isMirrorConfirmed: boolean; scotiabankExcluded: boolean; receiptIndex: number }[],
  ): PayrollMatchResult[] {
    return results.map((r) => {
      const ev = evaluations.find((e) => e.receiptIndex === r.receiptIndex);
      if (!ev) return r;

      let status = r.status;
      if (ev.isMirrorConfirmed) {
        status = 'PROVIDER_MIRROR_CONFIRMED' as PayrollReconciliationStatus;
      } else if (ev.isProviderCandidate && r.status === 'RFC_INCOMPATIBLE') {
        status = 'PROVIDER_CANDIDATE' as PayrollReconciliationStatus;
      }

      return {
        ...r,
        status,
        scotiabankExcluded: ev.scotiabankExcluded || r.scotiabankExcluded,
        hasPagadoraIncome: ev.isProviderCandidate || ev.isMirrorConfirmed,
      };
    });
  }

  // ── Mapeo resultados → alertas ─────────────────────────────────────────────
  private buildAlerts(
    results: PayrollMatchResult[],
    isJointAccount: boolean,
  ): RuleAlert[] {
    const alerts: RuleAlert[] = [];

    for (const r of results) {
      const ctx = `recibo #${r.receiptIndex + 1}`;

      switch (r.status) {
        case 'DISCREPANCY':
          alerts.push({
            ruleCode: 'DISCREPANCY_5PCT',
            severity: 'WARNING',
            field: ctx,
            message: `Monto difiere >5% entre recibo y deposito (${r.traceability.amountDiffPercent ?? '?'}%)`,
          });
          break;
        case 'RFC_INCOMPATIBLE':
          // RFC incompatible sin resolucion de pagadora → mismatch.
          alerts.push({
            ruleCode: 'BANK_PAYROLL_MISMATCH',
            severity: 'ERROR',
            field: ctx,
            message: 'RFC incompatible entre empleador y pagador sin resolucion',
          });
          break;
        case 'PROVIDER_MIRROR_CONFIRMED':
          alerts.push({
            ruleCode: 'PAYROLL_PROVIDER_MIRROR',
            severity: 'INFO',
            field: ctx,
            message: 'Doble espejo confirmado (empleador + pagadora)',
          });
          break;
        default:
          break;
      }

      // Alerta Scotiabank independiente del status, cuando el flag esta activo.
      if (r.scotiabankExcluded) {
        alerts.push({
          ruleCode: 'PAYROLL_PROVIDER_SCOTIABANK',
          severity: 'WARNING',
          field: ctx,
          message: 'No aplicable para Scotiabank',
        });
      }
    }

    // Cuenta mancomunada: emitir BANK_JOINT_ACCOUNT una sola vez (a nivel de
    // caso) cuando isJointAccount = true y algun resultado esta en MANUAL_REVIEW.
    // La unica causa de MANUAL_REVIEW es isJointAccount (forzado por el matching).
    if (isJointAccount && results.some((r) => r.status === 'MANUAL_REVIEW')) {
      if (!alerts.some((a) => a.ruleCode === 'BANK_JOINT_ACCOUNT')) {
        alerts.push({
          ruleCode: 'BANK_JOINT_ACCOUNT',
          severity: 'WARNING',
          field: 'bank-statement',
          message: 'Cuenta bancaria mancomunada requiere revision manual',
        });
      }
    }

    return alerts;
  }

  // ── Calculo de outcome (PASS/PARTIAL/FAIL) ─────────────────────────────────
  private computeOutcome(results: PayrollMatchResult[]): AnalysisOutcome {
    // PASS: todos MATCHED o PROVIDER_MIRROR_CONFIRMED.
    if (results.length === 0) return 'PASS';
    if (
      results.every(
        (r) =>
          r.status === 'MATCHED' || r.status === 'PROVIDER_MIRROR_CONFIRMED',
      )
    ) {
      return 'PASS';
    }
    // FAIL: algun RFC_INCOMPATIBLE sin resolver (no degradado a provider).
    if (results.some((r) => r.status === 'RFC_INCOMPATIBLE')) {
      return 'FAIL';
    }
    // Resto (DISCREPANCY, NOT_MATCHED, AMBIGUOUS, MANUAL_REVIEW, PROVIDER_CANDIDATE) → PARTIAL.
    return 'PARTIAL';
  }

  private computeSeverity(outcome: AnalysisOutcome): Severity {
    if (outcome === 'FAIL') return 'ERROR';
    if (outcome === 'PARTIAL') return 'WARNING';
    return 'INFO';
  }

}