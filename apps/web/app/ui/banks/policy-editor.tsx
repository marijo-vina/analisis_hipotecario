"use client";

import { useTransition, useState, useEffect } from "react";
import type { BankPolicy } from "@/app/lib/definitions";
import { updatePolicy } from "@/app/actions/banks";
import { DESTINATION_LABELS } from "@/app/lib/definitions";

interface PolicyEditorProps {
  bankCode: string;
  policies: BankPolicy[];
}

/**
 * Inline-editable policy table for a single bank.
 *
 * Each numeric cell can be clicked to reveal an input. On blur or Enter the
 * value is saved via server action. The active column is a toggle switch.
 */
export default function PolicyEditor({ bankCode, policies }: PolicyEditorProps) {
  const columns: { key: keyof BankPolicy; label: string }[] = [
    { key: "minimumIncome", label: "Ingreso Mínimo" },
    { key: "minimumPropertyValue", label: "Propiedad Mínima" },
    { key: "minimumEmploymentTenureMonths", label: "Tenure (meses)" },
    { key: "minimumApplicantAgeMonths", label: "Edad Mínima" },
    { key: "maximumApplicationAgeMonths", label: "Edad Máxima" },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse min-w-[760px]">
        <thead>
          <tr className="border-b border-gf-border bg-gf-surface-dim/60">
            <th className="py-3 px-4 text-xs font-semibold text-gf-text-muted uppercase tracking-wider w-[180px]">
              Destino
            </th>
            {columns.map((col) => (
              <th
                key={col.key}
                className="py-3 px-4 text-xs font-semibold text-gf-text-muted uppercase tracking-wider"
              >
                {col.label}
              </th>
            ))}
            <th className="py-3 px-4 text-xs font-semibold text-gf-text-muted uppercase tracking-wider text-center w-[100px]">
              Activo
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gf-border">
          {policies.map((policy) => (
            <PolicyRow
              key={policy.id}
              policy={policy}
              bankCode={bankCode}
              columns={columns}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Row
 * ------------------------------------------------------------------------- */

interface RowProps {
  policy: BankPolicy;
  bankCode: string;
  columns: { key: keyof BankPolicy; label: string }[];
}

function PolicyRow({ policy, bankCode, columns }: RowProps) {
  const [isPending, startTransition] = useTransition();

  const save = (field: string, value: unknown) => {
    startTransition(async () => {
      await updatePolicy(bankCode, policy.destination, { [field]: value });
    });
  };

  const destinationLabel =
    DESTINATION_LABELS[policy.destination] ?? policy.destination;

  return (
    <tr className={`h-[48px] ${isPending ? "opacity-50" : ""}`}>
      <td className="py-2 px-4">
        <span className="inline-flex items-center rounded-full bg-[#0F5C81] text-white px-2.5 py-0.5 text-xs font-medium">
          {destinationLabel}
        </span>
      </td>
      {columns.map((col) => (
        <td key={col.key} className="py-2 px-4">
          <InlineCell
            value={policy[col.key] as number | null}
            onSave={(v) => save(col.key as string, v)}
          />
        </td>
      ))}
      <td className="py-2 px-4 text-center">
        <ToggleSwitch
          active={policy.isActive}
          onToggle={(v) => save("isActive", v)}
        />
      </td>
    </tr>
  );
}

/* ---------------------------------------------------------------------------
 * Inline editable cell
 * ------------------------------------------------------------------------- */

interface InlineCellProps {
  value: number | null;
  onSave: (value: number | null) => void;
}

function InlineCell({ value, onSave }: InlineCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<number | null>(value);

  // Sync when server data changes (after revalidation)
  useEffect(() => {
    setDraft(value);
  }, [value]);

  if (!editing) {
    return (
      <span
        role="button"
        tabIndex={0}
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            setDraft(value);
            setEditing(true);
          }
        }}
        className="cursor-pointer inline-block min-w-[48px] px-2 py-1 rounded-md hover:bg-gf-surface-dim text-sm text-gf-text tabular-nums"
      >
        {value ?? "—"}
      </span>
    );
  }

  const commit = () => {
    if (draft !== value) onSave(draft);
    setEditing(false);
  };

  return (
    <input
      type="number"
      value={draft ?? ""}
      onChange={(e) =>
        setDraft(e.target.value === "" ? null : Number(e.target.value))
      }
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
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
