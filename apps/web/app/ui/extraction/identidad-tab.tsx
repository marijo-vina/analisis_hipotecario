"use client";

import { useState } from "react";
import { ShieldCheck, ExternalLink, AlertTriangle } from "lucide-react";

import type { Document } from "@/app/lib/definitions";
import { parseIdentity } from "@/app/lib/extraction";
import Card from "@/app/ui/common/card";
import FieldGrid from "@/app/ui/common/field-grid";
import CopyButton from "@/app/ui/common/copy-button";
import EmptyState from "@/app/ui/common/empty-state";
import ExtractionDocumentCard from "@/app/ui/extraction/extraction-document-card";
import DocumentConsultationDrawer from "@/app/ui/documents/document-consultation-drawer";

interface IdentidadTabProps {
  /** Identity-category documents (INE / PASSPORT). */
  documents: Document[];
}

/**
 * IdentidadTab — renders one ExtractionDocumentCard per processed identity
 * document plus a manual validation card (CIC + Identificador del ciudadano,
 * each with a CopyButton) for INE docs, and hosts the consultation drawer.
 *
 * Manual correction is visual-only and lives inside each card; nothing here
 * touches the database.
 */
export default function IdentidadTab({ documents }: IdentidadTabProps) {
  const [drawerDoc, setDrawerDoc] = useState<Document | null>(null);

  const processed = documents.filter(
    (d) => d.documentStatus.code === "PROCESSED",
  );

  if (processed.length === 0) {
    return (
      <EmptyState message="No hay documentos de identidad procesados aún. Cuando se procesen uno o más documentos, sus datos extraídos aparecerán aquí." />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {processed.map((doc) => {
          const parsed = parseIdentity(doc);
          if (!parsed) return null;
          return (
            <ExtractionDocumentCard
              key={doc.id}
              document={doc}
              category="identidad"
              fields={parsed.fields}
              alerts={parsed.alerts}
              defaultExpanded={true}
              isExpired={parsed.isExpired}
              onValidate={setDrawerDoc}
              manualCorrections={parsed.manualCorrections}
            />
          );
        })}

        {/* Manual validation card — one per INE doc that has ineValidation. */}
        {processed
          .filter((doc) => {
            const parsed = parseIdentity(doc);
            return (
              parsed?.idType === "INE" && parsed.ineValidation != null
            );
          })
          .map((doc) => {
            const parsed = parseIdentity(doc)!;
            const iv = parsed.ineValidation!;
            const hasCic = !!iv.cic && iv.cic.trim() !== "";
            const hasCitizenId =
              !!iv.citizenIdentifier && iv.citizenIdentifier.trim() !== "";
            return (
              <Card key={`${doc.id}-manual`}>
                <div className="flex items-center gap-2 border-b border-gf-border/50 pb-3 mb-4">
                  <div className="p-2 rounded-lg bg-tertiary-container/60 text-gf-tertiary">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-gf-text">
                      Datos para validación manual INE
                    </h3>
                    <p className="text-xs text-gf-text-muted mt-0.5">
                      Copia estos datos para validarlos en la Lista Nominal del INE.
                    </p>
                  </div>
                </div>

                <FieldGrid
                  fields={[
                    {
                      label: "CIC",
                      value: hasCic ? iv.cic : undefined,
                      missing: !hasCic,
                      action: (
                        <CopyButton
                          value={hasCic ? iv.cic! : ""}
                          disabled={!hasCic}
                        />
                      ),
                    },
                    {
                      label: "Identificador del ciudadano",
                      value: hasCitizenId ? iv.citizenIdentifier : undefined,
                      missing: !hasCitizenId,
                      action: (
                        <CopyButton
                          value={hasCitizenId ? iv.citizenIdentifier! : ""}
                          disabled={!hasCitizenId}
                        />
                      ),
                    },
                  ]}
                />

                {(!hasCic || !hasCitizenId) && (
                  <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="leading-snug">
                      {!hasCic && !hasCitizenId
                        ? "No se detectaron CIC ni Identificador del ciudadano. Revisión manual requerida."
                        : !hasCic
                          ? "CIC no detectado. La asesora debe localizarlo manualmente en la credencial."
                          : "Identificador del ciudadano no detectado. La asesora debe localizarlo manualmente en la credencial."}
                    </p>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-gf-border/50">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1 text-xs font-semibold">
                    <AlertTriangle className="h-3 w-3 text-amber-600" />
                    Requiere validación manual
                  </span>

                  <a
                    href="https://listanominal.ine.mx/scpln/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-[10px] bg-gf-red-soft/50 border border-gf-red-soft px-3 py-1.5 text-xs font-bold text-gf-red hover:bg-gf-red-soft hover:text-gf-red-dark transition-all shadow-2xs group active:scale-[0.98]"
                  >
                    <span>Ir a Lista Nominal INE</span>
                    <ExternalLink className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </a>
                </div>
              </Card>
            );
          })}
      </div>

      <DocumentConsultationDrawer
        document={drawerDoc}
        onClose={() => setDrawerDoc(null)}
      />
    </div>
  );
}