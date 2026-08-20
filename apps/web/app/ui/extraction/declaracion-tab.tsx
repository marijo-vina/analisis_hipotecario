"use client";

import { useState } from "react";
import {
  FileText,
  AlertTriangle,
  CheckCircle2,
  Building2,
  DollarSign,
  TrendingDown,
  TrendingUp,
  Receipt,
  Sparkles,
  Info,
} from "lucide-react";

import type { Document } from "@/app/lib/definitions";
import { parseTaxReturn, formatDateDisplay } from "@/app/lib/extraction";
import Card from "@/app/ui/common/card";
import FieldGrid from "@/app/ui/common/field-grid";
import CopyButton from "@/app/ui/common/copy-button";
import EmptyState from "@/app/ui/common/empty-state";
import DocumentConsultationDrawer from "@/app/ui/documents/document-consultation-drawer";

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

interface DeclaracionTabProps {
  /** Tax return documents. */
  documents: Document[];
}

export default function DeclaracionTab({ documents }: DeclaracionTabProps) {
  const [drawerDoc, setDrawerDoc] = useState<Document | null>(null);

  const processed = documents.filter(
    (d) => d.documentStatus.code === "PROCESSED",
  );

  if (processed.length === 0) {
    return (
      <EmptyState message="No hay Declaraciones Anuales procesadas aún. Cuando se procese la Declaración Anual del SAT, sus datos fiscales extraídos aparecerán aquí." />
    );
  }

  return (
    <div className="space-y-6">
      {processed.map((doc) => {
        const parsed = parseTaxReturn(doc);
        if (!parsed) return null;

        const {
          satReceipt,
          taxPayment,
          fiscalResult,
          declaredRegimes,
          salariedIncome,
          businessOrProfessionalIncome,
          resicoIncome,
          isValidTaxYear,
          hasTaxLoss,
          isMixedDeclaration,
          alerts,
        } = parsed;

        return (
          <div key={doc.id} className="space-y-6">
            {/* ── Top Header Card with Actions ── */}
            <div className="bg-white border border-gf-border rounded-xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-purple-50 text-purple-700 border border-purple-100">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gf-text">
                    Declaración Anual de Impuestos (SAT)
                  </h3>
                  <p className="text-xs text-gf-text-muted">
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

            {/* ── Knockout Critical Banner for Pérdida Fiscal ── */}
            {hasTaxLoss && (
              <div className="p-4 rounded-xl border border-red-300 bg-red-50 text-red-900 flex items-start gap-3 shadow-xs">
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-bold text-red-800">
                    KNOCKOUT FISCAL: Registro de Pérdida Fiscal en el Ejercicio
                  </p>
                  <p className="text-xs text-red-700 leading-relaxed">
                    El documento registra pérdida fiscal en el ejercicio. De acuerdo con las políticas bancarias, este soporte fiscal carece de viabilidad para comprobar solvencia y se activa descarte automático del camino fiscal, requiriendo respaldar el 100% de la comprobación a través de Estados de Cuenta Bancarios.
                  </p>
                </div>
              </div>
            )}

            {/* ── Alerts Banner ── */}
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
              {/* Acuse de Recibo Oficial SAT */}
              <Card>
                <div className="flex items-center justify-between border-b border-gf-border/50 pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-gf-surface-dim text-gf-text">
                      <Receipt className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-gf-text">Acuse de Recibo Oficial SAT</h4>
                      <p className="text-[11px] text-gf-text-muted">Metadatos de presentación fiscal</p>
                    </div>
                  </div>

                  {isValidTaxYear ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      Ejercicio Vigente ({satReceipt.taxYear})
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                      <AlertTriangle className="w-3 h-3 text-amber-600" />
                      Ejercicio Obsoleto ({satReceipt.taxYear})
                    </span>
                  )}
                </div>

                <FieldGrid
                  fields={[
                    {
                      label: "RFC del contribuyente",
                      value: satReceipt.rfc ?? undefined,
                      missing: !satReceipt.rfc,
                      action: satReceipt.rfc ? <CopyButton value={satReceipt.rfc} /> : undefined,
                    },
                    {
                      label: "Nombre en declaración",
                      value: satReceipt.taxpayerName ?? undefined,
                      missing: !satReceipt.taxpayerName,
                    },
                    {
                      label: "Número de operación",
                      value: satReceipt.operationNumber ?? undefined,
                      missing: !satReceipt.operationNumber,
                      action: satReceipt.operationNumber ? <CopyButton value={satReceipt.operationNumber} /> : undefined,
                    },
                    {
                      label: "Tipo de declaración",
                      value: satReceipt.declarationType ?? undefined,
                      missing: !satReceipt.declarationType,
                    },
                    {
                      label: "Fecha de presentación",
                      value: formatDateDisplay(satReceipt.presentationDate) ?? undefined,
                      missing: !satReceipt.presentationDate,
                    },
                  ]}
                />
              </Card>

              {/* Resultado Fiscal */}
              <Card>
                <div className="flex items-center gap-2 border-b border-gf-border/50 pb-3 mb-4">
                  <div className="p-2 rounded-lg bg-gf-surface-dim text-gf-text">
                    <DollarSign className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gf-text">Resultado Fiscal</h4>
                    <p className="text-[11px] text-gf-text-muted">Cifras globales anuales</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="p-3.5 rounded-xl border border-gf-border/60 bg-gf-surface-dim/40 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold text-gf-text-muted uppercase tracking-wider">
                        Total de ingresos acumulables / efectivamente percibidos
                      </p>
                      <p className="text-lg font-bold text-gf-text mt-0.5">
                        {fiscalResult.accumulableIncomeTotal != null
                          ? formatCurrency(fiscalResult.accumulableIncomeTotal)
                          : "No detectado"}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/50">
                      <div className="flex items-center gap-1.5 text-emerald-700">
                        <TrendingUp className="w-4 h-4" />
                        <p className="text-[10px] font-bold uppercase tracking-wider">Utilidad Fiscal</p>
                      </div>
                      <p className="text-sm font-bold text-emerald-900 mt-1">
                        {fiscalResult.fiscalProfit != null
                          ? formatCurrency(fiscalResult.fiscalProfit)
                          : "—"}
                      </p>
                    </div>

                    <div className={`p-3 rounded-xl border ${hasTaxLoss ? "border-red-300 bg-red-50" : "border-gf-border/60 bg-gf-surface-dim/40"}`}>
                      <div className={`flex items-center gap-1.5 ${hasTaxLoss ? "text-red-700" : "text-gf-text-muted"}`}>
                        <TrendingDown className="w-4 h-4" />
                        <p className="text-[10px] font-bold uppercase tracking-wider">Pérdida Fiscal</p>
                      </div>
                      <p className={`text-sm font-bold mt-1 ${hasTaxLoss ? "text-red-900" : "text-gf-text"}`}>
                        {fiscalResult.fiscalLoss != null && fiscalResult.fiscalLoss > 0
                          ? formatCurrency(fiscalResult.fiscalLoss)
                          : "$0.00"}
                      </p>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Desglose por Régimen */}
              <Card className="lg:col-span-2">
                <div className="flex items-center justify-between border-b border-gf-border/50 pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-blue-50 text-blue-700">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-gf-text">Desglose de Ingresos por Régimen</h4>
                      <p className="text-[11px] text-gf-text-muted">Cifras declaradas por actividad</p>
                    </div>
                  </div>

                  {isMixedDeclaration && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                      <Sparkles className="w-3 h-3 text-indigo-600" />
                      Declaración Mixta
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* RESICO */}
                  {resicoIncome && (
                    <div className="p-4 rounded-xl border border-gf-border bg-white space-y-2">
                      <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                        RESICO
                      </span>
                      <p className="text-xs font-semibold text-gf-text-muted">Ingresos efectivamente cobrados</p>
                      <p className="text-base font-bold text-gf-text">
                        {resicoIncome.totalEffectiveIncome != null ? formatCurrency(resicoIncome.totalEffectiveIncome) : "—"}
                      </p>
                    </div>
                  )}

                  {/* Actividad Empresarial / Honorarios */}
                  {businessOrProfessionalIncome && (
                    <div className="p-4 rounded-xl border border-gf-border bg-white space-y-2">
                      <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        Act. Empresarial / Honorarios
                      </span>
                      <p className="text-xs font-semibold text-gf-text-muted">Total de ingresos percibidos</p>
                      <p className="text-base font-bold text-gf-text">
                        {businessOrProfessionalIncome.totalIncome != null ? formatCurrency(businessOrProfessionalIncome.totalIncome) : "—"}
                      </p>
                      {businessOrProfessionalIncome.taxWithheld != null && (
                        <p className="text-[11px] text-gf-text-muted">
                          Retenciones ISR: {formatCurrency(businessOrProfessionalIncome.taxWithheld)}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Sueldos y Salarios */}
                  {salariedIncome && (
                    <div className="p-4 rounded-xl border border-gf-border bg-white space-y-2">
                      <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        Sueldos y Salarios
                      </span>
                      <p className="text-xs font-semibold text-gf-text-muted">Ingreso anual bruto</p>
                      <p className="text-base font-bold text-gf-text">
                        {salariedIncome.annualGrossIncome != null ? formatCurrency(salariedIncome.annualGrossIncome) : "—"}
                      </p>
                      {salariedIncome.exemptIncome != null && (
                        <p className="text-[11px] text-gf-text-muted">
                          Exento: {formatCurrency(salariedIncome.exemptIncome)}
                        </p>
                      )}
                    </div>
                  )}
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
