import type { Document } from "@/app/lib/definitions";
import { filterAlerts, type ExtractionAlert } from "@/app/lib/extraction";

export interface ArticlesShareholderView {
  name: string;
  seriesLabel: string;
  nominalValue: number | null;
  totalValue: number | null;
  percentage: number | null;
  relationshipToApplicant: string | null;
  entryDate: string | null;
}

export interface ArticlesPowerView {
  holderName: string;
  faculties: string;
  revoked: boolean;
}

export interface ArticlesDocumentView {
  documentId: string;
  originalName: string;
  actKind: "CONSTITUTIVE" | "AMENDMENT";
  title: string;
  legalName: string | null;
  legalForm: string | null;
  rfc: string | null;
  deedNumber: string | null;
  deedDate: string | null;
  notary: string | null;
  incorporationDate: string | null;
  assemblyDate: string | null;
  administrationLabel: string | null;
  shareholders: ArticlesShareholderView[];
  applicantShareholderName: string | null;
  applicantSharePercentage: number | null;
  powers: ArticlesPowerView[];
  registryFolio: string | null;
  registryDate: string | null;
  registryPlace: string | null;
  isNonProfit: boolean;
  alerts: ExtractionAlert[];
}

export type ShareEntrySource = "CONSTITUTIVE" | "EXPLICIT" | "ADMISSION" | "UNKNOWN";

export interface VigentArticlesView {
  documentId: string | null;
  applicantSharePercentage: number | null;
  applicantShareholderName: string | null;
  applicantShareEntryDate: string | null;
  applicantShareEntrySource: ShareEntrySource;
  legalName: string | null;
  sourceLabel: string | null;
  displacedByUnregisteredAmendment: boolean;
}

export function parseArticlesDocument(doc: Document): ArticlesDocumentView | null {
  const data = doc.extractedData;
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (record.documentType !== "ARTICLES_OF_INCORPORATION" && record.documentType !== "CORPORATE_AMENDMENT") {
    return null;
  }

  const actKind = record.actKind === "AMENDMENT" ? "AMENDMENT" : "CONSTITUTIVE";
  const registry = asRecord(record.registry);
  const administration = Array.isArray(record.administration) ? record.administration : [];
  const administrationNames = administration
    .map((member) => {
      const row = asRecord(member);
      const name = asText(row.name);
      const role = asText(row.role);
      if (!name) return null;
      return role ? `${name} (${role})` : name;
    })
    .filter((value): value is string => value != null);

  return {
    documentId: doc.id,
    originalName: doc.originalName,
    actKind,
    title: actKind === "AMENDMENT" ? "Modificación de poderes / asamblea" : "Acta constitutiva",
    legalName: asText(record.legalName),
    legalForm: asText(record.legalForm),
    rfc: asText(record.rfc),
    deedNumber: asText(record.deedNumber),
    deedDate: asText(record.deedDate),
    notary: asText(record.notary),
    incorporationDate: asText(record.incorporationDate),
    assemblyDate: asText(record.assemblyDate),
    administrationLabel: administrationNames.join(", ") || null,
    shareholders: parseShareholders(record.shareholders),
    applicantShareholderName: asText(record.applicantShareholderName),
    applicantSharePercentage: asNumber(record.applicantSharePercentage),
    powers: parsePowers(record.powers),
    registryFolio: asText(registry.folio),
    registryDate: asText(registry.date),
    registryPlace: asText(registry.place),
    isNonProfit: record.isNonProfit === true,
    alerts: filterAlerts(record.alerts),
  };
}

export function resolveVigentArticles(documents: ArticlesDocumentView[]): VigentArticlesView {
  const withTable = documents.filter((doc) => doc.shareholders.length > 0);
  const inscribed = withTable.filter((doc) => isIsoDate(doc.registryDate));
  const unregisteredAmendments = withTable.filter(
    (doc) => doc.actKind === "AMENDMENT" && !isIsoDate(doc.registryDate),
  );
  const winner = inscribed.length
    ? [...inscribed].sort(byInscriptionDesc)[0]
    : withTable.find((doc) => doc.actKind === "CONSTITUTIVE") ??
      [...unregisteredAmendments].sort(byAssemblyDesc)[0];

  const entry = resolveApplicantShareEntry(documents);

  if (!winner) {
    return {
      documentId: null,
      applicantSharePercentage: null,
      applicantShareholderName: null,
      applicantShareEntryDate: entry.entryDate,
      applicantShareEntrySource: entry.source,
      legalName: null,
      sourceLabel: null,
      displacedByUnregisteredAmendment: false,
    };
  }

  return {
    documentId: winner.documentId,
    applicantSharePercentage: winner.applicantSharePercentage,
    applicantShareholderName: winner.applicantShareholderName,
    applicantShareEntryDate: entry.entryDate,
    applicantShareEntrySource: entry.source,
    legalName: winner.legalName,
    sourceLabel: winner.title,
    displacedByUnregisteredAmendment:
      inscribed.length > 0 &&
      unregisteredAmendments.some((doc) => doc.documentId !== winner.documentId),
  };
}

