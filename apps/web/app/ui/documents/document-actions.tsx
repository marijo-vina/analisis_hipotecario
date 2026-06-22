"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Document } from "@/app/lib/definitions";
import { getDocumentViewUrl, deleteDocument, processDocument } from "@/app/actions/documents";
import Button from "@/app/ui/common/button";
import ConfirmDialog from "@/app/ui/common/confirm-dialog";
import DocumentPreviewDialog from "@/app/ui/common/document-preview-dialog";
import OcrTextDialog from "@/app/ui/common/ocr-text-dialog";

interface DocumentActionsProps {
  caseId: string;
  document: Document;
}

/**
 * Client component that renders action buttons per document row in the
 * table: "Ver" (document preview), "Procesar" / "Reintentar" (OCR),
 * "Ver OCR" (extracted text modal), and "Eliminar" (with confirmation).
 *
 * Button visibility is driven by `document.documentStatus.code`:
 *
 * | Status      | Buttons                          |
 * |-------------|----------------------------------|
 * | UPLOADED    | Ver, Procesar, Eliminar          |
 * | PROCESSING  | Ver (disabled), spinner        |
 * | PROCESSED   | Ver, Ver OCR                     |
 * | OCR_ERROR   | Ver, Reintentar                  |
 * | ERROR       | Ver, Reintentar                  |
 *
 * All backend calls go through server actions — `apiFetch` is never
 * exposed on the client side.
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

  // ── OCR state ────────────────────────────────────────────────────────
  const [processLoading, setProcessLoading] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);
  const [ocrDialogOpen, setOcrDialogOpen] = useState(false);

  // ── View handler ─────────────────────────────────────────────────────
  const handleView = useCallback(async () => {
    setViewLoading(true);
    setPreviewUrl(null);

    try {
      const signedUrl = await getDocumentViewUrl(caseId, document.id);
      setPreviewUrl(signedUrl);
      setPreviewOpen(true);
    } catch {
      // signedUrl stays null — dialog will show error state
      setPreviewOpen(true);
    } finally {
      setViewLoading(false);
    }
  }, [caseId, document.id]);

  const handleClosePreview = useCallback(() => {
    setPreviewOpen(false);
    setPreviewUrl(null);
  }, []);

  // ── Delete handler (passed to ConfirmDialog.onConfirm) ───────────────
  const handleDelete = useCallback(async () => {
    setDeleteError(null);
    try {
      await deleteDocument(caseId, document.id);
      router.refresh();
      // Success — ConfirmDialog will call onClose
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Error al eliminar el documento";
      setDeleteError(msg);
      throw err; // Re-throw so ConfirmDialog keeps the dialog open
    }
  }, [caseId, document.id, router]);

  const handleCloseDeleteDialog = useCallback(() => {
    setDeleteConfirmOpen(false);
    setDeleteError(null);
  }, []);

  // ── OCR process handler (Procesar / Reintentar) ──────────────────────
  const handleProcess = useCallback(async () => {
    setProcessLoading(true);
    setProcessError(null);
    try {
      await processDocument(caseId, document.id);
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
  }, [caseId, document.id, router]);

  // ── Visibility ───────────────────────────────────────────────────────
  const statusCode = document.documentStatus.code;
  const isUploaded = statusCode === "UPLOADED";
  const isProcessing = statusCode === "PROCESSING";
  const isProcessed = statusCode === "PROCESSED";
  const isError = statusCode === "OCR_ERROR" || statusCode === "ERROR";

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
            Procesar
          </Button>
        )}

        {/* ── Processing indicator (PROCESSING) ──────────────────────── */}
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

        {/* ── Ver OCR (PROCESSED) ────────────────────────────────────── */}
        {isProcessed && (
          <Button
            variant="secondary"
            onClick={() => setOcrDialogOpen(true)}
          >
            Ver OCR
          </Button>
        )}

        {/* ── Reintentar (OCR_ERROR / ERROR) ─────────────────────────── */}
        {isError && (
          <Button
            variant="destructive"
            onClick={handleProcess}
            disabled={processLoading}
            loading={processLoading}
          >
            Reintentar
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

      {/* ── Document preview dialog (T029) ────────────────────────────── */}
      <DocumentPreviewDialog
        open={previewOpen}
        onClose={handleClosePreview}
        fileName={document.originalName}
        signedUrl={previewUrl}
        mimeType={document.mimeType ?? ""}
      />

      {/* ── Delete confirmation dialog (T028) ─────────────────────────── */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={handleCloseDeleteDialog}
        title="Eliminar documento"
        message={`¿Estás segura de que deseas eliminar este documento? Esta acción no se puede deshacer y el archivo será removido del expediente.`}
        confirmLabel="Eliminar"
        confirmVariant="destructive"
        onConfirm={handleDelete}
        error={deleteError}
      />

      {/* ── OCR text dialog ────────────────────────────────────────────── */}
      <OcrTextDialog
        open={ocrDialogOpen}
        onClose={() => setOcrDialogOpen(false)}
        ocrText={document.ocrText}
        fileName={document.originalName}
      />
    </>
  );
}
