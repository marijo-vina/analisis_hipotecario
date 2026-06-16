import type { ReactNode } from 'react';
import Button from './button';

interface EmptyStateProps {
  /** Optional decorative icon displayed above the message */
  icon?: ReactNode;
  /** Human-readable Spanish message describing the empty state */
  message: string;
  /** Optional label for the call-to-action button */
  ctaLabel?: string;
  /** Optional href for the call-to-action button (renders as Link) */
  ctaHref?: string;
}

/**
 * EmptyState server component.
 *
 * Renders a centered layout with an optional icon, a descriptive message
 * in muted text, and an optional primary CTA button. The CTA button only
 * renders when both `ctaLabel` and `ctaHref` are provided.
 */
export default function EmptyState({
  icon,
  message,
  ctaLabel,
  ctaHref,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {icon && <div className="mb-4 text-gf-text-muted">{icon}</div>}
      <p className="text-gf-text-muted text-sm mb-6 max-w-md">{message}</p>
      {ctaLabel && ctaHref && (
        <Button variant="primary" href={ctaHref}>
          {ctaLabel}
        </Button>
      )}
    </div>
  );
}
