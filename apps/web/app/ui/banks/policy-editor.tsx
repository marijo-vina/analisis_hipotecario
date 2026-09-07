"use client";

import { useTransition, useState, useEffect } from "react";
import { AlertTriangle, Check } from "lucide-react";
import type { BankPolicy } from "@/app/lib/definitions";
import { updatePolicy } from "@/app/actions/banks";
import { DESTINATION_LABELS } from "@/app/lib/definitions";

interface PolicyEditorProps {
  bankCode: string;
  policies: BankPolicy[];
}

const PFAE_SALARIED_FALLBACK = "igual que asalariado";

const COLUMNS: {
  key: keyof BankPolicy;
  label: string;
  isAge?: boolean;
  isCurrency?: boolean;
  emptyDisplay?: string;
}[] = [
  { key: "minimumIncome", label: "Ingreso mín.", isCurrency: true },
  { key: "minimumPropertyValue", label: "Valor prop. mín.", isCurrency: true },
  { key: "minimumEmploymentTenureMonths", label: "Antigüedad (meses)" },
  { key: "minimumApplicantAgeMonths", label: "Edad mín. (años)", isAge: true },
  { key: "maximumApplicationAgeMonths", label: "Edad máx. (años)", isAge: true },
  { key: "minimumActivityTenureMonths", label: "Antigüedad PFAE" },
  {
    key: "minimumIncomePfae",
    label: "Ingreso mín. PFAE",
    isCurrency: true,
    emptyDisplay: PFAE_SALARIED_FALLBACK,
  },
  {
    key: "minimumApplicantAgeMonthsPfae",
    label: "Edad mín. PFAE",
    isAge: true,
    emptyDisplay: PFAE_SALARIED_FALLBACK,
  },
];

