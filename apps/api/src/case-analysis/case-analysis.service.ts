import { Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AnalysisRule,
  RuleResult,
} from './analysis-rule.interface';
import { IdentityMatchRule } from './rules/identity-match.rule';
import { BankarizationValidationRule } from './rules/bankarization-validation.rule';
import { PfaeValidationRule } from './rules/pfae-validation.rule';
import { PmCsfTaxRule } from './rules/pm-csf-tax.rule';
import { PmGatesRule } from './rules/pm-gates.rule';
import { BankViabilityRule } from './rules/bank-viability.rule';
import { IncomeCalculationService } from '../income-calculation/income-calculation.service';
import { LiabilityCalculationService } from '../liability/liability.service';
import {
  mapBureauCreditToInput,
  mapCompanyBureauCredit,
} from '../liability/credit-mapper';
import type { BankarizationFlags } from './types/bank-viability.types';
import { CaseStatusCalculatorService } from '../case-status-calculator/case-status-calculator.service';
import {
  applySalariedPayrollDepuration,
  employersFromDocuments,
  promoteEmployerPayrollDeposits,
} from '../documents/payroll-deposit-match';

/** Loaded mortgage case shape used by the orchestrator. */
interface LoadedMortgageCase {
  id: string;
  client: Record<string, unknown>;
  personType?: string | null;
  sharePercentage?: unknown;
  documents: {
    extractedData: unknown;
    documentType: { code: string };
    owner?: string | null;
    createdAt?: Date | string | null;
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
 *  Phase A: identity-match + personType-specific validation rules
 *    (SALARIED: bankarization-validation; PFAE: pfae-validation;
 *     PM: identity-match on shareholder documents only)
 *  Phase B: income calculation + liability calculation (services)
 *  Phase C: bank-viability rule (reads income/liability from DB)
 *
 * PM runs identity on shareholder documents plus the CSF/tax-return gates,
 * and skips payroll persist, Phase B, and Phase C (no capacity / bankViability).
 * Phase failure produces a warning but does not block subsequent phases.
 */
@Injectable()
export class CaseAnalysisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identityMatchRule: IdentityMatchRule,
    private readonly bankarizationValidationRule: BankarizationValidationRule,
    private readonly pfaeValidationRule: PfaeValidationRule,
    private readonly pmCsfTaxRule: PmCsfTaxRule,
    private readonly pmGatesRule: PmGatesRule,
    private readonly bankViabilityRule: BankViabilityRule,
    @Inject(forwardRef(() => IncomeCalculationService))
    private readonly incomeCalcService: IncomeCalculationService,
    private readonly liabilityCalcService: LiabilityCalculationService,
    private readonly caseStatusCalculator: CaseStatusCalculatorService,
  ) {}

  /**
   * Resolves the Phase A rule set per request based on `personType`.
   * PFAE runs `identity-match` + `pfae-validation` (CSF/bank gates).
   * Persona Moral does not use this list: `run` applies identity on
   * shareholder documents and `pm-csf-tax` before Phase B.
   * SALARIED (or absent/unrecognized `personType`) runs `identity-match` +
   * `bankarization-validation`, matching prior behavior.
   */
  private resolvePhaseARules(personType?: string | null): AnalysisRule[] {
    if (personType === 'PM') {
      return [this.identityMatchRule];
    }
    if (personType === 'PFAE') {
      return [this.identityMatchRule, this.pfaeValidationRule];
    }
    return [this.identityMatchRule, this.bankarizationValidationRule];
  }

  /**
   * Shareholder bureau uses the 6% engine. Company bureau uses the
   * simple / revolving formulas. Income reads the snapshot afterwards.
   */
  private async calculatePmLiabilities(mortgageCase: LoadedMortgageCase): Promise<void> {
    const share =
      mortgageCase.sharePercentage == null
        ? null
        : Number(mortgageCase.sharePercentage);
    await this.liabilityCalcService.calculatePersonaMoral(
      mortgageCase.id,
      this.bureauCredits(mortgageCase, 'SHAREHOLDER').map(mapBureauCreditToInput),
      this.bureauCredits(mortgageCase, 'COMPANY').map(mapCompanyBureauCredit),
      Number.isFinite(share) ? share : null,
    );
  }

  /** Latest bureau report for one owner. A missing owner counts as SHAREHOLDER. */
  private bureauCredits(
    mortgageCase: LoadedMortgageCase,
    owner: 'SHAREHOLDER' | 'COMPANY',
  ): Record<string, unknown>[] {
    const matches = mortgageCase.documents.filter((doc) => {
      if (doc.documentType?.code !== 'CREDIT_BUREAU_REPORT') return false;
      const docOwner = doc.owner === 'COMPANY' ? 'COMPANY' : 'SHAREHOLDER';
      return docOwner === owner;
    });
    if (matches.length === 0) return [];

    const latest = matches.reduce((best, doc) => {
      const bestTime = best.createdAt ? new Date(best.createdAt).getTime() : 0;
      const docTime = doc.createdAt ? new Date(doc.createdAt).getTime() : 0;
      return docTime >= bestTime ? doc : best;
    });
    const extracted = latest.extractedData as { credits?: unknown } | null;
    return Array.isArray(extracted?.credits)
      ? (extracted.credits as Record<string, unknown>[])
      : [];
  }

