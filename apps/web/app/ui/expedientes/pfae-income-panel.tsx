"use client";

import { useEffect, useState, useTransition } from "react";

import {
  switchIncomeSource,
  type IncomeBase,
  type IncomeCalculationResult,
  type PfaeIncomeBases,
} from "@/app/actions/income";
import Button from "@/app/ui/common/button";
import Card from "@/app/ui/common/card";
import FieldGrid, { type FieldGridField } from "@/app/ui/common/field-grid";
import FormField from "@/app/ui/common/form-field";
import { formatMonthKey } from "@/app/lib/display-format";

type PfaeSendSource = "BANK_STATEMENTS" | "TAX_RETURN";

interface PfaeIncomePanelProps {
  caseId: string;
  snapshot: IncomeCalculationResult | null;
  onSnapshotChange: (next: IncomeCalculationResult) => void;
  onSourceSwitched?: () => void;
  peinadoWarn?: boolean;
}

const SELECT_CLASS =
  "h-[42px] w-full px-3 rounded-[8px] border border-gf-border bg-white text-sm text-gf-text " +
  "focus:border-gf-red focus:ring-2 focus:ring-gf-red/20 focus:outline-none " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

const INVALID_REASON_COPY: Record<string, string> = {
  TAX_LOSS: "Pérdida fiscal",
  INSUFFICIENT_MONTHS: "Meses insuficientes",
  MISSING_DOCUMENT: "Documento faltante",
};

const TAX_LOSS_SEND_COPY =
  "No se puede enviar declaración: hay pérdida fiscal. Cambie a estados de cuenta.";

