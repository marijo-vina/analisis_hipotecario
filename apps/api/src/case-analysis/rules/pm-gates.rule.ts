import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  AnalysisRule,
  RuleAlert,
  RuleResult,
  Severity,
} from '../analysis-rule.interface';
import { collectPmGatesInput } from '../pm-gates-input';
import { evaluatePmGates, type PmGatesResult } from '../pm-gates';
import type { AnalysisOutcome } from '../../generated/prisma/client';

const RULE_ID = 'pm-gates';

function emptyGates(): PmGatesResult {
  return {
    banks: [],
    companyIdentity: 'PASS',
    identityLocks: [],
    prohibitedActivity: null,
    ageExceeded: false,
  };
}

interface OwnedDocument {
  owner?: string | null;
  extractedData?: unknown;
  documentType?: { code?: string | null } | null;
}

@Injectable()
export class PmGatesRule implements AnalysisRule {
  readonly ruleId = RULE_ID;

  constructor(private readonly prisma: PrismaService) {}

  async execute(
    client: Record<string, unknown>,
    documents: Record<string, unknown>[],
  ): Promise<RuleResult> {
    if (client.personType !== 'PM' || typeof client.caseId !== 'string') {
      return this.build('PASS', 'INFO', emptyGates(), []);
    }

    const mortgageCase = await this.prisma.mortgageCase.findUnique({
      where: { id: client.caseId },
      select: {
        sharePercentage: true,
        incorporationDate: true,
        estimatedTermMonths: true,
        legalName: true,
        companyRfc: true,
        creditType: { select: { destination: true } },
      },
    });

    const shareFromCase =
      mortgageCase?.sharePercentage == null ? null : Number(mortgageCase.sharePercentage);
    const evaluated = evaluatePmGates(
      collectPmGatesInput(
        {
          asOf: new Date(),
          sharePercentage: Number.isFinite(shareFromCase) ? shareFromCase : null,
          incorporationDate: mortgageCase?.incorporationDate ?? null,
          estimatedTermMonths: mortgageCase?.estimatedTermMonths ?? null,
          destination: mortgageCase?.creditType?.destination ?? null,
          legalName: mortgageCase?.legalName ?? null,
          companyRfc: mortgageCase?.companyRfc ?? null,
        },
        documents as unknown as OwnedDocument[],
      ),
    );

    const outcome = this.outcome(evaluated);
    return this.build(outcome, this.severity(outcome), evaluated, this.alerts(evaluated));
  }

  private outcome(gates: PmGatesResult): AnalysisOutcome {
    if (gates.companyIdentity === 'FAIL' || gates.prohibitedActivity || gates.ageExceeded) {
      return 'FAIL';
    }
    if (gates.banks.every((bank) => bank.status === 'VIABLE')) return 'PASS';
    if (gates.banks.every((bank) => bank.status === 'NOT_VIABLE')) return 'FAIL';
    return 'PARTIAL';
  }

  private severity(outcome: AnalysisOutcome): Severity {
    if (outcome === 'FAIL') return 'ERROR';
    if (outcome === 'PARTIAL') return 'WARNING';
    return 'INFO';
  }

  private alerts(gates: PmGatesResult): RuleAlert[] {
    const alerts: RuleAlert[] = gates.identityLocks.map((lock) => ({
      ruleCode: lock.code,
      severity: 'ERROR' as const,
      field: 'companyIdentity',
      message: lock.message,
    }));
    const seen = new Set<string>();
    for (const bank of gates.banks) {
      for (const lock of bank.locks) {
        if (seen.has(lock.code)) continue;
        seen.add(lock.code);
        alerts.push({
          ruleCode: lock.code,
          severity: lock.code.startsWith('SIN_') ? 'WARNING' : 'ERROR',
          field: bank.bankCode,
          message: lock.message,
        });
      }
    }
    return alerts;
  }

  private build(
    outcome: AnalysisOutcome,
    severity: Severity,
    gates: PmGatesResult,
    alerts: RuleAlert[],
  ): RuleResult {
    return {
      ruleId: this.ruleId,
      outcome,
      severity,
      detail: { sources: ['acta', 'csf-company', 'mortgage-case'], fields: [], pmGates: gates },
      alerts,
    };
  }
}
