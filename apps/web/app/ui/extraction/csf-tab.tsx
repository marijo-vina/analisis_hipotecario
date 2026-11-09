"use client";

import { useState } from "react";
import {
  FileText,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Building2,
  MapPin,
  Clock,
  Sparkles,
  Info,
} from "lucide-react";

import type { Document } from "@/app/lib/definitions";
import { parseCsf, formatDateDisplay } from "@/app/lib/extraction";
import Card from "@/app/ui/common/card";
import FieldGrid from "@/app/ui/common/field-grid";
import CopyButton from "@/app/ui/common/copy-button";
import EmptyState from "@/app/ui/common/empty-state";
import DocumentConsultationDrawer from "@/app/ui/documents/document-consultation-drawer";
import ExtractionOwnerSwitch, {
  type ExtractionOwner,
} from "@/app/ui/extraction/extraction-owner-switch";

interface CsfTabProps {
  /** CSF documents. */
  documents: Document[];
  /** Persona moral keeps one constancia on screen at a time. */
  showOwnerSwitch?: boolean;
}

function formatTenure(months: number | null): string {
  if (months == null) return "No calculado";
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  if (years > 0 && remMonths > 0) {
    return `${years} años y ${remMonths} meses`;
  }
  if (years > 0) {
    return `${years} ${years === 1 ? "año" : "años"}`;
  }
  return `${remMonths} ${remMonths === 1 ? "mes" : "meses"}`;
}

