"use client";

import { useState, useMemo } from "react";

import type { Document } from "@/app/lib/definitions";
import {
  docCategory,
  type ExtractionCategory,
} from "@/app/lib/extraction";
import ExtractionSummaryBar from "@/app/ui/extraction/extraction-summary-bar";
import ExtractionCategoryTabs from "@/app/ui/extraction/extraction-category-tabs";
import EmptyState from "@/app/ui/common/empty-state";
import IdentidadTab from "@/app/ui/extraction/identidad-tab";
import NominaTab from "@/app/ui/extraction/nomina-tab";
import EstadosTab from "@/app/ui/extraction/estados-tab";
import BuroTab from "@/app/ui/extraction/buro-tab";

interface ExtractionSectionProps {
  documents: Document[];
}

/**
 * ExtractionSection — client container for the "Datos extraidos" block.
 *
 * Composes the operational summary bar, the global AlertBanner, the category
 * tabs and the active tab panel. The section self-hides when no document has
 * `PROCESSED` status, so the parent page can mount it unconditionally.
 *
 * Tab state is local (`useState`); the `#extraccion` hash enables scroll-to.
 */
export default function ExtractionSection({
  documents,
}: ExtractionSectionProps) {
  const [activeTab, setActiveTab] = useState<ExtractionCategory>("identidad");

  // Reduce over documents once: processed count.
  const hasProcessed = useMemo(() => {
    return documents.some((d) => d.documentStatus.code === "PROCESSED");
  }, [documents]);

  // Per-category processed documents, so each tab gets only what it needs.
  const docsByCategory = useMemo(() => {
    const map = new Map<ExtractionCategory, Document[]>();
    (["identidad", "nomina", "estados", "buro"] as ExtractionCategory[]).forEach(
      (cat) => map.set(cat, []),
    );
    for (const doc of documents) {
      const cat = docCategory(doc.documentType.code);
      if (!cat) continue;
      map.get(cat)!.push(doc);
    }
    return map;
  }, [documents]);

  // Hidden entirely when nothing is PROCESSED yet.
  if (!hasProcessed) return null;

  return (
    <section id="extraccion" className="mt-6 scroll-mt-6">
      <h2 className="text-lg font-semibold text-gf-text mb-4">
        Datos extraidos
      </h2>

      <div className="space-y-4">
        <ExtractionSummaryBar documents={documents} />

        <ExtractionCategoryTabs activeTab={activeTab} onChange={setActiveTab} />

        <div role="tabpanel" className="pt-2">
          {activeTab === "identidad" && (
            <IdentidadTab documents={docsByCategory.get("identidad") ?? []} />
          )}
          {activeTab === "nomina" && (
            <NominaTab documents={docsByCategory.get("nomina") ?? []} />
          )}
          {activeTab === "estados" && (
            <EstadosTab
              documents={docsByCategory.get("estados") ?? []}
              allDocuments={documents}
            />
          )}
          {activeTab === "buro" && (
            <BuroTab documents={docsByCategory.get("buro") ?? []} />
          )}
        </div>
      </div>
    </section>
  );
}