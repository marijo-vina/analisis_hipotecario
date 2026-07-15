import { useState } from "react";
import type { Document } from "@/app/lib/definitions";
import type { ParsedBankStatementDeposit } from "@/app/lib/extraction";
import { parsePayroll, formatDateDisplay } from "@/app/lib/extraction";
import {
  reconcilePreview,
  STATUS_LABELS,
  METHOD_LABELS,
  type PreviewReceiptResult,
  type PreviewStatus,
} from "@/app/lib/bankarization-preview";
import Card from "@/app/ui/common/card";

interface EstadosConciliacionProps {
  allDeposits: ParsedBankStatementDeposit[];
  payrollDocs: Document[];
}

const TOLERANCE_PCT = 5;

/**
 * HU-10 — Conciliación por recibo de nómina vs depósitos bancarios.
 *
 * La conciliación se ejecuta bajo demanda (botón "Reconciliar") porque los
 * documentos se procesan de uno en uno y la asesora puede agregar más después.
 * Una vez ejecutada, el botón cambia a "Re-ejecutar conciliación".
 */
export default function EstadosConciliacion({
  allDeposits,
  payrollDocs,
}: EstadosConciliacionProps) {
  const payrollParsed = parsePayroll(payrollDocs);
  const payrollReceipts = payrollParsed.receipts.filter((r) => r.hasData);

  const [results, setResults] = useState<PreviewReceiptResult[] | null>(null);
  const [hasRun, setHasRun] = useState(false);

  const runReconciliation = () => {
    setResults(reconcilePreview(payrollReceipts, allDeposits));
    setHasRun(true);
  };

  if (allDeposits.length === 0 && payrollReceipts.length === 0) {
    return null;
  }

  const totalNetIncome = payrollReceipts.reduce(
    (sum, r) => sum + (r.ingresoNeto ?? 0),
    0,
  );

  return (
    <div className="space-y-4">
      {/* ── Trigger button ──────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={runReconciliation}
        disabled={allDeposits.length === 0 || payrollReceipts.length === 0}
        className="inline-flex items-center gap-2 rounded-lg bg-gf-red px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gf-red-dark disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        {hasRun ? "Re-ejecutar conciliación" : "Reconciliar nómina vs banco"}
      </button>

      {!results && (
        <p className="text-sm text-gf-text-muted py-2">
          Presiona &quot;Reconciliar&quot; para comparar los recibos de nómina contra los depósitos bancarios.
        </p>
      )}

      {results && (
        <>
          {/* ── Summary bar ──────────────────────────────────────────── */}
          <Card className="flex flex-wrap items-center justify-between gap-6 px-5 py-4">
            <Stat label="Recibos" value={`${payrollReceipts.length} procesados`} />
            <Divider />
            <Stat
              label="Conciliados"
              value={`${results.filter((r) => r.status === "MATCHED" || r.status === "PROVIDER_MIRROR_CONFIRMED").length} de ${payrollReceipts.length}`}
            />
            <Divider />
            <Stat label="Depósitos" value={`${allDeposits.length} detectados`} />
            <Divider />
            <Stat label="Ingreso neto" value={fmtCurrency(totalNetIncome)} />
          </Card>

          {/* ── Receipt cards ────────────────────────────────────────── */}
          <Card className="space-y-4 px-5 py-5">
            <h4 className="text-[13px] font-semibold text-gf-text">
              Conciliación por recibo
            </h4>
            <div className="space-y-3">
              {results.map((r) => (
                <ReceiptRow key={`${r.receiptOriginalName}-${r.receiptIndex}`} r={r} />
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

// ── Receipt row ──────────────────────────────────────────────────────────────

function ReceiptRow({ r }: { r: PreviewReceiptResult }) {
  return (
    <div className="rounded-lg border border-gf-border bg-gf-bg px-4 py-3 space-y-3">
      {/* Header: filename + status badge + period */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-gf-text truncate max-w-[300px]">
          {r.receiptOriginalName}
        </span>
        <StatusBadge status={r.status} />
        {r.period && (
          <span className="text-[11px] text-gf-text-soft">{r.period}</span>
        )}
      </div>

      {/* Method badge + flags */}
      <div className="flex flex-wrap items-center gap-2">
        <MethodBadge method={r.method} />
        {r.scotiabankExcluded && (
          <span className="inline-flex items-center rounded-full bg-orange-50 px-2.5 py-0.5 text-[11px] font-semibold text-orange-600">
            Excluido Scotiabank
          </span>
        )}
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <FieldCell label="RECIBO">
          {r.netIncome != null ? fmtCurrency(r.netIncome) : "—"}
        </FieldCell>
        <FieldCell label="DEPÓSITO">
          {r.candidate?.amount != null
            ? fmtCurrency(r.candidate.amount)
            : "Sin candidato"}
        </FieldCell>
        <FieldCell label="DIF. MONTO">
          <span
            className={
              r.amountDiffPct != null && r.amountDiffPct > TOLERANCE_PCT
                ? "text-amber-600"
                : ""
            }
          >
            {r.amountDiffPct != null ? `${r.amountDiffPct.toFixed(1)}%` : "—"}
          </span>
        </FieldCell>
        <FieldCell label="SCORE">
          {r.score != null ? r.score.toFixed(1) : "—"}
        </FieldCell>
      </div>

      {/* Used payment date */}
      <div className="text-[11px] text-gf-text-soft">
        📅 Fecha de pago usada:{" "}
        <span className="text-gf-text-muted">
          {r.usedPaymentDate
            ? formatDateDisplay(r.usedPaymentDate)
            : "Sin fecha"}
        </span>
        {r.paymentDateSource && (
          <span
            className={`ml-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${
              r.paymentDateEstimated
                ? "bg-amber-50 text-amber-700"
                : "bg-green-50 text-green-700"
            }`}
          >
            {r.paymentDateSource === "EXPLICIT"
              ? "Explícita"
              : r.paymentDateSource === "PERIOD_END"
                ? "Cierre periodo"
                : r.paymentDateSource === "INFERRED_QUINCENA"
                  ? "Inferida"
                  : r.paymentDateSource === "MANUAL_OVERRIDE"
                    ? "Manual"
                    : r.paymentDateSource}
            {r.paymentDateEstimated && " ⚠️"}
          </span>
        )}
      </div>

      {/* Candidate deposit details */}
      {r.candidate && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[11px] text-gf-text-soft">
          <span>
            Fecha depósito:{" "}
            <span className="font-medium text-gf-text-muted">
              {r.candidate.date ?? "—"}
            </span>
          </span>
          <span>
            RFC pagador:{" "}
            <span className="font-medium text-gf-text-muted">
              {r.candidate.employerRfc ?? "No detectado"}
            </span>
          </span>
          <span className="truncate max-w-[300px]">
            Concepto:{" "}
            <span className="font-medium text-gf-text-muted">
              {r.candidate.concept ?? "—"}
            </span>
          </span>
        </div>
      )}

      {/* Alerts */}
      {r.alerts.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {r.alerts.map((a, i) => (
            <span
              key={`${a.code}-${i}`}
              className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-gf-text-muted"
            >
              {a.message}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<PreviewStatus, string> = {
  MATCHED: "bg-green-100 text-green-700",
  PROVIDER_MIRROR_CONFIRMED: "bg-green-100 text-green-700",
  DISCREPANCY: "bg-amber-100 text-amber-700",
  AMBIGUOUS: "bg-amber-100 text-amber-700",
  MANUAL_REVIEW: "bg-amber-100 text-amber-700",
  PROVIDER_CANDIDATE: "bg-blue-100 text-blue-700",
  NOT_MATCHED: "bg-gray-200 text-gray-700",
  RFC_INCOMPATIBLE: "bg-red-100 text-red-700",
};

function StatusBadge({ status }: { status: PreviewStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function MethodBadge({ method }: { method: PreviewReceiptResult["method"] }) {
  if (method === "NONE") return null;
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-gf-text-muted">
      {METHOD_LABELS[method]}
    </span>
  );
}

// ── Shared helpers (same pattern as estados-statement-card) ──────────────────

function FieldCell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-gf-text-soft">{label}</span>
      <span className="text-[13px] font-semibold text-gf-text">{children}</span>
    </div>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-medium text-gf-text-soft uppercase tracking-wide">
        {label}
      </span>
      <span className="text-lg font-bold text-gf-text">{value}</span>
    </div>
  );
}

function Divider() {
  return <div className="h-10 w-px bg-gf-border" />;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(amount: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(amount);
}
