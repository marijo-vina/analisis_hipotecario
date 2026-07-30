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
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(notes);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sincronizar estado si la prop initialNotes cambia desdé la página
  useEffect(() => {
    setNotes(initialNotes ?? "");
    if (!isEditing) {
      setDraft(initialNotes ?? "");
    }
  }, [initialNotes, isEditing]);

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
    setDraft(notes);
    setError(null);
    setIsEditing(true);
  }

  function handleCancel() {
    setDraft(notes);
    setError(null);
    setIsEditing(false);
  }

  async function handleSave() {
    const trimmed = draft.trim();
    setIsSaving(true);
    setError(null);

    try {
      const result = await updateCaseNotes(caseId, trimmed);
      if (result.success) {
        setNotes(trimmed);
        setIsEditing(false);
      } else {
        setError(result.error ?? "No se pudo guardar la observación.");
      }
    } catch {
      setError("Ocurrió un error al guardar la observación.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col h-full justify-between">
      <div>
        <h3 className="text-base font-bold text-gf-text mb-3">
          Observaciones
        </h3>

        {isEditing ? (
          <div className="space-y-3">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_LENGTH))}
              maxLength={MAX_LENGTH}
              rows={4}
              disabled={isSaving}
              className="block w-full rounded-xl border border-gf-border px-3 py-2 text-xs sm:text-sm text-gf-text bg-white focus:outline-none focus:border-gf-red focus:ring-1 focus:ring-gf-red disabled:opacity-50 resize-y min-h-[100px]"
              placeholder="Escribe las observaciones del expediente..."
            />

            {/* Contador + error */}
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-semibold text-gf-text-muted tabular-nums">
                {draft.length}/{MAX_LENGTH}
              </span>
              {error && (
                <p className="text-xs text-red-600 font-medium" role="alert">
                  {error}
                </p>
              )}
            </div>

            {/* Botones compactos */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="bg-gf-red hover:bg-gf-red-dark text-white px-4 h-8 rounded-lg font-semibold text-xs transition-all shadow-xs inline-flex items-center gap-1.5 active:scale-[0.98] disabled:opacity-50"
              >
                {isSaving ? "Guardando..." : "Guardar"}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={isSaving}
                className="bg-white border border-gf-border hover:bg-gf-surface-dim text-gf-text px-4 h-8 rounded-lg font-semibold text-xs transition-colors shadow-2xs disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleStartEdit}
            className="block w-full text-left rounded-xl p-3 text-xs sm:text-sm text-gf-text bg-gf-surface-dim/40 hover:bg-gf-surface-dim border border-gf-border/50 transition-colors focus-visible:ring-2 focus-visible:ring-gf-red/40 focus-visible:outline-none group min-h-[100px]"
          >
            {notes.length > 0 ? (
              <p className="whitespace-pre-wrap break-words">{notes}</p>
            ) : (
              <p className="text-gf-text-muted italic">{PLACEHOLDER}</p>
            )}
          </button>
        )}
      </div>
    </div>
  );
}