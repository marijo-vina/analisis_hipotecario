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
 * HU-10 — Conciliación por recibo de nómina vs depósitos.
 *
 * Reemplaza los totales agregados por una vista individual: cada recibo se
 * reconcilia contra el mejor depósito mediante matching determinista
 * (RFC-first, fallback 3 reglas + score, bidireccional 1:1, detección de
 * pagadoras y regla Scotiabank). Muestra estado, método, candidato vinculado
 * y alertas por recibo.
 *
 * Esta comparación es PRELIMINAR e informativa; la validación auditable y
 * definitiva es la regla `bankarization-validation` del backend.
 */
export default function EstadosConciliacion({
  allDeposits,
  payrollDocs,
}: EstadosConciliacionProps) {
  const payrollParsed = parsePayroll(payrollDocs);
  const payrollReceipts = payrollParsed.receipts.filter((r) => r.hasData);

  if (allDeposits.length === 0 && payrollReceipts.length === 0) {
    return null;
  }

  const results = reconcilePreview(payrollReceipts, allDeposits);

  // ── Resumen agregado (informativo) ─────────────────────────────────────
  const totalNetIncome = payrollReceipts.reduce(
    (sum, r) => sum + (r.ingresoNeto ?? 0),
    0,
  );
  const conciledCount = results.filter(
    (r) => r.status === "MATCHED" || r.status === "PROVIDER_MIRROR_CONFIRMED",
  ).length;

  return (
    <Card className="space-y-5 p-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="h-3.5 w-3.5 rounded-full bg-blue-400" />
        <span className="text-base font-semibold text-gf-text">
          Conciliación nómina vs depósitos
        </span>
      </div>

      {/* ── Tarjetas de resumen ────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl bg-gf-bg p-4">
          <span className="text-[11px] font-medium text-gf-text-muted">
            RECIBOS PROCESADOS
          </span>
          <p className="mt-1 text-2xl font-bold text-gf-text">
            {payrollReceipts.length}
          </p>
          <span className="text-xs text-gf-text-muted">
            {conciledCount} conciliado(s)
          </span>
        </div>

        <div className="rounded-xl bg-gf-bg p-4">
          <span className="text-[11px] font-medium text-gf-text-muted">
            DEPÓSITOS DETECTADOS
          </span>
          <p className="mt-1 text-2xl font-bold text-gf-text">
            {allDeposits.length}
          </p>
          <span className="text-xs text-gf-text-muted">
            {allDeposits.length} depósitos de nómina
          </span>
        </div>

        <div className="rounded-xl bg-gf-bg p-4">
          <span className="text-[11px] font-medium text-gf-text-muted">
            INGRESO NETO (RECIBOS)
          </span>
          <p className="mt-1 text-2xl font-bold text-gf-text">
            {fmtCurrency(totalNetIncome)}
          </p>
          <span className="text-xs text-gf-text-muted">
            tolerancia {TOLERANCE_PCT}%
          </span>
        </div>
      </div>

      {/* ── Vista por recibo ───────────────────────────────────────────── */}
      <hr className="border-gf-border" />

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gf-text">
            Conciliación por recibo
          </span>
        </div>

        {results.length === 0 ? (
          <p className="text-sm text-gf-text-muted py-2">
            No hay recibos procesados para conciliar.
          </p>
        ) : (
          <div className="space-y-2">
            {results.map((r) => (
              <ReceiptRow key={`${r.receiptOriginalName}-${r.receiptIndex}`} r={r} />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Fila por recibo ──────────────────────────────────────────────────────────

function ReceiptRow({ r }: { r: PreviewReceiptResult }) {
  return (
    <div className="rounded-lg border border-gf-border bg-white px-4 py-3 space-y-2.5">
      {/* Encabezado de la fila */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold text-gf-text truncate max-w-[280px]">
          {r.receiptOriginalName}
        </span>
        {r.period && (
          <span className="text-[11px] text-gf-text-soft">{r.period}</span>
        )}
      </div>

      {/* Badges de estado, método y banderas */}
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={r.status} />
        <MethodBadge method={r.method} />
        {r.scotiabankExcluded && (
          <span className="inline-flex items-center rounded-md bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-700">
            Excluido Scotiabank
          </span>
        )}
      </div>

      {/* Detalle del candidato + métricas */}
      <div className="grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4">
        <Metric
          label="RECIBO"
          value={r.netIncome != null ? fmtCurrency(r.netIncome) : "—"}
        />
        <Metric
          label="DEPÓSITO"
          value={
            r.candidate?.amount != null
              ? fmtCurrency(r.candidate.amount)
              : "Sin candidato"
          }
        />
        <Metric
          label="DIF. MONTO"
          value={
            r.amountDiffPct != null
              ? `${r.amountDiffPct.toFixed(1)}%`
              : "—"
          }
          tone={
            r.amountDiffPct != null && r.amountDiffPct > TOLERANCE_PCT
              ? "warn"
              : undefined
          }
        />
        <Metric
          label="SCORE"
          value={r.score != null ? r.score.toFixed(1) : "—"}
        />
      </div>

      {/* Fecha usada con trazabilidad */}
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
                  ? "Inferida (quincena)"
                  : r.paymentDateSource === "MANUAL_OVERRIDE"
                    ? "Manual"
                    : r.paymentDateSource}
            {r.paymentDateEstimated && " ⚠️"}
          </span>
        )}
      </div>

      {/* Datos del depósito vinculado */}
      {r.candidate && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gf-text-soft">
          <span>
            Fecha:{" "}
            <span className="text-gf-text-muted">
              {r.candidate.date ?? "—"}
            </span>
          </span>
          <span>
            Pagador RFC:{" "}
            <span className="text-gf-text-muted">
              {r.candidate.employerRfc ?? "No detectado"}
            </span>
          </span>
          <span className="truncate max-w-[260px]">
            Concepto:{" "}
            <span className="text-gf-text-muted">
              {r.candidate.concept ?? "—"}
            </span>
          </span>
        </div>
      )}

      {/* Alertas por recibo */}
      {r.alerts.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {r.alerts.map((a, i) => (
            <span
              key={`${a.code}-${i}`}
              className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gf-text-muted"
            >
              {a.code}: {a.message}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Componentes auxiliares ───────────────────────────────────────────────────

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
      className={`inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function MethodBadge({ method }: { method: PreviewReceiptResult["method"] }) {
  if (method === "NONE") return null;
  return (
    <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-[11px] font-medium text-gf-text-muted">
      Método: {METHOD_LABELS[method]}
    </span>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warn";
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-medium text-gf-text-soft">{label}</span>
      <span
        className={`text-[13px] font-semibold ${
          tone === "warn" ? "text-amber-600" : "text-gf-text"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(amount: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(amount);
}