function formatMXN(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function reasonLabel(reason: string | null): string | undefined {
  if (!reason) return undefined;
  return INVALID_REASON_COPY[reason] ?? reason;
}

function persistedPickerSource(snapshot: IncomeCalculationResult): PfaeSendSource {
  if (
    snapshot.source === "BANK_STATEMENTS" ||
    snapshot.source === "TAX_RETURN"
  ) {
    return snapshot.source;
  }
  return snapshot.bases?.bank.valid ? "BANK_STATEMENTS" : "TAX_RETURN";
}

function isSelectable(base: IncomeBase): boolean {
  return base.valid && base.invalidReason !== "TAX_LOSS";
}

function mapSwitchError(raw: string | undefined, source: PfaeSendSource): string {
  const text = raw ?? "";
  if (text.includes("TAX_LOSS")) {
    return TAX_LOSS_SEND_COPY;
  }
  if (text.includes("INSUFFICIENT_MONTHS")) {
    return "No se puede enviar estados de cuenta: meses insuficientes.";
  }
  if (text.includes("MISSING_DOCUMENT")) {
    return "No se puede enviar esta base: falta el documento.";
  }
  if (source === "TAX_RETURN") {
    return TAX_LOSS_SEND_COPY;
  }
  return text || "No se pudo cambiar la fuente de ingresos.";
}

function bankFields(bases: PfaeIncomeBases): FieldGridField[] {
  const bank = bases.bank;
  return [
    {
      label: "Promedio mensual (depósitos)",
      value: formatMXN(bank.monthlyGross),
    },
    { label: "Ventana", value: `${bank.windowMonths} meses` },
    {
      label: "Meses usados",
      value:
        bank.monthsUsed.length > 0
          ? bank.monthsUsed.map((month) => formatMonthKey(month) ?? month).join(", ")
          : undefined,
    },
    {
      label: "Mes alto excluido",
      value: formatMonthKey(bank.droppedMax) ?? undefined,
    },
    {
      label: "Mes bajo excluido",
      value: formatMonthKey(bank.droppedMin) ?? undefined,
    },
  ];
}

function taxFields(bases: PfaeIncomeBases): FieldGridField[] {
  const tax = bases.taxReturn;
  return [
    {
      label: "Promedio bruto mensual (acumulables / 12)",
      value: formatMXN(tax.monthlyGross),
    },
    {
      label: "Promedio neto mensual (utilidad / 12)",
      value: formatMXN(tax.monthlyNet),
    },
  ];
}

function activityLine(bases: PfaeIncomeBases): string | undefined {
  const activity = bases.activity;
  const parts: string[] = [];
  if (activity.description) parts.push(activity.description);
  if (activity.percentage != null) parts.push(`${activity.percentage}%`);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function EmptyPfaeIncomeCard() {
  return (
    <Card>
      <p className="text-sm text-gf-text-muted">
        Sin bases PFAE. Ejecuta «Analizar expediente» en Validaciones para
        calcular las bases.
      </p>
    </Card>
  );
}

function BaseStatus({ base }: { base: IncomeBase }) {
  if (base.valid) {
    return <p className="text-xs text-gf-text-muted mb-3">Base válida</p>;
  }
  return (
    <p className="text-xs text-gf-danger mb-3">
      Base no válida
      {reasonLabel(base.invalidReason)
        ? `: ${reasonLabel(base.invalidReason)}`
        : ""}
    </p>
  );
}

export default function PfaeIncomePanel({
  caseId,
  snapshot,
  onSnapshotChange,
  onSourceSwitched,
  peinadoWarn = false,
}: PfaeIncomePanelProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draftSource, setDraftSource] = useState<PfaeSendSource>("BANK_STATEMENTS");

  const bases = snapshot?.bases ?? null;

  useEffect(() => {
    if (!snapshot?.bases) return;
    setDraftSource(persistedPickerSource(snapshot));
  }, [snapshot]);

  if (!snapshot || !bases) {
    return <EmptyPfaeIncomeCard />;
  }

  const taxHasLoss = bases.taxReturn.invalidReason === "TAX_LOSS";
  const bankSelectable = isSelectable(bases.bank);
  const taxSelectable = isSelectable(bases.taxReturn);
  const pickerDisabled = isPending || (!bankSelectable && !taxSelectable);
  const activity = activityLine(bases);

  const applySource = (next: PfaeSendSource) => {
    if (next === "TAX_RETURN" && taxHasLoss) {
      setError(TAX_LOSS_SEND_COPY);
      setDraftSource(persistedPickerSource(snapshot));
      return;
    }
    if (next === "BANK_STATEMENTS" && !bankSelectable) {
      setError("No se puede enviar estados de cuenta: la base no es válida.");
      setDraftSource(persistedPickerSource(snapshot));
      return;
    }
    if (next === "TAX_RETURN" && !taxSelectable) {
      setError(TAX_LOSS_SEND_COPY);
      setDraftSource(persistedPickerSource(snapshot));
      return;
    }
    if (next === persistedPickerSource(snapshot)) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await switchIncomeSource(caseId, next);
      if (!result.success || !result.data) {
        setError(mapSwitchError(result.error, next));
        setDraftSource(persistedPickerSource(snapshot));
        return;
      }
      onSnapshotChange(result.data);
      onSourceSwitched?.();
    });
  };

  return (
    <div className="space-y-4">
      {peinadoWarn && (
        <p className="text-sm text-gf-warning">
          Hay discrepancias en el peinado de depósitos.{" "}
          <a href="#extraccion" className="underline font-medium text-gf-text">
            Revisar extracción
          </a>
        </p>
      )}

      <Card>
        {activity && (
          <p className="text-xs text-gf-text-muted mb-4">Actividad: {activity}</p>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h4 className="text-sm font-semibold text-gf-text mb-1">
              Estados de cuenta
            </h4>
            <BaseStatus base={bases.bank} />
            <FieldGrid fields={bankFields(bases)} />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-gf-text mb-1">
              Declaración
            </h4>
            <BaseStatus base={bases.taxReturn} />
            {taxHasLoss && (
              <p className="text-sm text-gf-danger mb-3">{TAX_LOSS_SEND_COPY}</p>
            )}
            <FieldGrid fields={taxFields(bases)} />
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-gf-border space-y-3">
          {error && (
            <p role="alert" className="text-sm text-gf-danger">
              {error}
            </p>
          )}

          <FormField label="Base a enviar al banco" name="incomeSource">
            <select
              id="incomeSource"
              name="incomeSource"
              className={SELECT_CLASS}
              value={draftSource}
              disabled={pickerDisabled}
              onChange={(event) => {
                const next = event.target.value as PfaeSendSource;
                setDraftSource(next);
                applySource(next);
              }}
            >
              <option value="BANK_STATEMENTS" disabled={!bankSelectable}>
                Estados de cuenta
              </option>
              <option value="TAX_RETURN" disabled={!taxSelectable}>
                Declaración
              </option>
            </select>
          </FormField>

          <Button
            variant="secondary"
            loading={isPending}
            disabled={pickerDisabled}
            onClick={() => applySource(draftSource)}
          >
            Aplicar base
          </Button>
        </div>
      </Card>
    </div>
  );
}
