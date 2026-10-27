"use client";

import { useState, useEffect, useCallback, useMemo } from "react";

import {
  fetchIncomeLatest,
  toggleIncomeReceipt,
  type IncomeCalculationResult,
  type IncomeReceiptResult,
} from "@/app/actions/income";

import { Check, X } from "lucide-react";
import Card from "@/app/ui/common/card";
import PfaeIncomePanel from "@/app/ui/expedientes/pfae-income-panel";

// ── Props ────────────────────────────────────────────────────────────────────

interface IncomeCalculationSectionProps {
  caseId: string;
  personType?: string;
  onSourceSwitched?: () => void;
  peinadoWarn?: boolean;
}

// ── Formatting helpers ───────────────────────────────────────────────────────

/**
 * Formats a number as Mexican pesos for display: `$1,234.56`.
 * Always shows 2 decimal places for income figures.
 */
function formatMXN(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Formats a date string for display. Returns "No identificada" when null.
 */
function formatDate(dateStr: string | null): string {
  if (!dateStr) return "No identificada";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

/**
 * Renders a visual badge with checkmark (✓) for matched conciliation (3/3 or 2/3 matched)
 * or cross mark (✗) for unconciliated receipts.
 */
function ConciliationStatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return <span className="text-gf-text-soft">—</span>;
  }

  const isMatched =
    status === "MATCHED" ||
    status === "MATCHED_2_OF_3" ||
    status === "PROVIDER_MIRROR_CONFIRMED";

  if (isMatched) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"
        title={status === "MATCHED_2_OF_3" ? "Conciliado (2/3)" : "Conciliado (3/3)"}
      >
        <Check className="h-3.5 w-3.5 stroke-[2.5]" />
        <span>Conciliado</span>
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200"
      title={status}
    >
      <X className="h-3.5 w-3.5 stroke-[2.5]" />
      <span>No conciliado</span>
    </span>
  );
}

// ── Currency input helper ────────────────────────────────────────────────────

/**
 * Formats a raw numeric string with thousand-separator commas for display
 * while the user types. "1500000" → "1,500,000", "15000.50" → "15,000.50".
 */
function formatCurrencyRaw(raw: string): string {
  if (!raw) return "";
  const parts = raw.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1").split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parts.join(".");
}

/** Controlled text input that displays MXN-formatted numbers as the user types. */
function CurrencyInput({
  value,
  onChange,
  className,
  placeholder,
  id,
}: {
  value: string;
  onChange: (raw: string) => void;
  className?: string;
  placeholder?: string;
  id?: string;
}) {
  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      placeholder={placeholder}
      value={formatCurrencyRaw(value)}
      onChange={(e) => {
        const raw = e.target.value.replace(/,/g, "");
        onChange(raw);
      }}
      className={className}
    />
  );
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * IncomeCalculationSection
 *
 * Orchestrates the "Cálculo de ingreso mensual admisible" view inside the
 * Motor financiero tab. Fetches the latest income snapshot on mount, renders
 * KPI cards, a 9-column receipt table with inclusion toggles, and a
 * confirmation panel for analyst verification.
 */
