"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useTransition, useState, useEffect } from "react";
import type { BankDetail } from "@/app/lib/definitions";
import { INCOME_CRITERION_LABELS } from "@/app/lib/definitions";
import { updateBank } from "@/app/actions/banks";
import Card from "@/app/ui/common/card";
import PolicyEditor from "@/app/ui/banks/policy-editor";

interface BankDetailCardProps {
  bank: BankDetail;
}

/**
 * Bank-level detail card with inline editing for top-level fields
 * (incomeCriterion, debtCommitmentFactor, minimumBureauScore) plus the
 * policies table rendered by the PolicyEditor client island.
 */
export default function BankDetailCard({ bank }: BankDetailCardProps) {
  const [isPending, startTransition] = useTransition();

  const save = (field: string, value: unknown) => {
    startTransition(async () => {
      await updateBank(bank.code, { [field]: value });
    });
  };

  const [incomeCriterion, setIncomeCriterion] = useState(bank.incomeCriterion);

  // Sync when server data changes (after revalidation)
  useEffect(() => {
    setIncomeCriterion(bank.incomeCriterion);
  }, [bank.incomeCriterion]);

  const debtPct = Math.round(bank.debtCommitmentFactor * 100);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/bancos"
          className="flex items-center gap-1 text-sm text-gf-text-muted hover:text-gf-text transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver
        </Link>
      </div>

      {/* Bank info card */}
      <Card className={isPending ? "opacity-60 transition-opacity" : ""}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gf-red-soft text-gf-red">
              <BuildingIcon />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gf-text">{bank.name}</h1>
              <p className="text-sm text-gf-text-muted">
                {INCOME_CRITERION_LABELS[bank.incomeCriterion] ?? bank.incomeCriterion}
                {" · "}
                CE: {debtPct}%
                {" · "}
                Score mín: {bank.minimumBureauScore ?? "—"}
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-gf-border pt-5">
          <h2 className="text-sm font-semibold text-gf-text mb-4">
            Datos Generales
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Bank name — readonly */}
            <div>
              <label className="block text-xs font-medium text-gf-text-muted mb-1">
                Banco
              </label>
              <div className="h-10 rounded-[10px] border border-gf-border bg-gf-surface-dim/60 px-3 flex items-center text-sm text-gf-text-muted">
                {bank.name}
              </div>
            </div>

            {/* Income criterion dropdown */}
            <div>
              <label className="block text-xs font-medium text-gf-text-muted mb-1">
                Tipo Ingreso
              </label>
              <select
                value={incomeCriterion}
                onChange={(e) => {
                  const next = e.target.value as "NET" | "GROSS";
                  setIncomeCriterion(next);
                  save("incomeCriterion", next);
                }}
                className="h-10 w-full rounded-[10px] border border-gf-border bg-white px-3 text-sm text-gf-text focus:outline-none focus:ring-2 focus:ring-gf-red/30 focus:border-gf-red"
              >
                <option value="NET">Neto</option>
                <option value="GROSS">Bruto</option>
              </select>
            </div>

            {/* Debt commitment factor (%) */}
            <div>
              <label className="block text-xs font-medium text-gf-text-muted mb-1">
                Factor CE
              </label>
              <NumberField
                defaultValue={debtPct}
                suffix="%"
                onSave={(v) => save("debtCommitmentFactor", v != null ? v / 100 : null)}
              />
            </div>

            {/* Minimum bureau score — nullable */}
            <div>
              <label className="block text-xs font-medium text-gf-text-muted mb-1">
                Score Mínimo Buro
              </label>
              <NumberField
                defaultValue={bank.minimumBureauScore}
                nullable
                onSave={(v) => save("minimumBureauScore", v)}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Policies card */}
      <Card>
        <h2 className="text-sm font-semibold text-gf-text mb-4">
          Políticas por destino
        </h2>
        <PolicyEditor bankCode={bank.code} policies={bank.policies} />
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Inline helpers
 * ------------------------------------------------------------------------- */

interface NumberFieldProps {
  defaultValue: number | null;
  suffix?: string;
  nullable?: boolean;
  onSave: (value: number | null) => void;
}

function NumberField({ defaultValue, suffix, nullable, onSave }: NumberFieldProps) {
  const [value, setValue] = useState(defaultValue);

  // Sync when server data changes (after revalidation)
  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  const commit = () => {
    if (value !== defaultValue) onSave(value);
  };

  return (
    <div className="relative">
      <input
        type="number"
        defaultValue={value ?? ""}
        onChange={(e) =>
          setValue(e.target.value === "" ? null : Number(e.target.value))
        }
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
        placeholder={nullable ? "Sin límite" : undefined}
        className={`h-10 w-full rounded-[10px] border border-gf-border bg-white px-3 pr-10 text-sm text-gf-text focus:outline-none focus:ring-2 focus:ring-gf-red/30 focus:border-gf-red ${
          suffix ? "" : ""
        }`}
      />
      {suffix && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gf-text-muted pointer-events-none">
          {suffix}
        </span>
      )}
    </div>
  );
}

function BuildingIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-5 h-5"
    >
      <rect width="16" height="20" x="4" y="2" rx="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01" />
      <path d="M16 6h.01" />
      <path d="M12 6h.01" />
      <path d="M12 10h.01" />
      <path d="M12 14h.01" />
      <path d="M16 10h.01" />
      <path d="M16 14h.01" />
      <path d="M8 10h.01" />
      <path d="M8 14h.01" />
    </svg>
  );
}

