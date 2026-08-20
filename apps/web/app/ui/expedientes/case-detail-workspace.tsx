"use client";

import { useState } from "react";
import { Eye, ExternalLink, RotateCw, User, FolderOpen, CreditCard, Building, Sparkles, Loader2 } from "lucide-react";
import type { Client, Document, DocumentType } from "@/app/lib/definitions";
import CaseDetailHeader from "@/app/ui/expedientes/case-detail-header";
import ObservationsEditor from "@/app/ui/expedientes/observations-editor";
import ClientDrawer from "@/app/ui/expedientes/client-drawer";
import CaseDetailDrawer from "@/app/ui/expedientes/case-detail-drawer";
import DocumentBrowser from "@/app/ui/documents/document-browser";
import ExtractionSection from "@/app/ui/extraction/extraction-section";
import AnalysisSection from "@/app/ui/expedientes/analysis-section";


interface CaseSummaryData {
  id: string;
  requestedAmount?: number;
  personType?: string;
  creditType?: { name: string };
  notes?: string | null;
  propertyLocation?: string;
  propertyValue?: number;
  estimatedTermMonths?: number;
  createdAt: string;
  updatedAt: string;
}

interface CaseDetailWorkspaceProps {
  caseId: string;
  statusCode: string;
  statusName: string;
  client: Client | null;
  caseData: CaseSummaryData;
  documents: Document[];
  documentTypes: DocumentType[];
}

const PERSON_TYPE_LABELS: Record<string, string> = {
  SALARIED: "Asalariado",
  NON_SALARIED: "No asalariado",
  PFAE: "Persona Física con Actividad Empresarial (PFAE)",
  MORAL: "Persona Moral",
};

function personTypeLabel(code?: string): string {
  if (!code) return "—";
  return PERSON_TYPE_LABELS[code] ?? code;
}

function formatCurrency(amount?: number): string {
  if (amount == null || amount === 0) return "—";
  return `$${Number(amount).toLocaleString("es-MX")}`;
}

function formatTermInYears(months?: number): string {
  if (!months) return "—";
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  if (remMonths === 0) return `${years} años`;
  return `${years} años (${months} meses)`;
}

