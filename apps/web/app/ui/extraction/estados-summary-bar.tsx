import type { ParsedBankStatements } from "@/app/lib/extraction";
import Card from "@/app/ui/common/card";

interface EstadosSummaryBarProps {
  summary: NonNullable<ParsedBankStatements["summary"]>;
}

/**
 * Compact summary bar showing statement counts, banks, period,
 * payroll deposits detected, and alert counts.
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
    totalCriticalAlerts,
    totalWarningAlerts,
  } = summary;

  const periodLabel =
    periodStart && periodEnd
      ? `${fmtMonth(periodStart)} — ${fmtMonth(periodEnd)}`
      : periodStart
        ? `Desde ${fmtMonth(periodStart)}`
        : "—";

  return (
    <Card className="flex flex-wrap items-center gap-6 px-5 py-4">
      {/* Statements count */}
      <StatItem label="Estados de cuenta" value={`${totalStatements} procesados`} />

      <Divider />

      {/* Banks */}
      <StatItem label="Bancos" value={`${banks.length} detectados`} />

      <Divider />

      {/* Period */}
      <StatItem label="Periodo" value={periodLabel} />

      <Divider />

      {/* Payroll deposits */}
      <StatItem
        label="Depósitos nómina"
        value={`${totalDeposits} detectados`}
        valueClass="text-green-600"
      />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Alert chips */}
      <div className="flex items-center gap-3">
        {totalCriticalAlerts > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
            {totalCriticalAlerts} críticas
          </span>
        )}
        {totalWarningAlerts > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-600">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            {totalWarningAlerts} advertencias
          </span>
        )}
      </div>
    </Card>
  );
}

function StatItem({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-medium text-gf-text-soft uppercase tracking-wide">
        {label}
      </span>
      <span className={`text-lg font-bold text-gf-text ${valueClass ?? ""}`}>
        {value}
      </span>
    </div>
  );
}

function Divider() {
  return <div className="h-10 w-px bg-gf-border" />;
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
