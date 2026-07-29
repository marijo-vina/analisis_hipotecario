import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AnalysisRule,
  RuleResult,
} from './analysis-rule.interface';
import { IdentityMatchRule } from './rules/identity-match.rule';
import { BankarizationValidationRule } from './rules/bankarization-validation.rule';
import { BankViabilityRule } from './rules/bank-viability.rule';
import { IncomeCalculationService } from '../income-calculation/income-calculation.service';
import { LiabilityCalculationService } from '../liability/liability.service';
import { mapBureauCreditToInput } from '../liability/credit-mapper';
import type { BankarizationFlags } from './types/bank-viability.types';
import { CaseStatusCalculatorService } from '../case-status-calculator/case-status-calculator.service';

/** Loaded mortgage case shape used by the orchestrator. */
interface LoadedMortgageCase {
  id: string;
  client: Record<string, unknown>;
  documents: {
    extractedData: unknown;
    documentType: { code: string };
  }[];
  [k: string]: unknown;
}

export interface AnalysisResultPayload {
  runId: string;
  executionStatus: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'ERROR';
  outcome: 'PASS' | 'PARTIAL' | 'FAIL';
  summary: string;
  detail: {
    sources: string[];
    fields: unknown[];
  };
  executionMetadata: {
    timestamp: string;
    triggeredBy: string;
  };
}

/**
 * Orchestrates cross-document analysis for a mortgage case.
 *
 * 3-phase execution:
 *  Phase A: identity-match + bankarization-validation rules
 *  Phase B: income calculation + liability calculation (services)
 *  Phase C: bank-viability rule (reads income/liability from DB)
 *
 * Phase failure produces a warning but does not block subsequent phases.
 */
@Injectable()
export class CaseAnalysisService {
  private readonly phaseARules: AnalysisRule[];

  constructor(
    private readonly prisma: PrismaService,
    identityMatchRule: IdentityMatchRule,
    bankarizationValidationRule: BankarizationValidationRule,
    private readonly bankViabilityRule: BankViabilityRule,
    private readonly incomeCalcService: IncomeCalculationService,
    private readonly liabilityCalcService: LiabilityCalculationService,
    private readonly caseStatusCalculator: CaseStatusCalculatorService,
  ) {
    // Phase A rules — pure evaluation, no side-effect-producing services.
    this.phaseARules = [identityMatchRule, bankarizationValidationRule];
  }

