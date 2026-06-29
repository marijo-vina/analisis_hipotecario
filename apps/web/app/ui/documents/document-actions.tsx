"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Document } from "@/app/lib/definitions";
import { getDocumentViewUrl, deleteDocument, processDocument, extractOfficialId, extractPayrollReceipt, extractBankStatement } from "@/app/actions/documents";
import Button from "@/app/ui/common/button";
import ConfirmDialog from "@/app/ui/common/confirm-dialog";
import DocumentPreviewDialog from "@/app/ui/common/document-preview-dialog";

interface DocumentActionsProps {
  caseId: string;
  document: Document;
}

/**
 * Client component that renders action buttons per document row.
 *
 * Button visibility by status:
 *
 * | Status     | Buttons                                          |
 * |------------|--------------------------------------------------|
 * | UPLOADED   | Ver, Procesar (OCR+IA), Eliminar                 |
 * | PROCESSING | Ver (disabled), spinner                         |
 * | PROCESSED  | Ver, Reprocesar                                  |
 * | OCR_ERROR  | Ver, Reintentar                                  |
 * | ERROR      | Ver, Reintentar                                  |
 *
 * "Procesar" chains OCR + AI extraction for document types that have
 * an extractor (currently INE). "Reprocesar" re-runs the full pipeline.
 */
export default function DocumentActions({
  caseId,
  document,
}: DocumentActionsProps) {
  const router = useRouter();

  // ── View state ───────────────────────────────────────────────────────
  const [viewLoading, setViewLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // ── Delete state ─────────────────────────────────────────────────────
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ── Process state (OCR + optional extraction) ─────────────────────────
  const [processLoading, setProcessLoading] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);

  // ── View handler ─────────────────────────────────────────────────────
  const handleView = useCallback(async () => {
    setViewLoading(true);
    setPreviewUrl(null);
    try {
      const signedUrl = await getDocumentViewUrl(caseId, document.id);
      setPreviewUrl(signedUrl);
      setPreviewOpen(true);
    } catch {
      setPreviewOpen(true);
    } finally {
      setViewLoading(false);
    }
  }, [caseId, document.id]);

  const handleClosePreview = useCallback(() => {
    setPreviewOpen(false);
    setPreviewUrl(null);
  }, []);

  // ── Delete handler ───────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    setDeleteError(null);
    try {
      await deleteDocument(caseId, document.id);
      router.refresh();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Error al eliminar el documento";
      setDeleteError(msg);
      throw err;
    }
  }, [caseId, document.id, router]);

  const handleCloseDeleteDialog = useCallback(() => {
    setDeleteConfirmOpen(false);
    setDeleteError(null);
  }, []);

  // ── Process handler: OCR → optional AI extraction ────────────────────
  const handleProcess = useCallback(async () => {
    setProcessLoading(true);
    setProcessError(null);
    try {
      const needsForce =
        document.documentStatus.code === "PROCESSED" ||
        document.documentStatus.code === "OCR_ERROR" ||
        document.documentStatus.code === "ERROR";

      // Step 1: OCR
      await processDocument(caseId, document.id, needsForce);

      // Step 2: AI extraction for eligible document types
      if (document.documentType.code === "INE") {
        try {
          await extractOfficialId(caseId, document.id);
        } catch {
          setProcessError(
            "OCR completado, pero la extracción de datos falló. Puede intentar reprocesar.",
          );
        }
      }

      if (document.documentType.code === "PAYROLL_RECEIPT") {
        try {
          await extractPayrollReceipt(caseId, document.id);
        } catch {
          setProcessError(
            "OCR completado, pero la extracción de nómina falló. Puede intentar reprocesar.",
          );
        }
      }

      if (document.documentType.code === "BANK_STATEMENT") {
        try {
          await extractBankStatement(caseId, document.id);
        } catch {
          setProcessError(
            "OCR completado, pero la extracción del estado de cuenta falló. Puede intentar reprocesar.",
          );
        }
      }

      router.refresh();
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Error al procesar el documento";
      setProcessError(msg);
    } finally {
      setProcessLoading(false);
    }
  }, [caseId, document.id, document.documentType.code, router]);

  // ── Visibility ───────────────────────────────────────────────────────
  const statusCode = document.documentStatus.code;
  const isUploaded = statusCode === "UPLOADED";
  const isProcessing = statusCode === "PROCESSING";
  const isProcessed = statusCode === "PROCESSED";
  const isOcrError = statusCode === "OCR_ERROR" || statusCode === "ERROR";
  const isExtractionError = statusCode === "EXTRACTION_ERROR";

  return (
    <>
      {/* ── Action buttons ───────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        {/* ── Ver (disabled during PROCESSING) ──────────────────────── */}
        <Button
          variant="secondary"
          onClick={handleView}
          disabled={viewLoading || isProcessing}
          loading={viewLoading}
        >
          {viewLoading ? "Abriendo..." : "Ver"}
        </Button>

        {/* ── Procesar (UPLOADED) ────────────────────────────────────── */}
        {isUploaded && (
          <Button
            variant="primary"
            onClick={handleProcess}
            disabled={processLoading}
            loading={processLoading}
          >
            {processLoading ? "Procesando..." : "Procesar"}
          </Button>
        )}

        {/* ── Processing indicator ───────────────────────────────────── */}
        {isProcessing && (
          <Button variant="secondary" disabled>
            <svg
              className="animate-spin h-4 w-4 mr-1"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Procesando...
          </Button>
        )}

        {/* ── Reprocesar (PROCESSED) ───────────────────────────────── */}
        {isProcessed && (
          <Button
            variant="primary"
            onClick={handleProcess}
            disabled={processLoading}
            loading={processLoading}
          >
            {processLoading ? "Procesando..." : "Reprocesar"}
          </Button>
        )}

        {/* ── Reintentar (OCR_ERROR / ERROR) ─────────────────────────── */}
        {isOcrError && (
          <Button
            variant="destructive"
            onClick={handleProcess}
            disabled={processLoading}
            loading={processLoading}
          >
            {processLoading ? "Procesando..." : "Reintentar"}
          </Button>
        )}

        {/* ── Reintentar extracción (EXTRACTION_ERROR) ─────────────── */}
        {isExtractionError && (
          <Button
            variant="primary"
            onClick={handleProcess}
            disabled={processLoading}
            loading={processLoading}
          >
            {processLoading ? "Procesando..." : "Reintentar extracción"}
          </Button>
        )}

        {/* ── Eliminar (UPLOADED only) ───────────────────────────────── */}
        {isUploaded && (
          <Button
            variant="destructive"
            onClick={() => setDeleteConfirmOpen(true)}
          >
            Eliminar
          </Button>
        )}
      </div>

      {/* ── Process error (inline per-document) ────────────────────────── */}
      {processError && (
        <p className="mt-1 text-xs text-red-600">{processError}</p>
      )}

      {/* ── Document preview dialog ────────────────────────────────────── */}
      <DocumentPreviewDialog
        open={previewOpen}
        onClose={handleClosePreview}
        fileName={document.originalName}
        signedUrl={previewUrl}
        mimeType={document.mimeType ?? ""}
      />

      {/* ── Delete confirmation dialog ─────────────────────────────────── */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={handleCloseDeleteDialog}
        title="Eliminar documento"
        message="¿Estás segura de que deseas eliminar este documento? Esta acción no se puede deshacer y el archivo será removido del expediente."
        confirmLabel="Eliminar"
        confirmVariant="destructive"
        onConfirm={handleDelete}
        error={deleteError}
      />
    </>
  );
}