export default function IncomeCalculationSection({
  caseId,
  personType,
  onSourceSwitched,
  peinadoWarn = false,
}: IncomeCalculationSectionProps) {
  const [snapshot, setSnapshot] = useState<IncomeCalculationResult | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Local receipt state for optimistic updates
  const [localReceipts, setLocalReceipts] = useState<IncomeReceiptResult[]>(
    [],
  );

  // ── Load latest snapshot ───────────────────────────────────────────────
  const loadLatest = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchIncomeLatest(caseId);
    setLoading(false);
    if (!res.success) {
      setError(res.error ?? "Error al cargar el cálculo");
      return;
    }
    if (res.data) {
      setSnapshot(res.data);
      setLocalReceipts(res.data.receiptResults);
    }
  }, [caseId]);

  useEffect(() => {
    loadLatest();
  }, [loadLatest]);

  // ── Client-side averages (optimistic) ──────────────────────────────────
  const localAverages = useMemo(() => {
    const included = localReceipts.filter(
      (r) => r.included && r.grossIncome !== null,
    );
    if (included.length === 0)
      return { gross: 0, net: 0, count: 0 };
    const gross =
      included.reduce((sum, r) => sum + (r.grossIncome ?? 0), 0) /
      included.length;
    const net =
      included.reduce((sum, r) => sum + (r.netIncome ?? 0), 0) /
      included.length;
    return { gross, net, count: included.length };
  }, [localReceipts]);

  // ── Toggle receipt inclusion ───────────────────────────────────────────
  const handleToggleReceipt = async (
    receiptIndex: number,
    newIncluded: boolean,
  ) => {
    // Optimistic update
    setLocalReceipts((prev) =>
      prev.map((r, i) =>
        i === receiptIndex ? { ...r, included: newIncluded } : r,
      ),
    );

    const res = await toggleIncomeReceipt(caseId, receiptIndex, newIncluded);
    if (!res.success || !res.data) {
      setError(res.error ?? "Error al actualizar el recibo");
      // Revert on failure
      if (snapshot) setLocalReceipts(snapshot.receiptResults);
      return;
    }
    // Sync with server response
    setSnapshot(res.data);
    setLocalReceipts(res.data.receiptResults);
  };

  // ── Render states ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <Card>
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-48 rounded bg-gray-200" />
          <div className="grid grid-cols-2 gap-4">
            <div className="h-24 rounded bg-gray-100" />
            <div className="h-24 rounded bg-gray-100" />
          </div>
          <div className="h-40 rounded bg-gray-100" />
        </div>
      </Card>
    );
  }

  if (personType === "PFAE") {
    return (
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gf-text">
            Cálculo de ingreso mensual admisible
          </h3>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <PfaeIncomePanel
          caseId={caseId}
          snapshot={snapshot}
          onSnapshotChange={setSnapshot}
          onSourceSwitched={onSourceSwitched}
          peinadoWarn={peinadoWarn}
        />
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gf-text">
          Cálculo de ingreso mensual admisible
        </h3>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {personType === "PM" && snapshot?.bases?.bank.statementNotice && (
        <div
          className="flex items-start gap-2.5 rounded-lg border px-4 py-3"
          style={{ backgroundColor: "#FFFBEB", borderColor: "#FDE68A" }}
        >
          <span className="mt-px text-sm">⚠</span>
          <p className="text-sm leading-relaxed text-gf-text">
            {snapshot.bases.bank.statementNotice}
          </p>
        </div>
      )}

      {/* ── Empty state: no snapshot yet ─────────────────────────────────── */}
      {!snapshot && !error && (
        <Card className="text-center">
          <p className="text-sm text-gf-text-muted">
            Sin cálculo — ejecuta &quot;Analizar expediente&quot; en la pestaña
            Validaciones para calcular automáticamente los ingresos.
          </p>
        </Card>
      )}

      {snapshot && (
        <>
          {/* ── KPI cards row ──────────────────────────────────────────────── */}
          <KpiCards
            snapshot={snapshot}
            localGross={localAverages.gross}
            localNet={localAverages.net}
            localCount={localAverages.count}
          />

          {/* ── Receipt table ──────────────────────────────────────────────── */}
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gf-border bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gf-text-muted">
                    <th className="px-4 py-3 text-center">Incluir</th>
                    <th className="px-4 py-3">Periodo</th>
                    <th className="px-4 py-3">Fecha de pago</th>
                    <th className="px-4 py-3">Patrón</th>
                    <th className="px-4 py-3">RFC</th>
                    <th className="px-4 py-3 text-right">Ingreso bruto</th>
                    <th className="px-4 py-3 text-right">Ingreso neto</th>
                    <th className="px-4 py-3">Conciliación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gf-border">
                  {localReceipts.map((receipt, idx) => (
                    <tr
                      key={receipt.documentId}
                      className={`transition-colors ${
                        receipt.included
                          ? "bg-gf-surface"
                          : "bg-gray-50 opacity-60"
                      }`}
                    >
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={receipt.included}
                          onChange={(e) =>
                            handleToggleReceipt(idx, e.target.checked)
                          }
                          className="h-4 w-4 cursor-pointer rounded border-gray-300 accent-[#4B5563]"
                          style={{ accentColor: "#4B5563" }}
                        />
                      </td>
                      <td className="px-4 py-3 text-gf-text">
                        {receipt.period ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-gf-text">
                        {formatDate(receipt.paymentDate)}
                      </td>
                      <td className="px-4 py-3 text-gf-text">
                        {receipt.employer ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gf-text-muted">
                        {receipt.employerRfc ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gf-text">
                        {formatMXN(receipt.grossIncome)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gf-text">
                        {formatMXN(receipt.netIncome)}
                      </td>
                      <td className="px-4 py-3">
                        <ConciliationStatusBadge status={receipt.conciliationStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {localReceipts.length === 0 && (
              <div className="p-8 text-center text-sm text-gf-text-muted">
                No se encontraron recibos de nómina para este caso.
              </div>
            )}
          </Card>

        </>
      )}
    </section>
  );
}

// ── KPI Cards (inline) ──────────────────────────────────────────────────────

function KpiCards({
  snapshot,
  localGross,
  localNet,
  localCount,
}: {
  snapshot: IncomeCalculationResult;
  localGross: number;
  localNet: number;
  localCount: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
      {/* Promedio ingreso bruto */}
      <div
        className="flex flex-1 flex-col rounded-lg border border-blue-200 p-4"
        style={{ backgroundColor: "#EFF6FF" }}
      >
        <span className="text-xs font-medium" style={{ color: "#1E40AF" }}>
          Promedio ingreso bruto
        </span>
        <span className="mt-1 text-lg font-bold" style={{ color: "#1E40AF" }}>
          {formatMXN(localGross || snapshot.averageGrossIncome)}
        </span>
        <span className="mt-1 text-xs text-gf-text-muted">
          {localCount || snapshot.includedCount} de{" "}
          {snapshot.receiptCount} recibos incluidos
        </span>
      </div>

      {/* Promedio ingreso neto */}
      <div
        className="flex flex-1 flex-col rounded-lg border border-green-200 p-4"
        style={{ backgroundColor: "#F0FDF4" }}
      >
        <span
          className="text-xs font-medium"
          style={{ color: "#166534" }}
        >
          Promedio ingreso neto
        </span>
        <span
          className="mt-1 text-lg font-bold"
          style={{ color: "#166534" }}
        >
          {formatMXN(localNet || snapshot.averageNetIncome)}
        </span>
        <span className="mt-1 text-xs text-gf-text-muted">
          Calculado sobre recibos incluidos
        </span>
      </div>

    </div>
  );
}
