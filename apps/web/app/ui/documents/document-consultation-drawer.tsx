"use client";
/* eslint-disable @next/next/no-img-element -- signed URLs can't use next/image */

import { useState, useEffect, useCallback } from "react";

import type { Document } from "@/app/lib/definitions";
import { getDocumentViewUrl } from "@/app/actions/documents";
import Button from "@/app/ui/common/button";

interface DocumentConsultationDrawerProps {
  /** When set, the drawer is open showing this document. */
  document: Document | null;
  /** Called to close the drawer (backdrop, Escape, or Cerrar). */
  onClose: () => void;
}

/**
 * DocumentConsultationDrawer — right-side document viewer.
 *
 *  - Desktop (>=1024px): 480-560px wide panel sliding from the right.
 *  - Mobile/tablet (<1024px): full-screen overlay.
 *
 * The signed URL is fetched lazily on FIRST open (NFR-EXT-08) and cached for
 * the lifetime of the open session; re-opening the same doc refetches.
 *
 * Does NOT replace the existing "Ver" button / `DocumentPreviewDialog` — it is
 * a separate, contextual viewer triggered from extraction cards.
 */
export default function DocumentConsultationDrawer({
  document,
  onClose,
}: DocumentConsultationDrawerProps) {
  const open = document !== null;

  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lazy-load the signed URL only when a document is first provided.
  useEffect(() => {
    if (!open || !document) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setSignedUrl(null);

    getDocumentViewUrl(document.mortgageCaseId, document.id)
      .then((url) => {
        if (!cancelled) setSignedUrl(url);
      })
      .catch(() => {
        if (!cancelled)
          setError("No se pudo cargar el documento para validacion manual.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, document]);

  // Escape closes the drawer.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  if (!open || !document) return null;

  const mimeType = document.mimeType ?? "";
  const isPDF = mimeType === "application/pdf";
  const isImage = mimeType.startsWith("image/");
  const canPreview = isPDF || isImage;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="consultation-drawer-title"
    >
      {/* Drawer panel — desktop 560px (within 480-560px), mobile full-screen */}
      <aside
        className="absolute right-0 top-0 h-full w-full max-w-full lg:max-w-[560px] bg-gf-surface border-l border-gf-border shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gf-border shrink-0">
          <div className="min-w-0">
            <h2
              id="consultation-drawer-title"
              className="text-base font-semibold text-gf-text truncate"
            >
              Validacion manual
            </h2>
            <p className="text-sm text-gf-text-muted mt-0.5 truncate">
              {document.originalName}
            </p>
          </div>
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        </div>

        {/* ── Content ────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-4 min-h-0 bg-gf-bg">
          {loading && (
            <p className="text-sm text-gf-text-muted">Cargando documento…</p>
          )}

          {error && !loading && (
            <p className="text-sm text-red-600 text-center max-w-xs">
              {error}
            </p>
          )}

          {!loading && !error && signedUrl && canPreview && (
            isPDF ? (
              <iframe
                src={signedUrl}
                className="w-full h-full border-0 rounded"
                title={`Validacion manual: ${document.originalName}`}
              />
            ) : (
              <img
                src={signedUrl}
                alt={document.originalName}
                className="max-w-full max-h-full object-contain rounded"
              />
            )
          )}

          {!loading && !error && signedUrl && !canPreview && (
            <div className="text-center max-w-sm">
              <p className="text-sm text-gf-text-muted mb-3">
                Este tipo de archivo no se puede previsualizar aqui.
              </p>
              <Button variant="secondary" href={signedUrl}>
                Abrir en nueva pestaña
              </Button>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}