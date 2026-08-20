"use client";

import { useState, useMemo } from "react";

import type { Document } from "@/app/lib/definitions";
import {
  docCategory,
  type ExtractionCategory,
} from "@/app/lib/extraction";
import ExtractionCategoryTabs from "@/app/ui/extraction/extraction-category-tabs";
import EmptyState from "@/app/ui/common/empty-state";
import IdentidadTab from "@/app/ui/extraction/identidad-tab";
import CsfTab from "@/app/ui/extraction/csf-tab";
import DeclaracionTab from "@/app/ui/extraction/declaracion-tab";
import NominaTab from "@/app/ui/extraction/nomina-tab";
import EstadosTab from "@/app/ui/extraction/estados-tab";
import BuroTab from "@/app/ui/extraction/buro-tab";

interface ExtractionSectionProps {
  documents: Document[];
  caseId: string;
  personType?: string;
}

/**
 * ExtractionSection — client container for the "Datos extraídos" block.
 *
 * Composes category tabs and the active tab panel. Renders tabs dynamically
 * according to personType (PFAE vs SALARIED) and uploaded documents.
 */
export default function ExtractionSection({
  documents,
  caseId,
  personType,
}: ExtractionSectionProps) {
  // Determine relevant tabs for this profile
  const availableTabs = useMemo<ExtractionCategory[]>(() => {
    if (personType === "PFAE") {
      return ["identidad", "csf", "declaracion", "estados", "buro"];
    }
    // For SALARIED or default, include CSF/declaracion if they exist in documents
    const tabs: ExtractionCategory[] = ["identidad"];
    const hasCsf = documents.some((d) => d.documentType.code === "CSF");
    const hasTaxReturn = documents.some((d) => d.documentType.code === "TAX_RETURN");
    const hasPayroll = documents.some((d) => d.documentType.code === "PAYROLL_RECEIPT");

    if (hasCsf) tabs.push("csf");
    if (hasTaxReturn) tabs.push("declaracion");
    if (hasPayroll || (!hasCsf && !hasTaxReturn)) tabs.push("nomina");
    tabs.push("estados", "buro");
    return tabs;
  }, [personType, documents]);

  const [activeTab, setActiveTab] = useState<ExtractionCategory>(() => {
    return availableTabs[0] ?? "identidad";
  });

  // Reduce over documents once: processed count.
  const hasProcessed = useMemo(() => {
    return documents.some((d) => d.documentStatus.code === "PROCESSED");
  }, [documents]);

  // Per-category processed documents, so each tab gets only what it needs.
  const docsByCategory = useMemo(() => {
    const map = new Map<ExtractionCategory, Document[]>();
    ([
      "identidad",
      "csf",
      "declaracion",
      "nomina",
      "estados",
      "buro",
    ] as ExtractionCategory[]).forEach((cat) => map.set(cat, []));
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
    <section id="extraccion" className="mt-8 pt-6 border-t border-gf-border/60 scroll-mt-6">
      <div className="flex items-center gap-3 mb-5">
        <h2 className="text-xl sm:text-2xl font-bold text-gf-text tracking-tight">
          Datos extraídos
        </h2>
      </div>

      <div className="space-y-4">
        <ExtractionCategoryTabs
          activeTab={activeTab}
          tabs={availableTabs}
          onChange={setActiveTab}
        />

        <div role="tabpanel" className="pt-2">
          {activeTab === "identidad" && (
            <IdentidadTab documents={docsByCategory.get("identidad") ?? []} />
          )}
          {activeTab === "csf" && (
            <CsfTab documents={docsByCategory.get("csf") ?? []} />
          )}
          {activeTab === "declaracion" && (
            <DeclaracionTab documents={docsByCategory.get("declaracion") ?? []} />
          )}
          {activeTab === "nomina" && (
            <NominaTab documents={docsByCategory.get("nomina") ?? []} />
          )}
          {activeTab === "estados" && (
            <EstadosTab
              documents={docsByCategory.get("estados") ?? []}
            />
          )}
          {activeTab === "buro" && (
            <BuroTab documents={docsByCategory.get("buro") ?? []} caseId={caseId} />
          )}
        </div>
      </div>
    </section>
  );
}