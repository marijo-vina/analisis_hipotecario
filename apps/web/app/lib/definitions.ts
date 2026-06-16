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
  creditType: { code: string; name: string };
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
  createdAt: string;
  updatedAt: string;
}
