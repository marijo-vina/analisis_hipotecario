import Link from "next/link";
import { apiFetch } from "@/app/lib/api";
import ErrorMessage from "@/app/ui/error-message";
import PageHeader from "@/app/ui/common/page-header";
import Button from "@/app/ui/common/button";
import Card from "@/app/ui/common/card";
import StatusBadge from "@/app/ui/status-badge";
import CaseStatusDropdown from "@/app/ui/case-status-dropdown";
import FieldGrid from "@/app/ui/common/field-grid";
import ExtractionSection from "@/app/ui/extraction/extraction-section";
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
 * Layout (top → bottom):
 *   1. Page header with breadcrumbs + actions
 *   2. Two-column grid: case summary / client (left 2/3), observations (right 1/3)
 *   3. Full-width: documents section (upload + list)
 *   4. Full-width: extraction results grouped by document type
 */
export default async function CaseDetailPage({ params }: CaseDetailPageProps) {
  const { id } = await params;

  const result = await apiFetch<MortgageCase>(`/mortgage-cases/${id}`);

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

  const expShort = id.slice(0, 8);

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Expedientes", href: "/dashboard/expedientes" },
          { label: `Expediente ${expShort.toUpperCase()}` },
        ]}
        title={`Expediente ${expShort.toUpperCase()}`}
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

      {/* ── Top: 2-column grid ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <h3 className="text-base font-semibold text-gf-text mb-4">
              Resumen del expediente
            </h3>
            <FieldGrid
              fields={[
                {
                  label: "Monto solicitado",
                  value:
                    c.requestedAmount != null
                      ? `$${Number(c.requestedAmount).toLocaleString("es-MX")}`
                      : undefined,
                },
                { label: "Ubicación", value: c.propertyLocation },
                {
                  label: "Valor propiedad",
                  value:
                    c.propertyValue != null
                      ? `$${Number(c.propertyValue).toLocaleString("es-MX")}`
                      : undefined,
                },
                {
                  label: "Plazo estimado",
                  value:
                    c.estimatedTermMonths != null
                      ? `${c.estimatedTermMonths} meses`
                      : undefined,
                },
                { label: "Tipo crédito", value: c.creditType.name },
                { label: "Tipo persona", value: personTypeLabel(c.personType) },
              ]}
            />
          </Card>

          <Card>
            <h3 className="text-base font-semibold text-gf-text mb-4">
              Cliente asociado
            </h3>
            {client ? (
              <FieldGrid
                fields={[
                  { label: "Nombre", value: client.fullName },
                  { label: "RFC", value: client.rfc },
                  { label: "Tipo persona", value: personTypeLabel(c.personType) },
                  { label: "Correo", value: client.email },
                  { label: "Teléfono", value: client.phone },
                ]}
              />
            ) : (
              <p className="text-sm text-gf-text-muted">
                No se pudo cargar la información del cliente.
              </p>
            )}
          </Card>

          <CaseStatusDropdown
            caseId={c.id}
            currentCode={c.status.code}
            statuses={statuses}
          />
        </div>

        <div className="space-y-6">
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

      {/* ── Full-width: Documentos ─────────────────────────────────────── */}
      <div className="mt-6" id="documentos">
        <DocumentsClientSection
          caseId={c.id}
          documentTypes={documentTypes}
          initialDocuments={documents}
        />
      </div>

      {/* ── Full-width: Datos extraídos ────────────────────────────────── */}
      <ExtractionSection documents={documents} />
    </div>
  );
}
