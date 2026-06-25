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

export interface ParsedPayrollSummary {
  recibosProcesados: number;
  totalRecibos: number;
  periodos: string[];
  empleado: { nombre: string; rfc: string } | null;
  empleadores: { nombre: string; rfc: string }[];
  ingresoBrutoPromedio: number | null;
  ingresoNetoPromedio: number | null;
  timbradoDetectado: number;
  totalRecibosTimbrados: number;
  alertas: number;
}

export interface ParsedPayrollReceipt {
  documentId: string;
  periodo: string;
  fechaPago: string;
  periodicidad: string;
  ingresoBruto: number | null;
  deducciones: number | null;
  ingresoNeto: number | null;
  timbrado: boolean;
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
}

export interface ParsedPayroll {
  summary: ParsedPayrollSummary | null;
  receipts: ParsedPayrollReceipt[];
  hasError: boolean;
  errorMessage: string | null;
}

/**
 * Parses all PAYROLL_RECEIPT documents into a structured payroll view.
 *
 * Only documents with `extractedData` are included in the summary/table.
 * Documents with PROCESSED status but no extractedData are counted as
 * unprocessed. Documents with ERROR/EXTRACTION_ERROR status are flagged.
 */
export function parsePayroll(documents: Document[]): ParsedPayroll {
  const payrollDocs = documents.filter(
    (d) => d.documentType.code === "PAYROLL_RECEIPT",
  );

  const totalRecibos = payrollDocs.length;

  // Check for extraction errors
  const errorDoc = payrollDocs.find(
    (d) =>
      d.documentStatus.code === "ERROR" ||
      d.documentStatus.code === "EXTRACTION_ERROR",
  );
  if (errorDoc) {
    return {
      summary: null,
      receipts: [],
      hasError: true,
      errorMessage:
        "No se pudo extraer la información de este recibo de nómina. Intenta reprocesar el documento.",
    };
  }

  // Filter to PROCESSED docs with extractedData
  const processed = payrollDocs.filter(
    (d) =>
      d.documentStatus.code === "PROCESSED" && d.extractedData != null,
  );

  if (processed.length === 0) {
    return {
      summary: null,
      receipts: [],
      hasError: false,
      errorMessage: null,
    };
  }

  // Build receipts from processed documents
  const receipts: ParsedPayrollReceipt[] = [];
  const allPeriodos: string[] = [];
  let totalBruto = 0;
  let totalNeto = 0;
  let countBruto = 0;
  let countNeto = 0;
  let timbradoCount = 0;
  let totalAlertas = 0;
  const empleadosMap = new Map<string, { nombre: string; rfc: string }>();
  const empleadoresMap = new Map<string, { nombre: string; rfc: string }>();

  for (const doc of processed) {
    const ed = doc.extractedData as Record<string, unknown>;
    const employee = (ed.employee as Record<string, unknown>) ?? {};
    const employer = (ed.employer as Record<string, unknown>) ?? {};
    const payrollPeriod =
      (ed.payrollPeriod as Record<string, unknown>) ?? {};
    const income = (ed.income as Record<string, unknown>) ?? {};
    const fiscalStamp =
      (ed.fiscalStamp as Record<string, unknown>) ?? {};
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
          nombre: empName ?? "No detectado",
          rfc: empRfc ?? "—",
        });
      }
    }

    if (emplName || emplRfc) {
      const key = emplRfc ?? emplName ?? "unknown";
      if (!empleadoresMap.has(key)) {
        empleadoresMap.set(key, {
          nombre: emplName ?? "No detectado",
          rfc: emplRfc ?? "—",
        });
      }
    }

    const periodo =
      [
        payrollPeriod.periodStartDate,
        payrollPeriod.periodEndDate,
      ]
        .filter(Boolean)
        .join(" a ") || "No detectado";
    const fechaPago =
      (payrollPeriod.paymentDate as string) ?? "No detectado";
    const periodicidad =
      periodicityLabel(payrollPeriod.periodicity as string | null | undefined);

    const ingresoBruto = income.grossIncome as number | null;
    const deducciones = income.totalDeductions as number | null;
    const ingresoNeto = income.netIncome as number | null;

    const hasQr = fiscalStamp.hasQrCode === true;
    const hasSeal = fiscalStamp.hasSatDigitalSeal === true;
    const timbrado = hasQr || hasSeal;

    const alerts = filterAlerts(ed.alerts);
    const alertCount = alerts.length;

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

    // Employment data (from employment section, fallback to employee fields)
    const employmentData = (ed.employment as Record<string, unknown>) ?? {};
    const hireDate =
      (employmentData.hireDate as string) ??
      (employee.employmentStartDate as string) ??
      null;
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

    allPeriodos.push(periodo);

    if (ingresoBruto != null) {
      totalBruto += ingresoBruto;
      countBruto++;
    }
    if (ingresoNeto != null) {
      totalNeto += ingresoNeto;
      countNeto++;
    }
    if (timbrado) timbradoCount++;
    totalAlertas += alertCount;

    receipts.push({
      documentId: doc.id,
      periodo,
      fechaPago,
      periodicidad,
      ingresoBruto,
      deducciones,
      ingresoNeto,
      timbrado,
      alertas: alertCount,
      alertasLista: alerts,
      empleado: empName
        ? { nombre: empName, rfc: empRfc ?? "—" }
        : null,
      empleador: emplName
        ? { nombre: emplName, rfc: emplRfc ?? "—" }
        : null,
      percepciones,
      deduccionesDetalle,
      employment: hireDate || seniority || contributesImss != null
        ? {
            hireDate,
            seniorityText: seniority,
            hasMinimumSeniority: hasMinSeniority,
            contributesToImss: contributesImss,
            imssEvidence,
          }
        : null,
      isVariableIncome: isVarIncome,
    });
  }

  // Build summary
  const empleados = Array.from(empleadosMap.values());
  const empleadores = Array.from(empleadoresMap.values());

  const summary: ParsedPayrollSummary = {
    recibosProcesados: processed.length,
    totalRecibos,
    periodos: allPeriodos,
    empleado: empleados.length > 0 ? empleados[0] : null,
    empleadores,
    ingresoBrutoPromedio:
      countBruto > 0 ? totalBruto / countBruto : null,
    ingresoNetoPromedio:
      countNeto > 0 ? totalNeto / countNeto : null,
    timbradoDetectado: timbradoCount,
    totalRecibosTimbrados: processed.length,
    alertas: totalAlertas,
  };

  return {
    summary,
    receipts,
    hasError: false,
    errorMessage: null,
  };
}