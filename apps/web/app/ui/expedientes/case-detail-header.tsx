import Link from "next/link";

import StatusBadge from "@/app/ui/common/badge";
import Button from "@/app/ui/common/button";
import CaseStatusDropdown from "@/app/ui/case-status-dropdown";

interface CaseStatus {
  code: string;
  name: string;
}

interface CaseDetailHeaderProps {
  caseId: string;
  statusCode: string;
  statusName: string;
  /** Catálogo de estados disponibles para el dropdown "Cambiar estado". */
  statuses: CaseStatus[];
}

/**
 * CaseDetailHeader — encabezado compacto del workspace de expediente.
 *
 * Server component. Reemplaza al PageHeader anterior con una fila única
 * (~52px) que contiene: flecha de retroceso, breadcrumb, badge de estado,
 * botón Editar y el control "Cambiar estado" (CaseStatusDropdown) renderizado
 * inline sin envoltorio Card.
 *
 * El CaseStatusDropdown es un client component que se hidrata por sí solo;
 * el resto del header permanece estático en el server.
 */
export default function CaseDetailHeader({
  caseId,
  statusCode,
  statusName,
  statuses,
}: CaseDetailHeaderProps) {
  const expLabel = `EXP-${caseId.slice(0, 8).toUpperCase()}`;

  return (
    <header className="mb-4">
      {/* ── Fila compacta ~52px ────────────────────────────────────────── */}
      <div className="flex items-center gap-3 min-h-[52px] flex-wrap">
        {/* Flecha ← */}
        <Link
          href="/dashboard/expedientes"
          aria-label="Volver a expedientes"
          className="rounded-[var(--radius-sm)] p-1.5 text-gf-text-muted hover:text-gf-text hover:bg-gf-bg transition-colors shrink-0 focus-visible:ring-2 focus-visible:ring-gf-red/40 focus-visible:outline-none"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-5 h-5"
            aria-hidden="true"
          >
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </Link>

        {/* Breadcrumb */}
        <nav
          className="flex items-center gap-1.5 text-sm text-gf-text-soft min-w-0"
          aria-label="Breadcrumb"
        >
          <Link
            href="/dashboard"
            className="hover:text-gf-text transition-colors truncate"
          >
            Dashboard
          </Link>
          <span className="text-gf-text-soft select-none">/</span>
          <Link
            href="/dashboard/expedientes"
            className="hover:text-gf-text transition-colors truncate"
          >
            Expedientes
          </Link>
          <span className="text-gf-text-soft select-none">/</span>
          <span className="text-gf-text-muted font-medium truncate">
            {expLabel}
          </span>
        </nav>

        {/* Separator? No — relleno flexible para empujar acciones a la derecha */}
        <div className="flex-1" />

        {/* Badge de estado */}
        <StatusBadge code={statusCode} name={statusName} />

        {/* Botón Editar */}
        <Button
          variant="secondary"
          href={`/dashboard/expedientes/${caseId}/editar`}
        >
          Editar
        </Button>
      </div>

      {/* ── Cambiar estado — inline, sin Card wrapper ──────────────────── */}
      <CaseStatusDropdown
        caseId={caseId}
        currentCode={statusCode}
        statuses={statuses}
      />
    </header>
  );
}