"use client";

import { useState } from "react";
import {
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
  FileText,
  User,
  Building,
  Calendar,
  ShieldCheck,
  Clock,
} from "lucide-react";
import type { ParsedPayrollReceipt } from "@/app/lib/extraction";

export type ParsedReceiptRow = ParsedPayrollReceipt;

interface NominaReceiptTableProps {
  rows: ParsedPayrollReceipt[];
}

function formatCurrency(value: number | null): string {
  if (value == null) return "—";
  return `$${value.toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ── DetailBlock for percepciones / deducciones tables ─────────────────
interface DetailBlockProps {
  title: string;
  items?: { concepto: string; importe: number }[];
}

function DetailBlock({ title, items }: DetailBlockProps) {
  if (!items || items.length === 0) {
    return (
      <div>
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-gf-text-muted mb-3">
          {title}
        </h4>
        <div className="rounded-xl border border-gf-border/60 bg-gf-surface p-4 text-center text-xs text-gf-text-muted italic">
          Sin conceptos registrados
        </div>
      </div>
    );
  }

  const total = items.reduce((sum, item) => sum + item.importe, 0);

  return (
    <div>
      <h4 className="text-[10px] font-bold uppercase tracking-wider text-gf-text-muted mb-3">
        {title}
      </h4>
      <div className="rounded-xl border border-gf-border/60 overflow-hidden bg-white shadow-2xs">
        <div className="divide-y divide-gf-border/40">
          {items.map((item, i) => (
            <div
              key={`${item.concepto}-${item.importe}-${i}`}
              className={`flex items-center justify-between gap-4 px-3.5 py-2 text-xs ${
                i % 2 === 0 ? "bg-white" : "bg-gf-surface/50"
              }`}
            >
              <span className="text-gf-text font-medium leading-snug min-w-0 break-words">
                {item.concepto}
              </span>
              <span className="font-semibold text-gf-text text-right shrink-0 tabular-nums">
                {formatCurrency(item.importe)}
              </span>
            </div>
          ))}
        </div>
        {/* ── Total Row ────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4 px-3.5 py-2.5 text-xs bg-gf-surface-dim border-t border-gf-border font-bold text-gf-text">
          <span>Total</span>
          <span className="text-right shrink-0 tabular-nums">
            {formatCurrency(total)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Empty Detail for receipts without extractedData ───────────────────
function EmptyDetail({ row }: { row: ParsedPayrollReceipt }) {
  const isError =
    row.statusCode === "ERROR" ||
    row.statusCode === "EXTRACTION_ERROR" ||
    row.statusCode === "OCR_ERROR";

  return (
    <div className="p-6 bg-white space-y-4">
      <div className="flex items-center justify-between border-b border-gf-border/50 pb-3">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-gf-text-muted block">
            Archivo de recibo
          </span>
          <span className="text-sm font-bold text-gf-text">
            {row.originalName}
          </span>
        </div>
      </div>

      {isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Error en la extracción del recibo</p>
            <p className="mt-0.5 leading-relaxed">
              La extracción de datos de este recibo no se pudo completar. Puedes intentar reprocesar el documento desde la sección de Documentos.
            </p>
          </div>
        </div>
      )}

      {row.statusCode === "UPLOADED" && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs text-blue-800 flex items-start gap-2.5">
          <Clock className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Documento pendiente de procesar</p>
            <p className="mt-0.5 leading-relaxed">
              Usa el botón &ldquo;Procesar&rdquo; en la sección de Documentos para extraer los datos de este recibo.
            </p>
          </div>
        </div>
      )}

      {row.statusCode === "PROCESSING" && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs text-blue-800 flex items-start gap-2.5">
          <Clock className="h-4 w-4 text-blue-600 shrink-0 mt-0.5 animate-spin" />
          <div>
            <p className="font-bold">Procesando OCR del documento</p>
            <p className="mt-0.5 leading-relaxed">
              El análisis del recibo está en proceso. Los datos estructurados aparecerán aquí automáticamente al concluir.
            </p>
          </div>
        </div>
      )}

      {row.statusCode === "PROCESSED" && !row.hasData && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Sin datos de extracción disponibles</p>
            <p className="mt-0.5 leading-relaxed">
              El procesamiento concluyó pero no se generaron campos estructurados. Intenta reprocesar el documento.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * NominaReceiptTable — Lista de recibos de nómina en acordeón optimizado
 * basado en el diseño de Stitch ("Rediseño Tab Nómina - Acordeón Optimizado").
 */
export default function NominaReceiptTable({
  rows,
}: NominaReceiptTableProps) {
  // First card expanded by default
  const [expandedSet, setExpandedSet] = useState<Set<string>>(() => {
    const set = new Set<string>();
    if (rows.length > 0) {
      set.add(rows[0].documentId);
    }
    return set;
  });

  const toggle = (documentId: string) => {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(documentId)) {
        next.delete(documentId);
      } else {
        next.add(documentId);
      }
      return next;
    });
  };

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-gf-border bg-white p-8 text-center text-sm text-gf-text-muted shadow-2xs">
        No hay recibos de nómina registrados todavía.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {rows.map((row) => {
        const isExpanded = expandedSet.has(row.documentId);
        const hasData = row.hasData;

        return (
          <div
            key={row.documentId}
            className="bg-white rounded-xl border border-gf-border shadow-2xs overflow-hidden transition-all"
          >
            {/* ── Accordion Header Row (Stitch Layout) ──────────────────── */}
            <div
              onClick={() => toggle(row.documentId)}
              className="px-5 py-4 bg-white hover:bg-gf-surface-dim/60 flex items-center justify-between cursor-pointer transition-colors select-none"
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-4 items-center flex-1 pr-4">
                {/* 1. Status Badge */}
                <div className="shrink-0">
                  <span
                    className={
                      row.statusCode === "PROCESSED"
                        ? "inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold"
                        : row.statusCode === "ERROR" || row.statusCode === "EXTRACTION_ERROR"
                          ? "inline-flex items-center gap-1 rounded-full bg-red-50 text-red-700 border border-red-200 px-2.5 py-0.5 text-xs font-semibold"
                          : "inline-flex items-center gap-1 rounded-full bg-gf-surface-dim text-gf-text-muted border border-gf-border px-2.5 py-0.5 text-xs font-semibold"
                    }
                  >
                    {row.statusCode === "PROCESSED" && (
                      <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                    )}
                    {row.statusName}
                  </span>
                </div>

                {/* 2. Periodo */}
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gf-text-muted block">
                    Periodo
                  </span>
                  <span className="text-xs font-semibold text-gf-text truncate block">
                    {hasData ? row.periodo : "—"}
                  </span>
                </div>

                {/* 3. Fecha de pago */}
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gf-text-muted block">
                    Fecha de pago
                  </span>
                  <span className="text-xs font-semibold text-gf-text truncate block">
                    {hasData ? (row.fechaPago ?? "—") : "—"}
                  </span>
                </div>

                {/* 4. Ingreso Bruto */}
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gf-text-muted block">
                    Ingreso Bruto
                  </span>
                  <span className="text-xs font-semibold text-gf-text truncate block">
                    {hasData ? formatCurrency(row.ingresoBruto) : "—"}
                  </span>
                </div>

                {/* 5. Ingreso Neto */}
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gf-text-muted block">
                    Ingreso Neto
                  </span>
                  <span className="text-xs font-bold text-gf-text truncate block">
                    {hasData ? formatCurrency(row.ingresoNeto) : "—"}
                  </span>
                </div>

                {/* 6. Timbrado */}
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gf-text-muted block">
                    Timbrado
                  </span>
                  {hasData ? (
                    row.timbrado ? (
                      <span className="text-xs font-semibold text-emerald-700 inline-flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Sí
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-amber-700">
                        No detectado
                      </span>
                    )
                  ) : (
                    <span className="text-xs text-gf-text-muted">&mdash;</span>
                  )}
                </div>

                {/* 7. Alertas */}
                <div>
                  {hasData && row.alertas > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-0.5 text-xs font-semibold">
                      <AlertTriangle className="h-3 w-3 text-amber-600" />
                      {row.alertas}
                    </span>
                  ) : (
                    <span className="text-xs text-gf-text-muted">&mdash;</span>
                  )}
                </div>
              </div>

              {/* Chevron Icon Toggle */}
              <div className="shrink-0 pl-2">
                <div className="p-1.5 rounded-lg text-gf-text-muted hover:text-gf-text hover:bg-gf-surface transition-colors">
                  <ChevronDown
                    className={`h-5 w-5 transition-transform duration-200 ${
                      isExpanded ? "rotate-180 text-gf-text" : ""
                    }`}
                  />
                </div>
              </div>
            </div>

            {/* ── Accordion Body (3-Column Layout from Stitch) ──────────── */}
            {isExpanded && (
              <div className="border-t border-gf-border/50">
                {!hasData ? (
                  <EmptyDetail row={row} />
                ) : (
                  <div className="p-6 bg-white grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* ── Column 1: Información Laboral & Alertas ─────── */}
                    <div className="space-y-6">
                      <div>
                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-gf-text-muted mb-3 flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-gf-tertiary" />
                          Información Laboral
                        </h4>
                        <div className="space-y-3">
                          {/* Empleado */}
                          <div className="bg-gf-surface p-3.5 rounded-xl border border-gf-border/60">
                            <h5 className="text-[10px] font-bold text-gf-text-muted uppercase tracking-wider mb-2 flex items-center gap-1">
                              <User className="h-3 w-3 text-gf-text-muted" />
                              Empleado
                            </h5>
                            <dl className="grid grid-cols-1 gap-y-1.5 text-xs">
                              <div className="flex justify-between gap-2">
                                <dt className="text-gf-text-muted">Nombre:</dt>
                                <dd className="font-semibold text-gf-text text-right uppercase break-words">
                                  {row.empleado?.nombre ?? "—"}
                                </dd>
                              </div>
                              <div className="flex justify-between gap-2">
                                <dt className="text-gf-text-muted">RFC:</dt>
                                <dd className="font-mono font-semibold text-gf-text text-right">
                                  {row.empleado?.rfc ?? "—"}
                                </dd>
                              </div>
                            </dl>
                          </div>

                          {/* Empleador */}
                          <div className="bg-gf-surface p-3.5 rounded-xl border border-gf-border/60">
                            <h5 className="text-[10px] font-bold text-gf-text-muted uppercase tracking-wider mb-2 flex items-center gap-1">
                              <Building className="h-3 w-3 text-gf-text-muted" />
                              Empleador
                            </h5>
                            <dl className="grid grid-cols-1 gap-y-1.5 text-xs">
                              <div className="flex justify-between gap-2">
                                <dt className="text-gf-text-muted">Nombre:</dt>
                                <dd className="font-semibold text-gf-text text-right uppercase break-words">
                                  {row.empleador?.nombre ?? "—"}
                                </dd>
                              </div>
                              <div className="flex justify-between gap-2">
                                <dt className="text-gf-text-muted">RFC:</dt>
                                <dd className="font-mono font-semibold text-gf-text text-right">
                                  {row.empleador?.rfc ?? "—"}
                                </dd>
                              </div>
                            </dl>
                          </div>

                          {/* Antigüedad */}
                          <div className="bg-gf-surface p-3.5 rounded-xl border border-gf-border/60">
                            <h5 className="text-[10px] font-bold text-gf-text-muted uppercase tracking-wider mb-2 flex items-center gap-1">
                              <Calendar className="h-3 w-3 text-gf-text-muted" />
                              Antigüedad
                            </h5>
                            <dl className="grid grid-cols-1 gap-y-1.5 text-xs">
                              <div className="flex justify-between gap-2">
                                <dt className="text-gf-text-muted">Ingreso:</dt>
                                <dd className="font-semibold text-gf-text text-right">
                                  {row.employment?.hireDate ?? "—"}
                                </dd>
                              </div>
                              <div className="flex justify-between gap-2">
                                <dt className="text-gf-text-muted">Tiempo:</dt>
                                <dd className="font-semibold text-gf-text text-right">
                                  {row.employment?.seniorityText ?? "—"}
                                </dd>
                              </div>
                              <div className="flex justify-between gap-2">
                                <dt className="text-gf-text-muted">Cotiza IMSS:</dt>
                                <dd className="font-semibold text-gf-text text-right">
                                  {row.employment?.contributesToImss === true
                                    ? "Sí"
                                    : "—"}
                                </dd>
                              </div>
                            </dl>
                          </div>
                        </div>
                      </div>

                      {/* Alertas del recibo */}
                      {row.alertas > 0 && (
                        <div>
                          <h4 className="text-[10px] font-bold uppercase tracking-wider text-gf-text-muted mb-2 flex items-center gap-1.5">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                            Alertas del recibo
                          </h4>
                          <ul className="space-y-2">
                            {row.alertasLista.map((alert, idx) => (
                              <li
                                key={`${alert.code}-${idx}`}
                                className={
                                  alert.severity === "CRITICAL"
                                    ? "rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800 flex items-start gap-2"
                                    : "rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 flex items-start gap-2"
                                }
                              >
                                <span className="font-bold shrink-0 uppercase tracking-wide text-[10px] px-1.5 py-0.5 rounded bg-white/60">
                                  {alert.severity}
                                </span>
                                <span className="leading-snug">{alert.message}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* ── Column 2: Percepciones ───────────────────────── */}
                    <div>
                      <DetailBlock
                        title="PERCEPCIONES"
                        items={row.percepciones}
                      />
                    </div>

                    {/* ── Column 3: Deducciones & Datos Fiscales ─────── */}
                    <div className="space-y-6">
                      <DetailBlock
                        title="DEDUCCIONES"
                        items={row.deduccionesDetalle}
                      />

                      {row.fiscalData && (
                        <div>
                          <h4 className="text-[10px] font-bold uppercase tracking-wider text-gf-text-muted mb-3 flex items-center gap-1.5">
                            <ShieldCheck className="h-3.5 w-3.5 text-gf-tertiary" />
                            Datos Fiscales
                          </h4>
                          <div className="bg-gf-surface p-4 rounded-xl border border-gf-border/60 space-y-3">
                            <div>
                              <dt className="text-[10px] font-bold text-gf-text-muted uppercase tracking-wider mb-1">
                                Folio Fiscal
                              </dt>
                              <dd className="font-mono text-xs bg-white p-2 rounded-lg border border-gf-border break-all text-gf-text">
                                {row.fiscalData.fiscalFolio ?? "—"}
                              </dd>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <dt className="text-gf-text-muted">Certificación:</dt>
                                <dd className="font-semibold text-gf-text mt-0.5">
                                  {row.fiscalData.certificationDate
                                    ? new Date(
                                        row.fiscalData.certificationDate,
                                      ).toLocaleDateString("es-MX")
                                    : "—"}
                                </dd>
                              </div>

                              <div>
                                <dt className="text-gf-text-muted">Timbrado:</dt>
                                <dd className="font-semibold mt-0.5">
                                  {row.fiscalData.isStamped ? (
                                    <span className="inline-flex items-center gap-1 text-emerald-700">
                                      <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Sí
                                    </span>
                                  ) : (
                                    <span className="text-amber-700">
                                      No detectado
                                    </span>
                                  )}
                                </dd>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
