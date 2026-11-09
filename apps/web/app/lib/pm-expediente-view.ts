import { resolveVigentArticles, type ArticlesDocumentView } from "./articles-view";

export type FinancialPanel = "pm" | "pfae" | "salaried";
export type ComparisonSummaryKind = "payroll" | "business";
export type IdentityStatus = "MATCH" | "MISMATCH" | "INCOMPLETE";

export interface CompanyDoc {
  owner?: string | null;
  documentType?: { code?: string | null } | null;
  extractedData?: unknown;
}

export interface CompanyIdentityView {
  legalName: {
    csf: string | null;
    bureau: string | null;
    acta: string | null;
    statements: string | null;
  };
  rfc: {
    csf: string | null;
    bureau: string | null;
    acta: string | null;
    statements: string | null;
  };
  nameStatus: IdentityStatus;
  rfcStatus: IdentityStatus;
}

export interface PmActaHeadline {
  shareLabel: string;
  incorporationLabel: string;
  entryLabel: string;
  deedLabel: string;
  sharePercentage: number | null;
  note: string;
}

export interface PmDetailInput {
  bankCode: string;
  incomeSource: string | null;
  appliedFactor: string | null;
  debtCommitmentFactor: string | null;
  sharePercentage: number | null;
  matchedNativeLabel: string | null;
}

const SHAREHOLDER_COLUMNS = [
  "official-id",
  "bank-statement",
  "credit-bureau",
  "client",
] as const;

const PFAE_COLUMNS = [
  "csf",
  "tax-return",
  "official-id",
  "bank-statement",
  "credit-bureau",
  "client",
] as const;

const SALARIED_COLUMNS = [
  "payroll",
  "official-id",
  "bank-statement",
  "credit-bureau",
  "client",
] as const;

export function financialPanel(personType?: string | null): FinancialPanel {
  if (personType === "PM") return "pm";
  if (personType === "PFAE") return "pfae";
  return "salaried";
}

/** Persona moral used to hide this tab. Every profile now shows the saved comparison. */
export function showsBankComparison(_personType?: string | null): boolean {
  return true;
}

export function identityHeading(personType?: string | null): string {
  return personType === "PM" ? "Identidad del socio" : "Validación de identidad";
}

export function identityColumnKeys(personType?: string | null): readonly string[] {
  if (personType === "PM") return SHAREHOLDER_COLUMNS;
  if (personType === "PFAE") return PFAE_COLUMNS;
  return SALARIED_COLUMNS;
}

export function comparisonSummaryKind(
  personType?: string | null,
): ComparisonSummaryKind {
  return personType === "PM" || personType === "PFAE" ? "business" : "payroll";
}

export function companyIdentity(documents: CompanyDoc[]): CompanyIdentityView {
  const names = {
    csf: firstText(companyDocs(documents, "CSF"), (data) => text(record(data.taxpayer).fullName)),
    bureau: firstText(companyDocs(documents, "CREDIT_BUREAU_REPORT"), (data) =>
      text(record(data.borrower).fullName),
    ),
    acta: firstText(articleDocs(documents), (data) => text(data.legalName)),
    statements: firstText(companyDocs(documents, "BANK_STATEMENT"), (data) =>
      text(record(data.accountHolder).fullName),
    ),
  };
  const rfcs = {
    csf: firstText(companyDocs(documents, "CSF"), (data) => text(record(data.taxpayer).rfc)),
    bureau: firstText(companyDocs(documents, "CREDIT_BUREAU_REPORT"), (data) =>
      text(record(data.borrower).rfc),
    ),
    acta: firstText(articleDocs(documents), (data) => text(data.rfc)),
    statements: firstText(companyDocs(documents, "BANK_STATEMENT"), (data) =>
      text(record(data.accountHolder).rfc),
    ),
  };

  return {
    legalName: names,
    rfc: rfcs,
    nameStatus: statusOf(Object.values(names), normalizeName),
    rfcStatus: statusOf(Object.values(rfcs), normalizeRfc),
  };
}

export function pmActaHeadline(documents: ArticlesDocumentView[]): PmActaHeadline {
  const vigent = resolveVigentArticles(documents);
  if (vigent.documentId == null) {
    return {
      shareLabel: "Sin porcentaje",
      incorporationLabel: "Sin fecha",
      entryLabel: "Sin fecha",
      deedLabel: "Sin escritura",
      sharePercentage: null,
      note: "Falta el acta con cuadro accionario.",
    };
  }

  const winner = documents.find((doc) => doc.documentId === vigent.documentId) ?? null;
  const constitutive = documents.find((doc) => doc.actKind === "CONSTITUTIVE") ?? winner;

  return {
    shareLabel: shareLabel(vigent.applicantSharePercentage),
    incorporationLabel: yearLabel(constitutive?.incorporationDate ?? null),
    entryLabel: yearLabel(vigent.applicantShareEntryDate),
    deedLabel: winner?.deedNumber ?? "Sin escritura",
    sharePercentage: vigent.applicantSharePercentage,
    note: "El porcentaje de la comparativa sale de esta acta.",
  };
}

