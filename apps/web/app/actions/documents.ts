"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/app/lib/api";

/**
 * Obtiene una URL firmada (signed URL) para visualizar un documento.
 *
 * Llama a `GET /mortgage-cases/:caseId/documents/:documentId/view` del
 * backend NestJS. La URL tiene expiración de 5 minutos y se abre en una
 * pestaña nueva del navegador.
 */
export async function getDocumentViewUrl(
  caseId: string,
  documentId: string,
): Promise<string> {
  const result = await apiFetch<{ data: { signedUrl: string } }>(
    `/mortgage-cases/${caseId}/documents/${documentId}/view`,
  );

  if (!result.ok) {
    throw new Error(
      result.errors._form ?? "Error al obtener el documento",
    );
  }

  return result.data.data.signedUrl;
}

/**
 * Elimina un documento (GCS + DB) cuando su estado es UPLOADED.
 *
 * Llama a `DELETE /mortgage-cases/:caseId/documents/:documentId` (204 No Content).
 * El backend maneja la atomicidad GCS-first: si GCS falla, la DB se preserva.
 */
export async function deleteDocument(
  caseId: string,
  documentId: string,
): Promise<{ success: boolean }> {
  const result = await apiFetch(
    `/mortgage-cases/${caseId}/documents/${documentId}`,
    { method: "DELETE" },
  );

  if (!result.ok) {
    throw new Error(
      result.errors._form ?? "Error al eliminar el documento",
    );
  }

  return { success: true };
}

/**
 * Procesa un documento con OCR (Google Document AI).
 *
 * Llama a `POST /mortgage-cases/:caseId/documents/:documentId/process`
 * del backend NestJS. La operación es sincrónica (~5-30s). Retorna
 * el texto extraído y la fecha de procesamiento.
 *
 * @throws {Error} si el backend responde con error (400/409) o hay fallo de red.
 */
export async function processDocument(
  caseId: string,
  documentId: string,
  force?: boolean,
): Promise<{ success: boolean; ocrText: string; processedAt: string }> {
  const url = `/mortgage-cases/${caseId}/documents/${documentId}/process${force ? "?force=true" : ""}`;
  const result = await apiFetch<{
    data: { ocrText: string; processedAt: string };
  }>(url, { method: "POST" });

  if (!result.ok) {
    throw new Error(
      result.errors._form ?? "Error al procesar el documento",
    );
  }

  return {
    success: true,
    ocrText: result.data.data.ocrText,
    processedAt: result.data.data.processedAt,
  };
}

/**
 * Extrae datos estructurados de un documento de identificación oficial (INE/pasaporte)
 * usando Gemini AI.
 *
 * Llama a `POST /mortgage-cases/:caseId/documents/:documentId/extract`
 * del backend NestJS. El documento debe estar en estado PROCESSED.
 *
 * @throws {Error} si el backend responde con error o hay fallo de red.
 */
export async function extractOfficialId(
  caseId: string,
  documentId: string,
): Promise<{
  success: boolean;
  extractedData: Record<string, unknown> | null;
  alerts: Array<{
    code: string;
    severity: string;
    category: string;
    message: string;
    field: string | null;
    requiresManualReview: boolean;
  }>;
  missingFields: string[];
}> {
  const result = await apiFetch<{
    data: {
      success: boolean;
      extractedData: Record<string, unknown> | null;
      alerts: Array<{
        code: string;
        severity: string;
        category: string;
        message: string;
        field: string | null;
        requiresManualReview: boolean;
      }>;
      missingFields: string[];
    };
  }>(
    `/mortgage-cases/${caseId}/documents/${documentId}/extract`,
    { method: "POST" },
  );

  if (!result.ok) {
    throw new Error(
      result.errors._form ?? "Error al extraer datos del documento",
    );
  }

  return result.data.data;
}

/**
 * Extrae datos estructurados de un recibo de nómina (CFDI) usando Gemini AI.
 *
 * Llama a `POST /mortgage-cases/:caseId/documents/:documentId/extract-payroll`
 * del backend NestJS. El documento debe estar en estado PROCESSED.
 *
 * @throws {Error} si el backend responde con error o hay fallo de red.
 */
