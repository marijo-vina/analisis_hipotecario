"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";

import {
  switchIncomeSource,
  type IncomeBase,
  type IncomeCalculationResult,
  type PfaeIncomeBases,
} from "@/app/actions/income";
import Card from "@/app/ui/common/card";
import { formatMonthKey } from "@/app/lib/display-format";

type PfaeSendSource = "BANK_STATEMENTS" | "TAX_RETURN";

interface PfaeIncomePanelProps {
  caseId: string;
  snapshot: IncomeCalculationResult | null;
  onSnapshotChange: (next: IncomeCalculationResult) => void;
  onSourceSwitched?: () => void;
  peinadoWarn?: boolean;
  emptyMessage?: string;
  bankCaption?: string;
}

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

function bankPeriodCopy(bases: PfaeIncomeBases): string {
  return `Promedio de ${bases.bank.windowMonths} meses de depósitos`;
}

function bankExcludedCopy(bases: PfaeIncomeBases): string | undefined {
  const high = formatMonthKey(bases.bank.droppedMax);
  const low = formatMonthKey(bases.bank.droppedMin);
  if (high && low) {
    return `Se dejó fuera el mes más alto (${high}) y el más bajo (${low}).`;
  }
  if (high) return `Se dejó fuera el mes más alto (${high}).`;
  if (low) return `Se dejó fuera el mes más bajo (${low}).`;
  return undefined;
}

function activityLine(bases: PfaeIncomeBases): string | undefined {
  const activity = bases.activity;
  const parts: string[] = [];
  if (activity.description) parts.push(activity.description);
  if (activity.percentage != null) parts.push(`${activity.percentage}%`);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function EmptyPfaeIncomeCard({ message }: { message: string }) {
  return (
    <Card>
      <p className="text-sm text-gf-text-muted">{message}</p>
    </Card>
  );
}

function PathChip({
  selected,
  selectable,
}: {
  selected: boolean;
  selectable: boolean;
}) {
  if (selected) {
    return (
      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-gf-red-soft text-gf-red">
        Se manda a los bancos
      </span>
    );
  }
  if (!selectable) {
    return (
      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-red-50 text-gf-danger">
        No se puede usar
      </span>
    );
  }
  return (
    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gf-text-muted">
      Disponible
    </span>
  );
}

function PathCard({
  title,
  selected,
  selectable,
  disabled,
  onSelect,
  children,
}: {
  title: string;
  selected: boolean;
  selectable: boolean;
  disabled: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  const canChoose = selectable && !disabled && !selected;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={title}
      disabled={!canChoose && !selected}
      onClick={() => {
        if (canChoose) onSelect();
      }}
      className={
        "flex flex-col text-left rounded-[12px] border p-5 transition-colors " +
        (selected
          ? "border-gf-red bg-gf-red-soft/40"
          : "border-gf-border bg-gf-surface-dim/40") +
        (canChoose ? " hover:border-gf-red/60 cursor-pointer" : "") +
        (!selectable ? " opacity-80 cursor-not-allowed" : "")
      }
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <h4 className="text-sm font-semibold text-gf-text">{title}</h4>
        <PathChip selected={selected} selectable={selectable} />
      </div>
      {children}
    </button>
  );
}

const PFAE_EMPTY =
  "Sin bases PFAE. Ejecuta «Analizar expediente» en Validaciones para calcular las bases.";

export default function PfaeIncomePanel({
  caseId,
  snapshot,
  onSnapshotChange,
  onSourceSwitched,
  peinadoWarn = false,
  emptyMessage = PFAE_EMPTY,
  bankCaption,
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
    return <EmptyPfaeIncomeCard message={emptyMessage} />;
  }

  const taxHasLoss = bases.taxReturn.invalidReason === "TAX_LOSS";
  const bankSelectable = isSelectable(bases.bank);
  const taxSelectable = isSelectable(bases.taxReturn);
  const activity = activityLine(bases);
  const excluded = bankExcludedCopy(bases);
  const bankInvalid = reasonLabel(bases.bank.invalidReason);
  const taxInvalid = reasonLabel(bases.taxReturn.invalidReason);

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

  const sendingLabel =
    draftSource === "BANK_STATEMENTS" ? "estados de cuenta" : "declaración anual";

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
        <p className="text-sm text-gf-text mb-1">
          Hay dos formas de comprobar el ingreso. Elija cuál se manda a los
          bancos.
        </p>
        {activity && (
          <p className="text-xs text-gf-text-muted mb-4">Actividad: {activity}</p>
        )}
        {!activity && <div className="mb-4" />}

        {error && (
          <p role="alert" className="text-sm text-gf-danger mb-4">
            {error}
          </p>
        )}

        <div
          role="radiogroup"
          aria-label="Base a enviar al banco"
          className="grid grid-cols-1 lg:grid-cols-2 gap-4"
        >
          <PathCard
            title="Estados de cuenta"
            selected={draftSource === "BANK_STATEMENTS"}
            selectable={bankSelectable}
            disabled={isPending}
            onSelect={() => applySource("BANK_STATEMENTS")}
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-gf-text-muted">
              Promedio mensual de depósitos
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-gf-text">
              {formatMXN(bases.bank.monthlyGross)}
            </p>
            <p className="mt-2 text-xs text-gf-text-muted">
              {bankCaption ?? bankPeriodCopy(bases)}
            </p>
            {excluded && (
              <p className="mt-1 text-xs text-gf-text-muted">{excluded}</p>
            )}
            {bankInvalid && (
              <p className="mt-3 text-xs text-gf-danger">{bankInvalid}</p>
            )}
          </PathCard>

          <PathCard
            title="Declaración anual"
            selected={draftSource === "TAX_RETURN"}
            selectable={taxSelectable}
            disabled={isPending}
            onSelect={() => applySource("TAX_RETURN")}
          >
            <div className="space-y-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gf-text-muted">
                  Ingreso bruto mensual
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-gf-text">
                  {formatMXN(bases.taxReturn.monthlyGross)}
                </p>
                <p className="mt-1 text-xs text-gf-text-muted">
                  Ingresos acumulables del ejercicio ÷ 12
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gf-text-muted">
                  Ingreso neto mensual
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-gf-text">
                  {formatMXN(bases.taxReturn.monthlyNet)}
                </p>
                <p className="mt-1 text-xs text-gf-text-muted">
                  Utilidad fiscal ÷ 12
                </p>
              </div>
            </div>
            {taxHasLoss && (
              <p className="mt-3 text-xs text-gf-danger">{TAX_LOSS_SEND_COPY}</p>
            )}
            {!taxHasLoss && taxInvalid && (
              <p className="mt-3 text-xs text-gf-danger">{taxInvalid}</p>
            )}
          </PathCard>
        </div>

        <p className="mt-4 text-xs text-gf-text-muted">
          Los bancos recibirán el ingreso de {sendingLabel}.
        </p>
      </Card>
    </div>
  );
}
