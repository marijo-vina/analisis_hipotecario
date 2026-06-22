import type { ReactElement } from 'react';

// ── Unified status code → color map ─────────────────────────────
// Handles both case (expediente) and document statuses.
const STATUS_COLOR_MAP: Record<string, string> = {
  // Case statuses
  PENDING_DOCUMENTS:  'bg-amber-100 text-amber-800',
  DOCUMENTS_UPLOADED: 'bg-sky-100 text-sky-800',
  PROCESSING:         'bg-indigo-100 text-indigo-800',
  IN_REVIEW:          'bg-blue-100 text-blue-800',
  OBSERVED:           'bg-red-100 text-red-800',
  CLOSED:             'bg-slate-100 text-slate-800',
  REJECTED:           'bg-red-100 text-red-800',

  // Document statuses
  UPLOADED:   'bg-sky-100 text-sky-800',
  VALIDATED:  'bg-green-100 text-green-800',
  PROCESSED:  'bg-teal-100 text-teal-800',
  ERROR:      'bg-red-100 text-red-800',
  OCR_ERROR:  'bg-red-100 text-red-800',

  // Legacy case statuses — kept for backward compatibility
  DATA_EXTRACTED:   'bg-violet-100 text-violet-800',
  REPORT_GENERATED: 'bg-teal-100 text-teal-800',
};

const FALLBACK_COLOR = 'bg-gray-100 text-gray-800';

interface StatusBadgeProps {
  /** Technical status code (e.g. IN_REVIEW, UPLOADED) — used only for color lookup */
  code: string;
  /** Human-readable Spanish label displayed in the badge */
  name: string;
}

/**
 * Unified StatusBadge for both case and document statuses.
 *
 * Displays the human-readable `name` prop (never the raw `code`).
 * Maps the `code` to a color scheme: case statuses and document
 * statuses share the same color tokens. Unknown codes fall back
 * to neutral gray.
 */
export default function StatusBadge({ code, name }: StatusBadgeProps): ReactElement {
  const colorClasses = STATUS_COLOR_MAP[code] ?? FALLBACK_COLOR;
  const isProcessing = code === "PROCESSING";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClasses}`}
    >
      {isProcessing && (
        <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-current animate-pulse" aria-hidden="true" />
      )}
      {name}
    </span>
  );
}