export async function extractPayrollReceipt(
  caseId: string,
  documentId: string,
): Promise<{
  success: boolean;
  extractedData: Record<string, unknown> | null;
  alerts: Array<{
    code: string;
    severity: string;
    category: string;
    message: string;
    field: string | null;
    requiresManualReview: boolean;
  }>;
  missingFields: string[];
}> {
  const result = await apiFetch<{
    data: {
      success: boolean;
      extractedData: Record<string, unknown> | null;
      alerts: Array<{
        code: string;
        severity: string;
        category: string;
        message: string;
        field: string | null;
        requiresManualReview: boolean;
      }>;
      missingFields: string[];
    };
  }>(
    `/mortgage-cases/${caseId}/documents/${documentId}/extract-payroll`,
    { method: "POST" },
  );

  if (!result.ok) {
    throw new Error(
      result.errors._form ?? "Error al extraer datos del recibo de nómina",
    );
  }

  return result.data.data;
}

/**
 * Extrae datos estructurados de un estado de cuenta bancario usando Gemini AI.
 *
 * Llama a `POST /mortgage-cases/:caseId/documents/:documentId/extract-bank-statement`
 * del backend NestJS. El documento debe estar en estado PROCESSED.
 *
 * @throws {Error} si el backend responde con error o hay fallo de red.
 */
export async function extractBankStatement(
  caseId: string,
  documentId: string,
): Promise<{
  success: boolean;
  extractedData: Record<string, unknown> | null;
  alerts: Array<{
    code: string;
    severity: string;
    category: string;
    message: string;
    field: string | null;
    requiresManualReview: boolean;
  }>;
  missingFields: string[];
}> {
  const result = await apiFetch<{
    data: {
      success: boolean;
      extractedData: Record<string, unknown> | null;
      alerts: Array<{
        code: string;
        severity: string;
        category: string;
        message: string;
        field: string | null;
        requiresManualReview: boolean;
      }>;
      missingFields: string[];
    };
  }>(
    `/mortgage-cases/${caseId}/documents/${documentId}/extract-bank-statement`,
    { method: "POST" },
  );

  if (!result.ok) {
    throw new Error(
      result.errors._form ??
        "Error al extraer datos del estado de cuenta",
    );
  }

  return result.data.data;
}

/**
 * Extrae datos estructurados de un reporte de Buró de Crédito Especial
 * usando Gemini AI.
 *
 * Llama a `POST /mortgage-cases/:caseId/documents/:documentId/extract-bureau`
 * del backend NestJS. El documento debe estar en estado PROCESSED.
 *
 * @throws {Error} si el backend responde con error o hay fallo de red.
 */
export async function extractCreditBureau(
  caseId: string,
  documentId: string,
): Promise<{
  success: boolean;
  extractedData: Record<string, unknown> | null;
  alerts: Array<{
    code: string;
    severity: string;
    category: string;
    message: string;
    field: string | null;
    requiresManualReview: boolean;
  }>;
  missingFields: string[];
}> {
  const result = await apiFetch<{
    data: {
      success: boolean;
      extractedData: Record<string, unknown> | null;
      alerts: Array<{
        code: string;
        severity: string;
        category: string;
        message: string;
        field: string | null;
        requiresManualReview: boolean;
      }>;
      missingFields: string[];
    };
  }>(
    `/mortgage-cases/${caseId}/documents/${documentId}/extract-bureau`,
    { method: "POST" },
  );

  if (!result.ok) {
    throw new Error(
      result.errors._form ??
        "Error al extraer datos del buró de crédito",
    );
  }

  return result.data.data;
}

/**
 * Actualiza manualmente el "Monto a pagar" de un crédito específico dentro
 * de un reporte de Buró de Crédito extraído.
 *
 * Llama a `PATCH /mortgage-cases/:caseId/documents/:documentId/credits/:creditIndex/payment-due`
 * del backend NestJS. El override manual establece `paymentDueAmountSource = MANUAL`
 * y recalcula `monthlyDebtContribution`.
 *
 * @throws {Error} si el backend responde con error o hay fallo de red.
 */
export async function updatePaymentDueManual(
  caseId: string,
  documentId: string,
  creditIndex: number,
  paymentDueAmountManualOverride: number | null,
): Promise<{ success: boolean }> {
  const result = await apiFetch(
    `/mortgage-cases/${caseId}/documents/${documentId}/credits/${creditIndex}/payment-due`,
    {
      method: "PATCH",
      body: { paymentDueAmountManualOverride },
    },
  );

  if (!result.ok) {
    throw new Error(
      result.errors._form ?? "Error al actualizar el monto a pagar",
    );
  }

  return { success: true };
}

/**
 * Actualiza manualmente el valor de "Consultas 24 meses" de un reporte
 * de Buró de Crédito extraído.
 *
 * Llama a `PATCH /mortgage-cases/:caseId/documents/:documentId/inquiries`
 * del backend NestJS.
 *
 * @throws {Error} si el backend responde con error o hay fallo de red.
 */
