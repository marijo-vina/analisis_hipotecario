"use client";

import Drawer from "@/app/ui/common/drawer";
import FieldGrid, { type FieldGridField } from "@/app/ui/common/field-grid";

interface CaseDetailDrawerData {
  id: string;
  requestedAmount?: number;
  propertyLocation?: string;
  propertyValue?: number;
  estimatedTermMonths?: number;
  creditType?: { name: string };
  personType?: string;
  status?: { name: string };
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface CaseDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  caseData: CaseDetailDrawerData;
}

const PERSON_TYPE_LABELS: Record<string, string> = {
  SALARIED: "Asalariado",
};

function personTypeLabel(code?: string): string | undefined {
  if (!code) return undefined;
  return PERSON_TYPE_LABELS[code] ?? code;
}

function formatCurrency(amount?: number): string | undefined {
  if (amount == null) return undefined;
  return `$${Number(amount).toLocaleString("es-MX")}`;
}

function formatDate(iso?: string): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString("es-MX");
}

/**
 * CaseDetailDrawer — panel lateral con todos los campos del expediente.
 *
 * Envuelve el Drawer reutilizable. El título usa el formato "Expediente EXP-XXXX".
 * Despliega todos los campos disponibles mediante FieldGrid, con fechas en
 * formato es-MX, montos con prefijo $ y plazo con sufijo "meses". Los valores
 * nulos se muestran como "—" (gestionado por FieldGrid).
 */
export default function CaseDetailDrawer({
  open,
  onClose,
  caseData,
}: CaseDetailDrawerProps) {
  const expLabel = `EXP-${caseData.id.slice(0, 8).toUpperCase()}`;
  const title = `Expediente ${expLabel}`;

  const fields: FieldGridField[] = [
    { label: "ID", value: expLabel },
    {
      label: "Monto solicitado",
      value: formatCurrency(caseData.requestedAmount),
    },
    { label: "Ubicación", value: caseData.propertyLocation || undefined },
    {
      label: "Valor propiedad",
      value: formatCurrency(caseData.propertyValue),
    },
    {
      label: "Plazo estimado",
      value:
        caseData.estimatedTermMonths != null
          ? `${caseData.estimatedTermMonths} meses`
          : undefined,
    },
    { label: "Tipo crédito", value: caseData.creditType?.name || undefined },
    { label: "Tipo persona", value: personTypeLabel(caseData.personType) },
    { label: "Estado", value: caseData.status?.name || undefined },
    { label: "Observaciones", value: caseData.notes || undefined },
    { label: "Creado", value: formatDate(caseData.createdAt) },
    { label: "Actualizado", value: formatDate(caseData.updatedAt) },
  ];

  return (
    <Drawer open={open} onClose={onClose} title={title}>
      <FieldGrid fields={fields} />
    </Drawer>
  );
}