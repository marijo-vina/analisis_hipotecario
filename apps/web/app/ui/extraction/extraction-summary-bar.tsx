import type { Document } from "@/app/lib/definitions";
import {
  docCategory,
  CATEGORY_LABELS,
  type ExtractionCategory,
} from "@/app/lib/extraction";

interface ExtractionSummaryBarProps {
  documents: Document[];
}

// Order of the pills on the bar (left → right).
const CATEGORY_ORDER: ExtractionCategory[] = [
  "identidad",
  "nomina",
  "estados",
  "buro",
];

/**
 * ExtractionSummaryBar — horizontal pills with operational counts per
 * document category: "Identidad ✓ | Nomina 2/3 ⚠ | Estados de cuenta 0/3 | Buro pendiente".
 *
 * A pill is:
 *   - ✓ (all processed) when processed === total AND total > 0
 *   - ⚠ (partial) when 0 < processed < total
 *   - "pendiente" when total === 0
 *
 * No financial amounts are shown here — only counts/status.
 */
export default function ExtractionSummaryBar({
  documents,
}: ExtractionSummaryBarProps) {
  // Count processed / total per category.
  const counts = new Map<
    ExtractionCategory,
    { processed: number; total: number }
  >();
  for (const cat of CATEGORY_ORDER) {
    counts.set(cat, { processed: 0, total: 0 });
  }
  for (const doc of documents) {
    const cat = docCategory(doc.documentType.code);
    if (!cat) continue;
    const entry = counts.get(cat)!;
    entry.total += 1;
    if (doc.documentStatus.code === "PROCESSED") entry.processed += 1;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {CATEGORY_ORDER.map((cat) => {
        const { processed, total } = counts.get(cat)!;
        const label = CATEGORY_LABELS[cat];

        let badge: React.ReactNode;
        let badgeClass = "";
        if (total === 0) {
          badge = "pendiente";
          badgeClass = "bg-gray-100 text-gray-600";
        } else if (processed === total) {
          badge = (
            <>
              <span aria-hidden="true">✓</span> {processed}/{total}
            </>
          );
          badgeClass = "bg-green-100 text-green-800";
        } else {
          badge = (
            <>
              <span aria-hidden="true">⚠</span> {processed}/{total}
            </>
          );
          badgeClass = "bg-amber-100 text-amber-800";
        }

        return (
          <span
            key={cat}
            className="inline-flex items-center gap-1.5 rounded-full border border-gf-border bg-gf-surface px-3 py-1 text-sm text-gf-text"
          >
            <span className="font-medium">{label}</span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass}`}
            >
              {badge}
            </span>
          </span>
        );
      })}
    </div>
  );
}