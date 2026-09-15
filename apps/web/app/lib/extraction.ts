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

export type ExtractionCategory =
  | "identidad"
  | "csf"
  | "declaracion"
  | "nomina"
  | "estados"
  | "buro";

export const CATEGORY_LABELS: Record<ExtractionCategory, string> = {
  identidad: "Identidad",
  csf: "Constancia fiscal (CSF)",
  declaracion: "Declaración anual",
  nomina: "Recibos de nómina",
  estados: "Estados de cuenta",
  buro: "Buró de crédito",
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
    case "CSF":
      return "csf";
    case "TAX_RETURN":
      return "declaracion";
    case "PAYROLL_RECEIPT":
      return "nomina";
    case "BANK_STATEMENT":
      return "estados";
    case "CREDIT_BUREAU_REPORT":
    case "CREDIT_SCORE":
      return "buro";
    default:
      return null;
  }
}

/**
 * Converts an ISO `YYYY-MM-DD` (or other date strings) to the Mexican display format `DD-MM-YYYY`.
 * Non-matching strings pass through unchanged.
 */
export function formatDateDisplay(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const trimmed = iso.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (m) {
    return `${m[3]}-${m[2]}-${m[1]}`;
  }
  const m2 = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/.exec(trimmed);
  if (m2) {
    const d = m2[1].padStart(2, "0");
    const mo = m2[2].padStart(2, "0");
    return `${d}-${mo}-${m2[3]}`;
  }
  return trimmed;
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
  manualCorrections?: Record<string, { value: string; source: CorrectionSource }>;
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
  const idTypeLabel =
    idType === "PASSPORT"
      ? "Pasaporte"
      : idType === "INE"
        ? "INE"
        : idType;
  const fullName = (identity.fullName as string) ?? undefined;
  const birthDate = formatDateDisplay((identity.birthDate as string) ?? undefined);
  const curp = (identity.curp as string) ?? undefined;
  const voterKey = (identity.voterKey as string) ?? undefined;
  const idNumber = (identity.idNumber as string) ?? undefined;

  const fields: IdentityFieldDef[] = [
    { label: "Tipo de documento", value: idTypeLabel },
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

  const manualCorrections = data.manualCorrections as
    | Record<string, { value: string; source: CorrectionSource }>
    | undefined;

  return {
    idType,
    fields,
    isExpired: identity.isExpiredByVisibleDate === true,
    ineValidation,
    alerts,
    manualCorrections,
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

// ── Bank statement extraction parsing ──────────────────────────────────────

export interface ParsedBankStatementDeposit {
  date: string | null;
  amount: number | null;
  currency: string;
  originalConcept: string | null;
  employerName: string | null;
  employerRfc: string | null;
  isPayrollConcept: boolean;
  containsPayrollKeyword: boolean;
  matchCandidateForPayroll: boolean;
}

export interface ParsedBankStatementProvider {
  payerName: string;
  depositDate: string | null;
  amount: number | null;
  payerRfc: string | null;
  estimatedRecurrence: string | null;
}

export interface ParsedOtherMovement {
  date: string | null;
  amount: number | null;
  movementType: string | null;
  description: string | null;
}

export interface ParsedStatementContext {
  incomeBehavior: string | null;
  requiredMonths: number | null;
  detectedMonths: number | null;
  isRequirementSatisfied: boolean | null;
}

export interface ParsedBankStatement {
  documentId: string;
  originalName: string;
  statusCode: string;
  statusName: string;
  hasData: boolean;

  // Bank & account
  bankName: string | null;
  accountNumber: string | null;
  clabe: string | null;
  isJointAccount: boolean | null;

  // Account holder
  accountHolder: string | null;
  accountHolderRfc: string | null;

  // Period
  periodStart: string | null;
  periodEnd: string | null;
  cutoffDate: string | null;
  isClosedMonth: boolean;
  isCurrentIncompleteMonth: boolean;

  // Balances
  averageBalance: number | null;
  endingBalance: number | null;

  // Financial Depuration (PFAE & v1.2)
  financialDepuration?: {
    depurationSummary: {
      totalGrossDeposits: number;
      totalTrashDeposits: number;
      totalValidIncome: number;
      trashDepositsCount: number;
      validDepositsCount: number;
      needsReviewCount: number;
      detectedSector: string;
    };
    integrityCheck: {
      status: 'MATCHED' | 'MINOR_DIFFERENCE' | 'CRITICAL_DISCREPANCY' | 'NO_COVER_DATA';
      bankReportedTotal: number | null;
      extractedSum: number;
      difference: number;
      differencePercent: number;
      message: string;
    };
    cleanedDeposits: Array<any>;
    highImpactExceptions: Array<any>;
  } | null;

  // Payroll deposits
  deposits: ParsedBankStatementDeposit[];

  // Possible payroll providers (aggregated across all statements)
  providers: ParsedBankStatementProvider[];

  // Other movements
  otherMovements: ParsedOtherMovement[];

  // Requirement context
  context: ParsedStatementContext | null;

  // Alerts
  alerts: ExtractionAlert[];
  alertCount: number;
  hasCritical: boolean;
}

export interface ParsedBankStatements {
  summary: {
    totalStatements: number;
    statementsWithData: number;
    statementsWithError: number;
    banks: string[];
    periodStart: string | null;
    periodEnd: string | null;
    totalDeposits: number;
    totalCriticalAlerts: number;
    totalWarningAlerts: number;
    isPfae?: boolean;
    totalValidIncome?: number;
    totalGrossDeposits?: number;
    totalTrashDeposits?: number;
  } | null;
  statements: ParsedBankStatement[];

  // Aggregated data for cross-statement analysis
  allProviders: ParsedBankStatementProvider[];
  allDeposits: ParsedBankStatementDeposit[];
  aggregatedContext: {
    incomeBehavior: string | null;
    requiredMonths: number | null;
    detectedMonths: number | null;
    isRequirementSatisfied: boolean | null;
    coveredMonths: string[]; // e.g. ["2026-01", "2026-02", ...]
  } | null;

  // All alerts across statements
  allAlerts: ExtractionAlert[];
}

/**
 * Collapse Gemini/OCR bank name variants into a stable display key
 * so "Bancos detectados" counts unique institutions (e.g. BBVA México → BBVA).
 */
function canonicalizeBankInstitutionName(name: string): string {
  const key = name
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Z0-9]/g, "");

  if (key.includes("BBVA")) return "BBVA";
  if (key.includes("BANAMEX") || key.includes("CITIBANAMEX")) return "Citibanamex";
  if (key.includes("SANTANDER")) return "Santander";
  if (key.includes("BANORTE")) return "Banorte";
  if (key.includes("HSBC")) return "HSBC";
  if (key.includes("SCOTIABANK") || key.includes("SCOTIA")) return "Scotiabank";
  if (key.includes("AZTECA")) return "Azteca";
  if (key.includes("INBURSA")) return "Inbursa";
  if (key.includes("MIFEL")) return "Mifel";
  if (key.includes("BANREGIO")) return "Banregio";
  if (key.includes("BANBAJIO") || key.includes("BAJIO")) return "BanBajío";

  return name.trim().replace(/\s+/g, " ");
}

function emptyStatement(doc: Document): ParsedBankStatement {
  return {
    documentId: doc.id,
    originalName: doc.originalName,
    statusCode: doc.documentStatus.code,
    statusName: doc.documentStatus.name,
    hasData: false,
    bankName: null,
    accountNumber: null,
    clabe: null,
    isJointAccount: null,
    accountHolder: null,
    accountHolderRfc: null,
    periodStart: null,
    periodEnd: null,
    cutoffDate: null,
    isClosedMonth: false,
    isCurrentIncompleteMonth: false,
    averageBalance: null,
    endingBalance: null,
    deposits: [],
    providers: [],
    otherMovements: [],
    context: null,
    alerts: [],
    alertCount: 0,
    hasCritical: false,
  };
}

/**
 * Parses ALL BANK_STATEMENT documents into a structured bank statement view.
 *
 * Every document appears — including UPLOADED, PROCESSING, PROCESSED
 * (with or without extractedData), and error states. Aggregated providers
 * and context are collected for cross-statement analysis.
 */
export function parseBankStatements(
  documents: Document[],
): ParsedBankStatements {
  const bankDocs = documents.filter(
    (d) => d.documentType.code === "BANK_STATEMENT",
  );

  const totalStatements = bankDocs.length;

  if (totalStatements === 0) {
    return {
      summary: null,
      statements: [],
      allProviders: [],
      allDeposits: [],
      aggregatedContext: null,
      allAlerts: [],
    };
  }

  const statements: ParsedBankStatement[] = [];
  const allProvidersMap = new Map<
    string,
    ParsedBankStatementProvider
  >();
  const allDeposits: ParsedBankStatementDeposit[] = [];
  const allAlerts: ExtractionAlert[] = [];
  const banks = new Set<string>();
  const coveredMonths = new Set<string>();

  let statementsWithData = 0;
  let statementsWithError = 0;
  let totalCriticalAlerts = 0;
  let totalWarningAlerts = 0;
  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  let aggregatedContext: ParsedBankStatements["aggregatedContext"] = null;

  for (const doc of bankDocs) {
    const statusCode = doc.documentStatus.code;

    if (statusCode === "ERROR" || statusCode === "EXTRACTION_ERROR") {
      statementsWithError++;
      statements.push(emptyStatement(doc));
      continue;
    }

    if (
      statusCode === "UPLOADED" ||
      statusCode === "PROCESSING"
    ) {
      statements.push(emptyStatement(doc));
      continue;
    }

    if (!doc.extractedData) {
      statements.push(emptyStatement(doc));
      continue;
    }

    statementsWithData++;
    const ed = doc.extractedData as Record<string, unknown>;

    // ── Bank & account ──────────────────────────────────────────────────
    const bank = (ed.bank as Record<string, unknown>) ?? {};
    const rawBankName = (bank.institutionName as string) ?? null;
    const bankName = rawBankName
      ? canonicalizeBankInstitutionName(rawBankName)
      : null;
    const accountNumber = (bank.accountNumber as string) ?? null;
    const clabe = (bank.clabe as string) ?? null;

    if (bankName) banks.add(bankName);

    // ── Account holder ──────────────────────────────────────────────────
    const holder = (ed.accountHolder as Record<string, unknown>) ?? {};
    const accountHolder = (holder.fullName as string) ?? null;
    const accountHolderRfc = (holder.rfc as string) ?? null;
    const isJointAccount =
      (holder.isJointAccount as boolean) ?? null;

    // ── Period ─────────────────────────────────────────────────────────
    const period = (ed.statementPeriod as Record<string, unknown>) ?? {};
    const ps = (period.periodStartDate as string) ?? null;
    const pe = (period.periodEndDate as string) ?? null;
    const cutoff = (period.cutoffDate as string) ?? null;
    const isClosedMonth =
      period.isClosedMonth === true;
    const isCurrentIncompleteMonth =
      period.isCurrentIncompleteMonth === true;
    const averageBalance = (period.averageBalance as number) ?? null;
    const endingBalance = (period.endingBalance as number) ?? null;

    // Track period range
    if (ps && (!periodStart || ps < periodStart)) periodStart = ps;
    if (pe && (!periodEnd || pe > periodEnd)) periodEnd = pe;

    // Track covered months (YYYY-MM)
    if (ps) {
      const m = /^(\d{4}-\d{2})/.exec(ps);
      if (m) coveredMonths.add(m[1]);
    }
    if (pe) {
      const m = /^(\d{4}-\d{2})/.exec(pe);
      if (m) coveredMonths.add(m[1]);
    }

    // ── Payroll deposits ────────────────────────────────────────────────
    const depositsArr =
      (ed.payrollDeposits as Record<string, unknown>[]) ?? [];
    const deposits: ParsedBankStatementDeposit[] = [];
    for (const dep of depositsArr) {
      const deposit: ParsedBankStatementDeposit = {
        date: (dep.date as string) ?? null,
        amount: (dep.amount as number) ?? null,
        currency: (dep.currency as string) ?? "MXN",
        originalConcept: (dep.originalConcept as string) ?? null,
        employerName:
          (dep.detectedEmployerOrPayerName as string) ?? null,
        employerRfc: (dep.detectedPayerRfc as string) ?? null,
        isPayrollConcept: dep.isPayrollConcept === true,
        containsPayrollKeyword:
          dep.containsPayrollKeyword === true,
        matchCandidateForPayroll:
          dep.matchCandidateForPayrollReceipt === true,
      };
      deposits.push(deposit);
    }
    allDeposits.push(...deposits);

    // ── Possible providers ──────────────────────────────────────────────
    const providersArr =
      (ed.possiblePayrollProviders as Record<string, unknown>[]) ?? [];
    const providers: ParsedBankStatementProvider[] = [];
    for (const prov of providersArr) {
      const name = (prov.payerName as string) ?? "Sin nombre";
      const provider: ParsedBankStatementProvider = {
        payerName: name,
        depositDate: (prov.depositDate as string) ?? null,
        amount: (prov.amount as number) ?? null,
        payerRfc: (prov.detectedPayerRfc as string) ?? null,
        estimatedRecurrence:
          (prov.estimatedRecurrence as string) ?? null,
      };
      providers.push(provider);

      const key = (prov.detectedPayerRfc as string) ?? name;
      if (!allProvidersMap.has(key)) {
        allProvidersMap.set(key, provider);
      }
    }

    // ── Other movements ─────────────────────────────────────────────────
    const movementsArr =
      (ed.otherRelevantMovements as Record<string, unknown>[]) ?? [];
    const otherMovements: ParsedOtherMovement[] = [];
    for (const mov of movementsArr) {
      // trashDepositAnalysis is an OBJECT from Gemini, not a string.
      // Extract a readable description from it.
      const trashAnalysis = mov.trashDepositAnalysis as
        | Record<string, unknown>
        | undefined;
      let description: string | null = null;
      if (trashAnalysis && typeof trashAnalysis === "object") {
        const evidence = trashAnalysis.evidenceText as string | undefined;
        const reason = trashAnalysis.reason as string | undefined;
        description = evidence ?? reason ?? null;
      } else if (typeof mov.trashDepositAnalysis === "string") {
        description = mov.trashDepositAnalysis;
      }

      otherMovements.push({
        date: (mov.date as string) ?? null,
        amount: (mov.amount as number) ?? null,
        movementType: (mov.movementType as string) ?? null,
        description,
      });
    }

    // ── Context ─────────────────────────────────────────────────────────
    const ctx =
      ed.documentRequirementContext as Record<string, unknown> | undefined;
    const context: ParsedStatementContext | null = ctx
      ? {
          incomeBehavior: (ctx.incomeBehavior as string) ?? null,
          requiredMonths:
            (ctx.requiredBankStatementMonths as number) ?? null,
          detectedMonths:
            (ctx.detectedDocumentMonths as number) ?? null,
          isRequirementSatisfied:
            (ctx.isRequirementSatisfied as boolean) ?? null,
        }
      : null;

    // Use the first statement's context for aggregation
    if (!aggregatedContext && context) {
      aggregatedContext = {
        ...context,
        coveredMonths: [],
      };
    }

    // ── Alerts ──────────────────────────────────────────────────────────
    const alerts = filterAlerts(ed.alerts);
    const hasCritical = alerts.some(
      (a) => a.severity === "CRITICAL",
    );
    for (const a of alerts) {
      // Skip per-statement month-count warnings — they're misleading
      // at the aggregate level because each statement only sees itself.
      if (a.code === "BANK_FEWER_MONTHS_THAN_REQUIRED") continue;
      if (a.severity === "CRITICAL") totalCriticalAlerts++;
      else totalWarningAlerts++;
    }
    allAlerts.push(...alerts);

    const financialDepuration =
      (ed.financialDepuration as ParsedBankStatement["financialDepuration"]) ?? null;

    statements.push({
      documentId: doc.id,
      originalName: doc.originalName,
      statusCode: doc.documentStatus.code,
      statusName: doc.documentStatus.name,
      hasData: true,
      bankName,
      accountNumber,
      clabe,
      isJointAccount,
      accountHolder,
      accountHolderRfc,
      periodStart: ps,
      periodEnd: pe,
      cutoffDate: cutoff,
      isClosedMonth,
      isCurrentIncompleteMonth,
      averageBalance,
      endingBalance,
      financialDepuration,
      deposits,
      providers,
      otherMovements,
      context,
      alerts,
      alertCount: alerts.length,
      hasCritical,
    });
  }

  // Sort statements by periodStart ascending
  statements.sort((a, b) => {
    if (!a.periodStart && !b.periodStart) return 0;
    if (!a.periodStart) return 1;
    if (!b.periodStart) return -1;
    return a.periodStart.localeCompare(b.periodStart);
  });

  // ── Aggregated context ─────────────────────────────────────────────────
  // Always surface covered months from statement periods, even when Gemini
  // omitted documentRequirementContext (common after cover-prompt trim).
  const sortedCoveredMonths = Array.from(coveredMonths).sort();
  if (aggregatedContext) {
    aggregatedContext.coveredMonths = sortedCoveredMonths;
  } else if (sortedCoveredMonths.length > 0) {
    aggregatedContext = {
      incomeBehavior: null,
      requiredMonths: null,
      detectedMonths: sortedCoveredMonths.length,
      isRequirementSatisfied: null,
      coveredMonths: sortedCoveredMonths,
    };
  }

  // ── PFAE Aggregates ────────────────────────────────────────────────────
  const pfaeStatements = statements.filter((s) => s.financialDepuration != null);
  const isPfae = pfaeStatements.length > 0;
  let totalGrossDeposits = 0;
  let totalTrashDeposits = 0;
  let totalValidIncome = 0;

  if (isPfae) {
    for (const s of pfaeStatements) {
      const dep = s.financialDepuration?.depurationSummary;
      if (dep) {
        totalGrossDeposits += dep.totalGrossDeposits || 0;
        totalTrashDeposits += dep.totalTrashDeposits || 0;
        totalValidIncome += dep.totalValidIncome || 0;
      }
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────
  const summary = {
    totalStatements,
    statementsWithData,
    statementsWithError,
    banks: Array.from(banks).sort(),
    periodStart,
    periodEnd,
    totalDeposits: isPfae
      ? pfaeStatements.reduce(
          (sum, s) =>
            sum +
            (s.financialDepuration?.depurationSummary?.validDepositsCount || 0),
          0,
        )
      : allDeposits.length,
    totalCriticalAlerts,
    totalWarningAlerts,
    isPfae,
    totalGrossDeposits,
    totalTrashDeposits,
    totalValidIncome,
  };

  return {
    summary,
    statements,
    allProviders: Array.from(allProvidersMap.values()),
    allDeposits,
    aggregatedContext,
    allAlerts,
  };
}

// ── Credit bureau extraction parsing ─────────────────────────────────────

// ---------------------------------------------------------------------------
// Layout-aware financial extraction — provenance/confidence audit fields.
// Phase 1 of `layout-aware-buro-extraction`: pure type contracts only.
// These mirror the API-side enums in
// `apps/api/src/documents/document-ai.types.ts`. They are intentionally
// inlined (not imported cross-app) because apps/web is standalone.
// ---------------------------------------------------------------------------

/** Per-field confidence of a layout-extracted financial value. */
export enum FinancialFieldsConfidence {
  HIGH = "HIGH",
  MEDIUM = "MEDIUM",
  LOW = "LOW",
}

/** Coarse origin of a credit's financial field values. */
export enum FinancialFieldsSource {
  LAYOUT = "LAYOUT",
  GEMINI = "GEMINI",
  MANUAL_REVIEW = "MANUAL_REVIEW",
}

/** Per-field confidence map keyed by the 6 financial field names. */
export interface FinancialFieldsConfidenceMap {
  currentBalance: FinancialFieldsConfidence;
  creditLimit: FinancialFieldsConfidence;
  maxCredit: FinancialFieldsConfidence;
  lastPaymentAmount: FinancialFieldsConfidence;
  paymentDueAmount: FinancialFieldsConfidence;
  pastDueAmount: FinancialFieldsConfidence;
}

/**
 * Provenance of a credit's `paymentDueAmount` value (inlined mirror of the
 * API-side enum in `apps/api/src/documents/document-ai.types.ts`).
 */
export enum PaymentDueAmountSource {
  LAYOUT = "LAYOUT",
  GEMINI = "GEMINI",
  /** Coordinate grid extraction — value found inside the paymentDueAmount band */
  BAND_MATCH = "BAND_MATCH",
  /** Coordinate grid extraction — value rescued from boundary zone */
  RESCUE = "RESCUE",
  UNCONFIRMED = "UNCONFIRMED",
  CONFIRMED_AUTO = "CONFIRMED_AUTO",
  MANUAL = "MANUAL",
}

/** Triple-field pattern for paymentDueAmount — mirrors API types. */
export interface PaymentDueAmountTriple {
  paymentDueAmountExtracted: number | null;
  paymentDueAmountManual: number | null;
  paymentDueAmountEffective: number | null;
}

/** Guardrail fields persisted per credit on the JSONB payload. */
export interface PaymentDueGuardrailFields {
  paymentDueAmountSource: PaymentDueAmountSource;
  paymentDueAmountConfirmed: boolean;
  paymentDueAmountManualOverride: number | null;
}

/** Audit metadata added to each credit after layout↔Gemini merge (Phase 4). */
export interface CreditAuditFields {
  financialFieldsSource: FinancialFieldsSource | null;
  financialFieldsConfidence: FinancialFieldsConfidenceMap | null;
  financialFieldsWarnings: string[];
  /** Gemini's paymentDueAmount preserved for audit when layout low-confidence nulls it. */
  candidatePaymentDueAmount: number | null;
  /** True when the backend flagged this credit for human review. */
  needsManualReview: boolean;
}

export interface ParsedCreditBureauCredit extends CreditAuditFields, PaymentDueGuardrailFields, PaymentDueAmountTriple {
  institution: string | null;
  creditType: string | null;
  classification: string;
  status: string;
  currentBalance: number | null;
  /** @deprecated use paymentDueAmount — kept for backward compatibility */
  amountToPay: number | null;
  paymentDueAmount: number | null;
  lastPaymentAmount: number | null;
  creditLimit: number | null;
  currency: string;
  paymentHistory: string | null;
  mopCodes: string[];
  observationKeys: string[];
  hasLatePayments: boolean;
  hasSeriousDelinquency: boolean;
  hasWriteOff: boolean;
  hasSettlementOrDiscount: boolean;
  hasFraudFlag: boolean;
  hasIdentityTheft: boolean;
  isClosed: boolean;
  monthlyDebtContribution: number | null;
  rawTextReference: string | null;
}

export interface ParsedCreditBureauSummary {
  totalCredits: number;
  activeCredits: number;
  closedCredits: number;
  hasSeriousDelinquency: boolean;
  hasWriteOff: boolean;
  hasFraudFlag: boolean;
  /** null when score not available */
  score: number | null;
  /** true when score is an exclusion code (negative) */
  scoreIsExcluded: boolean;
  scoreExclusionReason: string | null;
  totalAlerts: number;
  totalCritical: number;
  totalWarnings: number;
}

export interface ParsedCreditBureau {
  documentId: string;
  originalName: string;
  statusCode: string;
  statusName: string;
  hasData: boolean;

  borrower: {
    fullName: string | null;
    birthDate: string | null;
    rfc: string | null;
    lastReportedAddress: string | null;
  } | null;

  summary: ParsedCreditBureauSummary | null;

  score: number | null;
  /** true when score is an exclusion code (negative) */
  scoreIsExcluded: boolean;
  scoreExclusionReason: string | null;
  /** Origin of the score: "CREDIT_SCORE" | "REPORT_CREDIT_BUREAU" | null */
  scoreSource: string | null;
  consultationDate: string | null;
  numberOfInquiries: number | null;
  /** Manual override for inquiries — analyst-captured value. */
  inquiries24mExtracted: number | null;
  inquiries24mManual: number | null;
  inquiries24mEffective: number | null;
  inquiries24mConfirmed: boolean;

  credits: ParsedCreditBureauCredit[];

  riskSummary: {
    hasWriteOff: boolean;
    hasSettlementOrDiscount: boolean;
    hasFraudFlag: boolean;
    hasIdentityTheft: boolean;
    hasMinorDelinquency: boolean;
    hasSeriousDelinquency: boolean;
    hasPreventiveKeys: boolean;
    possibleHomonym: boolean | null;
    riskNotes: string | null;
  } | null;

  alerts: ExtractionAlert[];
  alertCount: number;
  hasCritical: boolean;
}

const SCORE_EXCLUSION_LABELS: Record<number, string> = {
  [-1]: "Consumidor difunto",
  [-5]: "Todas las cuentas cerradas — morosidad de 90+ días (MOP ≥ 4)",
  [-6]: "Cuentas con menos de 6 meses — morosidad de 60+ días (MOP ≥ 3)",
  [-7]: "Cuentas con menos de 6 meses — morosidad de 30+ días (MOP ≥ 2)",
  [-8]: "Sin cuenta actualizada en 12 meses o abierta en 6 meses",
  [-9]: "Sin cuentas para calcular Mi Score",
};

const SCORE_BAND = (score: number): { label: string; color: string } => {
  if (score >= 680) return { label: "Bajo", color: "text-green-600" };
  if (score >= 600) return { label: "Medio", color: "text-yellow-600" };
  if (score >= 500) return { label: "Alto", color: "text-orange-600" };
  return { label: "Muy alto", color: "text-red-600" };
};

function emptyBuro(doc: Document): ParsedCreditBureau {
  return {
    documentId: doc.id,
    originalName: doc.originalName,
    statusCode: doc.documentStatus.code,
    statusName: doc.documentStatus.name,
    hasData: false,
    borrower: null,
    summary: null,
    score: null,
    scoreIsExcluded: false,
    scoreExclusionReason: null,
    scoreSource: null,
    consultationDate: null,
    numberOfInquiries: null,
    inquiries24mExtracted: null,
    inquiries24mManual: null,
    inquiries24mEffective: null,
    inquiries24mConfirmed: false,
    credits: [],
    riskSummary: null,
    alerts: [],
    alertCount: 0,
    hasCritical: false,
  };
}

/**
 * Parses ALL CREDIT_BUREAU_REPORT documents into a structured credit bureau view.
 *
 * The credit bureau report is typically a single document. Every document
 * appears — including UPLOADED, PROCESSING, PROCESSED (with or without
 * extractedData), and error states.
 */
export function parseBuro(documents: Document[]): ParsedCreditBureau | null {
  const buroDocs = documents.filter(
    (d) => d.documentType.code === "CREDIT_BUREAU_REPORT",
  );
  const scoreDocs = documents.filter(
    (d) => d.documentType.code === "CREDIT_SCORE",
  );

  if (buroDocs.length === 0 && scoreDocs.length === 0) return null;

  // Fallback: If only CREDIT_SCORE doc exists without CREDIT_BUREAU_REPORT yet
  if (buroDocs.length === 0) {
    const scoreDoc = scoreDocs[0];
    const base = emptyBuro(scoreDoc);
    if (!scoreDoc.extractedData) return base;
    const sdEd = scoreDoc.extractedData as Record<string, unknown>;
    const sdScore = (sdEd.score as number) ?? null;
    const scoreIsExcluded = sdScore != null && sdScore < 0;
    return {
      ...base,
      hasData: sdScore != null,
      score: sdScore,
      scoreIsExcluded,
      scoreExclusionReason: scoreIsExcluded
        ? ((sdEd.scoreExclusionReason as string) ??
          SCORE_EXCLUSION_LABELS[sdScore as number] ??
          `Exclusión código ${sdScore}`)
        : null,
      scoreSource: "CREDIT_SCORE",
    };
  }

  // Take the first (and typically only) credit bureau document
  const doc = buroDocs[0];
  const statusCode = doc.documentStatus.code;

  if (
    statusCode === "ERROR" ||
    statusCode === "EXTRACTION_ERROR" ||
    statusCode === "UPLOADED" ||
    statusCode === "PROCESSING"
  ) {
    return emptyBuro(doc);
  }

  if (!doc.extractedData) {
    return emptyBuro(doc);
  }

  const ed = doc.extractedData as Record<string, unknown>;

  // ── Borrower ──────────────────────────────────────────────────────────
  const borrowerRaw = (ed.borrower ?? {}) as Record<string, unknown>;
  const borrower = borrowerRaw.fullName
    ? {
        fullName: (borrowerRaw.fullName as string) ?? null,
        birthDate:
          formatDateDisplay(
            (borrowerRaw.birthDate as string) ?? undefined,
          ) ?? null,
        rfc: (borrowerRaw.rfc as string) ?? null,
        lastReportedAddress:
          (borrowerRaw.lastReportedAddress as string) ?? null,
      }
    : null;

  // ── Report ─────────────────────────────────────────────────────────────
  const reportRaw = (ed.report ?? {}) as Record<string, unknown>;

  // ── Score merge: prefer CREDIT_SCORE document, fall back to bureau ─────
  // MRG-001/002/003/004: score comes from a separate "Mi Score" document.
  // The bureau report's publicScore is always null (score bleed prevention).
  let score: number | null = null;
  let scoreSource: string | null = null;
  let scoreDocData: Record<string, unknown> | null = null;

  // Try CREDIT_SCORE documents first
  for (const sd of scoreDocs) {
    if (
      sd.documentStatus.code !== "PROCESSED" &&
      sd.documentStatus.code !== "DATA_EXTRACTED"
    )
      continue;
    if (!sd.extractedData) continue;
    const sdEd = sd.extractedData as Record<string, unknown>;
    const sdScore = (sdEd.score as number) ?? null;
    if (sdScore != null) {
      score = sdScore;
      scoreSource = "CREDIT_SCORE";
      scoreDocData = sdEd;
      break;
    }
  }

  // Fall back to bureau report's publicScore (legacy data may carry it)
  if (score == null) {
    const bureauScore = (reportRaw.publicScore as number) ?? null;
    if (bureauScore != null) {
      score = bureauScore;
      scoreSource = "REPORT_CREDIT_BUREAU";
    }
  }

  const scoreIsExcluded = score != null && score < 0;
  const scoreExclusionReason = scoreIsExcluded
    ? ((scoreDocData?.scoreExclusionReason as string) ??
      SCORE_EXCLUSION_LABELS[score as number] ??
      `Exclusión código ${score}`)
    : null;
  const consultationDate: string | null = formatDateDisplay(
    (reportRaw.consultationDate as string) ?? undefined,
  ) ?? null;
  const numberOfInquiries = (reportRaw.numberOfInquiries as number) ?? null;

  // ── Credits ────────────────────────────────────────────────────────────
  const creditsArr =
    (ed.credits as Record<string, unknown>[]) ?? [];
  const credits: ParsedCreditBureauCredit[] = [];
  let activeCredits = 0;
  let closedCredits = 0;

  for (const credit of creditsArr) {
    const classification = (credit.classification as string) ?? "UNKNOWN";
    const status = (credit.status as string) ?? "UNKNOWN";
    if (status === "ACTIVE") activeCredits++;
    else if (status === "CLOSED") closedCredits++;

    const paymentDueAmount = (credit.paymentDueAmount as number) ?? null;
    const lastPaymentAmount = (credit.lastPaymentAmount as number) ?? null;
    // Backward-compat: amountToPay falls back to paymentDueAmount for old data
    const amountToPay = paymentDueAmount ?? ((credit.amountToPay as number) ?? null);
    const isClosed = credit.isClosed === true || status === "CLOSED";
    const needsManualReview = credit.needsManualReview === true;
    const monthlyDebtContribution =
      (credit.monthlyDebtContribution as number) ??
      (isClosed ? 0 : paymentDueAmount) ??
      null;
    const hasIdentityTheft = credit.hasIdentityTheft === true;
    const hasSettlementOrDiscount = credit.hasSettlementOrDiscount === true;

    // Layout-aware audit fields (Phase 1 of layout-aware-buro-extraction).
    // Read defensively so legacy extractedData (no audit fields yet) keeps
    // rendering: all values default to null/empty until Phase 4 wires them.
    const ffSourceRaw = credit.financialFieldsSource as string | null | undefined;
    const financialFieldsSource: FinancialFieldsSource | null =
      ffSourceRaw && Object.values(FinancialFieldsSource).includes(
        ffSourceRaw as FinancialFieldsSource,
      )
        ? (ffSourceRaw as FinancialFieldsSource)
        : null;
    const ffConfRaw = credit.financialFieldsConfidence as
      | Partial<FinancialFieldsConfidenceMap>
      | null
      | undefined;

    credits.push({
      institution: (credit.institution as string) ?? null,
      creditType: (credit.creditType as string) ?? null,
      classification,
      status,
      currentBalance: (credit.currentBalance as number) ?? null,
      amountToPay,
      paymentDueAmount,
      lastPaymentAmount,
      creditLimit: (credit.creditLimit as number) ?? null,
      currency: (credit.currency as string) ?? "MXN",
      paymentHistory: (credit.paymentHistory as string) ?? null,
      mopCodes: (credit.mopCodes as string[]) ?? [],
      observationKeys: (credit.observationKeys as string[]) ?? [],
      hasLatePayments: credit.hasLatePayments === true,
      hasSeriousDelinquency: credit.hasSeriousDelinquency === true,
      hasWriteOff: credit.hasWriteOff === true,
      hasSettlementOrDiscount,
      hasFraudFlag: credit.hasFraudFlag === true,
      hasIdentityTheft,
      isClosed,
      monthlyDebtContribution,
      rawTextReference: (credit.rawTextReference as string) ?? null,
      // ── Layout-aware audit fields (defaults; Phase 4 populates them) ──
      financialFieldsSource,
      financialFieldsConfidence: ffConfRaw
        ? {
            currentBalance:
              (ffConfRaw.currentBalance as FinancialFieldsConfidence) ??
              FinancialFieldsConfidence.LOW,
            creditLimit:
              (ffConfRaw.creditLimit as FinancialFieldsConfidence) ??
              FinancialFieldsConfidence.LOW,
            maxCredit:
              (ffConfRaw.maxCredit as FinancialFieldsConfidence) ??
              FinancialFieldsConfidence.LOW,
            lastPaymentAmount:
              (ffConfRaw.lastPaymentAmount as FinancialFieldsConfidence) ??
              FinancialFieldsConfidence.LOW,
            paymentDueAmount:
              (ffConfRaw.paymentDueAmount as FinancialFieldsConfidence) ??
              FinancialFieldsConfidence.LOW,
            pastDueAmount:
              (ffConfRaw.pastDueAmount as FinancialFieldsConfidence) ??
              FinancialFieldsConfidence.LOW,
          }
        : null,
      financialFieldsWarnings:
        (credit.financialFieldsWarnings as string[]) ?? [],
      candidatePaymentDueAmount:
        (credit.candidatePaymentDueAmount as number) ?? null,
      needsManualReview,
      // ── Payment due guardrail fields (Sprint 3 prep) ──
      paymentDueAmountSource:
        (credit.paymentDueAmountSource as PaymentDueAmountSource) ??
        PaymentDueAmountSource.UNCONFIRMED,
      paymentDueAmountConfirmed:
        credit.paymentDueAmountConfirmed === true,
      paymentDueAmountManualOverride:
        (credit.paymentDueAmountManualOverride as number) ?? null,
      // ── Triple-field pattern (Sprint 3 manual validation) ──
      paymentDueAmountExtracted:
        (credit.paymentDueAmountExtracted as number) ?? paymentDueAmount,
      paymentDueAmountManual:
        (credit.paymentDueAmountManual as number) ?? null,
      // Effective = manual ?? (confirmed ? extracted : null)
      paymentDueAmountEffective: (() => {
        const manual = (credit.paymentDueAmountManual as number) ?? null;
        if (manual !== null) return manual;
        const confirmed = credit.paymentDueAmountConfirmed === true;
        if (confirmed) return (credit.paymentDueAmountExtracted as number) ?? paymentDueAmount;
        return null;
      })(),
    });
  }

  // ── Risk summary ──────────────────────────────────────────────────────
  const riskRaw = (ed.riskSummary ?? {}) as Record<string, unknown>;
  const neutralKeys = ["CC", "CA", "AD"];
  const hasNonNeutralObsKeys = credits.some((c) =>
    c.observationKeys.some((k) => !neutralKeys.includes(k.toUpperCase())),
  );

  const riskSummary = {
    hasWriteOff: riskRaw.hasWriteOff === true,
    hasSettlementOrDiscount: riskRaw.hasSettlementOrDiscount === true,
    hasFraudFlag: riskRaw.hasFraudFlag === true,
    hasIdentityTheft: riskRaw.hasIdentityTheft === true,
    hasMinorDelinquency: riskRaw.hasMinorDelinquency === true,
    hasSeriousDelinquency: riskRaw.hasSeriousDelinquency === true,
    hasPreventiveKeys: hasNonNeutralObsKeys,
    possibleHomonym: (riskRaw.possibleHomonym as boolean) ?? null,
    riskNotes: (riskRaw.riskNotes as string) ?? null,
  };

  // ── Alerts ────────────────────────────────────────────────────────────
  let alerts = filterAlerts(ed.alerts);
  if (!hasNonNeutralObsKeys) {
    alerts = alerts.filter((a) => a.code !== "BURO_PREVENTIVE_KEYS");
  }
  // Merge score-related alerts from CREDIT_SCORE documents
  for (const sd of scoreDocs) {
    if (
      sd.documentStatus.code !== "PROCESSED" &&
      sd.documentStatus.code !== "DATA_EXTRACTED"
    )
      continue;
    if (!sd.extractedData) continue;
    const sdEd = sd.extractedData as Record<string, unknown>;
    const sdAlerts = filterAlerts(sdEd.alerts);
    // Only merge score alerts (avoid duplicating non-score alerts)
    for (const a of sdAlerts) {
      if (a.code.startsWith("BURO_SCORE") && !alerts.some((x) => x.code === a.code)) {
        alerts.push(a);
      }
    }
  }
  const hasCritical = alerts.some((a) => a.severity === "CRITICAL");
  const totalCritical = alerts.filter((a) => a.severity === "CRITICAL").length;
  const totalWarnings = alerts.filter((a) => a.severity === "WARNING").length;

  // ── Summary ───────────────────────────────────────────────────────────
  const summary: ParsedCreditBureauSummary = {
    totalCredits: credits.length,
    activeCredits,
    closedCredits,
    hasSeriousDelinquency: riskSummary.hasSeriousDelinquency,
    hasWriteOff: riskSummary.hasWriteOff,
    hasFraudFlag: riskSummary.hasFraudFlag,
    score,
    scoreIsExcluded,
    scoreExclusionReason,
    totalAlerts: alerts.length,
    totalCritical,
    totalWarnings,
  };

  return {
    documentId: doc.id,
    originalName: doc.originalName,
    statusCode: doc.documentStatus.code,
    statusName: doc.documentStatus.name,
    hasData: true,
    borrower,
    summary,
    score,
    scoreIsExcluded,
    scoreExclusionReason,
    scoreSource,
    consultationDate,
    numberOfInquiries,
    inquiries24mExtracted: numberOfInquiries,
    inquiries24mManual: (ed.inquiries24mManual as number) ?? null,
    inquiries24mEffective:
      (ed.inquiries24mManual as number) ??
      ((ed.inquiries24mConfirmed === true) ? numberOfInquiries : null),
    inquiries24mConfirmed: ed.inquiries24mConfirmed === true,
    credits,
    riskSummary,
    alerts,
    alertCount: alerts.length,
    hasCritical,
  };
}

// ---------------------------------------------------------------------------
// Liability calculation result types — inlined mirror of the API-side types
// in `apps/api/src/liability/liability.types.ts`. Apps/web is standalone (no
// cross-app imports), so these are duplicated intentionally.
// ---------------------------------------------------------------------------

export enum LiabilityCreditNature {
  REVOLVING = "REVOLVING",
  FIXED = "FIXED",
  UNKNOWN = "UNKNOWN",
}

export enum LiabilityInstitutionCategory {
  BANK = "BANK",
  DEPARTMENT_STORE = "DEPARTMENT_STORE",
  FINTECH = "FINTECH",
  NON_BANK_SERVICE = "NON_BANK_SERVICE",
}

export enum LiabilityStatus {
  CALCULATED = "CALCULATED",
  REQUIRES_REVIEW = "REQUIRES_REVIEW",
  INCOMPLETE = "INCOMPLETE",
}

export enum LiabilityClassificationSource {
  EXTRACTED = "EXTRACTED",
  KEYWORD = "KEYWORD",
  MANUAL = "MANUAL",
  FALLBACK = "FALLBACK",
}

export enum GlobalLiabilityStatus {
  CALCULATED = "CALCULATED",
  PARTIAL = "PARTIAL",
  INCOMPLETE = "INCOMPLETE",
}

export enum LiabilityRuleApplied {
  REVOLVING_STANDARD = "REVOLVING_STANDARD",
  FIXED_DIRECT = "FIXED_DIRECT",
  UNKNOWN_PROVISIONAL = "UNKNOWN_PROVISIONAL",
  CLOSED_ZERO = "CLOSED_ZERO",
  INCOMPLETE_DATA = "INCOMPLETE_DATA",
}

/** Enriched credit result from the liability calculation engine (HU-11). */
export interface LiabilityCreditResult {
  creditReference: string;
  institution: string;
  creditType: string;
  productName?: string;
  classification: string;
  status: string;
  currentBalance: number | null;
  paymentDueAmountEffective: number | null;
  isClosed: boolean;
  monthlyDebtContribution: number | null;
  creditNature: LiabilityCreditNature;
  institutionCategory: LiabilityInstitutionCategory;
  ruleApplied: LiabilityRuleApplied;
  liabilityStatus: LiabilityStatus;
  classificationSource: LiabilityClassificationSource;
  classificationReason: string | null;
}

/** Full liability calculation result returned by the API (HU-11). */
export interface LiabilityCalculationResult {
  id: string;
  caseId: string;
  calculatedAt: string;
  factorUsed: number;
  rulesVersion: string;
  credits: LiabilityCreditResult[];
  globalStatus: GlobalLiabilityStatus;
  grossCurrentMonthlyDebt: number;
  totalCurrentBalance: number;
}

// ── CSF extraction parsing ──────────────────────────────────────────────────

export interface ParsedCsf {
  documentId: string;
  originalName: string;
  statusCode: string;
  statusName: string;
  hasData: boolean;
  taxpayer: {
    rfc: string | null;
    curp: string | null;
    fullName: string | null;
    operationsStartDate: string | null;
    statusInPadron: string | null;
    commercialName: string | null;
  };
  issuance: {
    issuanceDate: string | null;
    issuanceDateRaw: string | null;
    issuanceLocation: string | null;
    idCIF: string | null;
    isOlderThan3Months: boolean;
  };
  fiscalAddress: {
    postalCode: string | null;
    street: string | null;
    neighborhood: string | null;
    municipality: string | null;
    state: string | null;
  };
  activities: Array<{
    order?: number | null;
    description: string;
    percentage: number | null;
    startDate: string | null;
    endDate: string | null;
  }>;
  regimes: Array<{
    description: string;
    startDate: string | null;
    endDate: string | null;
  }>;
  activityStartDate: string | null;
  tenureMonths: number | null;
  hasSalariedRegime: boolean;
  hasIndependentRegime: boolean;
  isSolelySalaried: boolean;
  alerts: ExtractionAlert[];
}

function isSalariedCsfActivity(description: string): boolean {
  return /asalariado|sueldos/i.test(description);
}

function pickIndependentActivityStartDate(
  activities: ParsedCsf["activities"],
): string | null {
  const independent = activities.filter(
    (activity) =>
      activity.endDate == null &&
      activity.startDate &&
      activity.description &&
      !isSalariedCsfActivity(activity.description),
  );
  if (independent.length === 0) return null;
  independent.sort((a, b) => {
    const pctA = a.percentage ?? -1;
    const pctB = b.percentage ?? -1;
    if (pctB !== pctA) return pctB - pctA;
    const orderA = a.order ?? 999;
    const orderB = b.order ?? 999;
    return orderA - orderB;
  });
  return independent[0].startDate;
}

function monthsSinceYearMonth(iso: string): number | null {
  const match = /^(\d{4})-(\d{2})/.exec(iso.trim());
  if (!match) return null;
  const now = new Date();
  const total =
    (now.getFullYear() - Number(match[1])) * 12 +
    (now.getMonth() + 1 - Number(match[2]));
  return Math.max(0, total);
}

export function parseCsf(doc: Document): ParsedCsf | null {
  if (!doc) return null;
  const ed = doc.extractedData as Record<string, unknown> | null;
  if (!ed || typeof ed !== "object") {
    return {
      documentId: doc.id,
      originalName: doc.originalName,
      statusCode: doc.documentStatus.code,
      statusName: doc.documentStatus.name,
      hasData: false,
      taxpayer: { rfc: null, curp: null, fullName: null, operationsStartDate: null, statusInPadron: null, commercialName: null },
      issuance: { issuanceDate: null, issuanceDateRaw: null, issuanceLocation: null, idCIF: null, isOlderThan3Months: false },
      fiscalAddress: { postalCode: null, street: null, neighborhood: null, municipality: null, state: null },
      activities: [],
      regimes: [],
      activityStartDate: null,
      tenureMonths: null,
      hasSalariedRegime: false,
      hasIndependentRegime: false,
      isSolelySalaried: false,
      alerts: [],
    };
  }

  const taxpayer = (ed.taxpayer as Record<string, unknown>) ?? {};
  const issuance = (ed.issuance as Record<string, unknown>) ?? {};
  const fa = (ed.fiscalAddress as Record<string, unknown>) ?? {};
  const activities = Array.isArray(ed.activities) ? (ed.activities as ParsedCsf["activities"]) : [];
  const regimes = Array.isArray(ed.regimes) ? (ed.regimes as ParsedCsf["regimes"]) : [];
  const alerts = filterAlerts(ed.alerts);

  const street = [fa.streetType, fa.streetName, fa.exteriorNumber, fa.interiorNumber].filter(Boolean).join(" ").trim() || null;

  const independentStart = pickIndependentActivityStartDate(activities);
  const activityStartDate =
    independentStart ?? (ed.activityStartDate as string) ?? null;
  const tenureMonths = independentStart
    ? (monthsSinceYearMonth(independentStart) ??
      (ed.tenureMonths as number) ??
      null)
    : ((ed.tenureMonths as number) ?? null);

  return {
    documentId: doc.id,
    originalName: doc.originalName,
    statusCode: doc.documentStatus.code,
    statusName: doc.documentStatus.name,
    hasData: true,
    taxpayer: {
      rfc: (taxpayer.rfc as string) ?? null,
      curp: (taxpayer.curp as string) ?? null,
      fullName: (taxpayer.fullName as string) ?? null,
      operationsStartDate: (taxpayer.operationsStartDate as string) ?? null,
      statusInPadron: (taxpayer.statusInPadron as string) ?? null,
      commercialName: (taxpayer.commercialName as string) ?? null,
    },
    issuance: {
      issuanceDate: (issuance.issuanceDate as string) ?? null,
      issuanceDateRaw: (issuance.issuanceDateRaw as string) ?? null,
      issuanceLocation: (issuance.issuanceLocation as string) ?? null,
      idCIF: (issuance.idCIF as string) ?? null,
      isOlderThan3Months: issuance.isOlderThan3Months === true,
    },
    fiscalAddress: {
      postalCode: (fa.postalCode as string) ?? null,
      street,
      neighborhood: (fa.neighborhood as string) ?? null,
      municipality: (fa.municipality as string) ?? null,
      state: (fa.state as string) ?? null,
    },
    activities,
    regimes,
    activityStartDate,
    tenureMonths,
    hasSalariedRegime: ed.hasSalariedRegime === true,
    hasIndependentRegime: ed.hasIndependentRegime === true,
    isSolelySalaried: ed.isSolelySalaried === true,
    alerts,
  };
}

// ── Tax Return extraction parsing ──────────────────────────────────────────

export interface ParsedTaxReturn {
  documentId: string;
  originalName: string;
  statusCode: string;
  statusName: string;
  hasData: boolean;
  satReceipt: {
    rfc: string | null;
    taxpayerName: string | null;
    declarationType: string | null;
    taxYear: number | null;
    presentationDate: string | null;
    operationNumber: string | null;
  };
  taxPayment?: {
    paymentConcept: string | null;
    amountInFavor: number | null;
    amountDue: number | null;
    amountToPay: number | null;
  };
  declaredRegimes: string[];
  salariedIncome?: {
    annualGrossIncome: number | null;
    exemptIncome: number | null;
    employmentSubsidy: number | null;
    taxWithheld: number | null;
    retainers?: Array<{
      rfc: string | null;
      legalName: string | null;
      annualIncome: number | null;
      taxWithheld: number | null;
    }>;
  };
  businessOrProfessionalIncome?: {
    totalIncome: number | null;
    detailedIncome?: Array<{
      concept: string;
      amount: number;
    }>;
    taxWithheld: number | null;
    authorizedDeductions: number | null;
  };
  resicoIncome?: {
    totalEffectiveIncome: number | null;
    totalActivityIncome: number | null;
    taxWithheld: number | null;
  };
  fiscalResult: {
    accumulableIncomeTotal: number | null;
    fiscalProfit: number | null;
    fiscalLoss: number | null;
    taxResult: number | null;
  };
  isValidTaxYear: boolean;
  hasTaxLoss: boolean;
  isMixedDeclaration: boolean;
  hasOfficialReceipt: boolean;
  alerts: ExtractionAlert[];
}

export function parseTaxReturn(doc: Document): ParsedTaxReturn | null {
  if (!doc) return null;
  const ed = doc.extractedData as Record<string, unknown> | null;
  if (!ed || typeof ed !== "object") {
    return {
      documentId: doc.id,
      originalName: doc.originalName,
      statusCode: doc.documentStatus.code,
      statusName: doc.documentStatus.name,
      hasData: false,
      satReceipt: { rfc: null, taxpayerName: null, declarationType: null, taxYear: null, presentationDate: null, operationNumber: null },
      declaredRegimes: [],
      fiscalResult: { accumulableIncomeTotal: null, fiscalProfit: null, fiscalLoss: null, taxResult: null },
      isValidTaxYear: false,
      hasTaxLoss: false,
      isMixedDeclaration: false,
      hasOfficialReceipt: false,
      alerts: [],
    };
  }

  const satReceipt = (ed.satReceipt as Record<string, unknown>) ?? {};
  const taxPayment = (ed.taxPayment as Record<string, unknown>) ?? {};
  const fiscalResult = (ed.fiscalResult as Record<string, unknown>) ?? {};
  const salariedIncome = (ed.salariedIncome as Record<string, unknown>) ?? undefined;
  const businessOrProfessionalIncome = (ed.businessOrProfessionalIncome as Record<string, unknown>) ?? undefined;
  const resicoIncome = (ed.resicoIncome as Record<string, unknown>) ?? undefined;
  const declaredRegimes = Array.isArray(ed.declaredRegimes) ? (ed.declaredRegimes as string[]) : [];
  const alerts = filterAlerts(ed.alerts);

  return {
    documentId: doc.id,
    originalName: doc.originalName,
    statusCode: doc.documentStatus.code,
    statusName: doc.documentStatus.name,
    hasData: true,
    satReceipt: {
      rfc: (satReceipt.rfc as string) ?? null,
      taxpayerName: (satReceipt.taxpayerName as string) ?? null,
      declarationType: (satReceipt.declarationType as string) ?? null,
      taxYear: (satReceipt.taxYear as number) ?? null,
      presentationDate: (satReceipt.presentationDate as string) ?? null,
      operationNumber: (satReceipt.operationNumber as string) ?? null,
    },
    taxPayment: {
      paymentConcept: (taxPayment.paymentConcept as string) ?? null,
      amountInFavor: (taxPayment.amountInFavor as number) ?? null,
      amountDue: (taxPayment.amountDue as number) ?? null,
      amountToPay: (taxPayment.amountToPay as number) ?? null,
    },
    declaredRegimes,
    salariedIncome: salariedIncome as ParsedTaxReturn["salariedIncome"],
    businessOrProfessionalIncome: businessOrProfessionalIncome as ParsedTaxReturn["businessOrProfessionalIncome"],
    resicoIncome: resicoIncome as ParsedTaxReturn["resicoIncome"],
    fiscalResult: {
      accumulableIncomeTotal: (fiscalResult.accumulableIncomeTotal as number) ?? null,
      fiscalProfit: (fiscalResult.fiscalProfit as number) ?? null,
      fiscalLoss: (fiscalResult.fiscalLoss as number) ?? null,
      taxResult: (fiscalResult.taxResult as number) ?? null,
    },
    isValidTaxYear: ed.isValidTaxYear === true,
    hasTaxLoss: ed.hasTaxLoss === true,
    isMixedDeclaration: ed.isMixedDeclaration === true,
    hasOfficialReceipt: ed.hasOfficialReceipt === true,
    alerts,
  };
}
