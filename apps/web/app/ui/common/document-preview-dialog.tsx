'use client';
/* eslint-disable @next/next/no-img-element -- signed URLs from GCS can't use next/image */

import Button from './button';

interface DocumentPreviewDialogProps {
  /** Controls whether the dialog is visible */
  open: boolean;
  /** Called when the dialog should close (Cerrar button or backdrop click) */
  onClose: () => void;
  /** Original file name displayed in the header */
  fileName: string;
  /** Signed URL for document access — null means unavailable (error/loading) */
  signedUrl: string | null;
  /** MIME type of the document (e.g. application/pdf, image/jpeg) */
  mimeType: string;
}

/**
 * DocumentPreviewDialog — embedded document viewer modal.
 *
 * Renders a centered overlay with a large content area for previewing
 * documents inline. Supports PDF (iframe) and images (img). For
 * unsupported types, shows a fallback message with an "Abrir en nueva
 * pestaña" button as secondary option.
 *
 * The "Abrir en nueva pestaña" button is only rendered when a valid
 * signedUrl is available — null URLs are never opened.
 */
export default function DocumentPreviewDialog({
  open,
  onClose,
  fileName,
  signedUrl,
  mimeType,
}: DocumentPreviewDialogProps) {
  if (!open) return null;

  const isPDF = mimeType === 'application/pdf';
  const isImage = mimeType.startsWith('image/');
  const canPreview = isPDF || isImage;
  const hasValidUrl = signedUrl !== null && signedUrl.length > 0;

  const handleOpenNewTab = () => {
    if (hasValidUrl) {
      window.open(signedUrl!, '_blank');
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-dialog-title"
    >
      {/* Modal card — stop propagation so clicks inside don't close */}
      <div
        className="bg-gf-surface border border-gf-border rounded-[var(--radius-md)] shadow-xl w-full max-w-4xl flex flex-col"
        style={{ height: '80vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gf-border shrink-0">
          <div className="min-w-0">
            <h2
              id="preview-dialog-title"
              className="text-lg font-semibold text-gf-text truncate"
            >
              Vista previa del documento
            </h2>
            <p className="text-sm text-gf-text-muted mt-0.5 truncate">
              {fileName}
            </p>
          </div>
        </div>

        {/* ── Content ─────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden flex items-center justify-center p-4 min-h-0">
          {!hasValidUrl ? (
            /* Error / unavailable state */
            <div className="text-center">
              <p className="text-gf-text-muted text-sm">
                El documento no está disponible
              </p>
            </div>
          ) : canPreview ? (
            isPDF ? (
              <iframe
                src={signedUrl!}
                className="w-full h-full border-0 rounded"
                title={`Vista previa: ${fileName}`}
              />
            ) : (
              <img
                src={signedUrl!}
                alt={fileName}
                className="max-w-full max-h-full object-contain rounded"
              />
            )
          ) : (
            /* Unsupported type */
            <div className="text-center max-w-sm">
              <p className="text-gf-text-muted text-sm mb-3">
                Este tipo de archivo no se puede previsualizar. Puedes
                abrirlo en una nueva pestaña.
              </p>
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gf-border shrink-0">
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
          {hasValidUrl && (
            <Button variant="secondary" onClick={handleOpenNewTab}>
              Abrir en nueva pestaña
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
