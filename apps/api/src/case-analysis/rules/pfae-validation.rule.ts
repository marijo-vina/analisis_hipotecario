// ---------------------------------------------------------------------------
// PfaeValidationRule (HU-19b)
//
// Phase A gate rule for PFAE cases. Re-derives PLAN-FASE outcomes from
// persisted CSF and bank-statement fields — never copies document alerts[]
// (ARRAIGO_INSUFICIENTE, tax-loss knockouts, extraction régimen noise).
//
// Orchestrator registration is the primary SALARIED exclusion; execute()
// still no-ops PASS if invoked with a non-PFAE personType.
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
import type { PfaeValidationSnapshot } from '../types/pfae-validation.types';

const RULE_ID = 'pfae-validation';
const CSF_CODE = 'CSF';
const BANK_STATEMENT_CODE = 'BANK_STATEMENT';
const RENT_WITHOUT_REGIME = 'RENT_WITHOUT_CSF_REGIME';

const EMPTY_SNAPSHOT: PfaeValidationSnapshot = {
  regime: { isSolelySalaried: false, outcome: 'PASS' },
  vigencia: null,
  tenure: null,
  activity: null,
  coherence: null,
};

const OUTCOME_RANK: Record<AnalysisOutcome, number> = { PASS: 0, PARTIAL: 1, FAIL: 2 };

@Injectable()
export class PfaeValidationRule implements AnalysisRule {
  readonly ruleId = RULE_ID;
  private readonly logger = new Logger(PfaeValidationRule.name);

  async execute(
    client: Record<string, unknown>,
    documents: Record<string, unknown>[],
  ): Promise<RuleResult> {
    if (client.personType !== 'PFAE') {
      return this.buildResult('PASS', 'INFO', [], [], EMPTY_SNAPSHOT);
    }

    const docs = documents as unknown as PrismaDocumentLike[];
    const csfDoc = docs.find((d) => d.documentType?.code === CSF_CODE);
    const csfData = (csfDoc?.extractedData as Record<string, unknown> | null) ?? null;

    if (!csfDoc || csfData == null) {
      return this.buildResult(
        'PARTIAL',
        'WARNING',
        csfDoc ? ['csf'] : [],
        [
          {
            ruleCode: 'PFAE_CSF_MISSING',
            severity: 'WARNING',
            field: 'csf',
            message: 'No hay Constancia de Situación Fiscal extraída para evaluar las puertas PFAE.',
          },
        ],
        EMPTY_SNAPSHOT,
      );
    }

    const alerts: RuleAlert[] = [];
    let outcome: AnalysisOutcome = 'PASS';

    const isSolelySalaried = csfData.isSolelySalaried === true;
    const regime = {
      isSolelySalaried,
      outcome: isSolelySalaried ? ('FAIL' as const) : ('PASS' as const),
    };
    if (isSolelySalaried) {
      outcome = this.escalate(outcome, 'FAIL');
      alerts.push({
        ruleCode: 'REGIMEN_EXCLUSIVAMENTE_ASALARIADO',
        severity: 'ERROR',
        field: 'regime',
        message:
          'La CSF solo registra régimen de Sueldos y Salarios. El solicitante debe comprobar ingresos como Asalariado con recibos de nómina.',
      });
    }

    const issuance = (csfData.issuance as Record<string, unknown> | undefined) ?? {};
    const issuanceDate = (issuance.issuanceDate as string) ?? null;
    const isOlderThan3Months = issuance.isOlderThan3Months === true;
    const vigencia: PfaeValidationSnapshot['vigencia'] = {
      issuanceDate,
      isOlderThan3Months,
      outcome: isOlderThan3Months ? 'WARNING' : 'PASS',
    };
    if (isOlderThan3Months) {
      outcome = this.escalate(outcome, 'PARTIAL');
      alerts.push({
        ruleCode: 'VIGENCIA_MAYOR_3_MESES',
        severity: 'WARNING',
        field: 'vigencia',
        message:
          'La Constancia de Situación Fiscal tiene una fecha de emisión mayor a 3 meses.',
      });
    }

    const tenureMonths =
      typeof csfData.tenureMonths === 'number' ? csfData.tenureMonths : null;
    const activityStartDate = (csfData.activityStartDate as string) ?? null;
    const tenure: PfaeValidationSnapshot['tenure'] =
      tenureMonths != null || activityStartDate != null
        ? { months: tenureMonths, activityStartDate }
        : null;
    if (tenure) {
      alerts.push({
        ruleCode: 'PFAE_ACTIVITY_TENURE',
        severity: 'INFO',
        field: 'tenure',
        message: `Antigüedad en la actividad independiente: ${tenureMonths ?? 'N/D'} meses.`,
      });
    }

    const activity = this.selectActivity(csfData.activities);
    const { coherence, bankStatementPresent } = this.scanCoherence(docs);
    if (coherence?.outcome === 'WARNING') {
      outcome = this.escalate(outcome, 'PARTIAL');
      alerts.push({
        ruleCode: RENT_WITHOUT_REGIME,
        severity: 'WARNING',
        field: 'coherence',
        message: `${coherence.rentWithoutRegimeCount} depósito(s) de renta sin régimen CSF.`,
      });
    }

    const sources = ['csf'];
    if (bankStatementPresent) sources.push('bank-statement');

    const pfaeValidation: PfaeValidationSnapshot = {
      regime,
      vigencia,
      tenure,
      activity,
      coherence,
    };

    const severity = this.severityFor(outcome);
    this.logger.log(
      `Outcome=${outcome} solelySalaried=${isSolelySalaried} vigenciaStale=${isOlderThan3Months}`,
    );

    return this.buildResult(outcome, severity, sources, alerts, pfaeValidation);
  }

