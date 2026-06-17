import type { ReactNode } from "react";
import Link from "next/link";
import { apiFetch } from "@/app/lib/api";
import ErrorMessage from "@/app/ui/error-message";
import PageHeader from "@/app/ui/common/page-header";
import Button from "@/app/ui/common/button";
import Card from "@/app/ui/common/card";
import StatusBadge from "@/app/ui/status-badge";
import CaseStatusDropdown from "@/app/ui/case-status-dropdown";
import { DocumentsClientSection } from "@/app/ui/documents/documents-client-section";
import type {
  MortgageCase,
  Client,
  DocumentType,
  Document,
} from "@/app/lib/definitions";

// ── Person type → human-readable Spanish label ─────────────────────────
const PERSON_TYPE_LABELS: Record<string, string> = {
  SALARIED: "Asalariado",
};

function personTypeLabel(code: string): string {
  return PERSON_TYPE_LABELS[code] ?? code;
}

interface CaseDetailPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Mortgage case detail page — server component.
 *
 * Fetches a single mortgage case by ID and renders a 2-column layout:
 * left column with case summary and client info, right column with
 * documents, observations, and financial analysis placeholder.
 * Status change dropdown uses the new institutional Button styling
 * while preserving the existing server action logic.
 */
export default async function CaseDetailPage({ params }: CaseDetailPageProps) {
  const { id } = await params;

  const result = await apiFetch<MortgageCase>(`/mortgage-cases/${id}`);

  // ── Not found ───────────────────────────────────────────────────────────
  if (!result.ok && result.notFound) {
    return (
      <div>
        <PageHeader
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Expedientes", href: "/dashboard/expedientes" },
            { label: "No encontrado" },
          ]}
          title="Expediente no encontrado"
        />
        <Card>
          <p className="text-gf-text-muted mb-4">
            No se encontró un expediente con el ID especificado.
          </p>
          <Link
            href="/dashboard/expedientes"
            className="text-gf-text font-medium hover:underline"
          >
            &larr; Volver al listado
          </Link>
        </Card>
      </div>
    );
  }

  // ── Generic error ───────────────────────────────────────────────────────
  if (!result.ok) {
    return (
      <div>
        <PageHeader
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Expedientes", href: "/dashboard/expedientes" },
            { label: "Error" },
          ]}
          title="Expediente"
        />
        <ErrorMessage message="Error al cargar el expediente" />
        <div className="mt-4">
          <Link
            href="/dashboard/expedientes"
            className="text-gf-text font-medium hover:underline"
          >
            &larr; Volver al listado
          </Link>
        </div>
      </div>
    );
  }

  // ── Success — fetch related data in parallel ────────────────────────────
  const c = result.data;

  const [statusesResult, clientResult, docTypesResult, docsResult] =
    await Promise.all([
      apiFetch<{
        data: { code: string; name: string; order: number }[];
      }>("/case-statuses"),
      apiFetch<Client>(`/clients/${c.clientId}`),
      apiFetch<{ data: DocumentType[] }>("/document-types"),
      apiFetch<{ data: Document[] }>(`/mortgage-cases/${id}/documents`),
    ]);

  const statuses = statusesResult.ok ? statusesResult.data.data : [];
  const client = clientResult.ok ? clientResult.data : null;
  const documentTypes: DocumentType[] = docTypesResult.ok
    ? docTypesResult.data.data
    : [];
  const documents: Document[] = docsResult.ok ? docsResult.data.data : [];

  const expShort = id.slice(0, 12);

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Expedientes", href: "/dashboard/expedientes" },
          { label: `EXP-${expShort.toUpperCase()}` },
        ]}
        title={`Expediente ${expShort}...`}
        statusBadge={
          <StatusBadge code={c.status.code} name={c.status.name} />
        }
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              href={`/dashboard/expedientes/${id}/editar`}
            >
              Editar expediente
            </Button>
            <Button variant="secondary" href="#documentos">
              Subir documento
            </Button>
          </div>
        }
      />

      {/* ── 2-column layout ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column — spans 2/3 */}
        <div className="lg:col-span-2 space-y-6">
          {/* Resumen del expediente Card */}
          <Card>
            <h3 className="text-base font-semibold text-gf-text mb-4">
              Resumen del expediente
            </h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="Monto solicitado"
                value={
                  c.requestedAmount != null
                    ? `$${Number(c.requestedAmount).toLocaleString("es-MX")}`
                    : undefined
                }
              />
              <Field label="Ubicación" value={c.propertyLocation} />
              <Field
                label="Valor propiedad"
                value={
                  c.propertyValue != null
                    ? `$${Number(c.propertyValue).toLocaleString("es-MX")}`
                    : undefined
                }
              />
              <Field
                label="Plazo estimado"
                value={
                  c.estimatedTermMonths != null
                    ? `${c.estimatedTermMonths} meses`
                    : undefined
                }
              />
              <Field label="Tipo crédito" value={c.creditType.name} />
              <Field
                label="Tipo persona"
                value={personTypeLabel(c.personType)}
              />
            </dl>
          </Card>

          {/* Cliente asociado Card */}
          <Card>
            <h3 className="text-base font-semibold text-gf-text mb-4">
              Cliente asociado
            </h3>
            {client ? (
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Nombre" value={client.fullName} />
                <Field label="RFC" value={client.rfc} />
                <Field
                  label="Tipo persona"
                  value={personTypeLabel(c.personType)}
                />
                <Field label="Correo" value={client.email} />
                <Field label="Teléfono" value={client.phone} />
              </dl>
            ) : (
              <p className="text-sm text-gf-text-muted">
                No se pudo cargar la información del cliente.
              </p>
            )}
          </Card>

          {/* Status change dropdown */}
          <CaseStatusDropdown
            caseId={c.id}
            currentCode={c.status.code}
            statuses={statuses}
          />
        </div>

        {/* Right column — spans 1/3 */}
        <div className="space-y-6">
          {/* Documentos section */}
          <div id="documentos">
            <DocumentsClientSection
              caseId={c.id}
              documentTypes={documentTypes}
              initialDocuments={documents}
            />
          </div>

          {/* Observaciones Card */}
          <Card>
            <h3 className="text-base font-semibold text-gf-text mb-2">
              Observaciones
            </h3>
            {c.notes ? (
              <p className="text-sm text-gf-text whitespace-pre-wrap">
                {c.notes}
              </p>
            ) : (
              <p className="text-sm text-gf-text-muted">Sin observaciones</p>
            )}
          </Card>

          {/* Análisis financiero placeholder */}
          <Card>
            <h3 className="text-base font-semibold text-gf-text mb-2">
              Análisis financiero
            </h3>
            <p className="text-sm text-gf-text-muted">
              El análisis financiero estará disponible cuando se procesen todos
              los documentos requeridos.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Renders a read-only field in a detail card. */
function Field({
  label,
  value,
}: {
  label: string;
  value?: string | ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-gf-text-muted">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-gf-text">
        {value && typeof value === "string" && value.length > 0
          ? value
          : (value ?? "\u2014")}
      </dd>
    </div>
  );
}
