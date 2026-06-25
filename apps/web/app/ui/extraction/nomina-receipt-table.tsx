"use client";

import { useState, Fragment } from "react";
import type { ExtractionAlert } from "@/app/lib/extraction";

// ── Receipt row shape (parsed from real extractedData) ─────────────────
export interface ParsedReceiptRow {
  documentId: string;
  periodo: string;
  fechaPago: string | null;
  periodicidad: string;
  ingresoBruto: number | null;
  deducciones: number | null;
  ingresoNeto: number | null;
  timbrado: boolean;
  alertas: number;
  alertasLista: ExtractionAlert[];
  empleado: { nombre: string; rfc: string } | null;
  empleador: { nombre: string; rfc: string } | null;
  percepciones: { concepto: string; importe: number }[];
  deduccionesDetalle: { concepto: string; importe: number }[];
  employment: {
    hireDate: string | null;
    seniorityText: string | null;
    hasMinimumSeniority: boolean | null;
    contributesToImss: boolean | null;
    imssEvidence: string | null;
  } | null;
  isVariableIncome: boolean;
  fiscalData: {
    fiscalFolio: string | null;
    certificationDate: string | null;
    isStamped: boolean;
  } | null;
}

interface NominaReceiptTableProps {
  rows: ParsedReceiptRow[];
}