export default function PolicyEditor({ bankCode, policies }: PolicyEditorProps) {
  const [pendingConfirm, setPendingConfirm] = useState<{
    policy: BankPolicy;
    dirtyFields: Record<string, unknown>;
  } | null>(null);

  const [isPending, startTransition] = useTransition();

  const handleConfirmSave = () => {
    if (!pendingConfirm) return;
    const { policy, dirtyFields } = pendingConfirm;

    startTransition(async () => {
      await updatePolicy(bankCode, policy.destination, dirtyFields);
      setPendingConfirm(null);
    });
  };

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[1180px]">
          <thead>
            <tr className="border-b border-gf-border bg-gf-surface-dim/60">
              <th className="py-3 px-4 text-xs font-semibold text-gf-text-muted uppercase tracking-wider w-[160px]">
                Objetivo del Crédito
              </th>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className="py-3 px-3 text-xs font-semibold text-gf-text-muted uppercase tracking-wider"
                >
                  {col.label}
                </th>
              ))}
              <th className="py-3 px-4 text-xs font-semibold text-gf-text-muted uppercase tracking-wider text-center w-[90px]">
                Activo
              </th>
              <th className="py-3 px-3 w-[120px]"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gf-border">
            {policies?.map((policy) => (
              <PolicyRow
                key={policy.id}
                policy={policy}
                onRequestSave={(dirtyFields) =>
                  setPendingConfirm({ policy, dirtyFields })
                }
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Confirmation Modal */}
      {pendingConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center gap-3 text-amber-600">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-gf-text">
                Confirmar cambio de política
              </h3>
            </div>

            <div className="space-y-3 text-sm text-gf-text-muted">
              <p>
                Está a punto de actualizar la política para el destino{" "}
                <strong className="text-gf-text">
                  {DESTINATION_LABELS[pendingConfirm.policy.destination] ??
                    pendingConfirm.policy.destination}
                </strong>{" "}
                en <strong className="text-gf-text">{bankCode}</strong>.
              </p>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 space-y-1">
                <p className="font-semibold text-amber-950">
                  ⚠️ Aviso de impacto en análisis:
                </p>
                <p>
                  • Este cambio afectará todas las evaluaciones de viabilidad que se
                  ejecuten a partir de este momento.
                </p>
                <p>
                  • Los expedientes ya analizados <strong>no se verán alterados</strong> y
                  mantendrán su historial con las políticas vigentes al momento de su
                  evaluación.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPendingConfirm(null)}
                disabled={isPending}
                className="px-4 py-2 text-xs font-semibold rounded-full border border-gf-border text-gf-text hover:bg-gray-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmSave}
                disabled={isPending}
                className="px-4 py-2 text-xs font-semibold rounded-full bg-gf-red hover:bg-gf-red-dark text-white transition-colors flex items-center gap-1.5 shadow-xs"
              >
                {isPending ? "Guardando..." : "Confirmar y guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------------------------------------------------------------------------
 * PolicyRow — Row component tracking dirty state per destination
 * ------------------------------------------------------------------------- */

interface PolicyRowProps {
  policy: BankPolicy;
  onRequestSave: (dirtyFields: Record<string, unknown>) => void;
}

function PolicyRow({ policy, onRequestSave }: PolicyRowProps) {
  const [dirtyFields, setDirtyFields] = useState<Record<string, unknown>>({});

  // Reset dirty fields when policy prop updates from server
  useEffect(() => {
    setDirtyFields({});
  }, [policy]);

  const isActive =
    typeof dirtyFields.isActive === "boolean"
      ? (dirtyFields.isActive as boolean)
      : policy.isActive;

  const hasChanges = Object.keys(dirtyFields).length > 0;

  const updateField = (field: string, value: unknown) => {
    setDirtyFields((prev) => {
      const next = { ...prev, [field]: value };
      const original = (policy as unknown as Record<string, unknown>)[field];
      const originalComparable =
        typeof original === "boolean" ? original : coercePolicyNumber(original);
      if (value === originalComparable) {
        delete next[field];
      }
      return next;
    });
  };

  const destinationLabel =
    DESTINATION_LABELS[policy.destination] ?? policy.destination;

  return (
    <tr
      className={`h-[48px] transition-all ${
        !isActive
          ? "bg-gray-50/80 opacity-60 grayscale-[20%]"
          : "hover:bg-gf-surface-dim/40"
      }`}
    >
      <td className="py-2 px-4">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap transition-colors ${
            isActive
              ? "bg-[#0F5C81] text-white"
              : "bg-gray-200 text-gray-600 border border-gray-300"
          }`}
        >
          {destinationLabel}
        </span>
      </td>

      {COLUMNS.map((col) => {
        const sourceValue =
          col.key in dirtyFields ? dirtyFields[col.key] : policy[col.key];
        const rawValue = coercePolicyNumber(sourceValue);
        const isAge = col.isAge ?? false;
        const displayValue =
          isAge && rawValue != null ? Math.floor(rawValue / 12) : rawValue;

        return (
          <td key={col.key} className="py-2 px-3">
            <InlineCell
              value={displayValue}
              disabled={!isActive}
              isCurrency={col.isCurrency === true}
              emptyDisplay={col.emptyDisplay}
              onSave={(v) => {
                const finalDbValue = isAge && v != null ? v * 12 : v;
                updateField(col.key as string, finalDbValue);
              }}
            />
          </td>
        );
      })}

      <td className="py-2 px-4 text-center">
        <ToggleSwitch
          active={isActive}
          onToggle={(nextActive) => updateField("isActive", nextActive)}
        />
      </td>

      <td className="py-2 px-3 text-right">
        {hasChanges && (
          <button
            type="button"
            onClick={() => onRequestSave(dirtyFields)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-gf-red hover:bg-gf-red-dark text-white rounded-full transition-colors whitespace-nowrap shadow-xs"
          >
            <Check className="w-3 h-3" />
            Guardar
          </button>
        )}
      </td>
    </tr>
  );
}

/* ---------------------------------------------------------------------------
 * InlineCell — Editable cell with live thousand separator formatting
 * ------------------------------------------------------------------------- */

interface InlineCellProps {
  value: number | null;
  disabled?: boolean;
  isCurrency?: boolean;
  emptyDisplay?: string;
  onSave: (value: number | null) => void;
}

function formatCurrencyDisplay(val: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(val);
}

function formatThousandInput(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return new Intl.NumberFormat("es-MX").format(Number(digits));
}

function coercePolicyNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function InlineCell({
  value,
  disabled,
  onSave,
  isCurrency,
  emptyDisplay,
}: InlineCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(
    value != null ? (isCurrency ? formatThousandInput(String(value)) : String(value)) : ""
  );

  useEffect(() => {
    setDraft(
      value != null ? (isCurrency ? formatThousandInput(String(value)) : String(value)) : ""
    );
  }, [value, isCurrency]);

  if (!editing || disabled) {
    return (
      <span
        role={disabled ? undefined : "button"}
        tabIndex={disabled ? undefined : 0}
        onClick={() => {
          if (!disabled) {
            setDraft(
              value != null ? (isCurrency ? formatThousandInput(String(value)) : String(value)) : ""
            );
            setEditing(true);
          }
        }}
        onKeyDown={(e) => {
          if (!disabled && (e.key === "Enter" || e.key === " ")) {
            setDraft(
              value != null ? (isCurrency ? formatThousandInput(String(value)) : String(value)) : ""
            );
            setEditing(true);
          }
        }}
        className={`inline-block min-w-[48px] px-2 py-1 rounded-md text-sm tabular-nums ${
          disabled
            ? "cursor-not-allowed text-gf-text-muted"
            : "cursor-pointer hover:bg-gf-surface-dim font-medium"
        } ${value == null ? "text-gf-text-muted font-normal" : "text-gf-text"}`}
      >
        {value == null
          ? (emptyDisplay ?? "—")
          : isCurrency
          ? formatCurrencyDisplay(value)
          : String(value)}
      </span>
    );
  }

  const commit = () => {
    const cleanDigits = draft.replace(/\D/g, "");
    const numeric = cleanDigits === "" ? null : Number(cleanDigits);
    if (numeric !== value) onSave(numeric);
    setEditing(false);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      value={draft}
      onChange={(e) => {
        const val = e.target.value;
        if (isCurrency) {
          setDraft(formatThousandInput(val));
        } else {
          setDraft(val.replace(/\D/g, ""));
        }
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          setDraft(
            value != null ? (isCurrency ? formatThousandInput(String(value)) : String(value)) : ""
          );
          setEditing(false);
        }
      }}
      autoFocus
      placeholder={emptyDisplay ?? "—"}
      className="w-32 h-8 border border-gf-border rounded-[10px] px-2 text-sm text-gf-text bg-white focus:outline-none focus:ring-2 focus:ring-gf-red/30 focus:border-gf-red font-medium shadow-xs"
    />
  );
}

/* ---------------------------------------------------------------------------
 * Toggle switch
 * ------------------------------------------------------------------------- */

interface ToggleSwitchProps {
  active: boolean;
  onToggle: (next: boolean) => void;
}

function ToggleSwitch({ active, onToggle }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      onClick={() => onToggle(!active)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ${
        active ? "bg-[#067647]" : "bg-gray-300"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          active ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
