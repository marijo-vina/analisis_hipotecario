"use client";

import Link from "next/link";
import { ArrowLeft, Pencil } from "lucide-react";
import StatusBadge from "@/app/ui/common/badge";

interface CaseDetailHeaderProps {
  caseId: string;
  statusCode: string;
  statusName: string;
}

/**
 * CaseDetailHeader — encabezado estilizado del workspace de expediente según Stitch.
 *
 * Contiene: navegación de retorno ("Volver al listado de expedientes"), ID corto formateado,
 * StatusBadge con estilo del sistema y botón de edición rápida.
 */
export default function CaseDetailHeader({
  caseId,
  statusCode,
  statusName,
}: CaseDetailHeaderProps) {
  const expLabel = `EXP-${caseId.slice(0, 8).toUpperCase()}`;

  return (
    <header className="h-16 bg-white border-b border-gf-border flex items-center justify-between px-4 sm:px-6 shrink-0 rounded-xl mb-6 shadow-2xs">
      {/* Navigation Breadcrumb */}
      <div className="flex items-center gap-3 text-sm">
        <Link
          href="/dashboard/expedientes"
          className="inline-flex items-center gap-2 text-gf-text-muted hover:text-gf-red font-semibold transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" strokeWidth={2} />
          <span>Volver al listado de expedientes</span>
        </Link>
        <span className="text-gf-border select-none">|</span>
        <span className="font-mono text-xs font-bold text-gf-red bg-gf-red-soft px-2 py-0.5 rounded-md">
          {expLabel}
        </span>
      </div>

      {/* Right Actions: Status Badge & Edit CTA */}
      <div className="flex items-center gap-3">
        <StatusBadge code={statusCode} name={statusName} />
        <Link
          href={`/dashboard/expedientes/${caseId}/editar`}
          className="inline-flex items-center justify-center gap-2 bg-white border border-gf-border hover:bg-gf-surface-dim text-gf-text px-4 h-9 rounded-xl text-xs font-semibold transition-all shadow-2xs shrink-0 active:scale-[0.98]"
        >
          <Pencil className="w-3.5 h-3.5 text-gf-text-muted" />
          <span>Editar</span>
        </Link>
      </div>
    </header>
  );
}

