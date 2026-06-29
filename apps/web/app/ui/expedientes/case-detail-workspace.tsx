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

      {/* ── Card resumen compacto ───────────────────────────────────────── */}
      <Card className="mb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5 min-w-0">
            {/* Cliente (clickeable → client drawer) */}
            <div className="text-sm">
              <span className="text-gf-text-muted">Cliente: </span>
              {client ? (
                <button
                  type="button"
                  onClick={() => setClientDrawerOpen(true)}
                  className="font-medium text-gf-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gf-red/40 rounded-[var(--radius-sm)]"
                >
                  {client.fullName}
                </button>
              ) : (
                <span className="text-gf-text-muted italic">
                  No disponible
                </span>
              )}
            </div>

            {/* Resumen en línea: tipo persona · tipo crédito · monto */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gf-text">
              <span>{personTypeLabel(caseData.personType)}</span>
              <span className="text-gf-text-soft select-none">·</span>
              <span>{caseData.creditType?.name ?? "—"}</span>
              <span className="text-gf-text-soft select-none">·</span>
              <span>
                <span className="text-gf-text-muted">Monto solicitado: </span>
                {formatCurrency(caseData.requestedAmount)}
              </span>
            </div>
          </div>

          {/* Ver expediente → case detail drawer */}
          <div className="shrink-0">
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

      {/* ── Observaciones ──────────────────────────────────────────────── */}
      <div className="mb-6">
        <ObservationsEditor caseId={caseId} initialNotes={caseData.notes ?? null} />
      </div>

      {/* ── Documentos por categoría ───────────────────────────────────── */}
      <div id="documentos" className="mb-6">
        <h2 className="text-lg font-semibold text-gf-text mb-4">
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
      <ExtractionSection documents={documents} />

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
