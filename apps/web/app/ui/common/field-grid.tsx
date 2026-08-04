import type { ReactNode } from "react";

import type { CorrectionSource } from "@/app/lib/extraction";

export interface FieldGridField {
  /** Spanish label rendered as `<dt>` */
  label: string;
  /** Value rendered as `<dd>`. Empty/undefined shows an em dash. */
  value?: string;
  /** When true, the field is treated as undetected (amber dot + value hidden). */
  missing?: boolean;
  /** Correction state used to render the indicator chip. */
  correctionState?: CorrectionSource;
  /** Optional action slot rendered next to the value (Editar/Completar/editor). */
  action?: ReactNode;
}

interface FieldGridProps {
  fields: FieldGridField[];
  className?: string;
}

/**
 * FieldGrid — reusable `<dl>` grid of labelled values.
 *
 * Promoted from the previous inline `Field` helper in `page.tsx`.
 *
 * Each field renders:
 *   - `<dt>` uppercase label
 *   - `<dd>` value (or em dash when empty/missing)
 *   - optional `action` slot (e.g. Editar/Completar button, InlineFieldEditor)
 *   - optional `correctionState` dot/chip handled by the action layer
 *
 * The grid uses a 2-column layout on `sm+` for compact key/value pairs.
 */
export default function FieldGrid({
  fields,
  className = "",
}: FieldGridProps) {
  return (
    <dl
      className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${className}`}
    >
      {fields.map((field) => (
        <div key={field.label} className="flex flex-col justify-start">
          <dt className="text-[10px] font-bold uppercase tracking-wider text-gf-text-muted">
            {field.label}
          </dt>
          <dd className="mt-0.5 flex flex-wrap items-center gap-2 text-xs font-semibold text-gf-text">
            {field.missing || !field.value || field.value.length === 0 ? (
              <span className="text-gf-text-muted font-normal">&mdash;</span>
            ) : (
              <span className="break-words">{field.value}</span>
            )}
            {field.action}
          </dd>
        </div>
      ))}
    </dl>
  );
}