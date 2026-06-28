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
 * Periodicity code → Spanish label for UI display.
 * The backend returns WEEKLY/BIWEEKLY/MONTHLY; the UI never shows codes.
 */
export const PERIODICITY_LABELS: Record<string, string> = {
  WEEKLY: "Semanal",
  BIWEEKLY: "Quincenal",
  MONTHLY: "Mensual",
  OTHER: "Otro",
  UNKNOWN: "No detectado",
};

/** Converts a periodicity code to its Spanish label. */
export function periodicityLabel(code: string | null | undefined): string {
  if (!code) return "No detectado";
  return PERIODICITY_LABELS[code] ?? code;
}

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

// ── Payroll extraction parsing ────────────────────────────────────────────

/**
 * Sprint 2 summary — only counts and employee identification.
 * Financial analysis (averages, variable income, payment capacity) is Sprint 3.
 */
export interface ParsedPayrollSummary {
  totalRecibos: number;
  recibosConDatos: number;
  recibosConError: number;
  empleado: { nombre: string; rfc: string } | null;
}

export interface ParsedPayrollReceipt {
  documentId: string;
  originalName: string;
  statusCode: string;
  statusName: string;
  hasData: boolean;
  periodo: string | null;
  fechaPago: string | null;
  periodicidad: string | null;
  ingresoBruto: number | null;
  deducciones: number | null;
  ingresoNeto: number | null;
  timbrado: boolean | null;
  alertas: number;
  alertasLista: ExtractionAlert[];
  empleado: { nombre: string; rfc: string } | null;
  empleador: { nombre: string; rfc: string } | null;
  percepciones: { concepto: string; importe: number }[];
  deduccionesDetalle: { concepto: string; importe: number }[];
  employment: {
    hireDate: string | null;
    seniorityText: string | null;
    hasMinimumSeniority: boolean | null;
    contributesToImss: boolean | null;
    imssEvidence: string | null;
  } | null;
  isVariableIncome: boolean;
  fiscalData: {
    fiscalFolio: string | null;
    certificationDate: string | null;
    isStamped: boolean;
  } | null;
}

export interface ParsedPayroll {
  summary: ParsedPayrollSummary | null;
  receipts: ParsedPayrollReceipt[];
}

/**
 * Parses ALL PAYROLL_RECEIPT documents into a structured payroll view.
 *
 * Every document appears in the table with its real status — including
 * UPLOADED, PROCESSING, PROCESSED (with or without extractedData), and
 * ERROR/EXTRACTION_ERROR. Documents without extractedData show placeholder
 * values so the asesora knows they exist and what state they're in.
 */
