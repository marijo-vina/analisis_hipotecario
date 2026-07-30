import { apiFetch } from "@/app/lib/api";
import type { MortgageCase, PaginatedResponse } from "@/app/lib/definitions";
import ErrorMessage from "@/app/ui/error-message";
import CasesTable from "@/app/ui/cases-table";

interface CasesPageProps {
  searchParams: Promise<{ page?: string; limit?: string }>;
}

/**
 * Mortgage case list page — server component.
 *
 * Fetches paginated case data from the backend and renders the redesigned
 * CasesTable matching the Stitch "Expedientes - Gestión Financiera" specification.
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

  // ── Error state ───────────────────────────────────────────────────────
  if (!result.ok) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gf-text">Expedientes</h1>
        <ErrorMessage message="Error al cargar la lista de expedientes." />
      </div>
    );
  }

  const { data: cases, meta } = result.data;

  return (
    <CasesTable
      cases={cases}
      total={meta.total}
      page={page}
      limit={limit}
    />
  );
}

