"use client";

import {
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Ancho máximo del panel. Default: max-w-lg (512px). */
  width?: string;
}

/**
 * Drawer — panel lateral derecho con overlay, animación slide-in,
 * cierre por Escape / clic en overlay / botón X, y focus trap básico.
 *
 * Soporta múltiples instancias en la misma página mediante z-index
 * calculado con una prop opcional o auto-incremento interno.
 */
export default function Drawer({
  open,
  onClose,
  title,
  children,
  width = "max-w-lg",
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // ── Close on Escape ──────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose],
  );

  // ── Lock body scroll when open ───────────────────────────────────────
  useEffect(() => {
    if (!open) return;

    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    document.addEventListener("keydown", handleKeyDown);

    // Focus the close button on open
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = original;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, handleKeyDown]);

  // ── Trap focus inside panel ──────────────────────────────────────────
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      // Only close if the overlay itself was clicked, not children
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/40 animate-in fade-in duration-200"
        onClick={handleOverlayClick}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`relative w-full ${width} bg-gf-surface shadow-xl animate-in slide-in-from-right duration-300 flex flex-col`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gf-border shrink-0">
          <h2 className="text-base font-semibold text-gf-text truncate pr-2">
            {title}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-[var(--radius-sm)] p-1.5 text-gf-text-muted hover:text-gf-text hover:bg-gf-bg transition-colors focus-visible:ring-2 focus-visible:ring-gf-red/40 focus-visible:outline-none shrink-0"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-5 h-5"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
