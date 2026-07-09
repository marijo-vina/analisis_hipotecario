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
