'use client';

import { useState } from 'react';
import Button from './button';

interface ConfirmDialogProps {
  /** Controls whether the dialog is visible */
  open: boolean;
  /** Called when the dialog should close (Cancel, backdrop click) */
  onClose: () => void;
  /** Dialog title — rendered as h2 */
  title: string;
  /** Descriptive message explaining the action */
  message: string;
  /** Text for the confirm button */
  confirmLabel: string;
  /** Variant for the confirm button: primary or destructive */
  confirmVariant: 'primary' | 'destructive';
  /** Async action executed when the user confirms */
  onConfirm: () => Promise<void>;
}

/**
 * ConfirmDialog client component.
 *
 * Renders a centered modal with a dark overlay. The user can confirm
 * (triggering an async action with loading state) or cancel. Clicking
 * the backdrop also closes the dialog.
 *
 * While `onConfirm` is executing both buttons are disabled and the
 * confirm button shows a loading indicator.
 */
export default function ConfirmDialog({
  open,
  onClose,
  title,
  message,
  confirmLabel,
  confirmVariant,
  onConfirm,
}: ConfirmDialogProps) {
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
    >
      {/* Modal card — stop propagation so clicks inside don't close */}
      <div
        className="bg-gf-surface border border-gf-border rounded-[var(--radius-md)] shadow-lg p-6 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="confirm-dialog-title"
          className="text-lg font-semibold text-gf-text mb-2"
        >
          {title}
        </h2>
        <p
          id="confirm-dialog-message"
          className="text-gf-text-muted text-sm mb-6"
        >
          {message}
        </p>

        <div className="flex justify-end gap-3">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            variant={confirmVariant}
            onClick={handleConfirm}
            disabled={loading}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
