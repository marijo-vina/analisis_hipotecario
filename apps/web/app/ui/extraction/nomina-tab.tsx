import type { Document } from "@/app/lib/definitions";
import { parsePayroll } from "@/app/lib/extraction";
import EmptyState from "@/app/ui/common/empty-state";
import NominaHeader from "@/app/ui/extraction/nomina-header";
import NominaReceiptTable, {
  type ParsedReceiptRow,
} from "@/app/ui/extraction/nomina-receipt-table";

interface NominaTabProps {
  documents: Document[];
}

/**
 * NominaTab — renders payroll extraction data for PAYROLL_RECEIPT documents.
 *
 * Every payroll document appears in the table with its real status.
 * The header shows a compact count (Sprint 2 only — no financial analysis).
 */
export default function NominaTab({ documents }: NominaTabProps) {
  const parsed = parsePayroll(documents);

  // ── Empty state: no payroll documents at all ──────────────────────
  if (!parsed.summary) {
    return (
      <EmptyState message="Los datos de nómina se mostrarán aquí una vez que se suban recibos de nómina." />
    );
  }

  // ── Real data ─────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <NominaHeader data={parsed.summary} />
      <NominaReceiptTable rows={parsed.receipts} />
    </div>
  );
}
