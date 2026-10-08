// ---------------------------------------------------------------------------
// PmCsfTaxRule (HU-23)
//
// Phase A gates for Persona Moral CSF and tax return, keyed by document owner.
// Shareholder CSF must include an active socio/accionista regime. A mix with
// sueldos y salarios still counts. Company fiscal loss knocks out only the
// declaration path; bank statements stay available.
// ---------------------------------------------------------------------------

import { Injectable } from '@nestjs/common';
import type { AnalysisOutcome } from '../../generated/prisma/client';
import { hasActiveShareholderRegime } from '../../documents/pm-shareholder-regime';
import type {
  AnalysisRule,
  RuleAlert,
  RuleResult,
  Severity,
} from '../analysis-rule.interface';

const RULE_ID = 'pm-csf-tax';
const CSF_CODE = 'CSF';
const TAX_RETURN_CODE = 'TAX_RETURN';

interface OwnedDocument {
  owner?: string | null;
  extractedData?: unknown;
  documentType?: { code?: string | null } | null;
}

@Injectable()
export class PmCsfTaxRule implements AnalysisRule {
  readonly ruleId = RULE_ID;

  async execute(
    client: Record<string, unknown>,
    documents: Record<string, unknown>[],
  ): Promise<RuleResult> {
    if (client.personType !== 'PM') {
      return this.buildResult('PASS', 'INFO', [], [], false);
    }

    const docs = documents as unknown as OwnedDocument[];
    const alerts: RuleAlert[] = [];
    const sources: string[] = [];
    let outcome: AnalysisOutcome = 'PASS';

    const shareholderCsf = docs.find(
      (doc) => doc.documentType?.code === CSF_CODE && doc.owner !== 'COMPANY',
    );
    const csfData = (shareholderCsf?.extractedData ?? null) as Record<string, unknown> | null;

    if (!shareholderCsf || csfData == null) {
      outcome = 'PARTIAL';
      sources.push('csf-shareholder');
      alerts.push({
        ruleCode: 'PM_CSF_MISSING',
        severity: 'WARNING',
        field: 'csf',
        message:
          'No hay Constancia de Situación Fiscal del accionista extraída para confirmar el régimen de socio.',
      });
    } else {
      sources.push('csf-shareholder');
      const regimes = Array.isArray(csfData.regimes)
        ? (csfData.regimes as { description?: string | null; endDate?: string | null }[])
        : [];
      if (!hasActiveShareholderRegime(regimes)) {
        outcome = 'FAIL';
        alerts.push({
          ruleCode: 'PM_CSF_SIN_REGIMEN_SOCIO',
          severity: 'ERROR',
          field: 'regime',
          message:
            'La CSF del accionista no incluye un régimen de socio o accionista vigente. Este expediente no sigue el camino de Persona Moral.',
        });
      }
    }

    const companyReturns = docs.filter(
      (doc) => doc.documentType?.code === TAX_RETURN_CODE && doc.owner === 'COMPANY',
    );
    const declarationPathKnockedOut = companyReturns.some((doc) =>
      this.companyReturnHasFiscalLoss(doc.extractedData),
    );
    if (companyReturns.length > 0) {
      sources.push('tax-return-company');
    }
    if (declarationPathKnockedOut) {
      if (outcome === 'PASS') outcome = 'PARTIAL';
      alerts.push({
        ruleCode: 'PERDIDA_FISCAL_KNOCKOUT_DECLARACION',
        severity: 'WARNING',
        field: 'declaration',
        message:
          'La declaración de la empresa registra pérdida fiscal. Se descarta solo el camino de declaración. Los estados de cuenta de la empresa siguen disponibles.',
      });
    }

    const severity: Severity =
      outcome === 'FAIL' ? 'ERROR' : outcome === 'PARTIAL' ? 'WARNING' : 'INFO';
    return this.buildResult(outcome, severity, sources, alerts, declarationPathKnockedOut);
  }

  private companyReturnHasFiscalLoss(extracted: unknown): boolean {
    if (!extracted || typeof extracted !== 'object') return false;
    const data = extracted as Record<string, unknown>;
    if (data.hasTaxLoss === true) return true;
    const fiscal = data.fiscalResult as Record<string, unknown> | undefined;
    const loss = typeof fiscal?.fiscalLoss === 'number' ? fiscal.fiscalLoss : Number(fiscal?.fiscalLoss);
    if (Number.isFinite(loss) && loss > 0) return true;
    const taxResult =
      typeof fiscal?.taxResult === 'number' ? fiscal.taxResult : Number(fiscal?.taxResult);
    return Number.isFinite(taxResult) && taxResult < 0;
  }

  private buildResult(
    outcome: AnalysisOutcome,
    severity: Severity,
    sources: string[],
    alerts: RuleAlert[],
    declarationPathKnockedOut: boolean,
  ): RuleResult {
    return {
      ruleId: this.ruleId,
      outcome,
      severity,
      detail: {
        sources,
        fields: [],
        declarationPathKnockedOut,
      },
      alerts,
    };
  }
}