function resolveApplicantShareEntry(documents: ArticlesDocumentView[]): {
  entryDate: string | null;
  source: ShareEntrySource;
} {
  const present = documents.filter(
    (doc) => doc.applicantShareholderName != null && doc.shareholders.length > 0,
  );
  const constitutiveDates = present
    .filter((doc) => doc.actKind === "CONSTITUTIVE")
    .map(actDate)
    .filter((date): date is string => date != null);
  if (constitutiveDates.length > 0) {
    return { entryDate: earliestDate(constitutiveDates), source: "CONSTITUTIVE" };
  }

  const explicitDates = present
    .map(explicitEntryDate)
    .filter((date): date is string => date != null);
  if (explicitDates.length > 0) {
    return { entryDate: earliestDate(explicitDates), source: "EXPLICIT" };
  }

  const constitutiveTables = documents.filter(
    (doc) => doc.actKind === "CONSTITUTIVE" && doc.shareholders.length > 0,
  );
  const absentFromConstitutive =
    constitutiveTables.length > 0 &&
    constitutiveTables.every((doc) => doc.applicantShareholderName == null);
  if (absentFromConstitutive) {
    const admissionDates = present
      .filter((doc) => doc.actKind === "AMENDMENT")
      .map(actDate)
      .filter((date): date is string => date != null);
    if (admissionDates.length > 0) {
      return { entryDate: earliestDate(admissionDates), source: "ADMISSION" };
    }
  }

  return { entryDate: null, source: "UNKNOWN" };
}

function actDate(doc: ArticlesDocumentView): string | null {
  if (doc.actKind === "CONSTITUTIVE") return doc.incorporationDate ?? doc.deedDate;
  return doc.assemblyDate ?? doc.deedDate;
}

function explicitEntryDate(doc: ArticlesDocumentView): string | null {
  if (doc.actKind === "CONSTITUTIVE" || !doc.applicantShareholderName) return null;
  const row = doc.shareholders.find((shareholder) => shareholder.name === doc.applicantShareholderName);
  return row?.entryDate ?? null;
}

function earliestDate(dates: string[]): string {
  return [...dates].sort()[0];
}

export function completedShareTenureMonths(entryDate: string, asOf: Date): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(entryDate);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  let months = (asOf.getFullYear() - year) * 12 + (asOf.getMonth() + 1 - month);
  if (asOf.getDate() < day) months -= 1;
  return Math.max(0, months);
}

export function formatShareTenure(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const yearLabel = years === 1 ? "1 año" : years > 1 ? `${years} años` : null;
  const monthLabel = rest === 1 ? "1 mes" : rest > 1 ? `${rest} meses` : null;
  if (yearLabel && monthLabel) return `${yearLabel} y ${monthLabel}`;
  return yearLabel ?? monthLabel ?? "menos de 1 mes";
}

function byInscriptionDesc(a: ArticlesDocumentView, b: ArticlesDocumentView): number {
  const delta = dateValue(b.registryDate) - dateValue(a.registryDate);
  if (delta !== 0) return delta;
  if (a.actKind === b.actKind) return 0;
  return a.actKind === "AMENDMENT" ? -1 : 1;
}

function byAssemblyDesc(a: ArticlesDocumentView, b: ArticlesDocumentView): number {
  return dateValue(b.assemblyDate) - dateValue(a.assemblyDate);
}

function parseShareholders(value: unknown): ArticlesShareholderView[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const row = asRecord(entry);
    const name = asText(row.name);
    if (!name) return [];
    const series = Array.isArray(row.series) ? row.series : [];
    const seriesLabel = series
      .map((item) => {
        const seriesRow = asRecord(item);
        const label = asText(seriesRow.label);
        const count = asNumber(seriesRow.shareCount);
        if (!label) return null;
        return count == null ? label : `${label}: ${count}`;
      })
      .filter((item): item is string => item != null)
      .join(" · ");
    return [{
      name,
      seriesLabel,
      nominalValue: asNumber(row.nominalValue),
      totalValue: asNumber(row.totalValue),
      percentage: asNumber(row.percentage),
      relationshipToApplicant: asText(row.relationshipToApplicant),
      entryDate: asText(row.entryDate),
    }];
  });
}

function parsePowers(value: unknown): ArticlesPowerView[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const row = asRecord(entry);
    const holderName = asText(row.holderName);
    if (!holderName) return [];
    const faculties = [
      row.administration === true ? "administración" : null,
      row.ownership === true ? "dominio" : null,
      row.litigation === true ? "pleitos y cobranzas" : null,
    ].filter((item): item is string => item != null);
    return [{
      holderName,
      faculties: faculties.join(", ") || "Sin facultades identificadas",
      revoked: row.revoked === true,
    }];
  });
}

function isIsoDate(value: string | null): boolean {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}/.test(value));
}

function dateValue(value: string | null): number {
  if (!isIsoDate(value) || !value) return 0;
  const time = Date.parse(value.slice(0, 10));
  return Number.isFinite(time) ? time : 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text === "" ? null : text;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
