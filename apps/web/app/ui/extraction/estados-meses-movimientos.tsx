import type {
  ParsedBankStatement,
  ParsedBankStatements,
} from "@/app/lib/extraction";
import Card from "@/app/ui/common/card";

interface EstadosMesesMovimientosProps {
  context: ParsedBankStatements["aggregatedContext"];
  statements: ParsedBankStatement[];
}

const MONTH_LABELS: Record<string, string> = {
  "01": "Ene", "02": "Feb", "03": "Mar", "04": "Abr",
  "05": "May", "06": "Jun", "07": "Jul", "08": "Ago",
  "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dic",
};

/**
 * Two-column layout: months coverage (left) + other relevant movements (right).
 *
 * Sprint 2 — informative only. Distinguishes between:
 *  - statementsWithData: processed and have extracted data
 *  - closedMonths: months where the statement period ended and is NOT flagged
 *    as incomplete or in progress
 *  - requiredMonths: minimum required by policy
 */
export default function EstadosMesesMovimientos({
  context,
  statements,
}: EstadosMesesMovimientosProps) {
  // Statements with actual extracted data
  const dataStatements = statements.filter((s) => s.hasData);

  // Count truly closed months (periodEnd in the past OR isClosedMonth flag)
  const now = new Date();
  const closedStatements = dataStatements.filter((s) => {
    if (s.isClosedMonth) return true;
    // Fallback: if period ended in the past, treat as closed regardless of flag
    if (s.periodEnd) {
      const endDate = new Date(s.periodEnd);
      return endDate < now;
    }
    return false;
  });

  return (
    <div className="flex gap-5">
      {/* ── Months coverage ──────────────────────────────────────────── */}
      <Card className="flex-1 space-y-3.5 p-5">
        <span className="text-sm font-semibold text-gf-text">
          Cobertura de meses
        </span>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <CoverageItem
            label="Estados procesados"
            value={dataStatements.length}
            suffix={`de ${statements.length} totales`}
          />
          <CoverageItem
            label="Meses cerrados válidos"
            value={closedStatements.length}
            suffix={
              context?.requiredMonths != null
                ? `mínimo requerido: ${context.requiredMonths}`
                : undefined
            }
            accent={
              context?.requiredMonths != null &&
              closedStatements.length >= context.requiredMonths
            }
          />
        </div>

        {/* Month grid */}
        {context && context.coveredMonths.length > 0 ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2.5">
              {context.coveredMonths.map((ym) => {
                const parts = ym.split("-");
                const monthLabel = MONTH_LABELS[parts[1]] ?? parts[1];

                // Check if any statement covering this month is closed
                const hasClosedStatement = statements.some((s) => {
                  if (!s.periodStart || !s.hasData) return false;
                  if (!s.periodStart.startsWith(ym)) return false;
                  if (s.isClosedMonth) return true;
                  if (s.periodEnd) {
                    return new Date(s.periodEnd) < now;
                  }
                  return false;
                });

                const bankName = getBankForMonth(ym, statements);

                return (
                  <div
                    key={ym}
                    className={`flex w-[88px] flex-col items-center gap-1 rounded-lg px-2.5 py-2.5 ${
                      hasClosedStatement ? "bg-green-50" : "bg-gray-50"
                    }`}
                  >
                    <span
                      className={`text-[11px] font-semibold ${
                        hasClosedStatement ? "text-green-600" : "text-gray-500"
                      }`}
                    >
                      {monthLabel}
                    </span>
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white ${
                        hasClosedStatement ? "bg-green-500" : "bg-gray-400"
                      }`}
                    >
                      {hasClosedStatement ? "✓" : "—"}
                    </span>
                    <span
                      className={`text-[10px] ${
                        hasClosedStatement ? "text-green-600" : "text-gray-400"
                      }`}
                    >
                      {bankName}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Summary line */}
            <p className="text-xs text-gf-text-muted">
              {closedStatements.length} de{" "}
              {context.requiredMonths ?? "?"} meses cerrados requeridos.
              {context.isRequirementSatisfied &&
              context.requiredMonths != null &&
              closedStatements.length >= context.requiredMonths
                ? " El requisito de antigüedad está satisfecho."
                : context.requiredMonths != null &&
                    closedStatements.length < context.requiredMonths
                  ? ` Pendiente${context.requiredMonths - closedStatements.length > 1 ? "n" : ""} ${
                      context.requiredMonths - closedStatements.length
                    } mes${context.requiredMonths - closedStatements.length > 1 ? "es" : ""} cerrado${context.requiredMonths - closedStatements.length > 1 ? "s" : ""} adicional${context.requiredMonths - closedStatements.length > 1 ? "es" : ""}.`
                  : ""}
            </p>
          </div>
        ) : (
          <p className="text-xs text-gf-text-muted">
            Sin datos de cobertura de meses.
          </p>
        )}
      </Card>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function CoverageItem({
  label,
  value,
  suffix,
  accent,
}: {
  label: string;
  value: number;
  suffix?: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg bg-gf-bg px-3 py-2.5">
      <span className="text-[11px] font-medium text-gf-text-soft">{label}</span>
      <span
        className={`text-lg font-bold ${accent ? "text-green-600" : "text-gf-text"}`}
      >
        {value}
      </span>
      {suffix && (
        <span className="text-[11px] text-gf-text-muted">{suffix}</span>
      )}
    </div>
  );
}

function getBankForMonth(
  ym: string,
  statements: ParsedBankStatement[],
): string {
  for (const s of statements) {
    if (s.hasData && s.periodStart && s.periodStart.startsWith(ym)) {
      return s.bankName ?? "—";
    }
  }
  return "—";
}

