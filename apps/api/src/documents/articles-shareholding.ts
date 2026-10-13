export const ARTICLES_DOC_TYPES = [
  'ARTICLES_OF_INCORPORATION',
  'CORPORATE_AMENDMENT',
] as const;

export type ArticlesDocumentType = (typeof ARTICLES_DOC_TYPES)[number];
export type CorporateActKind = 'CONSTITUTIVE' | 'AMENDMENT';
export type CapitalKind = 'FIXED' | 'VARIABLE' | 'UNSPECIFIED';
export type AdministrationType = 'SOLE' | 'BOARD' | 'UNKNOWN';

export interface ShareSeries {
  label: string;
  capitalKind: CapitalKind;
  shareCount: number | null;
}

export interface ShareholderRow {
  name: string;
  series: ShareSeries[];
  nominalValue: number | null;
  totalValue: number | null;
  percentage: number | null;
  relationshipToApplicant: string | null;
}

export interface AdministrationMember {
  name: string;
  role: string | null;
}

export interface PowerGrant {
  holderName: string;
  administration: boolean | null;
  ownership: boolean | null;
  litigation: boolean | null;
  revoked: boolean | null;
}

export interface RegistryInscription {
  folio: string | null;
  date: string | null;
  place: string | null;
}

export interface ArticlesAlert {
  code: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
  field?: string;
}

export interface ArticlesExtractionPayload {
  documentType: ArticlesDocumentType;
  actKind: CorporateActKind;
  legalName: string | null;
  legalForm: string | null;
  rfc: string | null;
  deedNumber: string | null;
  deedDate: string | null;
  notary: string | null;
  incorporationDate: string | null;
  assemblyDate: string | null;
  shareholders: ShareholderRow[];
  applicantShareholderName: string | null;
  applicantSharePercentage: number | null;
  administrationType: AdministrationType;
  administration: AdministrationMember[];
  powers: PowerGrant[];
  registry: RegistryInscription;
  isNonProfit: boolean;
  capTableChanged: boolean | null;
  alerts: ArticlesAlert[];
  extractionTimestamp: string;
}

export interface CorporateActSnapshot {
  documentId: string;
  payload: ArticlesExtractionPayload;
}

export interface VigentShareholding {
  documentId: string | null;
  shareholders: ShareholderRow[];
  applicantSharePercentage: number | null;
  applicantShareholderName: string | null;
  legalName: string | null;
  source: 'AMENDMENT' | 'CONSTITUTIVE' | 'NONE';
  displacedByUnregisteredAmendment: boolean;
}

const NON_PROFIT_PATTERN =
  /sin fines de lucro|asociaci[oó]n civil|asistencia privada|\bI\.?\s*A\.?\s*P\.?\b|\bA\.?\s*C\.?\b/i;

export function actKindForDocumentType(code?: string | null): CorporateActKind | null {
  const normalized = code?.toUpperCase();
  if (normalized === 'ARTICLES_OF_INCORPORATION') return 'CONSTITUTIVE';
  if (normalized === 'CORPORATE_AMENDMENT') return 'AMENDMENT';
  return null;
}

export function isArticlesDocument(code?: string | null): boolean {
  return actKindForDocumentType(code) != null;
}

