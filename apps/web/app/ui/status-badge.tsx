import type { ReactElement } from 'react';

const STATUS_COLOR_MAP: Record<string, string> = {
  PENDING_DOCUMENTS:  'bg-amber-50 text-amber-700 ring-amber-600/20',
  DOCUMENTS_UPLOADED: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  PROCESSING:         'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  DATA_EXTRACTED:     'bg-violet-50 text-violet-700 ring-violet-600/20',
  IN_REVIEW:          'bg-blue-50 text-blue-700 ring-blue-600/20',
  REPORT_GENERATED:   'bg-teal-50 text-teal-700 ring-teal-600/20',
  OBSERVED:           'bg-red-50 text-red-700 ring-red-600/20',
  CLOSED:             'bg-slate-100 text-slate-700 ring-slate-600/20',
};

const FALLBACK_COLOR = 'bg-gray-50 text-gray-700 ring-gray-600/20';

interface StatusBadgeProps {
  code: string;
  name: string;
}

export default function StatusBadge({ code, name }: StatusBadgeProps): ReactElement {
  const colorClasses = STATUS_COLOR_MAP[code] ?? FALLBACK_COLOR;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${colorClasses}`}
    >
      {name}
    </span>
  );
}
