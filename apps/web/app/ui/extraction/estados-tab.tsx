"use client";

import { useState } from "react";
import type { Document } from "@/app/lib/definitions";
import { parseBankStatements } from "@/app/lib/extraction";
import EmptyState from "@/app/ui/common/empty-state";
import EstadosSummaryBar from "@/app/ui/extraction/estados-summary-bar";
import EstadosStatementCard from "@/app/ui/extraction/estados-statement-card";
import EstadosProviders from "@/app/ui/extraction/estados-providers";
import EstadosMesesMovimientos from "@/app/ui/extraction/estados-meses-movimientos";

interface EstadosTabProps {
  /** BANK_STATEMENT documents for this category */
  documents: Document[];
}

/**
 * EstadosTab — renders bank statement extraction data.
 *
 * Single-accordion logic: all cards are collapsed by default (`expandedId: null`),
 * and only one card can be expanded at a time.
 */
export default function EstadosTab({
  documents,
}: EstadosTabProps) {
  const parsed = parseBankStatements(documents);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleStatement = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  if (!parsed.summary) {
    return (
      <EmptyState message="Los datos de estados de cuenta se mostrarán aquí una vez que se suban y procesen." />
    );
  }

  const hasAnyData = parsed.statements.some((s) => s.hasData);

  if (!hasAnyData) {
    return (
      <EmptyState message="Los estados de cuenta están cargados pero aún no han sido procesados. Usa &quot;Procesar&quot; en el explorador de documentos para extraer los datos." />
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Summary bar ──────────────────────────────────────────────── */}
      <EstadosSummaryBar summary={parsed.summary} />

      {/* ── Statement cards ──────────────────────────────────────────── */}
      {parsed.statements.map((stmt) => (
        <EstadosStatementCard
          key={stmt.documentId}
          statement={stmt}
          isExpanded={expandedId === stmt.documentId}
          onToggle={() => toggleStatement(stmt.documentId)}
        />
      ))}

      {/* ── Providers (only when >0) ─────────────────────────────────── */}
      {parsed.allProviders.length > 0 && (
        <EstadosProviders providers={parsed.allProviders} />
      )}

      {/* ── Months coverage + other movements ────────────────────────── */}
      <EstadosMesesMovimientos
        context={parsed.aggregatedContext}
        statements={parsed.statements}
      />
    </div>
  );
}
