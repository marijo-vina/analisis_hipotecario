import type { CorrectionSource } from "@/app/lib/extraction";

interface ManualCorrectionIndicatorProps {
  source: CorrectionSource;
}

/**
 * ManualCorrectionIndicator — small chip describing a field's correction state.
 *
 *  - `MANUAL`  → green "Editado manualmente" chip
 *  - `PENDING` → amber dot + "Pendiente" text
 *  - `AI`      → renders `null` (default extracted state shows nothing)
 *
 * Reused inside FieldGrid action slots and document cards.
 */
export default function ManualCorrectionIndicator({
  source,
}: ManualCorrectionIndicatorProps) {
  if (source === "AI") return null;

  if (source === "PENDING") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-700">
        <span
          className="inline-block h-2 w-2 rounded-full bg-amber-500"
          aria-hidden="true"
        />
        Pendiente
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
      <svg
        className="h-3 w-3"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M5 13l4 4L19 7"
        />
      </svg>
      Editado manualmente
    </span>
  );
}