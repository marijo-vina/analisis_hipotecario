// ---------------------------------------------------------------------------
// HU-04 — TypeScript interfaces for the full mortgage-analysis frontend
// Source: design.md § Key Interfaces & orchestrator task detail
// ---------------------------------------------------------------------------

// ---- User (extracted from LoginResponse for reuse) ------------------------
export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

// ---- Auth -----------------------------------------------------------------
export interface LoginResponse {
  access_token: string;
  user: User;
}

// ---- Domain entities ------------------------------------------------------
export interface Client {
  id: string;
  firstName: string;
  paternalLastName: string;
  maternalLastName?: string;
  fullName: string;
  rfc?: string;
  curp?: string;
  email: string;
  phone: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreditType {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
}

// ---- CMA Bank Catalog (PR 6) -----------------------------------------------

export interface Bank {
  id: string;
  code: string;
  name: string;
  incomeCriterion: 'NET' | 'GROSS';
  debtCommitmentFactor: number;
  minimumBureauScore: number | null;
  isActive: boolean;
  _count?: { policies: number };
}

export interface BankPolicy {
  id: string;
  bankId: string;
  destination: string;
  minimumIncome: number | null;
  minimumPropertyValue: number | null;
  minimumEmploymentTenureMonths: number | null;
  minimumApplicantAgeMonths: number | null;
  maximumApplicationAgeMonths: number | null;
  isActive: boolean;
}

export interface BankDetail extends Bank {
  policies: BankPolicy[];
}

export interface CaseStatus {
  id: number;
  code: string;
  name: string;
  order: number;
}

export interface MortgageCase {
  id: string;
  clientId: string;
  client: { fullName: string };
  advisor: { name: string };
  creditType: { id: number; code: string; name: string };
  status: { code: string; name: string };
  personType: string;
  propertyLocation?: string;
  requestedAmount?: number;
  propertyValue?: number;
  estimatedTermMonths?: number;
  notes?: string;
  documents?: Array<{
    id: string;
    documentStatus: { id: number; code: string; name: string };
    documentType: { id: number; code: string; name: string };
    processingError?: string | null;
  }>;
  createdAt: string;
  updatedAt: string;
}

// ---- Generic responses ----------------------------------------------------
export interface PaginatedMeta {
  total: number;
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginatedMeta;
}

// ---- Form / action state --------------------------------------------------
export interface ActionState {
  errors?: Record<string, string>;
  success?: boolean;
  redirect?: string;
}

// ---- API result (discriminated union) -------------------------------------
export type ApiResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      errors: Record<string, string>;
      notFound?: boolean;
      status?: number;
    };

// ---- Document (HU-07) ------------------------------------------------------
export interface DocumentType {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
}

