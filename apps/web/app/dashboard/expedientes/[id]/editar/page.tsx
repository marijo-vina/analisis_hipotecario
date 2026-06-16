import type { CreditType, MortgageCase } from "@/app/lib/definitions";
import Link from "next/link";
import { apiFetch } from "@/app/lib/api";
import ErrorMessage from "@/app/ui/error-message";
import CaseEditForm from "@/app/ui/case-edit-form";

interface CaseEditPageProps {
  params: Promise<{ id: string }>;
}

export default async function CaseEditPage({ params }: CaseEditPageProps) {
  const { id } = await params;

  const result = await apiFetch<MortgageCase>(`/mortgage-cases/${id}`);

  // ---- Not found ----------------------------------------------------------
  if (!result.ok && result.notFound) {
    return (
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-6">
          Expediente no encontrado
        </h2>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <p className="text-slate-600 mb-4">
            No se encontr&oacute; un expediente con el ID especificado.
          </p>
          <Link
            href="/dashboard/expedientes"
            className="text-slate-900 font-medium hover:underline"
          >
            &larr; Volver al listado
          </Link>
        </div>
      </div>
    );
  }

  // ---- Generic error ------------------------------------------------------
  if (!result.ok) {
    return (
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-6">
          Editar expediente
        </h2>
        <ErrorMessage message="Error al cargar el expediente" />
        <div className="mt-4">
          <Link
            href="/dashboard/expedientes"
            className="text-slate-900 font-medium hover:underline"
          >
            &larr; Volver al listado
          </Link>
        </div>
      </div>
    );
  }

  // ---- Fetch credit types ------------------------------------------------
  const creditTypesResult = await apiFetch<{ data: CreditType[] }>("/credit-types");
  const creditTypes: CreditType[] = creditTypesResult.ok
    ? creditTypesResult.data.data
    : [];

  const mortgageCase = result.data;

  return (
    <div>
      <div className="mb-6">
        <Link
          href={`/dashboard/expedientes/${id}`}
          className="text-sm text-slate-600 hover:text-slate-900 hover:underline transition-colors"
        >
          &larr; Volver al expediente
        </Link>
      </div>

      <h2 className="text-2xl font-bold text-slate-900 mb-6">
        Editar expediente
      </h2>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <CaseEditForm mortgageCase={mortgageCase} creditTypes={creditTypes} />
      </div>
    </div>
  );
}
