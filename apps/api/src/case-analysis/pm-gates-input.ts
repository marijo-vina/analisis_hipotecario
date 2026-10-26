import {
  completedShareTenureMonths,
  resolveApplicantShareEntry,
  resolveVigentShareholding,
  type CorporateActSnapshot,
} from '../documents/articles-shareholding';
import type { PmGatesInput } from './pm-gates';

export interface OwnedPmDocument {
  owner?: string | null;
  extractedData?: unknown;
  documentType?: { code?: string | null } | null;
}

export interface PmCaseFacts {
  asOf: Date;
  sharePercentage: number | null;
  incorporationDate: Date | null;
  estimatedTermMonths: number | null;
  destination: string | null;
  legalName: string | null;
  companyRfc: string | null;
}

export function collectPmGatesInput(
  facts: PmCaseFacts,
  documents: OwnedPmDocument[],
): PmGatesInput {
  const acts = corporateActs(documents);
  const vigent = resolveVigentShareholding(acts);
  const shareFromCase = Number.isFinite(facts.sharePercentage ?? NaN)
    ? facts.sharePercentage
    : null;
  const incorporation = constitutiveDate(acts) ?? isoDate(facts.incorporationDate);
  return {
    asOf: facts.asOf,
    sharePercentage: vigent.applicantSharePercentage ?? shareFromCase,
    incorporationDate: incorporation,
    shareEntryDate: resolveApplicantShareEntry(acts).entryDate,
    birthDate: birthDate(documents),
    termMonths: facts.estimatedTermMonths,
    destination: facts.destination,
    companyBureauPresent: documents.some(
      (doc) => doc.documentType?.code === 'CREDIT_BUREAU_REPORT' && doc.owner === 'COMPANY',
    ),
    companyActivity: companyActivity(documents),
    shareholders: vigent.shareholders.map((row) => ({
      name: row.name,
      percentage: row.percentage,
      relationshipToApplicant: row.relationshipToApplicant,
    })),
    companyNames: companyNames(documents, facts.legalName),
    companyRfcs: companyRfcs(documents, facts.companyRfc),
  };
}

export function companyLegalForm(documents: OwnedPmDocument[]): string | null {
  const acts = corporateActs(documents);
  const constitutive = acts.find((act) => act.payload.actKind === 'CONSTITUTIVE');
  return constitutive?.payload.legalForm ?? acts[0]?.payload.legalForm ?? null;
}

export function companyTenureMonths(
  incorporationDate: string | null,
  asOf: Date,
): number | null {
  if (incorporationDate == null) return null;
  return completedShareTenureMonths(incorporationDate, asOf);
}

function corporateActs(docs: OwnedPmDocument[]): CorporateActSnapshot[] {
  return docs.flatMap((doc, index) => {
    const data = record(doc.extractedData);
    const documentType = data.documentType;
    if (
      (documentType !== 'ARTICLES_OF_INCORPORATION' &&
        documentType !== 'CORPORATE_AMENDMENT') ||
      !Array.isArray(data.shareholders)
    ) {
      return [];
    }
    return [
      {
        documentId: `act-${index}`,
        payload: data as unknown as CorporateActSnapshot['payload'],
      },
    ];
  });
}

function constitutiveDate(acts: CorporateActSnapshot[]): string | null {
  const dates = acts
    .filter((act) => act.payload.actKind === 'CONSTITUTIVE')
    .map((act) => act.payload.incorporationDate ?? act.payload.deedDate)
    .filter((date): date is string => Boolean(date));
  return dates.sort()[0] ?? null;
}

function birthDate(docs: OwnedPmDocument[]): string | null {
  for (const doc of docs) {
    const data = record(doc.extractedData);
    const identity = record(data.identity);
    if (typeof identity.birthDate === 'string') return identity.birthDate;
  }
  return null;
}

function companyActivity(docs: OwnedPmDocument[]): string | null {
  const csf = docs.find(
    (doc) => doc.documentType?.code === 'CSF' && doc.owner === 'COMPANY',
  );
  const activities = record(csf?.extractedData).activities;
  if (!Array.isArray(activities)) return null;
  const descriptions = activities
    .map((item) => record(item).description)
    .filter((value): value is string => typeof value === 'string' && value.trim() !== '');
  return descriptions[0] ?? null;
}

function companyNames(docs: OwnedPmDocument[], caseName: string | null): string[] {
  const names = [caseName];
  for (const doc of docs) {
    const data = record(doc.extractedData);
    if (
      data.documentType === 'ARTICLES_OF_INCORPORATION' ||
      data.documentType === 'CORPORATE_AMENDMENT'
    ) {
      names.push(typeof data.legalName === 'string' ? data.legalName : null);
    }
    if (doc.documentType?.code === 'CSF' && doc.owner === 'COMPANY') {
      names.push(text(record(data.taxpayer).fullName));
    }
    if (doc.documentType?.code === 'TAX_RETURN' && doc.owner === 'COMPANY') {
      names.push(text(data.taxpayerName));
    }
  }
  return names.filter((name): name is string => Boolean(name));
}

function companyRfcs(docs: OwnedPmDocument[], caseRfc: string | null): string[] {
  const rfcs = [caseRfc];
  for (const doc of docs) {
    const data = record(doc.extractedData);
    if (
      data.documentType === 'ARTICLES_OF_INCORPORATION' ||
      data.documentType === 'CORPORATE_AMENDMENT'
    ) {
      rfcs.push(text(data.rfc));
    }
    if (doc.documentType?.code === 'CSF' && doc.owner === 'COMPANY') {
      rfcs.push(text(record(data.taxpayer).rfc));
    }
    if (doc.documentType?.code === 'TAX_RETURN' && doc.owner === 'COMPANY') {
      rfcs.push(text(data.rfc));
    }
  }
  return rfcs.filter((rfc): rfc is string => Boolean(rfc));
}

function isoDate(value: Date | null | undefined): string | null {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${value.getUTCFullYear()}-${month}-${day}`;
}

function record(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}
