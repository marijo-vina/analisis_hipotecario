"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Document } from "@/app/lib/definitions";
import {
  getDocumentViewUrl,
  deleteDocument,
  processDocument,
  extractOfficialId,
  extractPayrollReceipt,
  extractBankStatement,
  extractCreditBureau,
  extractCreditScore,
  extractCsf,
  extractTaxReturn,
} from "@/app/actions/documents";
import { Eye, RotateCw, Play, Trash2, Loader2 } from "lucide-react";
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
      const statusCode = document.documentStatus.code;
      const needsForce =
        statusCode === "PROCESSED" ||
        statusCode === "DATA_EXTRACTED" ||
        statusCode === "OCR_ERROR" ||
        statusCode === "ERROR" ||
        statusCode === "EXTRACTION_ERROR";

      // Bureau already OCR'd (including OCR_ERROR after a failed re-OCR):
      // skip Document AI and only re-run extraction so last-4 can persist.
      const skipBureauOcr =
        document.documentType.code === "CREDIT_BUREAU_REPORT" &&
        statusCode !== "UPLOADED" &&
        statusCode !== "PROCESSING";

      if (!skipBureauOcr) {
        await processDocument(caseId, document.id, needsForce);
      }

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

      if (document.documentType.code === "CREDIT_BUREAU_REPORT") {
        try {
          await extractCreditBureau(caseId, document.id);
        } catch {
          setProcessError(
            skipBureauOcr
              ? "No se pudo reextraer el buró. Intente de nuevo."
              : "OCR completado, pero la extracción del buró de crédito falló. Puede intentar reprocesar.",
          );
        }
      }

      if (document.documentType.code === "CREDIT_SCORE") {
        try {
          await extractCreditScore(caseId, document.id);
        } catch {
          setProcessError(
            "OCR completado, pero la extracción del Mi Score falló. Puede intentar reprocesar.",
          );
        }
      }

      if (document.documentType.code === "CSF") {
        try {
          await extractCsf(caseId, document.id);
        } catch {
          setProcessError(
            "OCR completado, pero la extracción de la Constancia de Situación Fiscal falló. Puede intentar reprocesar.",
          );
        }
      }

      if (document.documentType.code === "TAX_RETURN") {
        try {
          await extractTaxReturn(caseId, document.id);
        } catch {
          setProcessError(
            "OCR completado, pero la extracción de la Declaración Anual falló. Puede intentar reprocesar.",
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
  }, [
    caseId,
    document.id,
    document.documentType.code,
    document.documentStatus.code,
    router,
  ]);

  // ── Visibility ───────────────────────────────────────────────────────
  const statusCode = document.documentStatus.code;
  const isUploaded = statusCode === "UPLOADED";
  const isProcessing = statusCode === "PROCESSING";
  const isProcessed = statusCode === "PROCESSED";
  const isError =
    statusCode === "OCR_ERROR" ||
    statusCode === "ERROR" ||
    statusCode === "EXTRACTION_ERROR";

  return (
    <>
      {/* ── Icon Action Buttons Group ─────────────────────────────────── */}
      <div className="flex items-center gap-1.5">
        {/* ── Ver (Eye Icon Button) ─────────────────────────────────── */}
        <button
          type="button"
          onClick={handleView}
          disabled={viewLoading || isProcessing}
          className="p-1.5 rounded-lg text-gf-text-muted hover:text-gf-red hover:bg-gf-surface-dim border border-gf-border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Ver vista previa del documento"
          aria-label="Ver documento"
        >
          {viewLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-gf-red" />
          ) : (
            <Eye className="w-4 h-4" strokeWidth={2} />
          )}
        </button>

        {/* ── Procesar / Reprocesar / Reintentar (RotateCw Icon Button) ── */}
        {isProcessing ? (
          <div
            className="p-1.5 rounded-lg text-gf-red bg-gf-red-soft border border-gf-red/30 flex items-center justify-center"
            title="Procesando documento..."
          >
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        ) : (
          <button
            type="button"
            onClick={handleProcess}
            disabled={processLoading}
            className={`p-1.5 rounded-lg border transition-colors disabled:opacity-40 ${
              isError
                ? "text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100"
                : isUploaded
                  ? "text-gf-red bg-gf-red-soft border-gf-red/20 hover:bg-gf-red hover:text-white"
                  : "text-gf-text-muted hover:text-gf-text hover:bg-gf-surface-dim border-gf-border"
            }`}
            title={
              isUploaded
                ? "Procesar documento (OCR e IA)"
                : isProcessed
                  ? "Reprocesar análisis de documento"
                  : "Reintentar procesamiento con IA"
            }
            aria-label="Procesar documento"
          >
            {processLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isUploaded ? (
              <Play className="w-4 h-4 fill-current" />
            ) : (
              <RotateCw className="w-4 h-4" strokeWidth={2} />
            )}
          </button>
        )}

        {/* ── Eliminar (Trash2 Icon Button) ─────────────────────────── */}
        <button
          type="button"
          onClick={() => setDeleteConfirmOpen(true)}
          disabled={isProcessing}
          className="p-1.5 rounded-lg text-gf-text-muted hover:text-red-600 hover:bg-red-50 border border-gf-border hover:border-red-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Eliminar documento del expediente"
          aria-label="Eliminar documento"
        >
          <Trash2 className="w-4 h-4" strokeWidth={2} />
        </button>
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
