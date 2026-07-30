"use client";

import { useState, useReducer } from "react";

import type { Document } from "@/app/lib/definitions";
import {
  type CorrectionSource,
  type ExtractionAlert,
  type ExtractionCategory,
} from "@/app/lib/extraction";
import Card from "@/app/ui/common/card";
import FieldGrid, { type FieldGridField } from "@/app/ui/common/field-grid";
import ManualCorrectionIndicator from "@/app/ui/extraction/manual-correction-indicator";
import InlineFieldEditor from "@/app/ui/extraction/inline-field-editor";

// ── Correction state (per-card, in-memory only — NO persistence) ───────────
export interface FieldCorrection {
  value: string | undefined;
  source: CorrectionSource; // AI | PENDING | MANUAL
}

interface CorrectionState {
  fields: Record<string, FieldCorrection>;
}

type CorrectionAction =
  | { type: "SAVE"; label: string; value: string }
  | { type: "RESET"; label: string; value: string | undefined; missing: boolean };

function correctionReducer(
  state: CorrectionState,
  action: CorrectionAction,
): CorrectionState {
  switch (action.type) {
    case "SAVE": {
      return {
        ...state,
        fields: {
          ...state.fields,
          [action.label]: { value: action.value, source: "MANUAL" },
        },
      };
    }
    case "RESET": {
      const source: CorrectionSource = action.missing ? "PENDING" : "AI";
      return {
        ...state,
        fields: {
          ...state.fields,
          [action.label]: { value: action.value, source },
        },
      };
    }
    default:
      return state;
  }
}

export interface ExtractionDocumentCardProps {
  document: Document;
  category: ExtractionCategory;
  /** Initial field definitions (label/value/missing) parsed by the tab. */
  fields: { label: string; value?: string; missing?: boolean }[];
  /** Per-document alerts shown inside the expanded body. */
  alerts?: ExtractionAlert[];
  /** When true, the card starts expanded (auto-expand when alerts exist). */
  defaultExpanded?: boolean;
  /** When true, shows a "Documento vencido" badge on the header. */
  isExpired?: boolean;
  /** Triggers document consultation drawer (the card's "Validar manualmente"). */
  onValidate?: (document: Document) => void;
  /** When true, the card is always expanded — no collapse toggle shown. */
  alwaysExpanded?: boolean;
}

/**
 * ExtractionDocumentCard — collapsible card wrapping a FieldGrid for one
 * document.
 *
 *  - Header: document name, status badge, alert count, collapse toggle and
 *    an optional "Validar manualmente" button (opens the consultation drawer).
 *  - Body: FieldGrid with per-field Editar/Completar actions and an
 *    InlineFieldEditor (one field at a time) + chips via
 *    ManualCorrectionIndicator.
 *  - Per-card correction state lives in `useReducer` — purely visual, never
 *    persisted. `onSave` is a no-op console.log placeholder.
 */