export default function CaseDetailWorkspace({
  caseId,
  statusCode,
  statusName,
  client,
  caseData,
  documents,
  documentTypes,
}: CaseDetailWorkspaceProps) {
  const [clientDrawerOpen, setClientDrawerOpen] = useState(false);
  const [caseDrawerOpen, setCaseDrawerOpen] = useState(false);
  const [isDocsCollapsed, setIsDocsCollapsed] = useState(false);

  return (
    <div className="flex flex-col w-full min-h-[calc(100vh-5rem)] relative">
      {/* ── Top Header Bar ─────────────────────────────────────────────── */}
      <CaseDetailHeader
        caseId={caseId}
        statusCode={statusCode}
        statusName={statusName}
      />

      {/* ── Main Workspace Body (2-Column Layout with Collapsible Sidebar) ── */}
      <div className="flex flex-col xl:flex-row gap-6 flex-1 items-start">
        {/* ── Left Column: Collapsible Document Sidebar ──────────────── */}
        <DocumentBrowser
          caseId={caseId}
          documents={documents}
          documentTypes={documentTypes}
          isCollapsed={isDocsCollapsed}
          onToggleCollapse={() => setIsDocsCollapsed(!isDocsCollapsed)}
          personType={caseData.personType}
        />

        {/* ── Right Main Content Area ─────────────────────────────────── */}
        <div className="flex-1 min-w-0 w-full space-y-6">
          {/* ── Top Info Cards Section (12 Grid Columns) ─────────────── */}
          <section className="grid grid-cols-12 gap-6">
            {/* Client Details Bento Card (8 Cols) */}
            <div className="col-span-12 lg:col-span-8 bg-white border border-gf-border rounded-xl p-6 shadow-xs flex flex-col justify-between">
              <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                <div className="space-y-4 flex-1">
                  <div>
                    <p className="text-[10px] font-bold text-gf-text-muted uppercase tracking-wider">
                      Cliente
                    </p>
                    {client ? (
                      <button
                        type="button"
                        onClick={() => setClientDrawerOpen(true)}
                        className="text-base font-bold text-gf-text hover:text-gf-red transition-colors text-left flex items-center gap-1.5 mt-0.5 group"
                      >
                        <span>{client.fullName}</span>
                        <ExternalLink className="w-3.5 h-3.5 text-gf-text-muted group-hover:text-gf-red transition-colors" />
                      </button>
                    ) : (
                      <p className="text-sm font-medium text-gf-text-muted italic">
                        Cliente no disponible
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-gf-border/50">
                    <div>
                      <p className="text-[10px] font-bold text-gf-text-muted uppercase tracking-wider">
                        Tipo de persona
                      </p>
                      <p className="text-xs font-semibold text-gf-text mt-0.5">
                        {personTypeLabel(caseData.personType)}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] font-bold text-gf-text-muted uppercase tracking-wider">
                        Objetivo del crédito
                      </p>
                      <p className="text-xs font-semibold text-gf-text mt-0.5">
                        {caseData.creditType?.name ?? "—"}
                      </p>
                    </div>

                    {caseData.propertyValue ? (
                      <div>
                        <p className="text-[10px] font-bold text-gf-text-muted uppercase tracking-wider">
                          Valor del inmueble
                        </p>
                        <p className="text-xs font-semibold text-gf-text mt-0.5">
                          {formatCurrency(caseData.propertyValue)}
                        </p>
                      </div>
                    ) : null}

                    {caseData.estimatedTermMonths ? (
                      <div>
                        <p className="text-[10px] font-bold text-gf-text-muted uppercase tracking-wider">
                          Plazo estimado
                        </p>
                        <p className="text-xs font-semibold text-gf-text mt-0.5">
                          {formatTermInYears(caseData.estimatedTermMonths)}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="text-right flex flex-col justify-between items-end shrink-0 sm:self-stretch">
                  <div>
                    <p className="text-[10px] font-bold text-gf-text-muted uppercase tracking-wider">
                      Valor del Inmueble
                    </p>
                    <p className="text-xl font-bold text-gf-text mt-0.5">
                      {formatCurrency(caseData.propertyValue)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 mt-4">
                    <button
                      type="button"
                      onClick={() => setCaseDrawerOpen(true)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-gf-text border border-gf-border rounded-xl px-3 py-2 hover:bg-gf-surface-dim transition-all shadow-2xs cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5 text-gf-text-muted" />
                      <span>Ver expediente</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Observations Bento Card (4 Cols) */}
            <div className="col-span-12 lg:col-span-4 bg-white border border-gf-border rounded-xl p-6 shadow-xs flex flex-col">
              <ObservationsEditor caseId={caseId} initialNotes={caseData.notes ?? null} />
            </div>
          </section>

          {/* ── Extracted Data Section ─────────────────────────────── */}
          <ExtractionSection
            documents={documents}
            caseId={caseId}
            personType={caseData.personType}
          />

          {/* ── Analysis Section (Sprint 3) ────────────────────────── */}
          <AnalysisSection caseId={caseId} statusCode={statusCode} documents={documents} />
        </div>
      </div>

      {/* ── Drawers (Controlados por `open`) ──────────────────────────── */}
      <ClientDrawer
        open={clientDrawerOpen}
        onClose={() => setClientDrawerOpen(false)}
        client={
          client
            ? {
                fullName: client.fullName,
                rfc: client.rfc ?? "",
                curp: client.curp,
                email: client.email,
                phone: client.phone,
                personType: caseData.personType,
              }
            : null
        }
      />

      <CaseDetailDrawer
        open={caseDrawerOpen}
        onClose={() => setCaseDrawerOpen(false)}
        caseData={{
          id: caseData.id,
          requestedAmount: caseData.requestedAmount,
          propertyLocation: caseData.propertyLocation,
          propertyValue: caseData.propertyValue,
          estimatedTermMonths: caseData.estimatedTermMonths,
          creditType: caseData.creditType,
          personType: caseData.personType,
          status: { name: statusName },
          notes: caseData.notes ?? undefined,
          createdAt: caseData.createdAt,
          updatedAt: caseData.updatedAt,
        }}
      />
    </div>
  );
}

