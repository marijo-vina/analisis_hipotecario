"use client";

import { useState, Fragment } from "react";

// ── Mock receipt shape (contract not finalized on the backend yet) ────────
export interface ReceiptRow {
  periodo: string;
  fechaPago: string;
  periodicidad: string;
  ingresoBruto: number;
  deducciones: number;
  ingresoNeto: number;
  timbrado: boolean;
  alertas: number;
  // expanded detail
  empleado?: { nombre: string; rfc: string };
  empleador?: { nombre: string; rfc: string };
  percepciones?: { concepto: string; importe: number }[];
  deduccionesDetalle?: { concepto: string; importe: number }[];
}

interface NominaReceiptTableProps {
  rows: ReceiptRow[];
}

function formatCurrency(value: number): string {
  return `$${value.toLocaleString("es-MX")}`;
}

interface DetailBlockProps {
  title: string;
  items?: { concepto: string; importe: number }[];
}

function DetailBlock({ title, items }: DetailBlockProps) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <h5 className="text-xs font-semibold uppercase tracking-wide text-gf-text-muted mb-1">
        {title}
      </h5>
      <ul className="space-y-1">
        {items.map((item) => (
          <li
            key={item.concepto}
            className="flex items-center justify-between gap-4 text-xs text-gf-text"
          >
            <span>{item.concepto}</span>
            <span className="font-medium">{formatCurrency(item.importe)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * NominaReceiptTable — expandable table of individual payroll receipts.
 *
 * Custom table (not the presentational `DataTable`) because it needs per-row
 * expand state. Columns: Periodo, Fecha de pago, Periodicidad, Ingreso bruto,
 * Deducciones, Ingreso neto, Timbrado, Alertas, plus a "Ver detalle" toggle
 * that reveals the expanded row with empleado/empleador/percepciones/deducciones.
 */
export default function NominaReceiptTable({ rows }: NominaReceiptTableProps) {
  const [expanded, setExpanded] = useState<number | null>(null);

  const toggle = (index: number) => {
    setExpanded((curr) => (curr === index ? null : index));
  };

  if (rows.length === 0) {
    return (
      <div className="rounded-[var(--radius-md)] border border-gf-border bg-gf-surface p-8 text-center text-sm text-gf-text-muted">
        No hay recibos de nomina procesados aun.
      </div>
    );
  }

  const headers = [
    "Periodo",
    "Fecha de pago",
    "Periodicidad",
    "Ingreso bruto",
    "Deducciones",
    "Ingreso neto",
    "Timbrado",
    "Alertas",
    "Accion",
  ];

  return (
    <div className="overflow-x-auto rounded-[var(--radius-md)] border border-gf-border">
      <table className="w-full min-w-[820px] text-sm text-gf-text">
        <thead>
          <tr className="border-b border-gf-border bg-gf-bg/50">
            {headers.map((header) => (
              <th
                key={header}
                scope="col"
                className="px-4 py-3 text-left font-semibold text-gf-text whitespace-nowrap"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const isExpanded = expanded === index;
            return (
              <Fragment key={index}>
                <tr key={`row-${index}`} className="border-b border-gf-border last:border-b-0 hover:bg-gf-red-soft/30 transition-colors duration-150">
                  <td className="px-4 py-3 whitespace-nowrap">{row.periodo}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{row.fechaPago}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {row.periodicidad}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatCurrency(row.ingresoBruto)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatCurrency(row.deducciones)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatCurrency(row.ingresoNeto)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {row.timbrado ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                        <span aria-hidden="true">✓</span> Si
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-amber-700">
                        No detectado
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {row.alertas > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        <span aria-hidden="true">⚠</span> {row.alertas}
                      </span>
                    ) : (
                      <span className="text-gf-text-muted">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggle(index)}
                      aria-expanded={isExpanded}
                      className="rounded border border-gf-border bg-gf-bg px-2.5 py-1 text-xs font-medium text-gf-text transition-colors hover:bg-gray-50"
                    >
                      Ver detalle
                    </button>
                  </td>
                </tr>

                {isExpanded && (
                  <tr key={`detail-${index}`} className="border-b border-gf-border last:border-b-0 bg-gf-bg/40">
                    <td colSpan={headers.length} className="px-4 py-4">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Datos del empleado / empleador */}
                        <div className="space-y-4">
                          <div>
                            <h5 className="text-xs font-semibold uppercase tracking-wide text-gf-text-muted mb-1">
                              Datos del empleado
                            </h5>
                            <dl className="grid grid-cols-2 gap-2 text-xs text-gf-text">
                              <dt className="font-medium text-gf-text-muted">
                                Nombre:
                              </dt>
                              <dd>{row.empleado?.nombre ?? "—"}</dd>
                              <dt className="font-medium text-gf-text-muted">
                                RFC:
                              </dt>
                              <dd>{row.empleado?.rfc ?? "—"}</dd>
                            </dl>
                          </div>

                          <div>
                            <h5 className="text-xs font-semibold uppercase tracking-wide text-gf-text-muted mb-1">
                              Datos del empleador
                            </h5>
                            <dl className="grid grid-cols-2 gap-2 text-xs text-gf-text">
                              <dt className="font-medium text-gf-text-muted">
                                Nombre:
                              </dt>
                              <dd>{row.empleador?.nombre ?? "—"}</dd>
                              <dt className="font-medium text-gf-text-muted">
                                RFC:
                              </dt>
                              <dd>{row.empleador?.rfc ?? "—"}</dd>
                            </dl>
                          </div>

                          {row.alertas > 0 && (
                            <div>
                              <h5 className="text-xs font-semibold uppercase tracking-wide text-gf-text-muted mb-1">
                                Alertas del recibo
                              </h5>
                              <p className="text-xs text-amber-700">
                                Este recibo presenta {row.alertas}{" "}
                                {row.alertas === 1 ? "alerta" : "alertas"}.
                                Revisa los detalles con la asesora.
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Percepciones / Deducciones */}
                        <div className="space-y-4">
                          <DetailBlock
                            title="Percepciones"
                            items={row.percepciones}
                          />
                          <DetailBlock
                            title="Deducciones"
                            items={row.deduccionesDetalle}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}