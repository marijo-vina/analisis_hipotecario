import Link from "next/link";
import { apiFetch } from "@/app/lib/api";
import type { Client, PaginatedResponse } from "@/app/lib/definitions";
import Pagination from "@/app/ui/pagination";
import ErrorMessage from "@/app/ui/error-message";

interface ClientsPageProps {
  searchParams: Promise<{ page?: string; limit?: string }>;
}

/**
 * Client list page — server component.
 *
 * Fetches paginated client data from the backend and renders a table
 * with pagination controls. Handles empty and error states.
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
        <h2 className="text-2xl font-bold text-slate-900 mb-6">Clientes</h2>
        <ErrorMessage message="Error al cargar clientes" />
      </div>
    );
  }

  const { data: clients, meta } = result.data;

  // ---- Empty state --------------------------------------------------------
  if (clients.length === 0) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-slate-900">Clientes</h2>
          <Link
            href="/dashboard/clientes/nuevo"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
          >
            + Nuevo cliente
          </Link>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center text-slate-500">
          No hay clientes registrados
        </div>
      </div>
    );
  }

  // ---- Data state ---------------------------------------------------------
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-900">Clientes</h2>
        <Link
          href="/dashboard/clientes/nuevo"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
        >
          + Nuevo cliente
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left px-4 py-3 font-semibold text-slate-700">
                Nombre
              </th>
              <th className="text-left px-4 py-3 font-semibold text-slate-700 hidden md:table-cell">
                Email
              </th>
              <th className="text-left px-4 py-3 font-semibold text-slate-700 hidden md:table-cell">
                Tel&eacute;fono
              </th>
              <th className="text-left px-4 py-3 font-semibold text-slate-700 hidden lg:table-cell">
                RFC
              </th>
              <th className="text-right px-4 py-3 font-semibold text-slate-700">
                Acci&oacute;n
              </th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <tr
                key={client.id}
                className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
              >
                <td className="px-4 py-3 text-slate-900 font-medium">
                  {client.fullName}
                </td>
                <td className="px-4 py-3 text-slate-600 hidden md:table-cell">
                  {client.email}
                </td>
                <td className="px-4 py-3 text-slate-600 hidden md:table-cell">
                  {client.phone}
                </td>
                <td className="px-4 py-3 text-slate-600 hidden lg:table-cell">
                  {client.rfc || "\u2014"}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/dashboard/clientes/${client.id}`}
                    className="text-slate-900 font-medium hover:underline"
                  >
                    Ver
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        currentPage={page}
        totalPages={Math.ceil(meta.total / limit)}
        basePath="/dashboard/clientes"
      />
    </div>
  );
}