export function parsePayroll(documents: Document[]): ParsedPayroll {
  const payrollDocs = documents.filter(
    (d) => d.documentType.code === "PAYROLL_RECEIPT",
  );

  const totalRecibos = payrollDocs.length;

  if (totalRecibos === 0) {
    return { summary: null, receipts: [] };
  }

  const receipts: ParsedPayrollReceipt[] = [];
  const empleadosMap = new Map<string, { nombre: string; rfc: string }>();
  let recibosConDatos = 0;
  let recibosConError = 0;

  // ── Helper: build a placeholder row for docs without extractedData ──────
  function emptyReceipt(doc: Document): ParsedPayrollReceipt {
    return {
      documentId: doc.id,
      originalName: doc.originalName,
      statusCode: doc.documentStatus.code,
      statusName: doc.documentStatus.name,
      hasData: false,
      periodo: null,
      fechaPago: null,
      periodicidad: null,
      ingresoBruto: null,
      deducciones: null,
      ingresoNeto: null,
      timbrado: null,
      alertas: 0,
      alertasLista: [],
      empleado: null,
      empleador: null,
      percepciones: [],
      deduccionesDetalle: [],
      employment: null,
      isVariableIncome: false,
      fiscalData: null,
    };
  }

  // ── Process every payroll document ──────────────────────────────────────
  for (const doc of payrollDocs) {
    const statusCode = doc.documentStatus.code;

    // Error states — show in table with empty data
    if (statusCode === "ERROR" || statusCode === "EXTRACTION_ERROR") {
      recibosConError++;
      receipts.push(emptyReceipt(doc));
      continue;
    }

    // Uploaded / Processing — show in table as pending
    if (statusCode === "UPLOADED" || statusCode === "PROCESSING") {
      receipts.push(emptyReceipt(doc));
      continue;
    }

    // PROCESSED — must have extractedData to show full row
    if (!doc.extractedData) {
      receipts.push(emptyReceipt(doc));
      continue;
    }

    recibosConDatos++;
    const ed = doc.extractedData as Record<string, unknown>;
    const employee = (ed.employee as Record<string, unknown>) ?? {};
    const employer = (ed.employer as Record<string, unknown>) ?? {};
    const payrollPeriod = (ed.payrollPeriod as Record<string, unknown>) ?? {};
    const income = (ed.income as Record<string, unknown>) ?? {};
    const fiscalStamp = (ed.fiscalStamp as Record<string, unknown>) ?? {};
    const deductionsArr = ed.deductions as Record<string, unknown>[] | undefined;
    const variablePerceptions = income.variablePerceptions as
      | Record<string, unknown>[]
      | undefined;

    const empName = (employee.fullName as string) ?? null;
    const empRfc = (employee.rfc as string) ?? null;
    const emplName = (employer.legalName as string) ?? null;
    const emplRfc = (employer.rfc as string) ?? null;

    if (empName || empRfc) {
      const key = empRfc ?? empName ?? "unknown";
      if (!empleadosMap.has(key)) {
        empleadosMap.set(key, {
          nombre: empName ?? "Sin nombre",
          rfc: empRfc ?? "—",
        });
      }
    }

    const periodo =
      ((payrollPeriod.periodLabel as string) ??
        (payrollPeriod.periodRaw as string) ??
        [payrollPeriod.periodStartDate, payrollPeriod.periodEndDate]
          .filter(Boolean)
          .join(" a ")) ||
      "Sin periodo";
    const fechaPago = formatDateDisplay((payrollPeriod.paymentDate as string) ?? undefined) ?? null;
    const periodicidad = periodicityLabel(
      payrollPeriod.periodicity as string | null | undefined,
    );

    const ingresoBruto = income.grossIncome as number | null;
    const deducciones = income.totalDeductions as number | null;
    const ingresoNeto = income.netIncome as number | null;

    const hasQr = fiscalStamp.hasQrCode === true;
    const hasSeal = fiscalStamp.hasSatDigitalSeal === true;
    const timbrado = hasQr || hasSeal;

    const alerts = filterAlerts(ed.alerts);

    // Percepciones
    const percepciones: { concepto: string; importe: number }[] = [];
    if (Array.isArray(variablePerceptions)) {
      for (const p of variablePerceptions) {
        const desc =
          (p.description as string) ?? (p.type as string) ?? "Percepción";
        const amount = p.amount as number | undefined;
        if (amount != null) {
          percepciones.push({ concepto: desc, importe: amount });
        }
      }
    }

    // Deducciones detalle
    const deduccionesDetalle: { concepto: string; importe: number }[] = [];
    if (Array.isArray(deductionsArr)) {
      for (const d of deductionsArr) {
        const desc =
          (d.description as string) ?? (d.type as string) ?? "Deducción";
        const amount = d.amount as number | undefined;
        if (amount != null) {
          deduccionesDetalle.push({ concepto: desc, importe: amount });
        }
      }
    }

    // Employment data
    const employmentData = (ed.employment as Record<string, unknown>) ?? {};
    const hireDateRaw =
      (employmentData.hireDate as string) ??
      (employee.employmentStartDate as string) ??
      null;
    const hireDate = formatDateDisplay(hireDateRaw ?? undefined) ?? null;
    const seniority =
      (employmentData.seniorityText as string) ??
      (employee.employmentSeniorityText as string) ??
      null;
    const hasMinSeniority =
      employmentData.hasMinimumSeniority as boolean | null | undefined ?? null;
    const contributesImss =
      (employmentData.contributesToImss as boolean) ??
      (employee.contributesToImss as boolean) ??
      null;
    const imssEvidence =
      (employmentData.imssEvidence as string) ??
      (employee.imssEvidence as string) ??
      null;

    const isVarIncome =
      income.isVariableIncome === true ||
      (Array.isArray(variablePerceptions) && variablePerceptions.length > 0);

    // Fiscal data
    const fiscalFolio = (fiscalStamp.fiscalFolio as string) ?? null;
    const certificationDate =
      (fiscalStamp.certificationDate as string) ?? null;
    const isStamped =
      fiscalStamp.hasQrCode === true ||
      fiscalStamp.hasSatDigitalSeal === true ||
      fiscalStamp.hasCfdiStamp === true ||
      !!fiscalFolio ||
      !!certificationDate;

    receipts.push({
      documentId: doc.id,
      originalName: doc.originalName,
      statusCode: doc.documentStatus.code,
      statusName: doc.documentStatus.name,
      hasData: true,
      periodo,
      fechaPago,
      periodicidad,
      ingresoBruto,
      deducciones,
      ingresoNeto,
      timbrado,
      alertas: alerts.length,
      alertasLista: alerts,
      empleado: empName
        ? { nombre: empName, rfc: empRfc ?? "—" }
        : null,
      empleador: emplName
        ? { nombre: emplName, rfc: emplRfc ?? "—" }
        : null,
      percepciones,
      deduccionesDetalle,
      employment:
        hireDate || seniority || contributesImss != null
          ? {
              hireDate,
              seniorityText: seniority,
              hasMinimumSeniority: hasMinSeniority,
              contributesToImss: contributesImss,
              imssEvidence,
            }
          : null,
      isVariableIncome: isVarIncome,
      fiscalData:
        isStamped || fiscalFolio || certificationDate
          ? { fiscalFolio, certificationDate, isStamped }
          : null,
    });
  }

  // ── Build summary ───────────────────────────────────────────────────────
  const empleados = Array.from(empleadosMap.values());

  const summary: ParsedPayrollSummary = {
    totalRecibos,
    recibosConDatos,
    recibosConError,
    empleado: empleados.length > 0 ? empleados[0] : null,
  };

  return { summary, receipts };
}