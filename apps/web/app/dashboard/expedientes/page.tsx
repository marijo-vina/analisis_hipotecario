import { apiFetch } from "@/app/lib/api";
import type { MortgageCase, PaginatedResponse } from "@/app/lib/definitions";
import Pagination from "@/app/ui/pagination";
import ErrorMessage from "@/app/ui/error-message";
import PageHeader from "@/app/ui/common/page-header";
import Button from "@/app/ui/common/button";
import CasesTable from "@/app/ui/cases-table";

interface CasesPageProps {
  searchParams: Promise<{ page?: string; limit?: string }>;
}

/**
 * Mortgage case list page — server component.
 *
 * Fetches paginated case data from the backend and renders a PageHeader
 * with action button, a CasesTable client component with filter dropdowns,
 * and Pagination controls. Error and empty states are handled inline.
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

  // Shared header rendered in all states
  const header = (
    <PageHeader
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Expedientes" },
      ]}
      title="Expedientes"
      action={
        <Button variant="primary" href="/dashboard/expedientes/nuevo">
          Nuevo expediente
        </Button>
      }
    />
  );

  // ── Error state ───────────────────────────────────────────────────────
  if (!result.ok) {
    return (
      <div>
        {header}
        <ErrorMessage message="Error al cargar expedientes" />
      </div>
    );
  }

  const { data: cases, meta } = result.data;

  return (
    <div>
      {header}

      <CasesTable cases={cases} />

      {meta.total > limit && (
        <Pagination
          currentPage={page}
          totalPages={Math.ceil(meta.total / limit)}
          basePath="/dashboard/expedientes"
        />
      )}
    </div>
  );
}
