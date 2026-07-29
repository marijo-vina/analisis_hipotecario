import Link from "next/link";
import { apiFetch } from "@/app/lib/api";
import ErrorMessage from "@/app/ui/error-message";
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
 */
export default async function CaseDetailPage({ params }: CaseDetailPageProps) {
  const { id } = await params;

  const result = await apiFetch<MortgageCase>(`/mortgage-cases/${id}`);

  if (!result.ok && result.notFound) {
    return (
      <div>
        <p className="text-gf-text-muted mb-4">
          No se encontró un expediente con el ID especificado.
        </p>
        <Link
          href="/dashboard/expedientes"
          className="text-gf-text font-medium hover:underline"
        >
          &larr; Volver al listado
        </Link>
      </div>
    );
  }

  if (!result.ok) {
    return (
      <div>
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

  const [clientResult, docTypesResult, docsResult] =
    await Promise.all([
      apiFetch<Client>(`/clients/${c.clientId}`),
      apiFetch<{ data: DocumentType[] }>("/document-types"),
      apiFetch<{ data: Document[] }>(`/mortgage-cases/${id}/documents`),
    ]);

  const client = clientResult.ok ? clientResult.data : null;
  const documentTypes: DocumentType[] = docTypesResult.ok
    ? docTypesResult.data.data
    : [];
  const documents: Document[] = docsResult.ok ? docsResult.data.data : [];

  return (
    <CaseDetailWorkspace
      caseId={c.id}
      statusCode={c.status.code}
      statusName={c.status.name}
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
  );
}