export async function updateInquiries24mManual(
  caseId: string,
  documentId: string,
  inquiries24mManual: number | null,
): Promise<{ success: boolean }> {
  const result = await apiFetch(
    `/mortgage-cases/${caseId}/documents/${documentId}/inquiries`,
    {
      method: "PATCH",
      body: { inquiries24mManual },
    },
  );

  if (!result.ok) {
    throw new Error(
      result.errors._form ?? "Error al actualizar consultas 24 meses",
    );
  }

  return { success: true };
}

/**
 * Extrae el score crediticio de un documento "Mi Score"
 * usando Gemini AI.
 *
 * Llama a `POST /mortgage-cases/:caseId/documents/:documentId/extract-score`
 * del backend NestJS. El documento debe estar en estado PROCESSED.
 *
 * @throws {Error} si el backend responde con error o hay fallo de red.
 */
export async function extractCreditScore(
  caseId: string,
  documentId: string,
): Promise<{
  success: boolean;
  score: number | null;
  scoreIsExcluded: boolean;
  scoreExclusionReason: string | null;
}> {
  const result = await apiFetch<{
    data: {
      success: boolean;
      score: number | null;
      scoreIsExcluded: boolean;
      scoreExclusionReason: string | null;
    };
  }>(
    `/mortgage-cases/${caseId}/documents/${documentId}/extract-score`,
    { method: "POST" },
  );

  if (!result.ok) {
    throw new Error(
      result.errors._form ??
        "Error al extraer el score crediticio",
    );
  }

  return result.data.data;
}

/**
 * Actualiza manualmente un campo extraído de un documento.
 *
 * Llama a `PATCH /mortgage-cases/:caseId/documents/:documentId/extracted-data`
 * del backend NestJS y revalida la ruta del expediente.
 */
export async function updateDocumentExtractedDataField(
  caseId: string,
  documentId: string,
  label: string,
  value: string,
): Promise<{ success: boolean; extractedData: Record<string, unknown> }> {
  const result = await apiFetch<{
    data: Record<string, unknown>;
  }>(
    `/mortgage-cases/${caseId}/documents/${documentId}/extracted-data`,
    {
      method: "PATCH",
      body: { label, value },
    },
  );

  if (!result.ok) {
    throw new Error(
      result.errors._form ??
        "Error al actualizar los datos extraídos del documento",
    );
  }

  revalidatePath(`/dashboard/expedientes/${caseId}`);
  return { success: true, extractedData: result.data.data };
}

/**
 * Extrae datos estructurados de una Constancia de Situación Fiscal (CSF)
 * usando Gemini AI.
 *
 * Llama a `POST /mortgage-cases/:caseId/documents/:documentId/extract-csf`
 * del backend NestJS. El documento debe estar en estado PROCESSED.
 */
export async function extractCsf(
  caseId: string,
  documentId: string,
): Promise<{
  success: boolean;
  extractedData: Record<string, unknown> | null;
}> {
  const result = await apiFetch<{
    data: Record<string, unknown>;
  }>(
    `/mortgage-cases/${caseId}/documents/${documentId}/extract-csf`,
    { method: "POST" },
  );

  if (!result.ok) {
    throw new Error(
      result.errors._form ?? "Error al extraer datos de la Constancia de Situación Fiscal",
    );
  }

  revalidatePath(`/dashboard/expedientes/${caseId}`);
  return { success: true, extractedData: result.data.data };
}

/**
 * Extrae datos estructurados de una Declaración Anual del SAT
 * usando Gemini AI.
 *
 * Llama a `POST /mortgage-cases/:caseId/documents/:documentId/extract-tax-return`
 * del backend NestJS. El documento debe estar en estado PROCESSED.
 */
export async function extractTaxReturn(
  caseId: string,
  documentId: string,
): Promise<{
  success: boolean;
  extractedData: Record<string, unknown> | null;
}> {
  const result = await apiFetch<{
    data: Record<string, unknown>;
  }>(
    `/mortgage-cases/${caseId}/documents/${documentId}/extract-tax-return`,
    { method: "POST" },
  );

  if (!result.ok) {
    throw new Error(
      result.errors._form ?? "Error al extraer datos de la Declaración Anual",
    );
  }

  revalidatePath(`/dashboard/expedientes/${caseId}`);
  return { success: true, extractedData: result.data.data };
}

