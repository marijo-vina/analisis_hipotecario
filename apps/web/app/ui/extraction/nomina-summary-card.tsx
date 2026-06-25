import type { ReactNode } from "react";
import type { ParsedPayrollSummary } from "@/app/lib/extraction";
import Card from "@/app/ui/common/card";

interface NominaSummaryCardProps {
  data: ParsedPayrollSummary;
}

function formatCurrency(value: number | null): string {
  if (value == null) return "—";
  return `$${value.toLocaleString("es-MX")}`;
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-gf-text-muted">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-gf-text">{children}</dd>
    </div>
  );
}

/**
 * NominaSummaryCard — consolidated payroll summary from real extracted data.
 */
export default function NominaSummaryCard({
  data,
}: NominaSummaryCardProps) {
  const allTimbrado =
    data.totalRecibos > 0 &&
    data.timbradoDetectado === data.totalRecibosTimbrados;
  const someTimbrado = data.timbradoDetectado > 0 && !allTimbrado;

  return (
    <Card>
      <h3 className="text-base font-semibold text-gf-text mb-1">
        Resumen de nómina
      </h3>
      <p className="text-xs text-gf-text-muted mb-4">
        Consolidado de {data.recibosProcesados} de {data.totalRecibos}{" "}
        recibos procesados.
      </p>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Cell label="Recibos procesados">
          {data.recibosProcesados} / {data.totalRecibos}
        </Cell>
        <Cell label="Periodos">
          {data.periodos.length > 0
            ? data.periodos.join(", ")
            : "Sin periodos detectados"}
        </Cell>
        <Cell label="Empleado">
          {data.empleado?.nombre ?? "No detectado"}
        </Cell>
        <Cell label="RFC del empleado">
          {data.empleado?.rfc ?? "—"}
        </Cell>
        <Cell label="Empleador">
          {data.empleadores.length > 0
            ? data.empleadores.map((e) => e.nombre).join(", ")
            : "Sin empleador detectado"}
        </Cell>
        <Cell label="RFC del empleador">
          {data.empleadores.length > 0
            ? data.empleadores.map((e) => e.rfc).join(", ")
            : "—"}
        </Cell>
        <Cell label="Ingreso bruto promedio">
          {formatCurrency(data.ingresoBrutoPromedio)}
        </Cell>
        <Cell label="Ingreso neto promedio">
          {formatCurrency(data.ingresoNetoPromedio)}
        </Cell>
        <Cell label="Timbrado">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
              allTimbrado
                ? "bg-green-100 text-green-800"
                : someTimbrado
                  ? "bg-amber-100 text-amber-800"
                  : "bg-gray-100 text-gray-600"
            }`}
          >
            {allTimbrado && (
              <>
                <span aria-hidden="true">✓</span>{" "}
                {data.timbradoDetectado}/{data.totalRecibosTimbrados}
              </>
            )}
            {someTimbrado && (
              <>
                <span aria-hidden="true">⚠</span>{" "}
                {data.timbradoDetectado}/{data.totalRecibosTimbrados}
              </>
            )}
            {!allTimbrado && !someTimbrado && "No detectado"}
          </span>
        </Cell>
        <Cell label="Alertas">
          {data.alertas > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              <span aria-hidden="true">⚠</span> {data.alertas}
            </span>
          ) : (
            <span className="text-gf-text-muted">Sin alertas</span>
          )}
        </Cell>
      </dl>
    </Card>
  );
}
