import type { Document } from "@/app/lib/definitions";
import { parseBankStatements } from "@/app/lib/extraction";
import EmptyState from "@/app/ui/common/empty-state";
import EstadosSummaryBar from "@/app/ui/extraction/estados-summary-bar";
import EstadosStatementCard from "@/app/ui/extraction/estados-statement-card";
import EstadosProviders from "@/app/ui/extraction/estados-providers";
import EstadosConciliacion from "@/app/ui/extraction/estados-conciliacion";
import EstadosMesesMovimientos from "@/app/ui/extraction/estados-meses-movimientos";

interface EstadosTabProps {
  /** BANK_STATEMENT documents for this category */
  documents: Document[];
  /** ALL documents (needed for cross-category conciliación with payroll) */
  allDocuments?: Document[];
}

/**
 * EstadosTab — renders bank statement extraction data.
 *
 * Composes: summary bar → statement cards (expandable) → providers
 * (horizontal scroll) → conciliación with payroll → months coverage
 * + other movements.
 */
export default function EstadosTab({
  documents,
  allDocuments,
}: EstadosTabProps) {
  const parsed = parseBankStatements(documents);

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
        <EstadosStatementCard key={stmt.documentId} statement={stmt} />
      ))}

      {/* ── Providers (only when >0) ─────────────────────────────────── */}
      {parsed.allProviders.length > 0 && (
        <EstadosProviders providers={parsed.allProviders} />
      )}

      {/* ── Conciliación with payroll ────────────────────────────────── */}
      {allDocuments && allDocuments.length > 0 && (
        <EstadosConciliacion
          allDeposits={parsed.allDeposits}
          payrollDocs={
            allDocuments.filter(
              (d) => d.documentType.code === "PAYROLL_RECEIPT",
            ) ?? []
          }
        />
      )}

      {/* ── Months coverage + other movements ────────────────────────── */}
      <EstadosMesesMovimientos
        context={parsed.aggregatedContext}
        statements={parsed.statements}
      />
    </div>
  );
}
