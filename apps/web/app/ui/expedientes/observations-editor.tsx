"use client";

import { useState, useRef, useEffect } from "react";

import { updateCaseNotes } from "@/app/actions/case-notes";
import Button from "@/app/ui/common/button";
import Card from "@/app/ui/common/card";

interface ObservationsEditorProps {
  caseId: string;
  initialNotes: string | null;
}

const MAX_LENGTH = 1000;
const PLACEHOLDER = "Sin observaciones. Haz clic para agregar.";

/**
 * ObservationsEditor — editor inline de observaciones del expediente.
 *
 * Client component. Modo lectura muestra el texto existente (o placeholder
 * en muted). Al hacer clic se convierte en un textarea con altura inicial de
 * ~3 filas, botones Guardar/Cancelar, contador de caracteres y límite de 1000.
 *
 * Guardar invoca `updateCaseNotes(caseId, notes)`. Si falla, se mantiene el
 * modo edición y se muestra el error inline. Cancelar descarta los cambios y
 * vuelve al texto original. No hay autoguardado al perder el foco.
 */
export default function ObservationsEditor({
  caseId,
  initialNotes,
}: ObservationsEditorProps) {
  const original = initialNotes ?? "";
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(original);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Al entrar en edición, enfocar el textarea y posicionar el cursor al final.
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      const el = textareaRef.current;
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
  }, [isEditing]);

  function handleStartEdit() {
    setDraft(original);
    setError(null);
    setIsEditing(true);
  }

  function handleCancel() {
    setDraft(original);
    setError(null);
    setIsEditing(false);
  }

  async function handleSave() {
    const trimmed = draft;
    if (trimmed === original) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    setError(null);

    const result = await updateCaseNotes(caseId, trimmed);

    setIsSaving(false);

    if (result.success) {
      setIsEditing(false);
    } else {
      setError(result.error ?? "No se pudo guardar la observación.");
    }
  }

  return (
    <Card>
      <h3 className="text-base font-semibold text-gf-text mb-3">
        Observaciones
      </h3>

      {isEditing ? (
        <div>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_LENGTH))}
            maxLength={MAX_LENGTH}
            rows={3}
            disabled={isSaving}
            className="block w-full rounded-[var(--radius-sm)] border border-gf-border px-3 py-2 text-sm text-gf-text bg-white focus:outline-none focus:border-gf-red focus:ring-1 focus:ring-gf-red disabled:opacity-50 resize-y min-h-[80px]"
            placeholder="Escribe las observaciones del expediente..."
          />

          {/* Contador + error */}
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-xs text-gf-text-muted tabular-nums">
              {draft.length}/{MAX_LENGTH}
            </span>
            {error && (
              <p className="text-xs text-red-600" role="alert">
                {error}
              </p>
            )}
          </div>

          {/* Botones */}
          <div className="mt-3 flex items-center gap-2">
            <Button
              variant="primary"
              onClick={handleSave}
              loading={isSaving}
              disabled={isSaving}
            >
              Guardar
            </Button>
            <Button
              variant="secondary"
              onClick={handleCancel}
              disabled={isSaving}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleStartEdit}
          className="block w-full text-left rounded-[var(--radius-sm)] -mx-1 px-1 py-1 text-sm text-gf-text hover:bg-gf-bg transition-colors focus-visible:ring-2 focus-visible:ring-gf-red/40 focus-visible:outline-none"
        >
          {original.length > 0 ? (
            <p className="whitespace-pre-wrap break-words">{original}</p>
          ) : (
            <p className="text-gf-text-muted italic">{PLACEHOLDER}</p>
          )}
        </button>
      )}
    </Card>
  );
}