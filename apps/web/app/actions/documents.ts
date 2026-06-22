"use server";

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
): Promise<{ success: boolean; ocrText: string; processedAt: string }> {
  const result = await apiFetch<{
    data: { ocrText: string; processedAt: string };
  }>(
    `/mortgage-cases/${caseId}/documents/${documentId}/process`,
    { method: "POST" },
  );

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
