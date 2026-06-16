"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Document } from "@/app/lib/definitions";
import { getDocumentViewUrl, deleteDocument } from "@/app/actions/documents";

interface DocumentActionsProps {
  caseId: string;
  document: Document;
}

/**
 * Client component que renderiza los botones "Ver" y "Eliminar" por fila
 * de la tabla de documentos.
 *
 * - "Ver": obtiene una signed URL via server action y la abre en pestaña nueva.
 * - "Eliminar": visible solo cuando `documentStatus.code === 'UPLOADED'`.
 *   Muestra modal de confirmación antes de ejecutar el delete.
 *
 * Todas las llamadas al backend pasan por server actions — nunca se expone
 * `apiFetch` del lado del cliente.
 */
export default function DocumentActions({
  caseId,
  document,
}: DocumentActionsProps) {
  const router = useRouter();

  const [viewLoading, setViewLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // ---- View handler --------------------------------------------------------
  const handleView = useCallback(async () => {
    setError(null);
    setViewLoading(true);
    try {
      const signedUrl = await getDocumentViewUrl(caseId, document.id);
      window.open(signedUrl, "_blank");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al obtener el documento",
      );
    } finally {
      setViewLoading(false);
    }
  }, [caseId, document.id]);

  // ---- Delete handler ------------------------------------------------------
  const handleDelete = useCallback(async () => {
    setError(null);
    setShowConfirm(false);
    setDeleteLoading(true);
    try {
      await deleteDocument(caseId, document.id);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Error al eliminar el documento",
      );
    } finally {
      setDeleteLoading(false);
    }
  }, [caseId, document.id, router]);

  const isUploaded = document.documentStatus.code === "UPLOADED";

  return (
    <>
      {/* ---- Error banner (inline, per row) -------------------------------- */}
      {error && (
        <div
          role="alert"
          className="mb-2 rounded-md bg-red-50 border border-red-200 p-2 text-xs text-red-700"
        >
          {error}
        </div>
      )}

      {/* ---- Action buttons ------------------------------------------------- */}
      <div className="flex items-center gap-2">
        {/* Ver */}
        <button
          type="button"
          onClick={handleView}
          disabled={viewLoading}
          className="inline-flex items-center rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {viewLoading ? "Abriendo..." : "Ver"}
        </button>

        {/* Eliminar — only for UPLOADED docs */}
        {isUploaded && (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setShowConfirm(true);
            }}
            disabled={deleteLoading}
            className="inline-flex items-center rounded-md bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 shadow-sm ring-1 ring-inset ring-red-300 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deleteLoading ? "Eliminando..." : "Eliminar"}
          </button>
        )}
      </div>

      {/* ---- Confirmation modal --------------------------------------------- */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 transition-opacity"
            onClick={() => setShowConfirm(false)}
          />

          {/* Dialog */}
          <div className="relative z-10 w-full max-w-sm rounded-xl bg-white p-6 shadow-xl border border-slate-200">
            <p className="text-sm text-slate-900 mb-4">
              ¿Estás segura de que deseas eliminar este documento?
            </p>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                disabled={deleteLoading}
                className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteLoading}
                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
              >
                {deleteLoading ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
