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

import { Injectable } from '@nestjs/common';
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
  PayrollReceipt,
  PayrollReconciliationStatus,
} from '../types/bankarization.types';

/**
 * Regla de bancarizacion. Sin estado: cada ejecucion produce un resultado
 * determinista a partir de los documentos del caso.
 */
@Injectable()
export class BankarizationValidationRule implements AnalysisRule {
  readonly ruleId = 'bankarization-validation';

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

    return {
      ruleId: this.ruleId,
      outcome,
      severity,
      detail: { sources: ['payroll', 'bank-statement', 'client'], fields: [] },
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
        receipts.push({
          index: receiptIndex++,
          netIncome: (income.netIncome as number) ?? null,
          // paymentDate: Gemini no siempre detecta la fecha de pago explícita.
          // Fallback a periodEndDate (el pago suele coincidir con el cierre del periodo).
          paymentDate:
            (period.paymentDate as string) ??
            (period.periodEndDate as string) ??
            null,
          employerRfc: (employer.rfc as string) ?? null,
          employerName: (employer.legalName as string) ?? null,
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