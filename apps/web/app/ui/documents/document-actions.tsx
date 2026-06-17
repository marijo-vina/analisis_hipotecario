"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Document } from "@/app/lib/definitions";
import { getDocumentViewUrl, deleteDocument } from "@/app/actions/documents";
import Button from "@/app/ui/common/button";
import ConfirmDialog from "@/app/ui/common/confirm-dialog";
import DocumentPreviewDialog from "@/app/ui/common/document-preview-dialog";

interface DocumentActionsProps {
  caseId: string;
  document: Document;
}

/**
 * Client component that renders "Ver" and "Eliminar" action buttons per
 * document row in the table.
 *
 * - **Ver**: calls the existing `getDocumentViewUrl` server action to
 *   obtain a signed URL, then opens the `DocumentPreviewDialog` with the
 *   URL and document metadata (embedded viewer — no `window.open`).
 * - **Eliminar**: visible only when `documentStatus.code === 'UPLOADED'`.
 *   Opens `ConfirmDialog` with file name highlighted, Spanish messages,
 *   and Cancelar/Eliminar buttons. Calls the existing `deleteDocument`
 *   server action. On error the dialog stays open with the error message.
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

  // ── Visibility ───────────────────────────────────────────────────────
  const isUploaded = document.documentStatus.code === "UPLOADED";

  return (
    <>
      {/* ── Action buttons ───────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          onClick={handleView}
          disabled={viewLoading}
          loading={viewLoading}
        >
          {viewLoading ? "Abriendo..." : "Ver"}
        </Button>

        {isUploaded && (
          <Button
            variant="destructive"
            onClick={() => setDeleteConfirmOpen(true)}
          >
            Eliminar
          </Button>
        )}
      </div>

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
    </>
  );
}
