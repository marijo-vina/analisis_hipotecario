import type { Document } from "@/app/lib/definitions";
import { parsePayroll, type ParsedPayrollSummary } from "@/app/lib/extraction";
import EmptyState from "@/app/ui/common/empty-state";
import ErrorMessage from "@/app/ui/error-message";
import NominaSummaryCard from "@/app/ui/extraction/nomina-summary-card";
import NominaReceiptTable, {
  type ParsedReceiptRow,
} from "@/app/ui/extraction/nomina-receipt-table";

interface NominaTabProps {
  documents: Document[];
}

/**
 * NominaTab — renders payroll extraction data for PAYROLL_RECEIPT documents.
 *
 * States:
 *  - No payroll documents processed → EmptyState
 *  - Extraction error → ErrorMessage with retry suggestion
 *  - Real extracted data → summary card + receipt table
 *
 * No mock data is ever displayed in production.
 */
export default function NominaTab({ documents }: NominaTabProps) {
  const parsed = parsePayroll(documents);

  // ── Error state: extraction failed ────────────────────────────────
  if (parsed.hasError) {
    return (
      <ErrorMessage
        message={
          parsed.errorMessage ??
          "Error al procesar los recibos de nómina."
        }
      />
    );
  }

  // ── Empty state: no processed payroll ─────────────────────────────
  if (!parsed.summary) {
    return (
      <EmptyState message="Los datos de nómina se mostrarán aquí una vez que se procesen recibos de nómina." />
    );
  }

  // ── Real data ─────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <NominaSummaryCard data={parsed.summary} />
      <NominaReceiptTable rows={parsed.receipts} />
    </div>
  );
}
