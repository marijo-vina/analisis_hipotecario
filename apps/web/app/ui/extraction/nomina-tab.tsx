import type { Document } from "@/app/lib/definitions";
import EmptyState from "@/app/ui/common/empty-state";
import NominaSummaryCard, {
  type NominaSummaryData,
} from "@/app/ui/extraction/nomina-summary-card";
import NominaReceiptTable, {
  type ReceiptRow,
} from "@/app/ui/extraction/nomina-receipt-table";

interface NominaTabProps {
  /** Payroll-category documents (PAYROLL_RECEIPT). */
  documents: Document[];
}

// ── Mock data (the backend payroll extraction contract isn't finalized) ────
// Used when at least one PAYROLL_RECEIPT document is PROCESSED. Per the change
// prompt: if receipts are processed, show the mock consolidation; otherwise
// show an EmptyState.
const mockNominaSummary: NominaSummaryData = {
  recibosProcesados: 3,
  totalRecibos: 6,
  periodos: ["2026-05-15 a 2026-05-30", "2026-06-01 a 2026-06-15"],
  empleado: { nombre: "Juan Perez Lopez", rfc: "PELJ900101ABC" },
  empleadores: [{ nombre: "Constructora Mexicana S.A.", rfc: "CME850101XYZ" }],
  ingresoBrutoPromedio: 18500,
  ingresoNetoPromedio: 15200,
  timbradoDetectado: 3,
  totalRecibosTimbrados: 3,
  alertas: 1,
};

const mockNominaReceipts: ReceiptRow[] = [
  {
    periodo: "2026-05-15 a 2026-05-30",
    fechaPago: "2026-05-31",
    periodicidad: "Quincenal",
    ingresoBruto: 18000,
    deducciones: 3200,
    ingresoNeto: 14800,
    timbrado: true,
    alertas: 0,
    empleado: { nombre: "Juan Perez Lopez", rfc: "PELJ900101ABC" },
    empleador: { nombre: "Constructora Mexicana S.A.", rfc: "CME850101XYZ" },
    percepciones: [
      { concepto: "Sueldo", importe: 16000 },
      { concepto: "Ayuda de transporte", importe: 2000 },
    ],
    deduccionesDetalle: [
      { concepto: "ISR", importe: 1800 },
      { concepto: "IMSS", importe: 1400 },
    ],
  },
  {
    periodo: "2026-06-01 a 2026-06-15",
    fechaPago: "2026-06-15",
    periodicidad: "Quincenal",
    ingresoBruto: 18500,
    deducciones: 3300,
    ingresoNeto: 15200,
    timbrado: true,
    alertas: 1,
    empleado: { nombre: "Juan Perez Lopez", rfc: "PELJ900101ABC" },
    empleador: { nombre: "Constructora Mexicana S.A.", rfc: "CME850101XYZ" },
    percepciones: [
      { concepto: "Sueldo", importe: 16500 },
      { concepto: "Ayuda de transporte", importe: 2000 },
    ],
    deduccionesDetalle: [
      { concepto: "ISR", importe: 1900 },
      { concepto: "IMSS", importe: 1400 },
    ],
  },
  {
    periodo: "2026-05-01 a 2026-05-15",
    fechaPago: "2026-05-15",
    periodicidad: "Quincenal",
    ingresoBruto: 19000,
    deducciones: 3400,
    ingresoNeto: 15600,
    timbrado: true,
    alertas: 0,
    empleado: { nombre: "Juan Perez Lopez", rfc: "PELJ900101ABC" },
    empleador: { nombre: "Constructora Mexicana S.A.", rfc: "CME850101XYZ" },
    percepciones: [
      { concepto: "Sueldo", importe: 17000 },
      { concepto: "Ayuda de transporte", importe: 2000 },
    ],
    deduccionesDetalle: [
      { concepto: "ISR", importe: 2000 },
      { concepto: "IMSS", importe: 1400 },
    ],
  },
];

/**
 * NominaTab — composes the consolidated summary card + the expandable receipts
 * table.
 *
 * Until the backend payroll extraction contract is finalized, data is mocked
 * when at least one PAYROLL_RECEIPT is PROCESSED. With none processed, an
 * EmptyState invites the asesora to process documents.
 */
export default function NominaTab({ documents }: NominaTabProps) {
  const hasProcessedPayroll = documents.some(
    (d) =>
      d.documentType.code === "PAYROLL_RECEIPT" &&
      d.documentStatus.code === "PROCESSED",
  );

  if (!hasProcessedPayroll) {
    return (
      <EmptyState message="No hay recibos de nomina procesados aun. Subi y procesa los recibos para ver el consolidado y el detalle aqui." />
    );
  }

  return (
    <div className="space-y-4">
      <NominaSummaryCard data={mockNominaSummary} />
      <NominaReceiptTable rows={mockNominaReceipts} />
    </div>
  );
}