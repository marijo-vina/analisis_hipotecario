"use client";

import { useState, useEffect, useCallback } from "react";

import {
  fetchLiabilityLatest,
  calculateLiability,
  overrideLiabilityCredit,
} from "@/app/actions/liability";
import {
  GlobalLiabilityStatus,
  LiabilityCreditNature,
  LiabilityStatus,
  type LiabilityCalculationResult,
  type LiabilityCreditResult,
} from "@/app/lib/extraction";

import LiabilityTable from "./liability-table";
import EditCreditModal from "./edit-credit-modal";

// ── Props ────────────────────────────────────────────────────────────────────

interface LiabilityCalculationSectionProps {
  caseId: string;
}

// ── Formatting helpers (pure) ────────────────────────────────────────────────

/**
 * Formats a number as Mexican pesos for display: `$1,234,567`.
 * Decimals only appear when the value has a fractional part.
 */
export function formatMXN(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

// ── Status-label maps (codes → Spanish labels) ───────────────────────────────

export const GLOBAL_STATUS_LABELS: Record<GlobalLiabilityStatus, string> = {
  [GlobalLiabilityStatus.CALCULATED]: "Completo",
  [GlobalLiabilityStatus.PARTIAL]: "Provisional",
  [GlobalLiabilityStatus.INCOMPLETE]: "Incompleto",
};

export const NATURE_LABELS: Record<LiabilityCreditNature, string> = {
  [LiabilityCreditNature.REVOLVING]: "Revolvente",
  [LiabilityCreditNature.FIXED]: "Fijo",
  [LiabilityCreditNature.UNKNOWN]: "Pendiente",
};

export const LIABILITY_STATUS_LABELS: Record<LiabilityStatus, string> = {
  [LiabilityStatus.CALCULATED]: "Calculado",
  [LiabilityStatus.REQUIRES_REVIEW]: "Requiere revisión",
  [LiabilityStatus.INCOMPLETE]: "Incompleto",
};

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * LiabilityCalculationSection
 *
 * Orchestrates the "Cálculo de pasivos" view inside the Motor financiero tab.
 * Fetches the latest liability snapshot on mount, renders 3 KPI cards, a
 * collapsible accordion with the credit breakdown table, and an edit modal
 * for credits that require manual correction.
 */
export default function LiabilityCalculationSection({
  caseId,
}: LiabilityCalculationSectionProps) {
  const [snapshot, setSnapshot] = useState<LiabilityCalculationResult | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Edit modal state
  const [editing, setEditing] = useState<{
    creditIndex: number;
    credit: LiabilityCreditResult;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Load latest snapshot ───────────────────────────────────────────────
  const loadLatest = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchLiabilityLatest(caseId);
    setLoading(false);
    if (!res.success) {
      setError(res.error ?? "Error al cargar el cálculo");
      return;
    }
    setSnapshot(res.data ?? null);
  }, [caseId]);

  useEffect(() => {
    loadLatest();
  }, [loadLatest]);

  // ── Calculate ──────────────────────────────────────────────────────────
  const handleCalculate = async () => {
    setCalculating(true);
    setError(null);
    const res = await calculateLiability(caseId);
    setCalculating(false);
    if (!res.success || !res.data) {
      setError(res.error ?? "Error al calcular pasivos");
      return;
    }
    setSnapshot(res.data);
    setExpanded(true);
  };

  // ── Edit credit submit ──────────────────────────────────────────────────
  const handleEditSubmit = async (
    creditIndex: number,
    payload: {
      creditNature?: "REVOLVING" | "FIXED";
      currentBalance?: number;
      paymentDueAmountEffective?: number;
    },
  ) => {
    setSaving(true);
    const res = await overrideLiabilityCredit(caseId, creditIndex, payload);
    setSaving(false);
    if (!res.success || !res.data) {
      setError(res.error ?? "Error al guardar la corrección");
      return;
    }
    setSnapshot(res.data);
    setEditing(null);
  };

  // ── Render states ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="rounded-lg border border-gf-border bg-gf-surface p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-48 rounded bg-gray-200" />
          <div className="grid grid-cols-3 gap-4">
            <div className="h-24 rounded bg-gray-100" />
            <div className="h-24 rounded bg-gray-100" />
            <div className="h-24 rounded bg-gray-100" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gf-text">
          Cálculo de pasivos
        </h3>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Empty state: no snapshot yet ─────────────────────────────────── */}
      {!snapshot && !error && (
        <div className="rounded-lg border border-gf-border bg-gf-surface p-8 text-center">
          <p className="text-sm text-gf-text-muted">
            Sin cálculo — ejecuta el motor de pasivos para ver el desglose.
          </p>
          <button
            type="button"
            onClick={handleCalculate}
            disabled={calculating}
            className="mt-4 inline-flex items-center justify-center rounded-md bg-gf-red px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gf-red-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {calculating ? "Calculando..." : "Calcular"}
          </button>
        </div>
      )}

      {snapshot && (
        <>
          {/* ── KPI row ────────────────────────────────────────────────── */}
          <KpiRow snapshot={snapshot} />

          {/* ── Accordion ──────────────────────────────────────────────── */}
          <div className="rounded-lg border border-gf-border bg-gf-surface overflow-hidden">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="flex w-full items-center justify-between bg-gray-50 px-4 py-3 text-left text-sm font-medium text-gf-text transition-colors hover:bg-gray-100"
              aria-expanded={expanded}
            >
              <span>
                {expanded ? "▾" : "▸"}{" "}
                {expanded
                  ? "Ocultar desglose del cálculo"
                  : "Ver desglose del cálculo"}
              </span>
              <span className="text-gf-text-muted">
                {snapshot.credits.filter((c) => !c.isClosed).length} crédito
                {snapshot.credits.filter((c) => !c.isClosed).length === 1 ? "" : "s"}
              </span>
            </button>

            {expanded && (
              <div className="border-t border-gf-border">
                <LiabilityTable
                  snapshot={snapshot}
                  onEditCredit={(creditIndex, credit) =>
                    setEditing({ creditIndex, credit })
                  }
                />
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Edit modal ─────────────────────────────────────────────────── */}
      {editing && (
        <EditCreditModal
          credit={editing.credit}
          creditIndex={editing.creditIndex}
          saving={saving}
          onClose={() => setEditing(null)}
          onSubmit={handleEditSubmit}
        />
      )}
    </section>
  );
}

// ── KPI row (inline) ───────────────────────────────────────────────────────

function KpiRow({ snapshot }: { snapshot: LiabilityCalculationResult }) {
  const status = snapshot.globalStatus;
  const statusLabel = GLOBAL_STATUS_LABELS[status] ?? status;
  const statusClasses =
    status === GlobalLiabilityStatus.CALCULATED
      ? "bg-green-100 text-green-800"
      : status === GlobalLiabilityStatus.PARTIAL
        ? "bg-amber-100 text-amber-800"
        : "bg-red-100 text-red-800";

  const openCount = snapshot.credits.filter((c) => !c.isClosed).length;

  return (
    <div className="flex flex-row gap-4">
      {/* Saldo actual total — green */}
      <div
        className="flex flex-1 flex-col rounded-lg border border-green-200 p-4"
        style={{ backgroundColor: "#F0FDF4" }}
      >
        <span
          className="text-xs font-medium"
          style={{ color: "#166534" }}
        >
          Saldo actual total
        </span>
        <span
          className="mt-1 text-lg font-bold"
          style={{ color: "#166534" }}
        >
          {formatMXN(snapshot.totalCurrentBalance)}
        </span>
        <span className="mt-1 text-xs text-gf-text-muted">
          Suma de saldos activos en Buró
        </span>
      </div>

      {/* Deuda total mensual — blue */}
      <div
        className="flex flex-1 flex-col rounded-lg border border-blue-200 p-4"
        style={{ backgroundColor: "#EFF6FF" }}
      >
        <span className="text-xs font-medium" style={{ color: "#1E40AF" }}>
          Deuda total mensual
        </span>
        <span className="mt-1 text-lg font-bold" style={{ color: "#1E40AF" }}>
          {formatMXN(snapshot.grossCurrentMonthlyDebt)}
        </span>
        <span className="mt-1 text-xs text-gf-text-muted">
          Pasivo mensual calculado
        </span>
      </div>

      {/* Estado del cálculo — amber */}
      <div
        className="flex flex-1 flex-col rounded-lg border border-amber-200 p-4"
        style={{ backgroundColor: "#FFFBEB" }}
      >
        <span className="text-xs font-medium" style={{ color: "#92400E" }}>
          Estado del cálculo
        </span>
        <span className="mt-1">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClasses}`}
          >
            {statusLabel}
          </span>
        </span>
        <span className="mt-1 text-xs text-gf-text-muted">
          {openCount} crédito
          {openCount === 1 ? "" : "s"} evaluado
          {openCount === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}