  private selectActivity(raw: unknown): PfaeValidationSnapshot['activity'] {
    if (!Array.isArray(raw) || raw.length === 0) return null;

    const active = raw.filter((item): item is Record<string, unknown> => {
      if (item == null || typeof item !== 'object') return false;
      return (item as Record<string, unknown>).endDate == null;
    });
    if (active.length === 0) return null;

    let best = active[0];
    let bestPct = typeof best.percentage === 'number' ? best.percentage : -1;
    for (const item of active.slice(1)) {
      const pct = typeof item.percentage === 'number' ? item.percentage : -1;
      if (pct > bestPct) {
        best = item;
        bestPct = pct;
      }
    }

    return {
      satDescription: typeof best.description === 'string' ? best.description : null,
      percentage: typeof best.percentage === 'number' ? best.percentage : null,
    };
  }

  private scanCoherence(docs: PrismaDocumentLike[]): {
    coherence: PfaeValidationSnapshot['coherence'];
    bankStatementPresent: boolean;
  } {
    const statements = docs.filter((d) => d.documentType?.code === BANK_STATEMENT_CODE);
    if (statements.length === 0) {
      return { coherence: null, bankStatementPresent: false };
    }

    let sawCleanedDeposits = false;
    let rentWithoutRegimeCount = 0;

    for (const statement of statements) {
      const ed = (statement.extractedData as Record<string, unknown> | null) ?? {};
      const depuration = ed.financialDepuration as Record<string, unknown> | undefined;
      const cleaned = depuration?.cleanedDeposits;
      if (!Array.isArray(cleaned) || cleaned.length === 0) continue;
      sawCleanedDeposits = true;
      for (const deposit of cleaned) {
        if (
          deposit != null &&
          typeof deposit === 'object' &&
          (deposit as Record<string, unknown>).trashCategory === RENT_WITHOUT_REGIME
        ) {
          rentWithoutRegimeCount += 1;
        }
      }
    }

    if (!sawCleanedDeposits) {
      return { coherence: null, bankStatementPresent: true };
    }

    return {
      coherence: {
        rentWithoutRegimeCount,
        outcome: rentWithoutRegimeCount > 0 ? 'WARNING' : 'PASS',
      },
      bankStatementPresent: true,
    };
  }

  private escalate(current: AnalysisOutcome, next: AnalysisOutcome): AnalysisOutcome {
    return OUTCOME_RANK[next] > OUTCOME_RANK[current] ? next : current;
  }

  private severityFor(outcome: AnalysisOutcome): Severity {
    if (outcome === 'FAIL') return 'ERROR';
    if (outcome === 'PARTIAL') return 'WARNING';
    return 'INFO';
  }

  private buildResult(
    outcome: AnalysisOutcome,
    severity: Severity,
    sources: string[],
    alerts: RuleAlert[],
    pfaeValidation: PfaeValidationSnapshot,
  ): RuleResult {
    return {
      ruleId: this.ruleId,
      outcome,
      severity,
      detail: {
        sources,
        fields: [],
        pfaeValidation,
      },
      alerts,
    };
  }
}
