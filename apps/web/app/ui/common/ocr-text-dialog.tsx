"use client";

import { useState, useCallback, useEffect } from "react";
import Button from "./button";

interface OcrTextDialogProps {
  /** Controls whether the dialog is visible */
  open: boolean;
  /** Called when the dialog should close (Cerrar button or backdrop click) */
  onClose: () => void;
  /** Extracted OCR text — null/undefined/empty triggers empty state */
  ocrText: string | null | undefined;
  /** Original file name displayed in the header */
  fileName: string;
}

/**
 * OcrTextDialog — modal for displaying extracted OCR text.
 *
 * Mirrors DocumentPreviewDialog structure: backdrop overlay + centered
 * card with header, scrollable content area, and footer actions.
 *
 * Features:
 * - Scrollable `<pre>` with monospace font for OCR text readability
 * - Copy-to-clipboard with 2-second "Copiado" feedback
 * - Empty state when no text was extracted
 * - Backdrop click to close
 */
export default function OcrTextDialog({
  open,
  onClose,
  ocrText,
  fileName,
}: OcrTextDialogProps) {
  const [copied, setCopied] = useState(false);

  const hasText = ocrText && ocrText.trim().length > 0;

  const handleCopy = useCallback(async () => {
    if (!hasText) return;
    try {
      await navigator.clipboard.writeText(ocrText!);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may fail in insecure contexts — silently ignore
    }
  }, [ocrText, hasText]);

  // ── Body scroll lock ─────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ocr-dialog-title"
    >
      {/* Modal card — stop propagation so clicks inside don't close */}
      <div
        className="bg-gf-surface border border-gf-border rounded-[var(--radius-md)] shadow-xl w-full max-w-2xl max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gf-border shrink-0">
          <div className="min-w-0">
            <h2
              id="ocr-dialog-title"
              className="text-lg font-semibold text-gf-text truncate"
            >
              Texto OCR extraído
            </h2>
            <p className="text-sm text-gf-text-muted mt-0.5 truncate">
              {fileName}
            </p>
          </div>
        </div>

        {/* ── Content ─────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          {hasText ? (
            <pre className="whitespace-pre-wrap font-mono text-sm text-gf-text break-words bg-gray-50 rounded p-4">
              {ocrText}
            </pre>
          ) : (
            <div className="flex items-center justify-center h-32 text-gf-text-muted text-sm">
              No se extrajo texto del documento
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gf-border shrink-0">
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
          {hasText && (
            <Button variant="primary" onClick={handleCopy}>
              {copied ? "Copiado" : "Copiar"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
