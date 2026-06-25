"use client";

import type { ExtractionCategory } from "@/app/lib/extraction";
import { CATEGORY_LABELS } from "@/app/lib/extraction";

interface ExtractionCategoryTabsProps {
  activeTab: ExtractionCategory;
  /** Called with the new category when the user clicks a tab. */
  onChange: (tab: ExtractionCategory) => void;
}

const TAB_ORDER: ExtractionCategory[] = [
  "identidad",
  "nomina",
  "estados",
  "buro",
];

/**
 * ExtractionCategoryTabs — tab navigation for the extraction section.
 *
 * Controlled component: the parent (ExtractionSection) owns `activeTab` state
 * and passes `onChange` to update it. The active tab is highlighted; inactive
 * tabs are muted.
 */
export default function ExtractionCategoryTabs({
  activeTab,
  onChange,
}: ExtractionCategoryTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Categorias de datos extraidos"
      className="flex flex-wrap gap-1 border-b border-gf-border"
    >
      {TAB_ORDER.map((tab) => {
        const isActive = tab === activeTab;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? "border-gf-red text-gf-text"
                : "border-transparent text-gf-text-muted hover:text-gf-text"
            }`}
          >
            {CATEGORY_LABELS[tab]}
          </button>
        );
      })}
    </div>
  );
}