import Link from "next/link";
import type { CreditType, MortgageCase } from "@/app/lib/definitions";
import { apiFetch } from "@/app/lib/api";
import ErrorMessage from "@/app/ui/error-message";
import PageHeader from "@/app/ui/common/page-header";
import CaseEditForm from "@/app/ui/case-edit-form";

interface CaseEditPageProps {
  params: Promise<{ id: string }>;
}

export default async function CaseEditPage({ params }: CaseEditPageProps) {
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
        <div className="bg-white border border-gf-border rounded-[12px] p-6">
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
            { label: "Editar" },
          ]}
          title="Editar expediente"
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

  // ── Fetch credit types ──────────────────────────────────────────────────
  const creditTypesResult = await apiFetch<{ data: CreditType[] }>(
    "/credit-types",
  );
  const creditTypes: CreditType[] = creditTypesResult.ok
    ? creditTypesResult.data.data
    : [];

  const mortgageCase = result.data;

  return <CaseEditForm mortgageCase={mortgageCase} creditTypes={creditTypes} />;
}
