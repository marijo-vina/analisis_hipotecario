import { FileText, UserCheck, AlertTriangle } from "lucide-react";
import type { ParsedPayrollSummary } from "@/app/lib/extraction";

interface NominaHeaderProps {
  data: ParsedPayrollSummary;
}

/**
 * NominaHeader — barra de contexto de recibos de nómina según Stitch / design.md.
 *
 * Muestra el conteo de recibos, recibos procesados, pendientes o con error,
 * e identificación del empleado (Nombre + RFC).
 */
export default function NominaHeader({ data }: NominaHeaderProps) {
  const { totalRecibos, recibosConDatos, recibosConError, empleado } = data;

  const pendientes = totalRecibos - recibosConDatos - recibosConError;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-gf-border rounded-xl p-4 shadow-2xs mb-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-gf-surface-dim text-gf-text-muted">
            <FileText className="h-4 w-4" />
          </div>
          <span className="text-sm font-bold text-gf-text">
            {totalRecibos === 1
              ? "1 recibo de nómina"
              : `${totalRecibos} recibos de nómina`}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {recibosConDatos > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold">
              {recibosConDatos} con datos extraídos
            </span>
          )}
          {pendientes > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gf-surface-dim text-gf-text-muted border border-gf-border px-2.5 py-0.5 text-xs font-medium">
              {pendientes} pendiente{pendientes !== 1 ? "s" : ""}
            </span>
          )}
          {recibosConError > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 text-red-700 border border-red-200 px-2.5 py-0.5 text-xs font-semibold">
              <AlertTriangle className="h-3 w-3 text-red-600" />
              {recibosConError} con error
            </span>
          )}
        </div>
      </div>

      {empleado && (
        <div className="flex items-center gap-2 text-xs font-medium text-gf-text-muted bg-gf-surface px-3 py-1.5 rounded-lg border border-gf-border/60">
          <UserCheck className="h-3.5 w-3.5 text-gf-tertiary" />
          <span className="font-semibold text-gf-text uppercase">{empleado.nombre}</span>
          {empleado.rfc !== "—" && (
            <span className="font-mono text-gf-text-muted">
              (RFC: {empleado.rfc})
            </span>
          )}
        </div>
      )}
    </div>
  );
}