function formatCurrency(value: number | null): string {
  if (value == null) return "—";
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
            <h5 className="text-xs font-semibold uppercase tracking-wide text-gf-text-muted mb-2 text-pretty">
              {title}
            </h5>
      <ul className="divide-y divide-gf-border/50 rounded-md border border-gf-border/50 overflow-hidden">
        {items.map((item, i) => (
          <li
            key={`${item.concepto}-${item.importe}-${i}`}
            className={`flex items-center justify-between gap-4 px-3 py-2 text-xs ${
              i % 2 === 0 ? "bg-white" : "bg-gf-bg/40"
            }`}
          >
            <span className="text-gf-text leading-snug min-w-0 break-words">
              {item.concepto}
            </span>
            <span className="font-semibold text-gf-text text-right shrink-0 tabular-nums">
              {formatCurrency(item.importe)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * NominaReceiptTable — expandable table of individual payroll receipts
 * built from real extracted data. No mock data.
 */
export default function NominaReceiptTable({
  rows,
}: NominaReceiptTableProps) {
  const [expanded, setExpanded] = useState<number | null>(null);

  const toggle = (index: number) => {
    setExpanded((curr) => (curr === index ? null : index));
  };

  if (rows.length === 0) {
    return (
      <div className="rounded-[var(--radius-md)] border border-gf-border bg-gf-surface p-8 text-center text-sm text-gf-text-muted">
        No hay recibos de nómina procesados aún.
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
    "Acción",
  ];

  return (
    <div className="overflow-x-auto rounded-[var(--radius-md)] border border-gf-border touch-manipulation">
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
              <Fragment key={row.documentId}>
                <tr className="border-b border-gf-border last:border-b-0 hover:bg-gf-red-soft/30 transition-colors duration-150">
                  <td className="px-4 py-3 whitespace-nowrap">
                    {row.periodo}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {row.fechaPago ?? "No detectada"}
                  </td>
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
                        <span aria-hidden="true">✓</span> Sí
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
                        aria-label={`${isExpanded ? "Ocultar" : "Ver"} detalle del recibo`}
                        className="rounded border border-gf-border bg-gf-bg px-2.5 py-1 text-xs font-medium text-gf-text transition-colors hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-gf-red/40 focus-visible:outline-none"
                      >
                        {isExpanded ? "Ocultar" : "Ver detalle"}
                      </button>
                  </td>
                </tr>

                {isExpanded && (
                  <tr className="border-b border-gf-border last:border-b-0 bg-gf-red-soft/10">
                    <td
                      colSpan={headers.length}
                      className="px-5 py-5"
                    >
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Datos del empleado / empleador / employment */}
                        <div className="space-y-5">
                          <div>
                            <h5 className="text-xs font-semibold uppercase tracking-wide text-gf-text-muted mb-2 text-pretty">
                              Datos del empleado
                            </h5>
                            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-gf-text">
                              <dt className="font-medium text-gf-text-muted">
                                Nombre:
                              </dt>
                              <dd>{row.empleado?.nombre ?? "—"}</dd>
                              <dt className="font-medium text-gf-text-muted">
                                RFC:
                              </dt>
                              <dd className="font-mono">{row.empleado?.rfc ?? "—"}</dd>
                            </dl>
                          </div>

                          <div>
                            <h5 className="text-xs font-semibold uppercase tracking-wide text-gf-text-muted mb-2 text-pretty">
                              Datos del empleador
                            </h5>
                            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-gf-text">
                              <dt className="font-medium text-gf-text-muted">
                                Nombre:
                              </dt>
                              <dd>
                                {row.empleador?.nombre ?? "—"}
                              </dd>
                              <dt className="font-medium text-gf-text-muted">
                                RFC:
                              </dt>
                              <dd className="font-mono">{row.empleador?.rfc ?? "—"}</dd>
                            </dl>
                          </div>

                          {row.employment && (
                            <div>
                              <h5 className="text-xs font-semibold uppercase tracking-wide text-gf-text-muted mb-2 text-pretty">
                                Antigüedad laboral
                              </h5>
                              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-gf-text">
                                <dt className="font-medium text-gf-text-muted">
                                  Fecha de ingreso:
                                </dt>
                                <dd>
                                  {row.employment.hireDate ?? "No detectado"}
                                </dd>
                                <dt className="font-medium text-gf-text-muted">
                                  Antigüedad:
                                </dt>
                                <dd>
                                  {row.employment.seniorityText ?? "No detectado"}
                                </dd>
                                <dt className="font-medium text-gf-text-muted">
                                  Cotiza IMSS:
                                </dt>
                                <dd>
                                  {row.employment.contributesToImss === true
                                    ? "Sí"
                                    : "No detectado"}
                                </dd>
                              </dl>
                              {row.employment.imssEvidence && (
                                <p className="mt-1.5 text-[11px] text-gf-text-muted leading-relaxed">
                                  {row.employment.imssEvidence}
                                </p>
                              )}
                            </div>
                          )}

                          {row.isVariableIncome && (
                            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5">
                              <h5 className="text-xs font-semibold uppercase tracking-wide text-amber-800 mb-1">
                                Ingresos variables detectados
                              </h5>
                              <p className="text-xs text-amber-700 leading-relaxed">
                                Este recibo contiene percepciones variables o
                                conceptos no base. Revisar si se requieren 6
                                meses de recibos para promediar.
                              </p>
                            </div>
                          )}

                          {row.alertas > 0 && (
                            <div>
                              <h5 className="text-xs font-semibold uppercase tracking-wide text-gf-text-muted mb-2 text-pretty">
                                Alertas del recibo
                              </h5>
                              <ul className="space-y-1.5">
                                {row.alertasLista.map((a, i) => (
                                  <li
                                    key={`${a.code}-${i}`}
                                    className={`text-xs rounded-md border-l-2 px-3 py-2 ${
                                      a.severity === "CRITICAL"
                                        ? "border-l-red-500 bg-red-50 text-red-800"
                                        : "border-l-amber-500 bg-amber-50 text-amber-800"
                                    }`}
                                  >
                                    <span className="font-semibold">
                                      {a.severity}
                                    </span>
                                    : {a.message}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>

                        {/* Percepciones / Deducciones */}
                        <div className="space-y-5">
                          <DetailBlock
                            title="Percepciones"
                            items={row.percepciones}
                          />
                          <DetailBlock
                            title="Deducciones"
                            items={row.deduccionesDetalle}
                          />

                          {row.fiscalData && (
                            <div>
                              <h5 className="text-xs font-semibold uppercase tracking-wide text-gf-text-muted mb-2 text-pretty">
                                Datos fiscales
                              </h5>
                              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-gf-text">
                                <dt className="font-medium text-gf-text-muted">
                                  Folio fiscal:
                                </dt>
                                <dd className="font-mono text-[11px] break-all leading-snug">
                                  {row.fiscalData.fiscalFolio ?? "—"}
                                </dd>
                                <dt className="font-medium text-gf-text-muted">
                                  Certificación:
                                </dt>
                                <dd className="text-[11px]">
                                  {row.fiscalData.certificationDate
                                    ? new Date(
                                        row.fiscalData.certificationDate,
                                      ).toLocaleString("es-MX", {
                                        year: "numeric",
                                        month: "2-digit",
                                        day: "2-digit",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })
                                    : "—"}
                                </dd>
                                <dt className="font-medium text-gf-text-muted">
                                  Timbrado:
                                </dt>
                                <dd>
                                  {row.fiscalData.isStamped ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800">
                                      <span aria-hidden="true">✓</span> Sí
                                    </span>
                                  ) : (
                                    <span className="text-[11px] font-medium text-amber-700">
                                      No detectado
                                    </span>
                                  )}
                                </dd>
                              </dl>
                            </div>
                          )}
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
