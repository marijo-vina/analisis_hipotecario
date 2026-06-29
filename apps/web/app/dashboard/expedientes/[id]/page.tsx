import Link from "next/link";
import { apiFetch } from "@/app/lib/api";
import ErrorMessage from "@/app/ui/error-message";
import PageHeader from "@/app/ui/common/page-header";
import Button from "@/app/ui/common/button";
import Card from "@/app/ui/common/card";
import StatusBadge from "@/app/ui/status-badge";
import CaseDetailWorkspace from "@/app/ui/expedientes/case-detail-workspace";
import type {
  MortgageCase,
  Client,
  DocumentType,
  Document,
} from "@/app/lib/definitions";

interface CaseDetailPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Mortgage case detail page — server component.
 *
 * Fetches the case, client, statuses, document types and documents, then
 * delegates all rendering to `CaseDetailWorkspace` (client), which composes
 * the compact header, summary card, observations editor, document browser
 * and extraction section, plus the client/case detail drawers.
 *
 * The PageHeader above is retained temporarily; CaseDetailWorkspace renders
 * its own compact header, so removing the PageHeader is an optional follow-up.
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
          <Button
            variant="primary"
            href={`/dashboard/expedientes/${id}/editar`}
          >
            Editar expediente
          </Button>
        }
      />

      <CaseDetailWorkspace
        caseId={c.id}
        statusCode={c.status.code}
        statusName={c.status.name}
        statuses={statuses}
        client={client}
        caseData={{
          id: c.id,
          requestedAmount: c.requestedAmount,
          personType: c.personType,
          creditType: c.creditType,
          notes: c.notes,
          propertyLocation: c.propertyLocation,
          propertyValue: c.propertyValue,
          estimatedTermMonths: c.estimatedTermMonths,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        }}
        documents={documents}
        documentTypes={documentTypes}
      />
    </div>
  );
}
