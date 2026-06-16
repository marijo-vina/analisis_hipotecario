import type { ReactNode } from 'react';
import Link from 'next/link';

interface Breadcrumb {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  /** Breadcrumb trail: each item with label and optional href. Last item is not linked. */
  breadcrumbs?: Breadcrumb[];
  /** Page title — rendered as h1, large and semibold */
  title: string;
  /** Optional subtitle below the title in muted text */
  subtitle?: string;
  /** Optional action slot (top-right area) — e.g. "Nuevo cliente" button */
  action?: ReactNode;
  /** Optional status badge rendered next to the title */
  statusBadge?: ReactNode;
}

/**
 * PageHeader server component.
 *
 * Renders breadcrumb navigation, title, optional subtitle, action slot,
 * and optional status badge. Layout: flex row — title+subtitle on the left,
 * action on the right.
 */
export default function PageHeader({
  breadcrumbs,
  title,
  subtitle,
  action,
  statusBadge,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
      <div className="flex-1 min-w-0">
        {/* Breadcrumb navigation */}
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav
            className="flex items-center gap-1.5 text-sm text-gf-text-soft mb-2"
            aria-label="Breadcrumb"
          >
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;
              return (
                <span key={index} className="flex items-center gap-1.5">
                  {crumb.href && !isLast ? (
                    <Link
                      href={crumb.href}
                      className="hover:text-gf-text transition-colors"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className={isLast ? 'text-gf-text-muted' : ''}>
                      {crumb.label}
                    </span>
                  )}
                  {!isLast && (
                    <span className="text-gf-text-soft select-none"> / </span>
                  )}
                </span>
              );
            })}
          </nav>
        )}

        {/* Title row with optional status badge */}
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold text-gf-text">{title}</h1>
          {statusBadge && <span>{statusBadge}</span>}
        </div>

        {/* Subtitle */}
        {subtitle && (
          <p className="text-gf-text-muted text-sm mt-1">{subtitle}</p>
        )}
      </div>

      {/* Action slot — top-right */}
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
