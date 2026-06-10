import Link from "next/link";
import { apiFetch } from "@/app/lib/api";
import type { MortgageCase, PaginatedResponse } from "@/app/lib/definitions";
import Pagination from "@/app/ui/pagination";
import ErrorMessage from "@/app/ui/error-message";

interface CasesPageProps {
  searchParams: Promise<{ page?: string; limit?: string }>;
}

/**
 * Mortgage case list page — server component.
 *
 * Fetches paginated case data from the backend and renders a table
 * with pagination controls. Handles empty and error states.
 */
export default async function CasesPage({ searchParams }: CasesPageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = Math.max(
    1,
    Math.min(100, parseInt(params.limit ?? "10", 10) || 10),
  );

  const result = await apiFetch<PaginatedResponse<MortgageCase>>(
    `/mortgage-cases?page=${page}&limit=${limit}`,
  );

  // ---- Header with "+ Nuevo expediente" button (shared across states) -----
  const header = (
    <div className="flex items-center justify-between mb-6">
      <h2 className="text-2xl font-bold text-slate-900">Expedientes</h2>
      <Link
        href="/dashboard/expedientes/nuevo"
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
      >
        + Nuevo expediente
      </Link>
    </div>
  );

  // ---- Error state --------------------------------------------------------
  if (!result.ok) {
    return (
      <div>
        {header}
        <ErrorMessage message="Error al cargar expedientes" />
      </div>
    );
  }

  const { data: cases, meta } = result.data;

  // ---- Empty state --------------------------------------------------------
  if (cases.length === 0) {
    return (
      <div>
        {header}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center text-slate-500">
          No hay expedientes registrados
        </div>
      </div>
    );
  }

  // ---- Data state ---------------------------------------------------------
  return (
    <div>
      {header}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left px-4 py-3 font-semibold text-slate-700">
                Cliente
              </th>
              <th className="text-left px-4 py-3 font-semibold text-slate-700 hidden md:table-cell">
                Tipo
              </th>
              <th className="text-left px-4 py-3 font-semibold text-slate-700">
                Estado
              </th>
              <th className="text-right px-4 py-3 font-semibold text-slate-700 hidden sm:table-cell">
                Monto
              </th>
              <th className="text-right px-4 py-3 font-semibold text-slate-700 hidden lg:table-cell">
                Fecha
              </th>
              <th className="text-right px-4 py-3 font-semibold text-slate-700">
                Acci&oacute;n
              </th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => (
              <tr
                key={c.id}
                className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
              >
                <td className="px-4 py-3 text-slate-900 font-medium">
                  {c.client.fullName}
                </td>
                <td className="px-4 py-3 text-slate-600 hidden md:table-cell">
                  {c.creditType.name}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={c.status} />
                </td>
                <td className="px-4 py-3 text-right text-slate-600 hidden sm:table-cell">
                  {c.requestedAmount != null
                    ? `$${Number(c.requestedAmount).toLocaleString("es-MX")}`
                    : "\u2014"}
                </td>
                <td className="px-4 py-3 text-right text-slate-600 hidden lg:table-cell">
                  {new Date(c.createdAt).toLocaleDateString("es-MX")}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/dashboard/expedientes/${c.id}`}
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
        basePath="/dashboard/expedientes"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Color-coded status pill rendered inline in the table. */
function StatusBadge({ status }: { status: { code: string; name: string } }) {
  const palette = getStatusColor(status.code);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${palette}`}
    >
      {status.name}
    </span>
  );
}

/** Map a status code to Tailwind badge classes. */
function getStatusColor(code: string): string {
  const lower = code.toLowerCase();
  if (lower.includes("pending") || lower.includes("pendiente")) {
    return "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20";
  }
  if (
    lower.includes("approved") ||
    lower.includes("aprobado") ||
    lower.includes("aprobada")
  ) {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20";
  }
  if (
    lower.includes("rejected") ||
    lower.includes("rechazado") ||
    lower.includes("rechazada")
  ) {
    return "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20";
  }
  if (
    lower.includes("review") ||
    lower.includes("revisión") ||
    lower.includes("revision")
  ) {
    return "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20";
  }
  if (
    lower.includes("closed") ||
    lower.includes("cerrado") ||
    lower.includes("cerrada")
  ) {
    return "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-600/20";
  }
  // Default — grey neutral pill
  return "bg-slate-50 text-slate-600 ring-1 ring-inset ring-slate-500/20";
}