export default function ExtractionDocumentCard({
  document,
  category,
  fields: initialFields,
  alerts = [],
  defaultExpanded,
  isExpired,
  onValidate,
  alwaysExpanded = false,
}: ExtractionDocumentCardProps) {
  // Auto-expand when there are alerts (SPEC-5) unless overridden.
  const [expanded, setExpanded] = useState(
    defaultExpanded ?? alerts.length > 0,
  );

  // ── Correction state ────────────────────────────────────────────────
  const [corrections, dispatch] = useReducer(
    correctionReducer,
    { fields: {} as Record<string, FieldCorrection> },
    (init) => {
      const fields: Record<string, FieldCorrection> = {};
      for (const f of initialFields) {
        const missing = f.missing || !f.value || f.value.length === 0;
        fields[f.label] = {
          value: f.value,
          source: missing ? "PENDING" : "AI",
        };
      }
      return { fields: { ...init.fields, ...fields } };
    },
  );

  // Only one field editable at a time (label key, or null).
  const [editingField, setEditingField] = useState<string | null>(null);

  const handleSave = (label: string, value: string) => {
    // Persistence placeholder — future wiring point. Visual state only.
    console.log("[ExtractionDocumentCard] correction saved (no-op):", {
      documentId: document.id,
      label,
      value,
    });
    dispatch({ type: "SAVE", label, value });
    setEditingField(null);
  };

  // Build FieldGrid fields with action slots.
  const gridFields: FieldGridField[] = initialFields.map((f) => {
    const correction = corrections.fields[f.label] ?? {
      value: f.value,
      source: (f.missing ? "PENDING" : "AI") as CorrectionSource,
    };
    const missing = correction.source === "PENDING";

    let action;
    if (editingField === f.label) {
      // The editor is open for this field — render it in place.
      action = (
        <span className="relative">
          <InlineFieldEditor
            label={f.label}
            initialValue={correction.value ?? ""}
            onSave={(value) => handleSave(f.label, value)}
            onCancel={() => setEditingField(null)}
          />
        </span>
      );
    } else if (missing) {
      // Undetected → Completar button + Pendiente indicator.
      action = (
        <>
          <button
            type="button"
            onClick={() => setEditingField(f.label)}
            className="rounded border border-gf-border bg-gf-bg px-2 py-0.5 text-xs font-medium text-gf-text transition-colors hover:bg-gray-50"
          >
            Completar
          </button>
          <ManualCorrectionIndicator source="PENDING" />
        </>
      );
    } else {
      // Detected → pencil Editar + (MANUAL chip if corrected).
      action = (
        <>
          <button
            type="button"
            onClick={() => setEditingField(f.label)}
            aria-label={`Editar ${f.label}`}
            className="inline-flex items-center rounded p-1 text-gf-text-muted transition-colors hover:bg-gf-bg hover:text-gf-text"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          </button>
          {correction.source === "MANUAL" && (
            <ManualCorrectionIndicator source="MANUAL" />
          )}
        </>
      );
    }

    return {
      label: f.label,
      value: correction.value,
      missing,
      correctionState: correction.source,
      action,
    };
  });

  return (
    <Card>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {alwaysExpanded ? (
          <span className="text-sm font-semibold text-gf-text">
            {document.originalName}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="flex items-center gap-2 text-left"
          >
            <svg
              className={`h-4 w-4 text-gf-text-muted transition-transform ${
                expanded ? "rotate-90" : ""
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5l7 7-7 7"
              />
            </svg>
            <span className="text-sm font-semibold text-gf-text">
              {document.originalName}
            </span>
          </button>
        )}

        <div className="flex items-center gap-2">
          {isExpired && (
            <span className="inline-flex items-center rounded-full bg-red-50 text-red-700 border border-red-200 px-2.5 py-0.5 text-xs font-semibold">
              Documento vencido
            </span>
          )}
          {alerts.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-0.5 text-xs font-semibold">
              <span aria-hidden="true">⚠</span> {alerts.length}{" "}
              {alerts.length === 1 ? "alerta" : "alertas"}
            </span>
          )}
          <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold">
            {document.documentStatus.name}
          </span>
          {onValidate && (
            <button
              type="button"
              onClick={() => onValidate(document)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gf-border bg-white px-3 py-1.5 text-xs font-semibold text-gf-text transition-all hover:bg-gf-surface-dim shadow-2xs active:scale-[0.98]"
            >
              Validar manualmente
            </button>
          )}
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────── */}
      {(expanded || alwaysExpanded) && (
        <div className="mt-4">
          <FieldGrid fields={gridFields} />

          {alerts.length > 0 && (
            <div className="mt-4 border-t border-gf-border pt-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gf-text-muted mb-2">
                Alertas
              </h4>
              <ul className="space-y-1.5">
                {alerts.map((alert, idx) => (
                  <li
                    key={`${alert.code}-${idx}`}
                    className={
                      alert.severity === "CRITICAL"
                        ? "rounded bg-red-50 px-2 py-1 text-xs text-red-700"
                        : "rounded bg-amber-50 px-2 py-1 text-xs text-amber-700"
                    }
                  >
                    <span className="font-semibold">{alert.severity}</span>:{" "}
                    {alert.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* category is reserved for future per-category styling hooks */}
      <span className="sr-only">{category}</span>
    </Card>
  );
}