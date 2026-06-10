import type { ReactNode } from "react";
import Link from "next/link";
import { apiFetch } from "@/app/lib/api";
import ErrorMessage from "@/app/ui/error-message";
import type { MortgageCase } from "@/app/lib/definitions";

interface CaseDetailPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Mortgage case detail page — server component.
 *
 * Fetches a single mortgage case by ID and renders a detail card
 * with all relations (client, advisor, creditType, status).
 * Handles 404 (not found) and generic error states.
 */
export default async function CaseDetailPage({ params }: CaseDetailPageProps) {
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
          Expediente
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

  // ---- Success ------------------------------------------------------------
  const c = result.data;

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/dashboard/expedientes"
          className="text-sm text-slate-600 hover:text-slate-900 hover:underline transition-colors"
        >
          &larr; Volver al listado
        </Link>
      </div>

      <h2 className="text-2xl font-bold text-slate-900 mb-6">Expediente</h2>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <dl className="space-y-4">
          <Field label="Cliente" value={c.client.fullName} />
          <Field label="Asesor" value={c.advisor.name} />
          <Field
            label="Tipo de cr&eacute;dito"
            value={`${c.creditType.name} (${c.creditType.code})`}
          />
          <Field
            label="Estado"
            value={
              <StatusBadge code={c.status.code} name={c.status.name} />
            }
          />
          <Field
            label="Tipo de persona"
            value={
              c.personType === "SALARIED"
                ? "Asalariado (SALARIED)"
                : c.personType
            }
          />
          <Field label="Ubicaci&oacute;n" value={c.propertyLocation} />
          <Field
            label="Monto solicitado"
            value={
              c.requestedAmount != null
                ? `$${Number(c.requestedAmount).toLocaleString("es-MX")}`
                : undefined
            }
          />
          <Field
            label="Valor propiedad"
            value={
              c.propertyValue != null
                ? `$${Number(c.propertyValue).toLocaleString("es-MX")}`
                : undefined
            }
          />
          <Field
            label="Plazo estimado"
            value={
              c.estimatedTermMonths != null
                ? `${c.estimatedTermMonths} meses`
                : undefined
            }
          />
          <Field label="Notas" value={c.notes} />
          <Field
            label="Creado"
            value={new Date(c.createdAt).toLocaleDateString("es-MX")}
          />
        </dl>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Renders a read-only field in a detail card. */
function Field({
  label,
  value,
}: {
  label: string;
  value?: string | ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-slate-900">
        {value && typeof value === "string" && value.length > 0
          ? value
          : (value ?? "\u2014")}
      </dd>
    </div>
  );
}

/** Color-coded status pill for the detail card. */
function StatusBadge({
  code,
  name,
}: {
  code: string;
  name: string;
}) {
  const palette = getStatusColor(code);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${palette}`}
    >
      {name}
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
  return "bg-slate-50 text-slate-600 ring-1 ring-inset ring-slate-500/20";
}