export function postProcessArticles(
  rawData: Record<string, unknown>,
  options: {
    documentType: ArticlesDocumentType;
    applicantName?: string | null;
    now?: Date;
  },
): ArticlesExtractionPayload {
  const actKind = actKindForDocumentType(options.documentType) ?? 'CONSTITUTIVE';
  const legalName = cleanText(rawData.legalName);
  const legalForm = cleanText(rawData.legalForm);
  const rfc = cleanRfc(rawData.rfc);
  const shareholders = parseShareholders(rawData.shareholders);
  const registry = parseRegistry(rawData.registry);
  const isNonProfit = detectNonProfit(rawData, legalName, legalForm);
  const match = matchApplicant(options.applicantName, shareholders);
  const alerts: ArticlesAlert[] = [];

  if (!rfc) {
    alerts.push({
      code: 'RFC_AUSENTE',
      severity: 'WARNING',
      message: 'El acta no trae RFC. El campo queda vacío.',
      field: 'rfc',
    });
  }

  if (isNonProfit) {
    alerts.push({
      code: 'ASOCIACION_SIN_FINES_DE_LUCRO',
      severity: 'CRITICAL',
      message:
        'Asociación sin fines de lucro. Descarte: este tipo de sociedad no se acepta. La extracción continúa.',
      field: 'legalForm',
    });
  }

  const percentageSum = sumPercentages(shareholders);
  if (percentageSum != null && Math.abs(percentageSum - 100) > 0.6) {
    alerts.push({
      code: 'CUADRO_NO_SUMA_100',
      severity: 'WARNING',
      message: `El cuadro accionario suma ${formatPercent(percentageSum)} en lugar de 100%.`,
      field: 'shareholders',
    });
  }

  const hasCapTable = shareholders.length > 0;
  if (actKind === 'AMENDMENT' && hasCapTable && !registry.date) {
    alerts.push({
      code: 'MODIFICACION_SIN_INSCRIPCION',
      severity: 'WARNING',
      message:
        'La modificación trae cuadro accionario y no trae fecha de inscripción. No sustituye un cuadro que sí esté inscrito.',
      field: 'registry.date',
    });
  }

  if (match.ambiguous) {
    alerts.push({
      code: 'SOLICITANTE_AMBIGUO',
      severity: 'WARNING',
      message: 'Más de un accionista coincide con el nombre del solicitante.',
      field: 'shareholders',
    });
  }

  return {
    documentType: options.documentType,
    actKind,
    legalName,
    legalForm,
    rfc,
    deedNumber: cleanText(rawData.deedNumber),
    deedDate: cleanIsoDate(rawData.deedDate),
    notary: cleanText(rawData.notary),
    incorporationDate: cleanIsoDate(rawData.incorporationDate),
    assemblyDate: cleanIsoDate(rawData.assemblyDate),
    shareholders,
    applicantShareholderName: match.name,
    applicantSharePercentage: match.percentage,
    administrationType: parseAdministrationType(rawData.administrationType),
    administration: parseAdministration(rawData.administration),
    powers: parsePowers(rawData.powers),
    registry,
    isNonProfit,
    capTableChanged:
      actKind === 'AMENDMENT' ? hasCapTable : null,
    alerts,
    extractionTimestamp: (options.now ?? new Date()).toISOString(),
  };
}

export function resolveVigentShareholding(
  acts: CorporateActSnapshot[],
): VigentShareholding {
  const empty: VigentShareholding = {
    documentId: null,
    shareholders: [],
    applicantSharePercentage: null,
    applicantShareholderName: null,
    legalName: null,
    source: 'NONE',
    displacedByUnregisteredAmendment: false,
  };
  const withTable = acts.filter((act) => act.payload.shareholders.length > 0);
  if (withTable.length === 0) return empty;

  const inscribed = withTable.filter((act) => inscriptionTime(act) != null);
  const unregisteredAmendments = withTable.filter(
    (act) =>
      act.payload.actKind === 'AMENDMENT' && inscriptionTime(act) == null,
  );

  const winner = inscribed.length
    ? [...inscribed].sort(compareInscribed)[0]
    : withTable.find((act) => act.payload.actKind === 'CONSTITUTIVE') ??
      [...unregisteredAmendments].sort(compareAssemblyDate)[0];

  if (!winner) return empty;

  return {
    documentId: winner.documentId,
    shareholders: winner.payload.shareholders,
    applicantSharePercentage: winner.payload.applicantSharePercentage,
    applicantShareholderName: winner.payload.applicantShareholderName,
    legalName: winner.payload.legalName,
    source: winner.payload.actKind === 'AMENDMENT' ? 'AMENDMENT' : 'CONSTITUTIVE',
    displacedByUnregisteredAmendment:
      inscribed.length > 0 &&
      unregisteredAmendments.length > 0 &&
      !unregisteredAmendments.some((act) => act.documentId === winner.documentId),
  };
}

function compareInscribed(a: CorporateActSnapshot, b: CorporateActSnapshot): number {
  const timeDelta = (inscriptionTime(b) ?? 0) - (inscriptionTime(a) ?? 0);
  if (timeDelta !== 0) return timeDelta;
  if (a.payload.actKind === b.payload.actKind) return 0;
  return a.payload.actKind === 'AMENDMENT' ? -1 : 1;
}

function compareAssemblyDate(a: CorporateActSnapshot, b: CorporateActSnapshot): number {
  return (dateTime(b.payload.assemblyDate) ?? 0) - (dateTime(a.payload.assemblyDate) ?? 0);
}

function inscriptionTime(act: CorporateActSnapshot): number | null {
  return dateTime(act.payload.registry.date);
}

function dateTime(value: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const time = Date.parse(value.slice(0, 10));
  return Number.isFinite(time) ? time : null;
}

