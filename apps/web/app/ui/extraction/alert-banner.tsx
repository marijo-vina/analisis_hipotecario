"use client";

import type {
  AggregatedAlert,
  ExtractionCategory,
} from "@/app/lib/extraction";
import { CATEGORY_LABELS } from "@/app/lib/extraction";

interface AlertBannerProps {
  alerts: AggregatedAlert[];
  /** Switches the active tab when a deep link is clicked. */
  onSelectTab: (tab: ExtractionCategory) => void;
}

/**
 * AlertBanner — global alert aggregator with deep links.
 *
 * Shows "{N} criticas · {M} advertencias" and a chip per category that, when
 * clicked, switches the active tab to that category (deep link).
 *
 *  - Renders `null` when there are no WARNING/CRITICAL alerts.
 *  - INFO alerts are already filtered out upstream (`filterAlerts`).
 */
export default function AlertBanner({
  alerts,
  onSelectTab,
}: AlertBannerProps) {
  if (alerts.length === 0) return null;

  const critical = alerts.filter((a) => a.alert.severity === "CRITICAL");
  const warnings = alerts.filter((a) => a.alert.severity === "WARNING");

  // Group affected categories for the deep-link chips.
  const affected = new Map<ExtractionCategory, number>();
  for (const { category } of alerts) {
    affected.set(category, (affected.get(category) ?? 0) + 1);
  }

  return (
    <div
      role="alert"
      className="rounded-[var(--radius-md)] border border-gf-border bg-gf-surface p-4"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {critical.length > 0 && (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-700">
            <span className="inline-block h-2 w-2 rounded-full bg-red-500" aria-hidden="true" />
            {critical.length} {critical.length === 1 ? "critica" : "criticas"}
          </span>
        )}
        {warnings.length > 0 && (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
            {warnings.length} {warnings.length === 1 ? "advertencia" : "advertencias"}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {Array.from(affected.entries()).map(([category, count]) => (
          <button
            key={category}
            type="button"
            onClick={() => onSelectTab(category)}
            className="inline-flex items-center gap-1.5 rounded-full border border-gf-border bg-gf-bg px-3 py-1 text-xs font-medium text-gf-text transition-colors hover:bg-gray-50"
          >
            {CATEGORY_LABELS[category]}
            <span className="rounded-full bg-gf-red-soft px-1.5 py-0.5 text-gf-text">
              {count}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}