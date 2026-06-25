// ---------------------------------------------------------------------------
// Extraction UI helpers — pure functions shared by the extraction components.
// No persistence, no API calls. Just parsing + formatting of extractedData.
// ---------------------------------------------------------------------------

import type { Document } from "@/app/lib/definitions";

// ── Correction source states -----------------------------------------------
export type CorrectionSource = "AI" | "PENDING" | "MANUAL";

// ── Alert model -------------------------------------------------------------
export interface ExtractionAlert {
  code: string;
  severity: "WARNING" | "CRITICAL" | "INFO";
  message: string;
}

export type ExtractionCategory = "identidad" | "nomina" | "estados" | "buro";

export const CATEGORY_LABELS: Record<ExtractionCategory, string> = {
  identidad: "Identidad",
  nomina: "Nomina",
  estados: "Estados de cuenta",
  buro: "Buro",
};

/**
 * Maps a document type code to its extraction category.
 * Unknown types default to null (rendered nowhere).
 */
export function docCategory(
  docTypeCode: string,
): ExtractionCategory | null {
  switch (docTypeCode) {
    case "INE":
    case "PASSPORT":
      return "identidad";
    case "PAYROLL_RECEIPT":
      return "nomina";
    case "BANK_STATEMENT":
      return "estados";
    case "CREDIT_BUREAU":
      return "buro";
    default:
      return null;
  }
}

/**
 * Converts an ISO `YYYY-MM-DD` date to the Mexican display format `DD-MM-YYYY`.
 * Non-matching strings pass through unchanged.
 */
export function formatDateDisplay(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/**
 * Filters + deduplicates raw alerts from `extractedData.alerts`:
 *  - only WARNING and CRITICAL severities (INFO is hidden per SPEC-9)
 *  - non-empty message
 *  - deduped by `code`
 *  - excludes `INE_MANUAL_VALIDATION_REQUIRED` (shown in its own card)
 */
export function filterAlerts(
  raw: unknown,
): ExtractionAlert[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ExtractionAlert[] = [];
  for (const entry of raw as Array<Record<string, unknown>>) {
    const msg = entry.message;
    if (!msg || String(msg).trim() === "") continue;

    const severityRaw = String(entry.severity ?? "").toUpperCase();
    if (severityRaw !== "WARNING" && severityRaw !== "CRITICAL") continue;

    const code = String(entry.code ?? "");
    if (code === "INE_MANUAL_VALIDATION_REQUIRED") continue;
    if (code && seen.has(code)) continue;
    if (code) seen.add(code);

    out.push({
      code,
      severity: severityRaw as "WARNING" | "CRITICAL",
      message: String(msg),
    });
  }
  return out;
}

// ── Identity extraction parsing --------------------------------------------

export interface IdentityFieldDef {
  label: string;
  value?: string;
  /** when true, field renders as Pendiente with a Completar button */
  missing?: boolean;
}

export interface ParsedIdentity {
  idType: string | undefined;
  fields: IdentityFieldDef[];
  isExpired: boolean;
  ineValidation: {
    cic: string | undefined;
    citizenIdentifier: string | undefined;
  } | null;
  alerts: ExtractionAlert[];
}

/**
 * Parses the `extractedData` of an INE/PASSPORT document into a structured
 * `ParsedIdentity` ready to feed the IdentidadTab components.
 *
 * Returns `null` when there is no usable extractedData.
 */
export function parseIdentity(doc: Document): ParsedIdentity | null {
  const ed = doc.extractedData;
  if (!ed || typeof ed !== "object") return null;

  const data = ed as Record<string, unknown>;
  const identity = (data.identity as Record<string, unknown>) ?? {};
  const ivRaw = data.ineValidation as Record<string, unknown> | undefined;

  const alerts = filterAlerts(data.alerts);

  // ── Expiration: multi-field fallback (mirrors old getExtraction) ──────
  const expirationCandidates = [
    identity.visibleExpirationDate,
    identity.expirationDate,
    identity.validUntil,
    identity.vigencia,
    identity.vigenciaVisible,
    identity.printedValidity,
    identity.documentValidity,
  ];
  let expirationDate: string | undefined;
  for (const cand of expirationCandidates) {
    if (cand && typeof cand === "string" && cand.trim() !== "") {
      expirationDate = cand.trim();
      break;
    }
  }
  if (!expirationDate && ivRaw) {
    const issueYear = ivRaw.issueYear as string | undefined;
    if (issueYear && issueYear.trim() !== "") {
      expirationDate = issueYear.trim();
    }
  }

  const idType = (identity.idType as string) ?? undefined;
  const fullName = (identity.fullName as string) ?? undefined;
  const birthDate = formatDateDisplay((identity.birthDate as string) ?? undefined);
  const curp = (identity.curp as string) ?? undefined;
  const voterKey = (identity.voterKey as string) ?? undefined;
  const idNumber = (identity.idNumber as string) ?? undefined;

  const fields: IdentityFieldDef[] = [
    { label: "Tipo de documento", value: idType },
    { label: "Nombre completo", value: fullName },
    { label: "Fecha de nacimiento", value: birthDate },
    { label: "CURP", value: curp },
  ];
  if (idType === "INE") {
    fields.push({ label: "Clave de elector", value: voterKey });
  }
  if (idType === "PASSPORT" || idNumber) {
    fields.push({ label: "Numero de documento", value: idNumber });
  }
  fields.push({ label: "Vigencia", value: formatDateDisplay(expirationDate) });

  const ineValidation = ivRaw
    ? {
        cic: (ivRaw.cic as string) ?? undefined,
        citizenIdentifier: (ivRaw.citizenIdentifier as string) ?? undefined,
      }
    : null;

  return {
    idType,
    fields,
    isExpired: identity.isExpiredByVisibleDate === true,
    ineValidation,
    alerts,
  };
}

/**
 * Aggregates alerts across every PROCESSED document, tagging each with the
 * category (tab) it belongs to so the AlertBanner can deep-link.
 */
export interface AggregatedAlert {
  alert: ExtractionAlert;
  category: ExtractionCategory;
}

export function aggregateAlerts(documents: Document[]): AggregatedAlert[] {
  const out: AggregatedAlert[] = [];
  for (const doc of documents) {
    if (doc.documentStatus.code !== "PROCESSED") continue;
    const category = docCategory(doc.documentType.code);
    if (!category) continue;
    const ed = doc.extractedData as Record<string, unknown> | null;
    if (!ed) continue;
    for (const alert of filterAlerts(ed.alerts)) {
      out.push({ alert, category });
    }
  }
  return out;
}