export function pmBaseSelectable(base: {
  valid: boolean;
  invalidReason: string | null;
}): boolean {
  return base.valid && base.invalidReason !== "TAX_LOSS";
}

export function pmBankWindowCopy(bank: {
  windowMonths: number;
  monthsUsed: string[];
  statementNotice?: string | null;
}): string {
  if (bank.statementNotice && bank.monthsUsed.length < bank.windowMonths) {
    return `Promedio de los ${bank.monthsUsed.length} meses que hay. El giro pide ${bank.windowMonths}.`;
  }
  return `Promedio de ${bank.windowMonths} meses de depósitos`;
}

export function pmDetailCopy(input: PmDetailInput): string[] {
  const share = shareLabel(input.sharePercentage);
  const factor = factorLabel(input.appliedFactor);
  const ce = ceLabel(input.debtCommitmentFactor);
  const source =
    input.incomeSource === "TAX_RETURN"
      ? "Declaración de la empresa"
      : "Estados de la empresa";

  if (input.bankCode === "SCOTIABANK") {
    return [
      "Scotiabank usa los estados de la empresa, aunque la base enviada sea la declaración.",
      `Estados × ${share} × 0.40.`,
      "No resta la deuda de la empresa.",
    ];
  }

  if (input.bankCode === "BANORTE" && input.incomeSource === "TAX_RETURN") {
    return [
      `Utilidad fiscal / 12 × 0.85 × ${share}.`,
      "Este camino no resta pasivos.",
    ];
  }

  if (input.bankCode === "BANORTE") {
    const client =
      input.appliedFactor === "0.50"
        ? "La casilla de cliente Banorte está marcada."
        : "La casilla de cliente Banorte no está marcada.";
    return [
      `Promedio de los últimos 6 meses × ${factor} × ${share} × CE ${ce}.`,
      client,
      "Resta la deuda de la empresa y, al final, la del socio.",
    ];
  }

  if (input.bankCode === "HSBC") {
    return [
      `${source} × ${factor} × ${share} × CE ${ce}.`,
      "Resta solo la deuda del socio.",
    ];
  }

  if (input.bankCode === "BANREGIO") {
    return [
      "Últimos 3 meses × 100% × 50%.",
      "Resta la deuda de la empresa y la del socio.",
    ];
  }

  if (input.bankCode === "SANTANDER") {
    return [
      `${source} × ${factor} × ${share} × CE ${ce}.`,
      "Resta la deuda de la empresa antes del CE y la del socio al final.",
    ];
  }

  return ["Este banco no tiene una fórmula cerrada de persona moral en la comparativa."];
}

function shareLabel(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "Sin porcentaje";
  return `${value}%`;
}

function yearLabel(iso: string | null): string {
  const match = /^(\d{4})-/.exec(iso ?? "");
  return match ? match[1] : "Sin fecha";
}

function factorLabel(value: string | null): string {
  if (value == null) return "sin factor";
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(2) : value;
}

function ceLabel(value: string | null): string {
  if (value == null) return "—";
  const num = Number(value);
  if (!Number.isFinite(num)) return value;
  return `${(num * 100).toFixed(0)}%`;
}

function companyDocs(documents: CompanyDoc[], code: string): CompanyDoc[] {
  return documents.filter(
    (doc) => doc.owner === "COMPANY" && doc.documentType?.code === code,
  );
}

function articleDocs(documents: CompanyDoc[]): CompanyDoc[] {
  return documents.filter((doc) => {
    const code = doc.documentType?.code;
    const extracted = text(record(doc.extractedData).documentType);
    return (
      code === "ARTICLES_OF_INCORPORATION" ||
      code === "CORPORATE_AMENDMENT" ||
      extracted === "ARTICLES_OF_INCORPORATION" ||
      extracted === "CORPORATE_AMENDMENT"
    );
  });
}

function firstText(
  documents: CompanyDoc[],
  read: (data: Record<string, unknown>) => string | null,
): string | null {
  for (const doc of documents) {
    const value = read(record(doc.extractedData));
    if (value) return value;
  }
  return null;
}

function statusOf(
  values: Array<string | null>,
  normalize: (value: string) => string,
): IdentityStatus {
  const present = values
    .filter((value): value is string => Boolean(value))
    .map(normalize)
    .filter((value) => value !== "");
  const distinct = [...new Set(present)];
  if (distinct.length === 0) return "INCOMPLETE";
  if (distinct.length === 1) return "MATCH";
  return "MISMATCH";
}

function normalizeName(value: string): string {
  const folded = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const suffixes = [
    "S A P I DE C V",
    "SAPI DE CV",
    "S DE R L DE C V",
    "S DE RL DE CV",
    "S A DE C V",
    "SA DE CV",
  ];
  for (const suffix of suffixes) {
    if (folded.endsWith(` ${suffix}`)) return folded.slice(0, -suffix.length).trim();
  }
  return folded;
}

function normalizeRfc(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9&Ñ]/g, "");
}

function record(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}