export interface Document {
  id: string;
  mortgageCaseId: string;
  documentTypeId: number;
  documentType: DocumentType;
  documentStatusId: number;
  documentStatus: { id: number; code: string; name: string; order: number };
  fileUrl: string | null;
  storagePath: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  originalName: string;
  uploadedById: string;
  uploadedBy?: { id: string; name: string };
  // OCR fields (HU-07 document processing)
  ocrText?: string;
  processedAt?: string;
  processingError?: string | null;
  // AI extraction (Task 2.7)
  extractedData?: Record<string, unknown> | null;
  // Conciliation persistence (HU-12)
  processingResults?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

// ---- Analysis (Sprint 3 HU-09) --------------------------------------------

export interface FieldComparison {
  fieldName: string;
  originalValue: Record<string, string | null>;
  normalizedValue: Record<string, string | null>;
  status: "MATCH" | "MISMATCH" | "NOT_AVAILABLE";
  severity: "INFO" | "WARNING" | "ERROR";
  alerts: string[];
}

export interface AnalysisDetail {
  sources: string[];
  fields: FieldComparison[];
  bankViability?: BankViabilitySnapshot;
}

export interface AnalysisAlert {
  id: string;
  ruleCode: string;
  severity: string;
  field: string;
  message: string;
}

export interface AnalysisRun {
  id: string;
  executionStatus: "PENDING" | "RUNNING" | "COMPLETED" | "ERROR";
  outcome: "PASS" | "PARTIAL" | "FAIL";
  detail: AnalysisDetail;
  triggeredBy: string;
  createdAt: string;
  alerts?: AnalysisAlert[];
  reviewDecisions?: ReviewDecision[];
}

export interface ReviewDecision {
  id: string;
  action: "MARK_FALSE_POSITIVE" | "CONFIRM_ISSUE" | "CANCEL_CASE";
  justification?: string | null;
  decidedBy: string;
  decidedAt: string;
}

export interface AnalysisResult {
  runId: string;
  executionStatus: string;
  outcome: "PASS" | "PARTIAL" | "FAIL";
  summary: string;
  detail: AnalysisDetail;
  executionMetadata: {
    timestamp: string;
    triggeredBy: string;
  };
}

// ---- Bank Viability (HU-14B) -----------------------------------------------

export type ProductMatchStatus =
  | "PRELIMINARY_VIABLE"
  | "CONDITIONED"
  | "NOT_COMPATIBLE"
  | "REQUIRES_REVIEW";

/** @deprecated Use BankResultStatus instead. Kept for backward compat. */
export type BankResultStatus = ProductMatchStatus;

export type CheckStatus =
  | "PASS"
  | "FAIL"
  | "REQUIRES_REVIEW"
  | "NOT_APPLICABLE";

export interface CheckResult {
  status: CheckStatus;
  [key: string]: unknown;
}

export interface BankViabilityInputs {
  confirmedGrossIncome: string | null;
  confirmedNetIncome: string | null;
  totalMonthlyLiabilities: string | null;
  requestedAmount: string | null;
  propertyValue: string | null;
  estimatedTermMonths: number | null;
  birthDate: string | null;
  employmentStartDate: string | null;
  hasPagadoraIncome: boolean;
  scotiabankExcluded: boolean;
}

export interface BankResultCalculation {
  incomeUsed: string | null;
  maximumDebt: string | null;
  totalMonthlyLiabilities: string | null;
  availableCapacity: string | null;
  currentAgeMonths: number | null;
  ageAtMaturityMonths: number | null;
  employmentTenureMonths: number | null;
}

/** @deprecated Use BankResultCalculation instead. Kept for backward compat. */
export type ProductMatchCalculation = BankResultCalculation;

export interface BankPolicySnapshot {
  /**
   * Optional bank display name. The backend `policySnapshot` may not include
   * `bankName`; the UI falls back to `bankCode` when this is absent.
   */
  bankName?: string;
  incomeCriterion: string;
  debtCommitmentFactor: string;
  minimumEmploymentTenureMonths: number | null;
  minimumApplicantAgeMonths: number | null;
  maximumApplicationAgeMonths: number | null;
  minimumIncome: string | null;
  minimumPropertyValue: string | null;
  minimumBureauScore?: number | null;
}

/** @deprecated Use BankPolicySnapshot instead. Kept for backward compat. */
export type ProductPolicySnapshot = BankPolicySnapshot;

export interface BankResult {
  bankCode: string;
  productCode: string;
  status: ProductMatchStatus;
  reasons: string[];
  policySnapshot: BankPolicySnapshot;
  calculation: BankResultCalculation;
  checks: Record<string, CheckResult>;
}

/** @deprecated Use BankResult instead. Kept for backward compat. */
export type ProductMatch = BankResult;

export interface BankViabilitySnapshot {
  sourceVersion: string;
  creditTypeCode: string;
  destination: string | null;
  calculatedAt: string;
  warningLegend: string;
  reasons: string[];
  inputs: BankViabilityInputs;
  bankResults: BankResult[];
}

export const STATUS_LABELS: Record<string, string> = {
  PRELIMINARY_VIABLE: "Viable preliminarmente",
  CONDITIONED: "Condicionado",
  REQUIRES_REVIEW: "Requiere revisión",
  NOT_COMPATIBLE: "No compatible",
};

export const REASON_LABELS: Record<string, string> = {
  NEGATIVE_CAPACITY: "Capacidad de pago insuficiente",
  LTV_EXCEEDED: "Aforo excede el máximo permitido",
  MATURITY_AGE_EXCEEDED: "Edad al vencimiento excede el máximo",
  NO_VALID_TERM_AVAILABLE: "Sin plazo válido disponible",
  MINIMUM_AGE_NOT_MET: "Edad mínima no alcanzada",
  MAXIMUM_APPLICATION_AGE_EXCEEDED: "Edad máxima de solicitud excedida",
  INSUFFICIENT_EMPLOYMENT_TENURE: "Antigüedad laboral insuficiente",
  UNCONFIRMED_INCOME: "Ingreso no confirmado",
  SCOTIABANK_PAGADORA_EXCLUSION: "Exclusión Scotiabank por nómina Pagadora",
  INVALID_REQUESTED_AMOUNT: "Monto solicitado inválido",
  INVALID_PROPERTY_VALUE: "Valor del inmueble inválido",
  CONFLICTING_EMPLOYMENT_DATES: "Fechas de empleo inconsistentes",
  MISSING_INCOME_CALCULATION: "Sin cálculo de ingresos",
  MISSING_LIABILITY_SNAPSHOT: "Sin snapshot de pasivos",
  UNSUPPORTED_DESTINATION: "Destino no soportado",
  MISSING_BIRTH_DATE: "Fecha de nacimiento no disponible",
  MISSING_EMPLOYMENT_DATA: "Datos de empleo no disponibles",
  INCOME_BELOW_MINIMUM: "Ingreso por debajo del mínimo requerido",
  PROPERTY_VALUE_BELOW_MINIMUM: "Valor del inmueble por debajo del mínimo requerido",
  SANTANDER_MOP_KNOCKOUT: "Histórico de morosidad excede la tolerancia del banco",
  BUREAU_SCORE_UNIVERSAL_REJECTION: "Score de Buró menor a 500 puntos (Rechazo universal)",
  QUITA_QUEBRANTO_REJECTED: "Registro de quita o quebranto en Buró de Crédito",
  FRAUD_IDENTITY_THEFT_REJECTED: "Alerta de riesgo de fraude o robo de identidad",
};

export function getReasonLabel(reason: string): string {
  if (REASON_LABELS[reason]) return REASON_LABELS[reason];
  if (reason.endsWith("_SCORE_BELOW_THRESHOLD")) {
    return "Score de Buró por debajo del mínimo requerido";
  }
  return reason;
}

export const INCOME_CRITERION_LABELS: Record<string, string> = {
  NET: 'Neto',
  GROSS: 'Bruto',
};

export const DESTINATION_LABELS: Record<string, string> = {
  ACQUISITION: "Adquisición",
  LIQUIDITY: "Liquidez",
  MORTGAGE_REPLACEMENT: "Sustitución",
  TERRENO: "Terreno",
  CONSTRUCCION: "Construcción",
  REMODELACION: "Remodelación",
};
