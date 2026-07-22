import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AnalysisRule,
  RuleResult,
} from './analysis-rule.interface';
import { IdentityMatchRule } from './rules/identity-match.rule';
import { BankarizationValidationRule } from './rules/bankarization-validation.rule';
import { BankViabilityRule } from './rules/bank-viability.rule';
import { ReviewDecisionDto } from './dto/review-decision.dto';

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
 *  1. Loads the MortgageCase with its Client and Documents (documentType +
 *     extractedData).
 *  2. Executes every registered `AnalysisRule` sequentially.
 *  3. Aggregates their results into a single `AnalysisRun` record and
 *     creates `AnalysisAlert` rows for every rule-emitted alert.
 *  4. When the aggregate outcome is `FAIL`, transitions the case status to
 *     `REQUIRES_REVIEW` (gates automatic financial-engine advance only).
 *  5. Returns an immutable `AnalysisResult` snapshot.
 */
@Injectable()
export class CaseAnalysisService {
  private readonly rules: AnalysisRule[];

  constructor(
    private readonly prisma: PrismaService,
    identityMatchRule: IdentityMatchRule,
    bankarizationValidationRule: BankarizationValidationRule,
    bankViabilityRule: BankViabilityRule,
  ) {
    // Rule registry. HU-10 adds bankarization-validation (nomina vs depositos)
    // despues del identity-match. HU-13 adds bank-viability. Future Sprint 3/4
    // rules (income, liability) register here without touching the controller.
    this.rules = [identityMatchRule, bankarizationValidationRule, bankViabilityRule];
  }

  async run(caseId: string, triggeredBy: string): Promise<AnalysisResultPayload> {
    const mortgageCase = (await this.prisma.mortgageCase.findUnique({
      where: { id: caseId },
      include: { client: true, documents: { include: { documentType: true } } },
    })) as LoadedMortgageCase | null;

    if (!mortgageCase) {
      throw new NotFoundException('Mortgage case not found');
    }

    // Execute all registered rules sequentially and aggregate results.
    const ruleResults: RuleResult[] = [];
    for (const rule of this.rules) {
      const context = {
        ...mortgageCase.client,
        caseId,
      } as Record<string, unknown>;
      const result = await rule.execute(
        context,
        mortgageCase.documents as unknown as Record<string, unknown>[],
      );
      ruleResults.push(result);
    }

    const aggregate = this.aggregate(ruleResults);

    // Merge bankViability snapshot from the bank-viability rule into detail.
    const bankViabilityResult = ruleResults.find((r) => r.ruleId === 'bank-viability');
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

    // FAIL outcome gates automatic financial-engine advance.
    if (aggregate.outcome === 'FAIL') {
      await this.transitionToRequiresReview(caseId);
    }

    return {
      runId: createdRun.id,
      executionStatus: 'COMPLETED',
      outcome: aggregate.outcome,
      summary: aggregate.summary,
      detail: { sources: aggregate.sources, fields: aggregate.fields },
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
      include: { alerts: true, reviewDecisions: true },
    });
  }

  /**
   * Stores a ReviewDecision against an AnalysisRun, validating that the run
   * belongs to the provided case. `MARK_FALSE_POSITIVE` justification is
   * enforced by the controller's ValidationPipe before reaching the service.
   */
  async recordReviewDecision(
    caseId: string,
    runId: string,
    dto: ReviewDecisionDto,
    decidedBy?: string,
  ) {
    const run = await this.prisma.analysisRun.findFirst({
      where: { id: runId, mortgageCaseId: caseId },
    });
    if (!run) {
      throw new NotFoundException('Analysis run not found for this case');
    }

    return this.prisma.reviewDecision.create({
      data: {
        runId,
        action: dto.action,
        justification: dto.justification,
        decidedBy: decidedBy ?? '',
      },
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
      return `Análisis completado con resultado: FAIL (${alertCount} alerta(s)). Caso enviado a REQUIRES_REVIEW.`;
    }
    if (outcome === 'PARTIAL') {
      return `Análisis completado con resultado: PARTIAL (${alertCount} alerta(s)). Revisión manual recomendada.`;
    }
    return 'Análisis completado con resultado: PASS. Sin alertas.';
  }

  private async transitionToRequiresReview(caseId: string) {
    const status = await this.prisma.caseStatus.findUnique({
      where: { code: 'REQUIRES_REVIEW' },
    });
    if (!status) {
      // REQUIRES_REVIEW status must exist (seeded in PR 1).
      throw new NotFoundException('Case status REQUIRES_REVIEW not found');
    }
    await this.prisma.mortgageCase.update({
      where: { id: caseId },
      data: { statusId: status.id },
    });
  }
}