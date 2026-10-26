import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  resolveApplicantShareEntry,
  resolveVigentShareholding,
  type CorporateActSnapshot,
} from '../../documents/articles-shareholding';
import type {
  AnalysisRule,
  RuleAlert,
  RuleResult,
  Severity,
} from '../analysis-rule.interface';
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

    const docs = documents as unknown as OwnedDocument[];
    const acts = this.corporateActs(docs);
    const vigent = resolveVigentShareholding(acts);
    const entry = resolveApplicantShareEntry(acts);
    const shareFromActa = vigent.applicantSharePercentage;
    const shareFromCase =
      mortgageCase?.sharePercentage == null ? null : Number(mortgageCase.sharePercentage);
    const incorporation =
      this.constitutiveDate(acts) ?? this.isoDate(mortgageCase?.incorporationDate);

    const evaluated = evaluatePmGates({
      asOf: new Date(),
      sharePercentage: shareFromActa ?? (Number.isFinite(shareFromCase) ? shareFromCase : null),
      incorporationDate: incorporation,
      shareEntryDate: entry.entryDate,
      birthDate: this.birthDate(docs),
      termMonths: mortgageCase?.estimatedTermMonths ?? null,
      destination: mortgageCase?.creditType?.destination ?? null,
      companyBureauPresent: docs.some(
        (doc) =>
          doc.documentType?.code === 'CREDIT_BUREAU_REPORT' && doc.owner === 'COMPANY',
      ),
      companyActivity: this.companyActivity(docs),
      shareholders: vigent.shareholders.map((row) => ({
        name: row.name,
        percentage: row.percentage,
        relationshipToApplicant: row.relationshipToApplicant,
      })),
      companyNames: this.companyNames(docs, mortgageCase?.legalName ?? null),
      companyRfcs: this.companyRfcs(docs, mortgageCase?.companyRfc ?? null),
    });

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

  private corporateActs(docs: OwnedDocument[]): CorporateActSnapshot[] {
    return docs.flatMap((doc, index) => {
      const data = this.record(doc.extractedData);
      const documentType = data.documentType;
      if (
        (documentType !== 'ARTICLES_OF_INCORPORATION' && documentType !== 'CORPORATE_AMENDMENT') ||
        !Array.isArray(data.shareholders)
      ) {
        return [];
      }
      return [{
        documentId: `act-${index}`,
        payload: data as unknown as CorporateActSnapshot['payload'],
      }];
    });
  }

  private constitutiveDate(acts: CorporateActSnapshot[]): string | null {
    const dates = acts
      .filter((act) => act.payload.actKind === 'CONSTITUTIVE')
      .map((act) => act.payload.incorporationDate ?? act.payload.deedDate)
      .filter((date): date is string => Boolean(date));
    return dates.sort()[0] ?? null;
  }

  private birthDate(docs: OwnedDocument[]): string | null {
    for (const doc of docs) {
      const data = this.record(doc.extractedData);
      const identity = this.record(data.identity);
      if (typeof identity.birthDate === 'string') return identity.birthDate;
    }
    return null;
  }

  private companyActivity(docs: OwnedDocument[]): string | null {
    const csf = docs.find(
      (doc) => doc.documentType?.code === 'CSF' && doc.owner === 'COMPANY',
    );
    const activities = this.record(csf?.extractedData).activities;
    if (!Array.isArray(activities)) return null;
    const descriptions = activities
      .map((item) => this.record(item).description)
      .filter((value): value is string => typeof value === 'string' && value.trim() !== '');
    return descriptions[0] ?? null;
  }

  private companyNames(docs: OwnedDocument[], caseName: string | null): string[] {
    const names = [caseName];
    for (const doc of docs) {
      const data = this.record(doc.extractedData);
      if (data.documentType === 'ARTICLES_OF_INCORPORATION' || data.documentType === 'CORPORATE_AMENDMENT') {
        names.push(typeof data.legalName === 'string' ? data.legalName : null);
      }
      if (doc.documentType?.code === 'CSF' && doc.owner === 'COMPANY') {
        names.push(this.text(this.record(data.taxpayer).fullName));
      }
      if (doc.documentType?.code === 'TAX_RETURN' && doc.owner === 'COMPANY') {
        names.push(this.text(data.taxpayerName));
      }
    }
    return names.filter((name): name is string => Boolean(name));
  }

  private companyRfcs(docs: OwnedDocument[], caseRfc: string | null): string[] {
    const rfcs = [caseRfc];
    for (const doc of docs) {
      const data = this.record(doc.extractedData);
      if (data.documentType === 'ARTICLES_OF_INCORPORATION' || data.documentType === 'CORPORATE_AMENDMENT') {
        rfcs.push(this.text(data.rfc));
      }
      if (doc.documentType?.code === 'CSF' && doc.owner === 'COMPANY') {
        rfcs.push(this.text(this.record(data.taxpayer).rfc));
      }
      if (doc.documentType?.code === 'TAX_RETURN' && doc.owner === 'COMPANY') {
        rfcs.push(this.text(data.rfc));
      }
    }
    return rfcs.filter((rfc): rfc is string => Boolean(rfc));
  }

  private isoDate(value: Date | null | undefined): string | null {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${value.getUTCFullYear()}-${month}-${day}`;
  }

  private record(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return {};
  }

  private text(value: unknown): string | null {
    return typeof value === 'string' && value.trim() !== '' ? value : null;
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
