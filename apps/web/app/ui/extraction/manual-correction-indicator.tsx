import type { CorrectionSource } from "@/app/lib/extraction";
import { Check, AlertCircle } from "lucide-react";

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
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 text-xs font-semibold">
        <AlertCircle className="h-3 w-3 text-amber-600 shrink-0" aria-hidden="true" />
        <span>Pendiente</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold">
      <Check className="h-3 w-3 text-emerald-600 shrink-0" aria-hidden="true" />
      <span>Editado manualmente</span>
    </span>
  );
}