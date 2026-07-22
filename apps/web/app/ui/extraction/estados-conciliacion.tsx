import { useState, useEffect, useCallback } from "react";
import type { Document } from "@/app/lib/definitions";
import type { ParsedBankStatementDeposit } from "@/app/lib/extraction";
import { parsePayroll, formatDateDisplay } from "@/app/lib/extraction";
import {
  reconcilePreview,
  STATUS_LABELS,
  type PreviewReceiptResult,
  type PreviewStatus,
} from "@/app/lib/bankarization-preview";
import { saveConciliation } from "@/app/actions/conciliation";
import Card from "@/app/ui/common/card";

interface EstadosConciliacionProps {
  caseId: string;
  allDeposits: ParsedBankStatementDeposit[];
  payrollDocs: Document[];
}

const TOLERANCE_PCT = 5;

/**
 * HU-10 — Conciliación por recibo de nómina vs depósitos bancarios.
 *
 * La conciliación se ejecuta automáticamente al cargar los datos
 * (integrada en el flujo unificado de análisis — HU-14A).
 * Los resultados se persisten y se restauran en montajes posteriores.
 */
export default function EstadosConciliacion({
  caseId,
  allDeposits,
  payrollDocs,
}: EstadosConciliacionProps) {
  const payrollParsed = parsePayroll(payrollDocs);
  const payrollReceipts = payrollParsed.receipts.filter((r) => r.hasData);

  const [results, setResults] = useState<PreviewReceiptResult[] | null>(null);
  const [hasRun, setHasRun] = useState(false);

  // Track whether we've already restored from persistence
  const [restored, setRestored] = useState(false);
  // Track whether we've already attempted auto-run
  const [autoRan, setAutoRan] = useState(false);

  // Restore persisted conciliation once deposits are available
  useEffect(() => {
    if (restored) return;
    if (allDeposits.length === 0 && payrollReceipts.length === 0) return;

    const persisted: PreviewReceiptResult[] = [];
    let hasAny = false;

    for (const doc of payrollDocs) {
      const proc = (doc as unknown as Record<string, unknown>).processingResults as
        | Record<string, unknown>
        | undefined;
      const conc = proc?.conciliation as Record<string, unknown> | undefined;
      if (conc?.status) {
        hasAny = true;
      }
    }

    if (hasAny && allDeposits.length > 0) {
      const reconciled = reconcilePreview(payrollReceipts, allDeposits);
      for (const r of reconciled) {
        const doc = payrollDocs[r.receiptIndex];
        if (doc) {
          const proc = (doc as unknown as Record<string, unknown>).processingResults as
            | Record<string, unknown>
            | undefined;
          const conc = proc?.conciliation as Record<string, unknown> | undefined;
          if (conc?.status) {
            r.status = conc.status as PreviewStatus;
            if (conc.method) {
              r.method = conc.method as PreviewReceiptResult["method"];
            }
          }
        }
        persisted.push(r);
      }
      setResults(persisted);
      setHasRun(true);
    }

    // Mark as attempted so we don't loop on re-renders.
    // Only re-trigger if the data actually changes (length guard).
    setRestored(true);
  }, [payrollDocs.length, allDeposits.length]);

  const runReconciliation = useCallback(async () => {
    const newResults = reconcilePreview(payrollReceipts, allDeposits);
    setResults(newResults);
    setHasRun(true);

    // Persist results
    const items = newResults
      .map((r, i) => {
        const doc = payrollDocs[i];
        if (!doc) return null;
        return {
          documentId: doc.id,
          status: r.status,
          method: r.method !== "NONE" ? r.method : undefined,
        };
      })
      .filter(Boolean) as Array<{
      documentId: string;
      status: string;
      method?: string;
    }>;

    if (items.length > 0) {
      await saveConciliation(caseId, items);
    }
  }, [payrollReceipts, allDeposits, caseId, payrollDocs]);

  // Auto-run conciliation on mount when data is available and no persisted results exist
  useEffect(() => {
    if (autoRan) return;
    if (!restored) return;
    if (allDeposits.length === 0 || payrollReceipts.length === 0) return;
    if (results !== null) return; // Already have results from restore

    setAutoRan(true);
    runReconciliation();
  }, [restored, allDeposits.length, payrollReceipts.length, results, autoRan, runReconciliation]);

  if (allDeposits.length === 0 && payrollReceipts.length === 0) {
    return null;
  }

  const totalNetIncome = payrollReceipts.reduce(
    (sum, r) => sum + (r.ingresoNeto ?? 0),
    0,
  );

  return (
    <div className="space-y-4">
      {!results && (
        <p className="text-sm text-gf-text-muted py-2 animate-pulse">
          Conciliando nómina vs banco...
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
          <div className="space-y-4">
            {results.map((r) => {
              return (
                <ReceiptCard
                  key={`${r.receiptOriginalName}-${r.receiptIndex}`}
                  r={r}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Receipt card ─────────────────────────────────────────────────────────────

function ReceiptCard({
  r,
}: {
  r: PreviewReceiptResult;
}) {
  const [expanded, setExpanded] = useState(() => {
    // Expanded by default if matched or has result; collapsed if NOT_MATCHED
    return r.status !== "NOT_MATCHED";
  });

  const ruleInfo = getRuleInfo(r.status);
  const hasCriteria = r.status !== "NOT_MATCHED" && r.candidate;

  return (
    <div className="rounded-xl border border-gf-border bg-white p-5 space-y-3.5">
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

      {/* Rule bar */}
      <div
        className={`rounded-lg border p-3 flex flex-wrap items-center gap-2 ${ruleInfo.containerClass}`}
      >
        <span className="text-sm">{ruleInfo.icon}</span>
        <span className="text-[13px] font-semibold">{ruleInfo.message}</span>
        {hasCriteria && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="ml-1 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label={expanded ? "Colapsar" : "Expandir"}
          >
            {expanded ? "▲" : "▼"}
          </button>
        )}
      </div>

      {/* Scotiabank exclusion */}
      {r.scotiabankExcluded && (
        <span className="inline-flex items-center rounded-full bg-orange-50 px-2.5 py-0.5 text-[11px] font-semibold text-orange-600">
          Excluido Scotiabank
        </span>
      )}

      {/* Collapsible criteria breakdown */}
      {hasCriteria && expanded && (
        <CriteriaBreakdown r={r} />
      )}
    </div>
  );
}

// ── Criteria breakdown table ─────────────────────────────────────────────────

function CriteriaBreakdown({ r }: { r: PreviewReceiptResult }) {
  if (!r.candidate) return null;

  const amountMatch = r.amountDiffPct != null && r.amountDiffPct <= TOLERANCE_PCT;
  const dateDiff = r.usedPaymentDate && r.candidate.date
    ? Math.abs(Math.round((new Date(r.candidate.date).getTime() - new Date(r.usedPaymentDate).getTime()) / 86400000))
    : null;
  const dateMatch = dateDiff != null && dateDiff <= 3;

  return (
    <div className="overflow-hidden rounded-lg border border-gf-border">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-gray-50 text-left text-[11px] font-medium uppercase tracking-wider text-gf-text-muted">
            <th className="px-3 py-2">Criterio</th>
            <th className="px-3 py-2">Recibo</th>
            <th className="px-3 py-2">Depósito</th>
            <th className="px-3 py-2">Resultado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gf-border">
          <tr>
            <td className="px-3 py-2 font-medium text-gf-text">Monto</td>
            <td className="px-3 py-2 text-gf-text-muted">{r.netIncome != null ? fmtCurrency(r.netIncome) : "—"}</td>
            <td className="px-3 py-2 text-gf-text-muted">{r.candidate.amount != null ? fmtCurrency(r.candidate.amount) : "—"}</td>
            <td className="px-3 py-2">
              {r.amountDiffPct != null ? (
                <span className={amountMatch ? "text-green-600" : "text-amber-600"}>
                  {amountMatch ? "✓" : "⚠"} {amountMatch ? "Coincide" : "Difiere"}, diferencia {r.amountDiffPct.toFixed(1)}%
                </span>
              ) : (
                <span className="text-gray-400">—</span>
              )}
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 font-medium text-gf-text">Fecha</td>
            <td className="px-3 py-2 text-gf-text-muted">{r.usedPaymentDate ? formatDateDisplay(r.usedPaymentDate) : "—"}</td>
            <td className="px-3 py-2 text-gf-text-muted">{r.candidate.date ? formatDateDisplay(r.candidate.date) : "—"}</td>
            <td className="px-3 py-2">
              {dateDiff != null ? (
                <span className={dateMatch ? "text-green-600" : "text-amber-600"}>
                  {dateMatch ? "✓" : "⚠"} {dateMatch ? `Dentro de ±${3} días` : `${dateDiff} días de diferencia`}
                </span>
              ) : (
                <span className="text-gray-400">—</span>
              )}
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 font-medium text-gf-text">RFC</td>
            <td className="px-3 py-2 font-mono text-[11px] text-gf-text-muted">{r.candidate.employerRfc ?? "—"}</td>
            <td className="px-3 py-2 font-mono text-[11px] text-gf-text-muted">{r.candidate.employerRfc ?? "—"}</td>
            <td className="px-3 py-2">
              {r.candidate.employerRfc ? (
                <span className="text-green-600">✓ Coincide</span>
              ) : (
                <span className="text-gray-400">⚠ No evaluado</span>
              )}
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 font-medium text-gf-text">Concepto</td>
            <td className="px-3 py-2 text-gray-400">—</td>
            <td className="px-3 py-2 text-gf-text-muted truncate max-w-[150px]">{r.candidate.concept ?? "—"}</td>
            <td className="px-3 py-2">
              {r.conceptKeyword ? (
                <span className="text-green-600">✓ Contiene <span className="font-semibold">&ldquo;{r.conceptKeyword}&rdquo;</span></span>
              ) : r.method === "FALLBACK" ? (
                <span className="text-green-600">✓ Concepto compatible</span>
              ) : (
                <span className="text-gray-400">—</span>
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ── Rule info helper ─────────────────────────────────────────────────────────

function getRuleInfo(status: PreviewStatus): {
  icon: string;
  message: string;
  containerClass: string;
} {
  switch (status) {
    case "MATCHED":
    case "PROVIDER_MIRROR_CONFIRMED":
      return {
        icon: "✓",
        message: "3 de 3 reglas obligatorias cumplidas",
        containerClass: "bg-green-50 border-green-200 text-green-800",
      };
    case "NOT_MATCHED":
      return {
        icon: "✗",
        message: "0 de 3 reglas obligatorias cumplidas",
        containerClass: "bg-red-50 border-red-200 text-red-800",
      };
    case "DISCREPANCY":
      return {
        icon: "⚠",
        message: "Coincidencia parcial (difiere en monto)",
        containerClass: "bg-amber-50 border-amber-200 text-amber-800",
      };
    case "RFC_INCOMPATIBLE":
      return {
        icon: "⚠",
        message: "RFC incompatible — requiere revisión",
        containerClass: "bg-amber-50 border-amber-200 text-amber-800",
      };
    case "AMBIGUOUS":
      return {
        icon: "⚠",
        message: "Múltiples candidatos — ambiguo",
        containerClass: "bg-amber-50 border-amber-200 text-amber-800",
      };
    case "PROVIDER_CANDIDATE":
      return {
        icon: "ℹ",
        message: "Pagadora detectada — candidata pendiente",
        containerClass: "bg-blue-50 border-blue-200 text-blue-800",
      };
    case "MANUAL_REVIEW":
      return {
        icon: "⚠",
        message: "Requiere revisión manual",
        containerClass: "bg-amber-50 border-amber-200 text-amber-800",
      };
    default:
      return {
        icon: "—",
        message: "Estado desconocido",
        containerClass: "bg-gray-50 border-gray-200 text-gray-800",
      };
  }
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

// ── Shared helpers ───────────────────────────────────────────────────────────

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
