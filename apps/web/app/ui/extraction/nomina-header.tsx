import type { ParsedPayrollSummary } from "@/app/lib/extraction";

interface NominaHeaderProps {
  data: ParsedPayrollSummary;
}

/**
 * NominaHeader — compacto, solo lo que el Sprint 2 puede mostrar.
 *
 * Muestra el conteo de recibos y el nombre/RFC del empleado si se
 * detectó. Sin promedios ni análisis financiero (eso es Sprint 3).
 */
export default function NominaHeader({ data }: NominaHeaderProps) {
  const { totalRecibos, recibosConDatos, recibosConError, empleado } = data;

  const pendientes =
    totalRecibos - recibosConDatos - recibosConError;

  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      {/* ── Conteo ──────────────────────────────────────────────────── */}
      <h3 className="text-base font-semibold text-gf-text">
        {totalRecibos === 1
          ? "1 recibo de nómina"
          : `${totalRecibos} recibos de nómina`}
      </h3>

      {/* ── Detalle de estados ──────────────────────────────────────── */}
      <span className="text-xs text-gf-text-muted">
        {recibosConDatos > 0 && (
          <span>
            {recibosConDatos} con datos extraídos
          </span>
        )}
        {recibosConDatos > 0 && pendientes > 0 && ", "}
        {pendientes > 0 && (
          <span>
            {pendientes} pendiente{pendientes !== 1 ? "s" : ""}
          </span>
        )}
        {recibosConError > 0 && (
          <span className="text-red-600">
            {(recibosConDatos > 0 || pendientes > 0 ? ", " : "")}
            {recibosConError} con error
          </span>
        )}
      </span>

      {/* ── Empleado ────────────────────────────────────────────────── */}
      {empleado && (
        <span className="text-sm text-gf-text-muted">
          &mdash; {empleado.nombre}
          {empleado.rfc !== "—" && (
            <span className="font-mono text-xs ml-1">
              (RFC: {empleado.rfc})
            </span>
          )}
        </span>
      )}
    </div>
  );
}