  async run(caseId: string, triggeredBy: string): Promise<AnalysisResultPayload> {
    const mortgageCase = (await this.prisma.mortgageCase.findUnique({
      where: { id: caseId },
      include: { client: true, documents: { include: { documentType: true } } },
    })) as LoadedMortgageCase | null;

    if (!mortgageCase) {
      throw new NotFoundException('Mortgage case not found');
    }

    const context = {
      ...mortgageCase.client,
      caseId,
    } as Record<string, unknown>;
    const docs = mortgageCase.documents as unknown as Record<string, unknown>[];

    // ── Phase A: Document validation rules ──────────────────────────────
    const ruleResults: RuleResult[] = [];
    for (const rule of this.phaseARules) {
      const result = await rule.execute(context, docs);
      ruleResults.push(result);
    }

    // Extract bankarization flags from Phase A for Phase C (bank-viability).
    const bankarizationResult = ruleResults.find(
      (r) => r.ruleId === 'bankarization-validation',
    );
    const bankarizationFlags: BankarizationFlags = {
      hasPagadoraIncome:
        (bankarizationResult?.detail.hasPagadoraIncome as boolean) ?? false,
      scotiabankExcluded:
        (bankarizationResult?.detail.scotiabankExcluded as boolean) ?? false,
    };

    // ── Phase B: Income + Liability calculations ────────────────────────
    try {
      await this.incomeCalcService.calculate(caseId, []);
    } catch (err) {
      console.warn(`[CaseAnalysis] Phase B income calculation warning for case ${caseId}:`, (err as Error).message);
    }

    try {
      // Extract credits from bureau document for liability calculation
      const bureauDoc = mortgageCase.documents.find(
        (d) => d.documentType.code === 'CREDIT_BUREAU_REPORT',
      );
      const rawCredits = (bureauDoc?.extractedData as Record<string, unknown>)?.credits as Record<string, unknown>[] | undefined;
      const credits = (rawCredits ?? []).map(mapBureauCreditToInput);
      await this.liabilityCalcService.calculate(caseId, credits);
    } catch (err) {
      console.warn(`[CaseAnalysis] Phase B liability calculation warning for case ${caseId}:`, (err as Error).message);
    }

    // ── Phase C: Bank viability rule (reads fresh income/liability) ─────
    const phaseCContext = { ...context, bankarizationFlags };
    const bankViabilityResult = await this.bankViabilityRule.execute(phaseCContext, docs);
    ruleResults.push(bankViabilityResult);

    const aggregate = this.aggregate(ruleResults);

    // Merge bankViability snapshot from the bank-viability rule into detail.
    const bankViability = bankViabilityResult
      ? (bankViabilityResult.detail as Record<string, unknown>).bankViability
      : undefined;

    // Persist the immutable AnalysisRun + its AnalysisAlert records.
    const createdRun = await this.prisma.analysisRun.create({
      data: {
        mortgageCaseId: caseId,
        executionStatus: 'COMPLETED',
        outcome: aggregate.outcome,
        detail: {
          ruleResults,
          sources: aggregate.sources,
          fields: aggregate.fields,
          ...(bankViability ? { bankViability } : {}),
        } as never,
        triggeredBy,
        alerts: {
          create: aggregate.alerts,
        },
      },
    });

    // Recalculate case status — the new COMPLETED run may advance to PRELIMINARY_RESULT.
    await this.caseStatusCalculator.recalculate(caseId);

    return {
      runId: createdRun.id,
      executionStatus: 'COMPLETED',
      outcome: aggregate.outcome,
      summary: aggregate.summary,
      detail: {
        sources: aggregate.sources,
        fields: aggregate.fields,
        ...(bankViability ? { bankViability } : {}),
      },
      executionMetadata: {
        timestamp: new Date().toISOString(),
        triggeredBy,
      },
    };
  }

  /** Returns the most recent AnalysisRun for a case, or null when none exists. */
  async getLatest(caseId: string) {
    return this.prisma.analysisRun.findFirst({
      where: { mortgageCaseId: caseId },
      orderBy: { createdAt: 'desc' },
      include: { alerts: true },
    });
  }

  private aggregate(ruleResults: RuleResult[]) {
    // Outcome escalation: FAIL > PARTIAL > PASS.
    const outcomeRank = { PASS: 0, PARTIAL: 1, FAIL: 2 } as const;
    let outcome: 'PASS' | 'PARTIAL' | 'FAIL' = 'PASS';
    for (const r of ruleResults) {
      if (outcomeRank[r.outcome] > outcomeRank[outcome]) {
        outcome = r.outcome;
      }
    }

    // Merge sources across rules (de-duplicated, ordered by insertion).
    const sources = [
      ...new Set(ruleResults.flatMap((r) => r.detail.sources)),
    ];
    // Merge field comparisons across rules.
    const fields = ruleResults.flatMap((r) => r.detail.fields);
    // Flatten alerts and attach a `severity`/`message` if missing.
    const alerts = ruleResults.flatMap((r) =>
      r.alerts.map((a) => ({
        ruleCode: a.ruleCode,
        severity: a.severity,
        field: a.field,
        message: a.message,
      })),
    );

    const summary = this.buildSummary(outcome, alerts.length);

    return { outcome, sources, fields, alerts, summary };
  }

  private buildSummary(outcome: 'PASS' | 'PARTIAL' | 'FAIL', alertCount: number): string {
    if (outcome === 'FAIL') {
      return `Análisis completado con resultado: FAIL (${alertCount} alerta(s)).`;
    }
    if (outcome === 'PARTIAL') {
      return `Análisis completado con resultado: PARTIAL (${alertCount} alerta(s)). Revisión manual recomendada.`;
    }
    return 'Análisis completado con resultado: PASS. Sin alertas.';
  }
}