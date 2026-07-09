"use client";

import { useState } from "react";

import type { Client, Document, DocumentType } from "@/app/lib/definitions";
import Card from "@/app/ui/common/card";
import Button from "@/app/ui/common/button";
import CaseDetailHeader from "@/app/ui/expedientes/case-detail-header";
import ObservationsEditor from "@/app/ui/expedientes/observations-editor";
import ClientDrawer from "@/app/ui/expedientes/client-drawer";
import CaseDetailDrawer from "@/app/ui/expedientes/case-detail-drawer";
import DocumentBrowser from "@/app/ui/documents/document-browser";
import ExtractionSection from "@/app/ui/extraction/extraction-section";
import AnalysisSection from "@/app/ui/expedientes/analysis-section";

// ── Tipos locales ──────────────────────────────────────────────────────────

interface CaseStatusLite {
  code: string;
  name: string;
}

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
  statuses: CaseStatusLite[];
  client: Client | null;
  caseData: CaseSummaryData;
  documents: Document[];
  documentTypes: DocumentType[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const PERSON_TYPE_LABELS: Record<string, string> = {
  SALARIED: "Asalariado",
};

function personTypeLabel(code?: string): string {
  if (!code) return "—";
  return PERSON_TYPE_LABELS[code] ?? code;
}

function formatCurrency(amount?: number): string {
  if (amount == null) return "—";
  return `$${Number(amount).toLocaleString("es-MX")}`;
}

/**
 * CaseDetailWorkspace — orquestador client del detalle de expediente.
 *
 * Compone verticalmente el header compacto, un card de resumen en línea
 * (cliente clickeable + tipo persona · tipo crédito · monto solicitado),
 * el editor de observaciones, el navegador de documentos por categoría y
 * la sección de datos extraídos. Gestiona con `useState` la apertura de
 * dos drawers: información del cliente y detalle completo del expediente.
 *
 * Los drawers se montan siempre y se controlan mediante la prop `open`
 * (el componente Drawer renderiza `null` cuando está cerrado), de modo que
 * las animaciones de entrada/salida y el focus trap funcionen correctamente.
 */
export default function CaseDetailWorkspace({
  caseId,
  statusCode,
  statusName,
  statuses,
  client,
  caseData,
  documents,
  documentTypes,
}: CaseDetailWorkspaceProps) {
  const [clientDrawerOpen, setClientDrawerOpen] = useState(false);
  const [caseDrawerOpen, setCaseDrawerOpen] = useState(false);

  return (
    <div>
      {/* ── Header compacto ─────────────────────────────────────────────── */}
      <CaseDetailHeader
        caseId={caseId}
        statusCode={statusCode}
        statusName={statusName}
        statuses={statuses}
      />

      {/* ── Resumen + Observaciones (2 columnas) ────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* Columna izquierda (2/3): Card resumen */}
        <Card className="lg:col-span-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Col 1: Cliente */}
            <div>
              <p className="text-xs text-gf-text-muted uppercase tracking-wide">
                Cliente
              </p>
              {client ? (
                <button
                  type="button"
                  onClick={() => setClientDrawerOpen(true)}
                  className="text-sm font-medium text-gf-text hover:text-gf-red transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gf-red/40 rounded-[var(--radius-sm)]"
                >
                  {client.fullName}
                </button>
              ) : (
                <p className="text-sm font-medium text-gf-text-muted italic">
                  No disponible
                </p>
              )}
            </div>

            {/* Col 2: Tipo persona + Tipo crédito */}
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gf-text-muted uppercase tracking-wide">
                  Tipo persona
                </p>
                <p className="text-sm font-medium text-gf-text">
                  {personTypeLabel(caseData.personType)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gf-text-muted uppercase tracking-wide">
                  Tipo crédito
                </p>
                <p className="text-sm font-medium text-gf-text">
                  {caseData.creditType?.name ?? "—"}
                </p>
              </div>
            </div>

            {/* Col 3: Monto + Ver expediente */}
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gf-text-muted uppercase tracking-wide">
                  Monto solicitado
                </p>
                <p className="text-sm font-medium text-gf-text">
                  {formatCurrency(caseData.requestedAmount)}
                </p>
              </div>
              <Button
                variant="secondary"
                type="button"
                onClick={() => setCaseDrawerOpen(true)}
              >
                Ver expediente
              </Button>
            </div>
          </div>
        </Card>

        {/* Columna derecha (1/3): Observaciones */}
        <ObservationsEditor caseId={caseId} initialNotes={caseData.notes ?? null} />
      </div>

      {/* ── Documentos por categoría ───────────────────────────────────── */}
      <div id="documentos" className="mb-4">
        <h2 className="text-base font-semibold text-gf-text mb-3">
          Documentos
          {documents.length > 0 && (
            <span className="text-gf-text-muted font-normal ml-1">
              ({documents.length})
            </span>
          )}
        </h2>
        <DocumentBrowser
          caseId={caseId}
          documents={documents}
          documentTypes={documentTypes}
        />
      </div>

      {/* ── Datos extraídos ────────────────────────────────────────────── */}
      <ExtractionSection documents={documents} caseId={caseId} />

      {/* ── Análisis del expediente (Sprint 3) ──────────────────────────── */}
      <AnalysisSection caseId={caseId} statusCode={statusCode} />

      {/* ── Drawers (siempre montados, controlados por `open`) ──────────── */}
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
