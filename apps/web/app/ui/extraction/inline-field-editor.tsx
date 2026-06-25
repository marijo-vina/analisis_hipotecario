"use client";

import { useState, useEffect, useRef } from "react";

import Button from "@/app/ui/common/button";

interface InlineFieldEditorProps {
  /** Field label shown in the popover header. */
  label: string;
  /** Initial value when editing an existing field (empty for Completar). */
  initialValue?: string;
  /** Called with the new value when the user clicks Guardar. */
  onSave: (value: string) => void;
  /** Called when the user cancels (Cancelar button or Escape). */
  onCancel: () => void;
}

/**
 * InlineFieldEditor — inline input popover for Completar/Editar.
 *
 * Mounted conditionally by the parent (ExtractionDocumentCard) for ONE field
 * at a time, so the "only one editor open at a time" invariant is enforced by
 * the parent's `editingField` state.
 *
 * All state is local — no persistence. `onSave` is a placeholder hook the
 * parent wires to update the in-memory correction map.
 */
export default function InlineFieldEditor({
  label,
  initialValue = "",
  onSave,
  onCancel,
}: InlineFieldEditorProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the input on open so the asesora can type immediately.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Escape closes the editor without saving.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel]);

  const handleSave = () => {
    const trimmed = value.trim();
    if (trimmed.length === 0) return; // never save empty
    onSave(trimmed);
  };

  return (
    <div className="absolute z-20 mt-1 w-64 rounded-[var(--radius-md)] border border-gf-border bg-gf-surface shadow-lg p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gf-text-muted mb-2">
        {label}
      </p>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleSave();
          }
        }}
        className="w-full rounded-[var(--radius-sm)] border border-gf-border bg-white px-3 py-2 text-sm text-gf-text focus:border-gf-red focus:outline-none"
      />
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={value.trim().length === 0}
        >
          Guardar
        </Button>
      </div>
    </div>
  );
}