  /** Shareholder packet for PM identity: missing owner counts as SHAREHOLDER. */
  private shareholderDocuments(
    docs: Record<string, unknown>[],
  ): Record<string, unknown>[] {
    return docs.filter((doc) => (doc.owner ?? 'SHAREHOLDER') !== 'COMPANY');
  }

  /**
   * SPEI deposits often say only "PAGO". Match them to the payroll employer
   * name or RFC and store them so the empty-payroll alert and the
   * reconciliation see the same deposits.
   */
  private async persistEmployerPayrollDeposits(
    docs: Record<string, unknown>[],
  ): Promise<void> {
    const employers = employersFromDocuments(
      docs as { documentType?: { code?: string } | null; extractedData?: unknown }[],
    );

    for (const doc of docs) {
      if ((doc.documentType as { code?: string } | undefined)?.code !== 'BANK_STATEMENT') {
        continue;
      }
      const extractedData = doc.extractedData;
      if (!extractedData || typeof extractedData !== 'object') continue;
      const payload = extractedData as Record<string, unknown>;
      const promoted = promoteEmployerPayrollDeposits(payload, employers);
      const incomeRestricted = applySalariedPayrollDepuration(payload);
      if ((!promoted && !incomeRestricted) || typeof doc.id !== 'string') continue;
      await this.prisma.document.update({
        where: { id: doc.id },
        data: { extractedData: payload as never },
      });
    }
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
      personType: mortgageCase.personType,
    } as Record<string, unknown>;
    const docs = mortgageCase.documents as unknown as Record<string, unknown>[];

    if (mortgageCase.personType === 'PM') {
      const identityResult = await this.identityMatchRule.execute(
        context,
        this.shareholderDocuments(docs),
      );
      const pmCsfTaxResult = await this.pmCsfTaxRule.execute(context, docs);
      const pmGatesResult = await this.pmGatesRule.execute(context, docs);
      try {
        await this.calculatePmLiabilities(mortgageCase);
      } catch (err) {
        console.warn(
          `[CaseAnalysis] Phase B persona moral liability warning for case ${caseId}:`,
          (err as Error).message,
        );
      }
      try {
        await this.incomeCalcService.calculate(caseId, []);
      } catch (err) {
        console.warn(
          `[CaseAnalysis] Phase B persona moral income warning for case ${caseId}:`,
          (err as Error).message,
        );
      }
      return this.persistCompletedRun(
        caseId,
        triggeredBy,
        [identityResult, pmCsfTaxResult, pmGatesResult],
        null,
      );
    }

    if (mortgageCase.personType !== 'PFAE') {
      await this.persistEmployerPayrollDeposits(docs);
    }

    // ── Phase A: Document validation rules ──────────────────────────────
    const phaseARules = this.resolvePhaseARules(mortgageCase.personType);
    const ruleResults: RuleResult[] = [];
    for (const rule of phaseARules) {
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

    return this.persistCompletedRun(
      caseId,
      triggeredBy,
      ruleResults,
      bankViabilityResult,
    );
  }

  /**
   * Phase-C-only re-run: copy prior Phase A `ruleResults`, skip Phase B
   * recalculation, execute BankViabilityRule against the latest income and
   * liability snapshots already in the database, and persist a new AnalysisRun.
   */
  async runPhaseC(
    caseId: string,
    triggeredBy: string,
  ): Promise<AnalysisResultPayload> {
    const mortgageCase = (await this.prisma.mortgageCase.findUnique({
      where: { id: caseId },
      include: { client: true, documents: { include: { documentType: true } } },
    })) as LoadedMortgageCase | null;

    if (!mortgageCase) {
      throw new NotFoundException('Mortgage case not found');
    }

    const priorRun = await this.prisma.analysisRun.findFirst({
      where: { mortgageCaseId: caseId },
      orderBy: { createdAt: 'desc' },
    });

    if (!priorRun) {
      throw new NotFoundException('No analysis run found for this case');
    }

    const priorDetail = (priorRun.detail ?? {}) as {
      ruleResults?: RuleResult[];
    };
    const phaseAResults = (priorDetail.ruleResults ?? []).filter(
      (result) => result.ruleId !== 'bank-viability',
    );

    const bankarizationResult = phaseAResults.find(
      (result) => result.ruleId === 'bankarization-validation',
    );
    const bankarizationFlags: BankarizationFlags = {
      hasPagadoraIncome:
        (bankarizationResult?.detail.hasPagadoraIncome as boolean) ?? false,
      scotiabankExcluded:
        (bankarizationResult?.detail.scotiabankExcluded as boolean) ?? false,
    };

    const phaseCContext = {
      ...mortgageCase.client,
      caseId,
      personType: mortgageCase.personType,
      bankarizationFlags,
    } as Record<string, unknown>;
    const docs = mortgageCase.documents as unknown as Record<string, unknown>[];

    const bankViabilityResult = await this.bankViabilityRule.execute(
      phaseCContext,
      docs,
    );
    const ruleResults = [...phaseAResults, bankViabilityResult];

    return this.persistCompletedRun(
      caseId,
      triggeredBy,
      ruleResults,
      bankViabilityResult,
    );
  }

  private async persistCompletedRun(
    caseId: string,
    triggeredBy: string,
    ruleResults: RuleResult[],
    bankViabilityResult: RuleResult | null,
  ): Promise<AnalysisResultPayload> {
    const aggregate = this.aggregate(ruleResults);
    const bankViability = bankViabilityResult
      ? (bankViabilityResult.detail as Record<string, unknown>).bankViability
      : null;

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