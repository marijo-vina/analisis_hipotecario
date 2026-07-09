"use client";

import { useState } from "react";

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
      <EmptyState message="No hay documentos de identidad procesados aun. Cuando se procesen uno o mas documentos, sus datos extraidos apareceran aqui." />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
              isExpired={parsed.isExpired}
              onValidate={setDrawerDoc}
              alwaysExpanded
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
                <h3 className="text-base font-semibold text-gf-text mb-1">
                  Datos para validacion manual INE
                </h3>
                <p className="text-xs text-gf-text-muted mb-3">
                  Copia estos datos para validarlos manualmente en Lista Nominal
                  del INE.
                </p>

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
                  <div className="mt-3 border-t border-gf-border pt-3">
                    <p className="text-xs text-red-600">
                      {!hasCic && !hasCitizenId
                        ? "No se detectaron CIC ni Identificador del ciudadano. Revision manual requerida."
                        : !hasCic
                          ? "CIC no detectado. La asesora debe localizarlo manualmente en la credencial."
                          : "Identificador del ciudadano no detectado. La asesora debe localizarlo manualmente en la credencial."}
                    </p>
                  </div>
                )}

                <div className="mt-3">
                  <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                    Requiere validacion manual en Lista Nominal
                  </span>
                </div>

                <div className="mt-3 pt-3 border-t border-gf-border">
                  <a
                    href="https://listanominal.ine.mx/scpln/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-gf-red hover:text-gf-red-dark transition-colors"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Ir a Lista Nominal del INE
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