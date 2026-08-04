import { Calendar, CheckCircle2, Minus } from "lucide-react";
import type {
  ParsedBankStatement,
  ParsedBankStatements,
} from "@/app/lib/extraction";

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
 * EstadosMesesMovimientos — Cobertura de meses según Stitch / design.md.
 */
export default function EstadosMesesMovimientos({
  context,
  statements,
}: EstadosMesesMovimientosProps) {
  const dataStatements = statements.filter((s) => s.hasData);

  const now = new Date();
  const closedStatements = dataStatements.filter((s) => {
    if (s.isClosedMonth) return true;
    if (s.periodEnd) {
      const endDate = new Date(s.periodEnd);
      return endDate < now;
    }
    return false;
  });

  return (
    <div className="bg-white border border-gf-border rounded-xl p-6 shadow-2xs space-y-5 mt-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-gf-text-muted flex items-center gap-1.5">
        <Calendar className="h-3.5 w-3.5 text-gf-tertiary" />
        Cobertura de meses
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gf-surface p-4 rounded-xl border border-gf-border/60 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-gf-text-muted uppercase tracking-wider">
            Estados procesados
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-gf-text">
              {dataStatements.length}
            </span>
            <span className="text-xs font-medium text-gf-text-muted">
              de {statements.length} totales
            </span>
          </div>
        </div>

        <div className="bg-gf-surface p-4 rounded-xl border border-gf-border/60 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-gf-text-muted uppercase tracking-wider">
            Meses cerrados válidos
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-gf-text">
              {closedStatements.length}
            </span>
            {context?.requiredMonths != null && (
              <span className="text-xs font-medium text-gf-text-muted">
                mínimo requerido: {context.requiredMonths}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Month grid visualization */}
      {context && context.coveredMonths.length > 0 ? (
        <div className="space-y-3 pt-1">
          <div className="flex flex-wrap gap-3">
            {context.coveredMonths.map((ym) => {
              const parts = ym.split("-");
              const monthLabel = MONTH_LABELS[parts[1]] ?? parts[1];

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
                  className={
                    hasClosedStatement
                      ? "flex w-24 flex-col items-center justify-between gap-2.5 rounded-xl bg-emerald-50/80 border border-emerald-200 p-3 text-center shadow-2xs"
                      : "flex w-24 flex-col items-center justify-between gap-2.5 rounded-xl bg-gf-surface border border-gf-border/60 p-3 text-center opacity-70"
                  }
                >
                  <span
                    className={
                      hasClosedStatement
                        ? "text-xs font-bold text-emerald-800 uppercase"
                        : "text-xs font-bold text-gf-text-muted uppercase"
                    }
                  >
                    {monthLabel}
                  </span>
                  <div
                    className={
                      hasClosedStatement
                        ? "h-6 w-6 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-2xs"
                        : "h-6 w-6 rounded-full bg-gf-surface-dim text-gf-text-muted flex items-center justify-center border border-gf-border"
                    }
                  >
                    {hasClosedStatement ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                    ) : (
                      <Minus className="h-3.5 w-3.5" />
                    )}
                  </div>
                  <span
                    className={
                      hasClosedStatement
                        ? "text-[10px] font-semibold text-emerald-700 truncate max-w-full"
                        : "text-[10px] text-gf-text-muted truncate max-w-full"
                    }
                  >
                    {bankName}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Summary line */}
          <p className="text-xs text-gf-text-muted pt-1">
            {closedStatements.length} de{" "}
            {context.requiredMonths ?? "?"} meses cerrados requeridos.
            {context.isRequirementSatisfied &&
            context.requiredMonths != null &&
            closedStatements.length >= context.requiredMonths
              ? " El requisito de antigüedad está satisfecho."
              : context.requiredMonths != null &&
                  closedStatements.length < context.requiredMonths
                ? ` Pendientes ${
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
