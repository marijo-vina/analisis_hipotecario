import { useState, useReducer } from "react";
import {
  CreditCard,
  FileText,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Edit2,
  Eye,
  Clock,
} from "lucide-react";

import type { Document } from "@/app/lib/definitions";
import {
  type CorrectionSource,
  type ExtractionAlert,
  type ExtractionCategory,
} from "@/app/lib/extraction";
import { updateDocumentExtractedDataField } from "@/app/actions/documents";
import Card from "@/app/ui/common/card";
import FieldGrid, { type FieldGridField } from "@/app/ui/common/field-grid";
import ManualCorrectionIndicator from "@/app/ui/extraction/manual-correction-indicator";
import InlineFieldEditor from "@/app/ui/extraction/inline-field-editor";

// ── Correction state (per-card, persisted to DB via server action) ─────────
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
  /** Persisted manual corrections map if previously saved. */
  manualCorrections?: Record<string, { value: string; source: CorrectionSource }>;
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
 *  - Per-card correction state lives in `useReducer` and persists to DB.
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
  manualCorrections,
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
        const manual = manualCorrections?.[f.label];
        if (manual) {
          fields[f.label] = {
            value: manual.value,
            source: "MANUAL",
          };
        } else {
          const missing = f.missing || !f.value || f.value.length === 0;
          fields[f.label] = {
            value: f.value,
            source: missing ? "PENDING" : "AI",
          };
        }
      }
      return { fields: { ...init.fields, ...fields } };
    },
  );

  // Only one field editable at a time (label key, or null).
  const [editingField, setEditingField] = useState<string | null>(null);

  const handleSave = async (label: string, value: string) => {
    dispatch({ type: "SAVE", label, value });
    setEditingField(null);
    try {
      await updateDocumentExtractedDataField(
        document.mortgageCaseId,
        document.id,
        label,
        value,
      );
    } catch (error) {
      console.error("[ExtractionDocumentCard] Failed to persist correction:", error);
    }
  };

  // Select appropriate document icon
  const DocIcon = category === "identidad" ? CreditCard : FileText;

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
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setEditingField(f.label)}
            className="rounded-[10px] border border-gf-border bg-white px-2.5 py-1 text-xs font-semibold text-gf-text shadow-2xs transition-all hover:bg-gf-surface-dim active:scale-[0.98]"
          >
            Completar
          </button>
          <ManualCorrectionIndicator source="PENDING" />
        </div>
      );
    } else {
      // Detected → pencil Editar + (MANUAL chip if corrected).
      action = (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setEditingField(f.label)}
            aria-label={`Editar ${f.label}`}
            className="inline-flex items-center justify-center rounded-[10px] p-1 text-gf-text-muted transition-colors hover:bg-gf-surface-dim hover:text-gf-text"
          >
            <Edit2 className="h-3.5 w-3.5" />
          </button>
          {correction.source === "MANUAL" && (
            <ManualCorrectionIndicator source="MANUAL" />
          )}
        </div>
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gf-border/50 pb-3">
        {alwaysExpanded ? (
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-gf-surface-dim text-gf-text-muted">
              <DocIcon className="h-4 w-4" />
            </div>
            <span className="text-sm font-bold text-gf-text">
              {document.originalName}
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="flex items-center gap-2 text-left group"
          >
            <ChevronRight
              className={`h-4 w-4 text-gf-text-muted transition-transform duration-200 ${
                expanded ? "rotate-90 text-gf-text" : "group-hover:text-gf-text"
              }`}
            />
            <div className="p-2 rounded-lg bg-gf-surface-dim text-gf-text-muted group-hover:text-gf-text transition-colors">
              <DocIcon className="h-4 w-4" />
            </div>
            <span className="text-sm font-bold text-gf-text group-hover:text-gf-red transition-colors">
              {document.originalName}
            </span>
          </button>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {isExpired && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-0.5 text-xs font-semibold">
              <Clock className="h-3 w-3 text-amber-600" />
              Documento vencido
            </span>
          )}
          {alerts.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-0.5 text-xs font-semibold">
              <AlertTriangle className="h-3 w-3 text-amber-600" />
              {alerts.length} {alerts.length === 1 ? "alerta" : "alertas"}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            {document.documentStatus.name}
          </span>
          {onValidate && (
            <button
              type="button"
              onClick={() => onValidate(document)}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-gf-border bg-white px-3 py-1.5 text-xs font-semibold text-gf-text transition-all hover:bg-gf-surface-dim shadow-2xs active:scale-[0.98]"
            >
              <Eye className="h-3.5 w-3.5 text-gf-text-muted" />
              <span>Validar manualmente</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────── */}
      {(expanded || alwaysExpanded) && (
        <div className="pt-4">
          <FieldGrid fields={gridFields} />

          {alerts.length > 0 && (
            <div className="mt-4 border-t border-gf-border/50 pt-3">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-gf-text-muted mb-2 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                Alertas observadas
              </h4>
              <ul className="space-y-2">
                {alerts.map((alert, idx) => (
                  <li
                    key={`${alert.code}-${idx}`}
                    className={
                      alert.severity === "CRITICAL"
                        ? "rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800 flex items-start gap-2"
                        : "rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 flex items-start gap-2"
                    }
                  >
                    <span className="font-bold shrink-0 uppercase tracking-wide text-[10px] px-1.5 py-0.5 rounded bg-white/60">
                      {alert.severity}
                    </span>
                    <span>{alert.message}</span>
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