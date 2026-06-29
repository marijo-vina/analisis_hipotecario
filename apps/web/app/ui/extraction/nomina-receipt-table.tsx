"use client";

import { useState, Fragment } from "react";
import type {
  ExtractionAlert,
  ParsedPayrollReceipt,
} from "@/app/lib/extraction";
import StatusBadge from "@/app/ui/common/badge";

// ── Re-export for backwards compatibility ─────────────────────────────
export type ParsedReceiptRow = ParsedPayrollReceipt;

interface NominaReceiptTableProps {
  rows: ParsedPayrollReceipt[];
}

function formatCurrency(value: number | null): string {
  if (value == null) return "—";
  return `$${value.toLocaleString("es-MX")}`;
}

// ── Status pill for inline use in the table ──────────────────────────
function statusPillStyle(code: string): string {
  switch (code) {
    case "PROCESSED":
      return "bg-green-100 text-green-800";
    case "PROCESSING":
      return "bg-blue-100 text-blue-800";
    case "UPLOADED":
      return "bg-gray-100 text-gray-600";
    case "EXTRACTION_ERROR":
    case "ERROR":
    case "OCR_ERROR":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

// ── DetailBlock for percepciones / deducciones ───────────────────────
interface DetailBlockProps {
  title: string;
  items?: { concepto: string; importe: number }[];
}

function DetailBlock({ title, items }: DetailBlockProps) {
  if (!items || items.length === 0) return null;

  const total = items.reduce((sum, item) => sum + item.importe, 0);

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
        {/* ── Total row ────────────────────────────────────────────── */}
        <li className="flex items-center justify-between gap-4 px-3 py-2 text-xs bg-gf-red-soft/20 font-semibold">
          <span className="text-gf-text">Total</span>
          <span className="text-gf-text text-right shrink-0 tabular-nums">
            {formatCurrency(total)}
          </span>
        </li>
      </ul>
    </div>
  );
}

// ── Empty-state row (shown when a receipt has no extractedData) ─────
function EmptyDetail({ row }: { row: ParsedPayrollReceipt }) {
  const isError =
    row.statusCode === "ERROR" ||
    row.statusCode === "EXTRACTION_ERROR" ||
    row.statusCode === "OCR_ERROR";

  return (
    <div className="space-y-3">
      <div>
        <h5 className="text-xs font-semibold uppercase tracking-wide text-gf-text-muted mb-2 text-pretty">
          Archivo
        </h5>
        <p className="text-sm text-gf-text">{row.originalName}</p>
      </div>

      <div>
        <h5 className="text-xs font-semibold uppercase tracking-wide text-gf-text-muted mb-2 text-pretty">
          Estado
        </h5>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusPillStyle(row.statusCode)}`}
        >
          {row.statusName}
        </span>
      </div>

      {isError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5">
          <p className="text-xs text-red-700 leading-relaxed">
            La extracción de datos de este recibo falló. Puedes intentar
            reprocesar el documento desde la sección de Documentos.
          </p>
        </div>
      )}

      {row.statusCode === "UPLOADED" && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2.5">
          <p className="text-xs text-blue-700 leading-relaxed">
            Este documento aún no se ha procesado. Usa el botón
            &ldquo;Procesar&rdquo; en la sección de Documentos para
            extraer los datos.
          </p>
        </div>
      )}

      {row.statusCode === "PROCESSING" && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2.5">
          <p className="text-xs text-blue-700 leading-relaxed">
            El OCR está en proceso. Los datos aparecerán aquí cuando
            termine.
          </p>
        </div>
      )}

      {row.statusCode === "PROCESSED" && !row.hasData && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="text-xs text-amber-700 leading-relaxed">
            El OCR se completó pero los datos no están disponibles.
            Intenta reprocesar el documento.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * NominaReceiptTable — expandable table of payroll receipts.
 *
 * Every payroll document appears here with its real status —
 * including UPLOADED, PROCESSING, PROCESSED (with or without
 * extractedData), and ERROR/EXTRACTION_ERROR.
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
        No hay recibos de nómina todavía.
      </div>
    );
  }

  const headers = [
    "Estado",
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
      <table className="w-full min-w-[900px] text-sm text-gf-text">
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
            const hasData = row.hasData;

            return (
              <Fragment key={row.documentId}>
                <tr className="border-b border-gf-border last:border-b-0 hover:bg-gf-red-soft/30 transition-colors duration-150">
                  {/* Estado */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${statusPillStyle(row.statusCode)}`}
                    >
                      {row.statusName}
                    </span>
                  </td>

                  {/* Periodo */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    {hasData ? row.periodo : "—"}
                  </td>

                  {/* Fecha de pago */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    {hasData ? (row.fechaPago ?? "—") : "—"}
                  </td>

                  {/* Periodicidad */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    {hasData ? row.periodicidad : "—"}
                  </td>

                  {/* Ingreso bruto */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    {hasData ? formatCurrency(row.ingresoBruto) : "—"}
                  </td>

                  {/* Deducciones */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    {hasData ? formatCurrency(row.deducciones) : "—"}
                  </td>

                  {/* Ingreso neto */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    {hasData ? formatCurrency(row.ingresoNeto) : "—"}
                  </td>

                  {/* Timbrado */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    {!hasData ? (
                      "—"
                    ) : row.timbrado ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                        <span aria-hidden="true">✓</span> Sí
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-amber-700">
                        No detectado
                      </span>
                    )}
                  </td>

                  {/* Alertas */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    {!hasData ? (
                      "—"
                    ) : row.alertas > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        <span aria-hidden="true">⚠</span> {row.alertas}
                      </span>
                    ) : (
                      <span className="text-gf-text-muted">0</span>
                    )}
                  </td>

                  {/* Acción */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggle(index)}
                      aria-expanded={isExpanded}
                      aria-label={
                        isExpanded
                          ? "Ocultar detalle del recibo"
                          : "Ver detalle del recibo"
                      }
                      className="rounded border border-gf-border bg-gf-bg px-2.5 py-1 text-xs font-medium text-gf-text transition-colors hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-gf-red/40 focus-visible:outline-none"
                    >
                      {isExpanded ? "Ocultar" : "Ver detalle"}
                    </button>
                  </td>
                </tr>

                {/* ── Expanded detail row ────────────────────────── */}
                {isExpanded && (
                  <tr className="border-b border-gf-border last:border-b-0 bg-gf-red-soft/10">
                    <td
                      colSpan={headers.length}
                      className="px-5 py-5"
                    >
                      {!hasData ? (
                        <EmptyDetail row={row} />
                      ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          {/* ── Datos del empleado / empleador / employment ── */}
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
                                <dd className="font-mono">
                                  {row.empleado?.rfc ?? "—"}
                                </dd>
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
                                <dd>{row.empleador?.nombre ?? "—"}</dd>
                                <dt className="font-medium text-gf-text-muted">
                                  RFC:
                                </dt>
                                <dd className="font-mono">
                                  {row.empleador?.rfc ?? "—"}
                                </dd>
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
                                    {row.employment.hireDate ?? "—"}
                                  </dd>
                                  <dt className="font-medium text-gf-text-muted">
                                    Antigüedad:
                                  </dt>
                                  <dd>
                                    {row.employment.seniorityText ??
                                      "—"}
                                  </dd>
                                  <dt className="font-medium text-gf-text-muted">
                                    Cotiza IMSS:
                                  </dt>
                                  <dd>
                                    {row.employment
                                      .contributesToImss === true
                                      ? "Sí"
                                      : "—"}
                                  </dd>
                                </dl>
                                {row.employment.imssEvidence && (
                                  <p className="mt-1.5 text-[11px] text-gf-text-muted leading-relaxed">
                                    {row.employment.imssEvidence}
                                  </p>
                                )}
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

                          {/* ── Percepciones / Deducciones / Fiscal ── */}
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
                                    {row.fiscalData.fiscalFolio ??
                                      "—"}
                                  </dd>
                                  <dt className="font-medium text-gf-text-muted">
                                    Certificación:
                                  </dt>
                                  <dd className="text-[11px]">
                                    {row.fiscalData
                                      .certificationDate
                                      ? new Date(
                                          row.fiscalData.certificationDate,
                                        ).toLocaleString(
                                          "es-MX",
                                          {
                                            year: "numeric",
                                            month: "2-digit",
                                            day: "2-digit",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                          },
                                        )
                                      : "—"}
                                  </dd>
                                  <dt className="font-medium text-gf-text-muted">
                                    Timbrado:
                                  </dt>
                                  <dd>
                                    {row.fiscalData.isStamped ? (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800">
                                        <span aria-hidden="true">
                                          ✓
                                        </span>{" "}
                                        Sí
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
                      )}
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