function parseShareholders(value: unknown): ShareholderRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const row = asRecord(entry);
      const name = cleanText(row.name);
      if (!name) return null;
      return {
        name,
        series: parseSeries(row.series),
        nominalValue: asNumber(row.nominalValue),
        totalValue: asNumber(row.totalValue),
        percentage: asNumber(row.percentage),
        relationshipToApplicant: cleanText(row.relationshipToApplicant),
      };
    })
    .filter((row): row is ShareholderRow => row != null);
}

function parseSeries(value: unknown): ShareSeries[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const row = asRecord(entry);
      const label = cleanText(row.label);
      if (!label) return null;
      return {
        label,
        capitalKind: parseCapitalKind(row.capitalKind, label),
        shareCount: asNumber(row.shareCount),
      };
    })
    .filter((row): row is ShareSeries => row != null);
}

function parseCapitalKind(value: unknown, label: string): CapitalKind {
  const explicit = cleanText(value)?.toUpperCase();
  if (explicit === 'FIXED' || explicit === 'VARIABLE' || explicit === 'UNSPECIFIED') {
    return explicit;
  }
  const source = `${explicit ?? ''} ${label}`;
  if (/variable/i.test(source)) return 'VARIABLE';
  if (/fijo/i.test(source)) return 'FIXED';
  return 'UNSPECIFIED';
}

function parseAdministration(value: unknown): AdministrationMember[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const row = asRecord(entry);
      const name = cleanText(row.name);
      if (!name) return null;
      return { name, role: cleanText(row.role) };
    })
    .filter((row): row is AdministrationMember => row != null);
}

function parseAdministrationType(value: unknown): AdministrationType {
  const text = cleanText(value)?.toUpperCase() ?? '';
  if (text === 'SOLE' || /administrador\s+único|administrador unico/i.test(text)) {
    return 'SOLE';
  }
  if (text === 'BOARD' || /consejo/i.test(text)) return 'BOARD';
  return 'UNKNOWN';
}

function parsePowers(value: unknown): PowerGrant[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const row = asRecord(entry);
      const holderName = cleanText(row.holderName);
      if (!holderName) return null;
      return {
        holderName,
        administration: asBoolean(row.administration),
        ownership: asBoolean(row.ownership),
        litigation: asBoolean(row.litigation),
        revoked: asBoolean(row.revoked),
      };
    })
    .filter((row): row is PowerGrant => row != null);
}

function parseRegistry(value: unknown): RegistryInscription {
  const row = asRecord(value);
  return {
    folio: cleanText(row.folio),
    date: cleanIsoDate(row.date),
    place: cleanText(row.place),
  };
}

function detectNonProfit(
  raw: Record<string, unknown>,
  legalName: string | null,
  legalForm: string | null,
): boolean {
  if (raw.isNonProfit === true) return true;
  const blob = [legalName, legalForm, cleanText(raw.companyPurpose)]
    .filter(Boolean)
    .join(' ');
  return NON_PROFIT_PATTERN.test(blob);
}

function matchApplicant(
  applicantName: string | null | undefined,
  shareholders: ShareholderRow[],
): { name: string | null; percentage: number | null; ambiguous: boolean } {
  const applicantTokens = tokenize(applicantName);
  if (applicantTokens.length < 2) {
    return { name: null, percentage: null, ambiguous: false };
  }
  const matches = shareholders.filter((row) => {
    const tokens = new Set(tokenize(row.name));
    return applicantTokens.every((token) => tokens.has(token));
  });
  if (matches.length !== 1) {
    return { name: null, percentage: null, ambiguous: matches.length > 1 };
  }
  return {
    name: matches[0].name,
    percentage: matches[0].percentage,
    ambiguous: false,
  };
}

function sumPercentages(shareholders: ShareholderRow[]): number | null {
  if (shareholders.length === 0) return null;
  if (shareholders.some((row) => row.percentage == null)) return null;
  return shareholders.reduce((sum, row) => sum + (row.percentage ?? 0), 0);
}

function formatPercent(value: number): string {
  return `${Number(value.toFixed(2))}%`;
}

function tokenize(value: string | null | undefined): string[] {
  return normalizeName(value).split(' ').filter(Boolean);
}

function normalizeName(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/Ñ/g, 'N')
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  return text === '' ? null : text;
}

function cleanRfc(value: unknown): string | null {
  const text = cleanText(value);
  if (!text) return null;
  const rfc = text.toUpperCase().replace(/[^A-Z0-9&Ñ]/g, '');
  return rfc === '' ? null : rfc;
}

function cleanIsoDate(value: unknown): string | null {
  const text = cleanText(value);
  if (!text) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace('%', '').replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
