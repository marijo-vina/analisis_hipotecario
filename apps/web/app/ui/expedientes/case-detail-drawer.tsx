"use client";

import Drawer from "@/app/ui/common/drawer";

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
  PFAE: "Persona Física con Actividad Empresarial (PFAE)",
  PM: "Persona Moral",
};

function personTypeLabel(code?: string): string {
  if (!code) return "—";
  return PERSON_TYPE_LABELS[code] ?? code;
}

function formatCurrency(amount?: number): string {
  if (amount == null) return "—";
  return `$${Number(amount).toLocaleString("es-MX")}`;
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-MX");
}

/**
 * CaseDetailDrawer — panel lateral con todos los campos del expediente.
 *
 * Envuelve el Drawer reutilizable. El título usa el formato "Expediente EXP-XXXX".
 * Despliega secciones manuales con labels pequeños y valores en font-medium,
 * organizados por "Información del crédito" y "Estado operativo".
 */
export default function CaseDetailDrawer({
  open,
  onClose,
  caseData,
}: CaseDetailDrawerProps) {
  const expLabel = `EXP-${caseData.id.slice(0, 8).toUpperCase()}`;
  const title = `Expediente ${expLabel}`;

  return (
    <Drawer open={open} onClose={onClose} title={title}>
      <div className="space-y-6">
        {/* ── Información del crédito ──────────────────────────────────── */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gf-text-muted mb-3">
            Información del crédito
          </h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <dt className="text-xs text-gf-text-muted">Tipo crédito</dt>
              <dd className="text-sm font-medium text-gf-text mt-0.5">
                {caseData.creditType?.name || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gf-text-muted">Valor propiedad</dt>
              <dd className="text-sm font-medium text-gf-text mt-0.5">
                {formatCurrency(caseData.propertyValue)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gf-text-muted">Plazo estimado</dt>
              <dd className="text-sm font-medium text-gf-text mt-0.5">
                {caseData.estimatedTermMonths != null
                  ? `${caseData.estimatedTermMonths} meses`
                  : "—"}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-gf-text-muted">Ubicación</dt>
              <dd className="text-sm font-medium text-gf-text mt-0.5">
                {caseData.propertyLocation || "—"}
              </dd>
            </div>
          </dl>
        </section>

        {/* ── Estado operativo ─────────────────────────────────────────── */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gf-text-muted mb-3">
            Estado operativo
          </h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <dt className="text-xs text-gf-text-muted">Estado actual</dt>
              <dd className="text-sm font-medium text-gf-text mt-0.5">
                {caseData.status?.name || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gf-text-muted">Tipo persona</dt>
              <dd className="text-sm font-medium text-gf-text mt-0.5">
                {personTypeLabel(caseData.personType)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gf-text-muted">Fecha creación</dt>
              <dd className="text-sm font-medium text-gf-text mt-0.5">
                {formatDate(caseData.createdAt)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gf-text-muted">Última actualización</dt>
              <dd className="text-sm font-medium text-gf-text mt-0.5">
                {formatDate(caseData.updatedAt)}
              </dd>
            </div>
            {caseData.notes && (
              <div className="col-span-2">
                <dt className="text-xs text-gf-text-muted">Observaciones</dt>
                <dd className="text-sm font-medium text-gf-text mt-0.5">
                  {caseData.notes}
                </dd>
              </div>
            )}
          </dl>
        </section>
      </div>
    </Drawer>
  );
}
