"use client";

import { useState, useEffect, useCallback, useMemo } from "react";

import {
  fetchIncomeLatest,
  calculateIncome,
  toggleIncomeReceipt,
  confirmIncome,
  type IncomeCalculationResult,
  type IncomeReceiptResult,
} from "@/app/actions/income";

import Card from "@/app/ui/common/card";
import Button from "@/app/ui/common/button";

// ── Props ────────────────────────────────────────────────────────────────────

interface IncomeCalculationSectionProps {
  caseId: string;
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

// ── Status helpers ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const isConfirmed = status === "CONFIRMED";
  const label = isConfirmed ? "CONFIRMADO" : "CALCULADO";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        isConfirmed
          ? "bg-green-100 text-green-800"
          : "bg-blue-100 text-blue-800"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          isConfirmed ? "bg-green-600" : "bg-blue-600"
        }`}
      />
      {label}
    </span>
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
}: IncomeCalculationSectionProps) {
  const [snapshot, setSnapshot] = useState<IncomeCalculationResult | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);

  // Local receipt state for optimistic updates
  const [localReceipts, setLocalReceipts] = useState<IncomeReceiptResult[]>(
    [],
  );

  // Confirmation form state
  const [confirmGross, setConfirmGross] = useState("");
  const [confirmNet, setConfirmNet] = useState("");
  const [observations, setObservations] = useState("");
  const [confirming, setConfirming] = useState(false);

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
      setConfirmGross(res.data.averageGrossIncome.toFixed(2));
      setConfirmNet(res.data.averageNetIncome.toFixed(2));
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

  // ── Calculate ──────────────────────────────────────────────────────────
  const handleCalculate = async () => {
    setCalculating(true);
    setError(null);
    const res = await calculateIncome(caseId);
    setCalculating(false);
    if (!res.success || !res.data) {
      setError(res.error ?? "Error al calcular ingresos");
      return;
    }
    setSnapshot(res.data);
    setLocalReceipts(res.data.receiptResults);
    setConfirmGross(res.data.averageGrossIncome.toFixed(2));
    setConfirmNet(res.data.averageNetIncome.toFixed(2));
  };

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
    setConfirmGross(res.data.averageGrossIncome.toFixed(2));
    setConfirmNet(res.data.averageNetIncome.toFixed(2));
  };

  // ── Confirm income ─────────────────────────────────────────────────────
  const handleConfirm = async () => {
    const gross = parseFloat(confirmGross);
    const net = parseFloat(confirmNet);
    if (isNaN(gross) || isNaN(net)) {
      setError("Ingresa valores numéricos válidos para la confirmación");
      return;
    }

    setConfirming(true);
    setError(null);
    const res = await confirmIncome(caseId, gross, net, observations);
    setConfirming(false);
    if (!res.success || !res.data) {
      setError(res.error ?? "Error al confirmar el cálculo");
      return;
    }
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

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gf-text">
          Cálculo de ingreso mensual admisible
        </h3>
        {snapshot && <StatusBadge status={snapshot.status} />}
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Empty state: no snapshot yet ─────────────────────────────────── */}
      {!snapshot && !error && (
        <Card className="text-center">
          <p className="text-sm text-gf-text-muted">
            Sin cálculo — ejecuta el motor de ingresos para ver el desglose de
            recibos de nómina.
          </p>
          <div className="mt-4">
            <Button
              variant="primary"
              onClick={handleCalculate}
              loading={calculating}
            >
              {calculating ? "Calculando..." : "Calcular ingresos"}
            </Button>
          </div>
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
                      <td className="px-4 py-3 text-gf-text-muted">
                        {receipt.conciliationStatus ?? "—"}
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

          {/* ── Confirmation panel ─────────────────────────────────────────── */}
          {snapshot.status !== "CONFIRMED" && (
            <Card>
              <h4 className="mb-3 text-sm font-semibold text-gf-text">
                Confirmar ingresos
              </h4>
              <p className="mb-4 text-xs text-gf-text-muted">
                Ajusta los valores calculados si es necesario y confirma los
                ingresos admisibles del solicitante.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gf-text-muted">
                    Ingreso bruto mensual confirmado
                  </label>
                  <CurrencyInput
                    value={confirmGross}
                    onChange={setConfirmGross}
                    placeholder="0.00"
                    className="w-full rounded-md border border-gf-border bg-gf-surface px-3 py-2 text-sm text-gf-text focus:border-gf-red focus:outline-none focus:ring-1 focus:ring-gf-red"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gf-text-muted">
                    Ingreso neto mensual confirmado
                  </label>
                  <CurrencyInput
                    value={confirmNet}
                    onChange={setConfirmNet}
                    placeholder="0.00"
                    className="w-full rounded-md border border-gf-border bg-gf-surface px-3 py-2 text-sm text-gf-text focus:border-gf-red focus:outline-none focus:ring-1 focus:ring-gf-red"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gf-text-muted">
                    Observaciones
                  </label>
                  <textarea
                    value={observations}
                    onChange={(e) => setObservations(e.target.value)}
                    rows={2}
                    placeholder="Opcional"
                    className="w-full rounded-md border border-gf-border bg-gf-surface px-3 py-2 text-sm text-gf-text focus:border-gf-red focus:outline-none focus:ring-1 focus:ring-gf-red"
                  />
                </div>
              </div>
              <div className="mt-4">
                <Button
                  variant="primary"
                  onClick={handleConfirm}
                  loading={confirming}
                >
                  {confirming ? "Confirmando..." : "Confirmar ingresos"}
                </Button>
              </div>
            </Card>
          )}

          {/* ── Confirmed info ─────────────────────────────────────────────── */}
          {snapshot.status === "CONFIRMED" && (
            <Card>
              <div className="flex items-center gap-2 text-sm text-green-700">
                <span className="font-semibold">✓ Ingresos confirmados</span>
                <span className="text-gf-text-muted">
                  el {formatDate(snapshot.confirmedAt)}
                </span>
              </div>
              {snapshot.observations && (
                <p className="mt-2 text-xs text-gf-text-muted">
                  Observaciones: {snapshot.observations}
                </p>
              )}
            </Card>
          )}
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
  const isConfirmed = snapshot.status === "CONFIRMED";

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
        className={`flex flex-1 flex-col rounded-lg border p-4 ${
          isConfirmed
            ? "border-violet-200"
            : "border-green-200"
        }`}
        style={{
          backgroundColor: isConfirmed ? "#F5F3FF" : "#F0FDF4",
        }}
      >
        <span
          className="text-xs font-medium"
          style={{ color: isConfirmed ? "#6D28D9" : "#166534" }}
        >
          Promedio ingreso neto
        </span>
        <span
          className="mt-1 text-lg font-bold"
          style={{ color: isConfirmed ? "#6D28D9" : "#166534" }}
        >
          {formatMXN(localNet || snapshot.averageNetIncome)}
        </span>
        <span className="mt-1 text-xs text-gf-text-muted">
          Calculado sobre recibos incluidos
        </span>
      </div>

      {/* Confirmed gross (if confirmed) */}
      {isConfirmed && (
        <div
          className="flex flex-1 flex-col rounded-lg border border-emerald-200 p-4"
          style={{ backgroundColor: "#ECFDF5" }}
        >
          <span
            className="text-xs font-medium"
            style={{ color: "#065F46" }}
          >
            Bruto confirmado
          </span>
          <span
            className="mt-1 text-lg font-bold"
            style={{ color: "#065F46" }}
          >
            {formatMXN(snapshot.confirmedGrossIncome)}
          </span>
          <span className="mt-1 text-xs text-gf-text-muted">
            Valor verificado por analista
          </span>
        </div>
      )}

      {/* Confirmed net (if confirmed) */}
      {isConfirmed && (
        <div
          className="flex flex-1 flex-col rounded-lg border border-emerald-200 p-4"
          style={{ backgroundColor: "#ECFDF5" }}
        >
          <span
            className="text-xs font-medium"
            style={{ color: "#065F46" }}
          >
            Neto confirmado
          </span>
          <span
            className="mt-1 text-lg font-bold"
            style={{ color: "#065F46" }}
          >
            {formatMXN(snapshot.confirmedNetIncome)}
          </span>
          <span className="mt-1 text-xs text-gf-text-muted">
            Valor verificado por analista
          </span>
        </div>
      )}

      {/* Estado (if not confirmed — takes the slot) */}
      {!isConfirmed && (
        <div
          className="flex flex-1 flex-col rounded-lg border border-amber-200 p-4"
          style={{ backgroundColor: "#FFFBEB" }}
        >
          <span className="text-xs font-medium" style={{ color: "#92400E" }}>
            Estado
          </span>
          <span className="mt-1">
            <StatusBadge status={snapshot.status} />
          </span>
          <span className="mt-1 text-xs text-gf-text-muted">
            Pendiente de confirmación
          </span>
        </div>
      )}
    </div>
  );
}
