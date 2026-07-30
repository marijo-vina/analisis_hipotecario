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

export default function ExtractionCategoryTabs({
  activeTab,
  onChange,
}: ExtractionCategoryTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Categorias de datos extraidos"
      className="border-b border-gf-border mb-6 w-full"
    >
      <nav className="flex w-full overflow-x-auto">
        {TAB_ORDER.map((tab) => {
          const isActive = tab === activeTab;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab)}
              className={`flex-1 min-w-[120px] pb-3 pt-2 text-sm transition-all border-b-2 flex items-center justify-center gap-2 ${
                isActive
                  ? "border-gf-red text-gf-red font-bold"
                  : "border-transparent text-gf-text-muted hover:text-gf-text hover:border-gf-border font-semibold"
              }`}
            >
              <span>{CATEGORY_LABELS[tab]}</span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-0.5 ${
                  isActive
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-gf-surface-dim text-gf-text-muted"
                }`}
              >
                ✓ 1/1
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
