import { apiFetch } from "@/app/lib/api";
import type { Client, PaginatedResponse } from "@/app/lib/definitions";
import Pagination from "@/app/ui/pagination";
import ErrorMessage from "@/app/ui/error-message";
import PageHeader from "@/app/ui/common/page-header";
import Button from "@/app/ui/common/button";
import ClientsTable from "@/app/ui/clients-table";

interface ClientsPageProps {
  searchParams: Promise<{ page?: string; limit?: string }>;
}

/**
 * Client list page — server component.
 *
 * Fetches paginated client data from the backend, then renders a
 * PageHeader with breadcrumb + "Nuevo cliente" action, a search
 * input that filters client-side, and a DataTable with pagination.
 */
export default async function ClientsPage({
  searchParams,
}: ClientsPageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = Math.max(
    1,
    Math.min(100, parseInt(params.limit ?? "10", 10) || 10),
  );

  const result = await apiFetch<PaginatedResponse<Client>>(
    `/clients?page=${page}&limit=${limit}`,
  );

  // ---- Error state --------------------------------------------------------
  if (!result.ok) {
    return (
      <div>
        <PageHeader
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Clientes" },
          ]}
          title="Clientes"
        />
        <ErrorMessage message="Error al cargar clientes" />
      </div>
    );
  }

  const { data: clients, meta } = result.data;

  return (
    <div>
      {/* Page header with breadcrumb + CTA */}
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Clientes" },
        ]}
        title="Clientes"
        action={
          <Button variant="primary" href="/dashboard/clientes/nuevo">
            Nuevo cliente
          </Button>
        }
      />

      {/* Search + table — client component for interactive filtering */}
      <ClientsTable clients={clients} />

      {/* Pagination — only shown when there are clients */}
      {clients.length > 0 && (
        <Pagination
          currentPage={page}
          totalPages={Math.ceil(meta.total / limit)}
          basePath="/dashboard/clientes"
        />
      )}
    </div>
  );
}
