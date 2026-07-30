import { apiFetch } from "@/app/lib/api";
import type { Client, PaginatedResponse } from "@/app/lib/definitions";
import ErrorMessage from "@/app/ui/error-message";
import ClientsTable from "@/app/ui/clients-table";

interface ClientsPageProps {
  searchParams: Promise<{ page?: string; limit?: string }>;
}

/**
 * Client list page — server component.
 *
 * Fetches paginated client data from the backend and renders the redesigned
 * ClientsTable matching the Stitch "Gestión de clientes - listado detallado" specification.
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
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gf-text">Clientes</h1>
        <ErrorMessage message="Error al cargar la lista de clientes." />
      </div>
    );
  }

  const { data: clients, meta } = result.data;

  return (
    <ClientsTable
      clients={clients}
      total={meta.total}
      page={page}
      limit={limit}
    />
  );
}
