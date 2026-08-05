"use client";

import { useTransition, useState, useEffect } from "react";
import type { BankPolicy } from "@/app/lib/definitions";
import { updatePolicy } from "@/app/actions/banks";
import { DESTINATION_LABELS } from "@/app/lib/definitions";

interface PolicyEditorProps {
  bankCode: string;
  policies: BankPolicy[];
}

const MONTHS_COLUMNS = new Set<string>([
  "minimumEmploymentTenureMonths",
  "minimumApplicantAgeMonths",
  "maximumApplicationAgeMonths",
]);

const CURRENCY_COLUMNS = new Set<string>(["minimumIncome", "minimumPropertyValue"]);

const COLUMNS: { key: keyof BankPolicy; label: string }[] = [
  { key: "minimumIncome", label: "Ingreso mín." },
  { key: "minimumPropertyValue", label: "Valor prop. mín." },
  { key: "minimumEmploymentTenureMonths", label: "Antigüedad (meses)" },
  { key: "minimumApplicantAgeMonths", label: "Edad mín." },
  { key: "maximumApplicationAgeMonths", label: "Edad máx." },
];

/**
 * Inline-editable policy table for a single bank.
 *
 * Each numeric cell can be clicked to reveal an input. On blur or Enter the
 * value is saved via server action. The active column is a toggle switch.
 * A "Guardar cambios" button at the bottom persists all unsaved edits.
 */
export default function PolicyEditor({ bankCode, policies }: PolicyEditorProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse min-w-[760px]">
        <thead>
          <tr className="border-b border-gf-border bg-gf-surface-dim/60">
            <th className="py-3 px-4 text-xs font-semibold text-gf-text-muted uppercase tracking-wider w-[130px]">
              Destino
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
          </tr>
        </thead>
        <tbody className="divide-y divide-gf-border">
          {policies?.map((policy) => (
            <PolicyRow
              key={policy.id}
              policy={policy}
              bankCode={bankCode}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Row — each row manages its own save state
 * ------------------------------------------------------------------------- */

interface RowProps {
  policy: BankPolicy;
  bankCode: string;
}

function PolicyRow({ policy, bankCode }: RowProps) {
  const [isPending, startTransition] = useTransition();
  const [dirtyColumns, setDirtyColumns] = useState<Record<string, unknown>>({});

  const hasDirty = Object.keys(dirtyColumns).length > 0;

  const saveField = (field: string, value: unknown) => {
    setDirtyColumns((prev) => ({ ...prev, [field]: value }));
  };

  const commitAll = () => {
    startTransition(async () => {
      await updatePolicy(bankCode, policy.destination, dirtyColumns);
      setDirtyColumns({});
    });
  };

  const destinationLabel =
    DESTINATION_LABELS[policy.destination] ?? policy.destination;

  return (
    <tr className={`h-[48px] ${isPending ? "opacity-50" : ""}`}>
      <td className="py-2 px-4">
        <span className="inline-flex items-center rounded-full bg-[#0F5C81] text-white px-2.5 py-0.5 text-xs font-medium whitespace-nowrap">
          {destinationLabel}
        </span>
      </td>
      {COLUMNS.map((col) => (
        <td key={col.key} className="py-2 px-3">
          <InlineCell
            value={policy[col.key] as number | null}
            isMonths={MONTHS_COLUMNS.has(col.key)}
            isCurrency={CURRENCY_COLUMNS.has(col.key)}
            onSave={(v) => saveField(col.key as string, v)}
          />
        </td>
      ))}
      <td className="py-2 px-4 text-center">
        <ToggleSwitch
          active={policy.isActive}
          onToggle={(v) => saveField("isActive", v)}
        />
      </td>
      <td className="py-2 px-2">
        {hasDirty && (
          <button
            onClick={commitAll}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-gf-red hover:bg-gf-red-dark text-white rounded-[10px] transition-colors whitespace-nowrap"
          >
            Guardar
          </button>
        )}
      </td>
    </tr>
  );
}

/* ---------------------------------------------------------------------------
 * Inline editable cell
 * ------------------------------------------------------------------------- */

interface InlineCellProps {
  value: number | null;
  isMonths?: boolean;
  isCurrency?: boolean;
  onSave: (value: number | null) => void;
}

function formatDisplay(value: number | null, isMonths: boolean, isCurrency: boolean): string {
  if (value == null) return "—";
  if (isMonths) {
    const years = Math.floor(value / 12);
    const months = value % 12;
    if (months === 0) return `${years} a`;
    return `${years}a ${months}m`;
  }
  if (isCurrency) {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 0,
    }).format(value);
  }
  return String(value);
}

function InlineCell({ value, onSave, isMonths, isCurrency }: InlineCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value != null ? String(value) : "");

  useEffect(() => {
    setDraft(value != null ? String(value) : "");
  }, [value]);

  if (!editing) {
    return (
      <span
        role="button"
        tabIndex={0}
        onClick={() => { setDraft(value != null ? String(value) : ""); setEditing(true); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { setDraft(value != null ? String(value) : ""); setEditing(true); } }}
        className="cursor-pointer inline-block min-w-[48px] px-2 py-1 rounded-md hover:bg-gf-surface-dim text-sm text-gf-text tabular-nums"
      >
        {formatDisplay(value, isMonths ?? false, isCurrency ?? false)}
      </span>
    );
  }

  const commit = () => {
    const numeric = draft === "" ? null : Number(draft);
    if (numeric !== value) onSave(numeric);
    setEditing(false);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") { setDraft(value != null ? String(value) : ""); setEditing(false); }
      }}
      autoFocus
      className="w-28 h-8 border border-gf-border rounded-[10px] px-2 text-sm text-gf-text bg-white focus:outline-none focus:ring-2 focus:ring-gf-red/30 focus:border-gf-red"
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
