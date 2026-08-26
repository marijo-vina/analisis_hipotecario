import {
  Landmark,
  Building2,
  Calendar,
  CheckCircle2,
} from "lucide-react";
import type { ParsedBankStatements } from "@/app/lib/extraction";

interface EstadosSummaryBarProps {
  summary: NonNullable<ParsedBankStatements["summary"]>;
}

/**
 * EstadosSummaryBar — Barra de resumen de estados de cuenta según Stitch / design.md.
 */
export default function EstadosSummaryBar({
  summary,
}: EstadosSummaryBarProps) {
  const {
    totalStatements,
    banks,
    periodStart,
    periodEnd,
    totalDeposits,
    statementsWithData,
  } = summary;

  const periodLabel =
    periodStart && periodEnd
      ? `${fmtMonth(periodStart)} — ${fmtMonth(periodEnd)}`
      : periodStart
        ? `Desde ${fmtMonth(periodStart)}`
        : "—";

  return (
    <div className="bg-white border border-gf-border rounded-xl p-5 shadow-2xs flex flex-wrap gap-6 items-center justify-between mb-4">
      <div className="flex flex-wrap items-center gap-6 sm:gap-8">
        {/* Statements count */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-gf-surface-dim text-gf-text-muted">
            <Landmark className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-gf-text-muted uppercase tracking-wider">
              Estados de cuenta
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-bold text-gf-text">
                {statementsWithData}/{totalStatements}
              </span>
              <span className="text-xs font-semibold text-gf-text-muted">
                procesado{statementsWithData !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        </div>

        <div className="hidden sm:block h-8 w-px bg-gf-border" />

        {/* Banks */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-gf-surface-dim text-gf-text-muted">
            <Building2 className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-gf-text-muted uppercase tracking-wider">
              Bancos
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-bold text-gf-text">
                {banks.length}
              </span>
              <span className="text-xs font-semibold text-gf-text-muted">
                detectado{banks.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        </div>

        <div className="hidden sm:block h-8 w-px bg-gf-border" />

        {/* Period */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-gf-surface-dim text-gf-text-muted">
            <Calendar className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-gf-text-muted uppercase tracking-wider">
              Periodo
            </span>
            <span className="text-sm font-bold text-gf-text">
              {periodLabel}
            </span>
          </div>
        </div>

        <div className="hidden sm:block h-8 w-px bg-gf-border" />

        {/* Payroll deposits or PFAE Valid Income */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-gf-text-muted uppercase tracking-wider">
              {summary.isPfae ? "Ingreso válido total depurado" : "Depósitos nómina"}
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-bold text-emerald-700">
                {summary.isPfae && summary.totalValidIncome != null
                  ? `$${Math.round(summary.totalValidIncome).toLocaleString("es-MX")}`
                  : totalDeposits}
              </span>
              <span className="text-xs font-semibold text-emerald-700">
                {summary.isPfae
                  ? `(${totalDeposits} válido${totalDeposits !== 1 ? "s" : ""})`
                  : `detectado${totalDeposits !== 1 ? "s" : ""}`}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Converts "2026-01-15" → "Ene 2026" */
function fmtMonth(iso: string): string {
  const months = [
    "Ene", "Feb", "Mar", "Abr", "May", "Jun",
    "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
  ];
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const monthIdx = parseInt(m[2], 10) - 1;
  return `${months[monthIdx] ?? m[2]} ${m[1]}`;
}