export default function CsfTab({
  documents,
  showOwnerSwitch = false,
}: CsfTabProps) {
  const [drawerDoc, setDrawerDoc] = useState<Document | null>(null);
  const [owner, setOwner] = useState<ExtractionOwner>("COMPANY");

  const visible = showOwnerSwitch
    ? documents.filter((doc) => doc.owner === owner)
    : documents;
  const processed = visible.filter(
    (d) => d.documentStatus.code === "PROCESSED",
  );
  const emptyMessage = showOwnerSwitch
    ? owner === "COMPANY"
      ? "No hay constancia procesada de la persona moral. Cuando se procese la de la empresa, su lectura aparece aquí."
      : "No hay constancia procesada del accionista. Cuando se procese la de la persona física, su lectura aparece aquí."
    : "No hay Constancias de Situación Fiscal procesadas aún. Cuando se procese la CSF, sus datos fiscales extraídos aparecerán aquí.";

  return (
    <div className="space-y-6">
      {showOwnerSwitch && (
        <ExtractionOwnerSwitch owner={owner} onChange={setOwner} />
      )}
      {processed.length === 0 ? (
        <EmptyState message={emptyMessage} />
      ) : processed.map((doc) => {
        const parsed = parseCsf(doc);
        if (!parsed) return null;

        const { taxpayer, issuance, fiscalAddress, activities, regimes, tenureMonths, activityStartDate, hasSalariedRegime, hasIndependentRegime, alerts } = parsed;
        const isOlderThan3Months = issuance.isOlderThan3Months;

        return (
          <div key={doc.id} className="space-y-6">
            {/* ── Top Header Card with Actions ── */}
            <div className="bg-white border border-gf-border rounded-xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-100">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gf-text">
                    Constancia de Situación Fiscal (SAT)
                  </h3>
                  <p className="text-xs text-gf-text-muted">
                    {doc.owner === "COMPANY"
                      ? "Empresa"
                      : doc.owner === "SHAREHOLDER"
                        ? "Accionista"
                        : null}
                    {doc.owner === "COMPANY" || doc.owner === "SHAREHOLDER"
                      ? " · "
                      : null}
                    Archivo: <span className="font-semibold text-gf-text">{doc.originalName}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDrawerDoc(doc)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gf-text border border-gf-border rounded-lg hover:bg-gf-surface-dim transition-all cursor-pointer shadow-2xs"
                >
                  <FileText className="w-3.5 h-3.5 text-gf-text-muted" />
                  <span>Ver documento</span>
                </button>
              </div>
            </div>

            {/* ── Alerts Banner for CSF ── */}
            {alerts.length > 0 && (
              <div className="space-y-2">
                {alerts.map((a, idx) => (
                  <div
                    key={idx}
                    className={`p-3.5 rounded-xl border flex items-start gap-3 text-xs leading-relaxed ${
                      a.severity === "CRITICAL"
                        ? "bg-red-50 border-red-200 text-red-800"
                        : a.severity === "WARNING"
                          ? "bg-amber-50 border-amber-200 text-amber-800"
                          : "bg-blue-50 border-blue-200 text-blue-800"
                    }`}
                  >
                    {a.severity === "CRITICAL" ? (
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    ) : a.severity === "WARNING" ? (
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    ) : (
                      <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <p className="font-semibold">{a.code.replace(/_/g, " ")}</p>
                      <p className="mt-0.5">{a.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── 2-Column Bento Grid ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Contribuyente & Identificación */}
              <Card>
                <div className="flex items-center gap-2 border-b border-gf-border/50 pb-3 mb-4">
                  <div className="p-2 rounded-lg bg-gf-surface-dim text-gf-text">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gf-text">Datos del Contribuyente</h4>
                    <p className="text-[11px] text-gf-text-muted">Cédula de identificación fiscal</p>
                  </div>
                </div>

                <FieldGrid
                  fields={[
                    {
                      label: "Nombre completo",
                      value: taxpayer.fullName ?? undefined,
                      missing: !taxpayer.fullName,
                    },
                    {
                      label: "RFC",
                      value: taxpayer.rfc ?? undefined,
                      missing: !taxpayer.rfc,
                      action: taxpayer.rfc ? <CopyButton value={taxpayer.rfc} /> : undefined,
                    },
                    {
                      label: "CURP",
                      value: taxpayer.curp ?? undefined,
                      missing: !taxpayer.curp,
                      action: taxpayer.curp ? <CopyButton value={taxpayer.curp} /> : undefined,
                    },
                    {
                      label: "Estatus en el padrón",
                      value: taxpayer.statusInPadron ?? undefined,
                      missing: !taxpayer.statusInPadron,
                    },
                    {
                      label: "Inicio de operaciones general",
                      value: formatDateDisplay(taxpayer.operationsStartDate) ?? undefined,
                      missing: !taxpayer.operationsStartDate,
                    },
                  ]}
                />
              </Card>

              {/* Vigencia y Arraigo Bancario */}
              <Card>
                <div className="flex items-center gap-2 border-b border-gf-border/50 pb-3 mb-4">
                  <div className="p-2 rounded-lg bg-gf-surface-dim text-gf-text">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gf-text">Vigencia y Arraigo</h4>
                    <p className="text-[11px] text-gf-text-muted">Validaciones operativas bancarias</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="p-3.5 rounded-xl border border-gf-border/60 bg-gf-surface-dim/40 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold text-gf-text-muted uppercase tracking-wider">
                        Fecha de emisión de la constancia
                      </p>
                      <p className="text-sm font-bold text-gf-text mt-0.5">
                        {formatDateDisplay(issuance.issuanceDate) ?? issuance.issuanceDateRaw ?? "No detectada"}
                      </p>
                      {issuance.issuanceLocation && (
                        <p className="text-[11px] text-gf-text-muted mt-0.5">{issuance.issuanceLocation}</p>
                      )}
                    </div>
                    <div>
                      {isOlderThan3Months ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <AlertTriangle className="w-3 h-3 text-amber-600" />
                          Antigüedad &gt; 3 meses
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Vigente (&le; 3 meses)
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl border border-gf-border/60 bg-gf-surface-dim/40 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold text-gf-text-muted uppercase tracking-wider">
                        Arraigo en la actividad independiente
                      </p>
                      <p className="text-sm font-bold text-gf-text mt-0.5">
                        {formatTenure(tenureMonths)}
                      </p>
                      {activityStartDate && (
                        <p className="text-[11px] text-gf-text-muted mt-0.5">
                          Inicio de actividad: <span className="font-semibold">{formatDateDisplay(activityStartDate)}</span>
                        </p>
                      )}
                    </div>
                    <div>
                      {tenureMonths != null && tenureMonths >= 24 ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Arraigo &ge; 2 años
                        </span>
                      ) : tenureMonths != null && tenureMonths >= 12 ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          <Info className="w-3 h-3 text-blue-600" />
                          Válido Banorte (&ge; 1 año)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <AlertTriangle className="w-3 h-3 text-amber-600" />
                          Arraigo &lt; 2 años
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Card>

              {/* Regímenes Fiscales */}
              <Card>
                <div className="flex items-center justify-between border-b border-gf-border/50 pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-purple-50 text-purple-700">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-gf-text">Regímenes Fiscales</h4>
                      <p className="text-[11px] text-gf-text-muted">Régimen registrado en el SAT</p>
                    </div>
                  </div>

                  {hasSalariedRegime && hasIndependentRegime && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                      <Sparkles className="w-3 h-3 text-indigo-600" />
                      Perfil Mixto Detectado
                    </span>
                  )}
                </div>

                <div className="space-y-3">
                  {regimes.map((r, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-xl border border-gf-border/70 bg-white hover:border-gf-border transition-all flex flex-col justify-between gap-2"
                    >
                      <p className="text-xs font-bold text-gf-text leading-snug">{r.description}</p>
                      <div className="flex items-center justify-between text-[11px] text-gf-text-muted">
                        <span>Inicio: {formatDateDisplay(r.startDate) ?? "—"}</span>
                        <span>{r.endDate ? `Fin: ${formatDateDisplay(r.endDate)}` : "Activo"}</span>
                      </div>
                    </div>
                  ))}
                  {regimes.length === 0 && (
                    <p className="text-xs text-gf-text-muted italic">No se detectaron regímenes en el OCR.</p>
                  )}
                </div>
              </Card>

              {/* Actividades Económicas */}
              <Card>
                <div className="flex items-center gap-2 border-b border-gf-border/50 pb-3 mb-4">
                  <div className="p-2 rounded-lg bg-gf-surface-dim text-gf-text">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gf-text">Actividades Económicas</h4>
                    <p className="text-[11px] text-gf-text-muted">Desglose de actividad y porcentaje de ingresos</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {activities.map((a, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-xl border border-gf-border/70 bg-white hover:border-gf-border transition-all flex items-start justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-gf-text leading-snug">{a.description}</p>
                        <p className="text-[11px] text-gf-text-muted">
                          Inicio: <span className="font-semibold">{formatDateDisplay(a.startDate) ?? "—"}</span>
                        </p>
                      </div>
                      {a.percentage != null && (
                        <span className="shrink-0 inline-flex px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          {a.percentage}%
                        </span>
                      )}
                    </div>
                  ))}
                  {activities.length === 0 && (
                    <p className="text-xs text-gf-text-muted italic">No se detectaron actividades económicas.</p>
                  )}
                </div>
              </Card>

              {/* Domicilio Fiscal (Ubicado al final) */}
              <Card className="lg:col-span-2">
                <div className="flex items-center gap-2 border-b border-gf-border/50 pb-3 mb-4">
                  <div className="p-2 rounded-lg bg-gf-surface-dim text-gf-text">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gf-text">Domicilio Fiscal Registrado</h4>
                    <p className="text-[11px] text-gf-text-muted">Ubicación oficial del contribuyente</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-[10px] font-bold text-gf-text-muted uppercase tracking-wider">Código Postal</p>
                    <p className="text-xs font-semibold text-gf-text mt-0.5">{fiscalAddress.postalCode ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gf-text-muted uppercase tracking-wider">Vialidad y Número</p>
                    <p className="text-xs font-semibold text-gf-text mt-0.5">{fiscalAddress.street ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gf-text-muted uppercase tracking-wider">Colonia / Fraccionamiento</p>
                    <p className="text-xs font-semibold text-gf-text mt-0.5">{fiscalAddress.neighborhood ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gf-text-muted uppercase tracking-wider">Municipio y Estado</p>
                    <p className="text-xs font-semibold text-gf-text mt-0.5">
                      {[fiscalAddress.municipality, fiscalAddress.state].filter(Boolean).join(", ") || "—"}
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        );
      })}

      <DocumentConsultationDrawer
        document={drawerDoc}
        onClose={() => setDrawerDoc(null)}
      />
    </div>
  );
}
