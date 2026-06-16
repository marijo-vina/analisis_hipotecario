import Link from "next/link";
import { apiFetch } from "@/app/lib/api";
import ErrorMessage from "@/app/ui/error-message";
import type { Client } from "@/app/lib/definitions";

interface ClientDetailPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Client detail page — server component.
 *
 * Fetches a single client by ID and renders a detail card.
 * Handles 404 (not found) and generic error states.
 * Linked mortgage cases are OUT OF SCOPE for HU-04.
 */
export default async function ClientDetailPage({
  params,
}: ClientDetailPageProps) {
  const { id } = await params;

  const result = await apiFetch<Client>(`/clients/${id}`);

  // ---- Not found ----------------------------------------------------------
  if (!result.ok && result.notFound) {
    return (
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-6">
          Cliente no encontrado
        </h2>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <p className="text-slate-600 mb-4">
            No se encontr&oacute; un cliente con el ID especificado.
          </p>
          <Link
            href="/dashboard/clientes"
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
        <h2 className="text-2xl font-bold text-slate-900 mb-6">Cliente</h2>
        <ErrorMessage message="Error al cargar el cliente" />
        <div className="mt-4">
          <Link
            href="/dashboard/clientes"
            className="text-slate-900 font-medium hover:underline"
          >
            &larr; Volver al listado
          </Link>
        </div>
      </div>
    );
  }

  // ---- Success ------------------------------------------------------------
  const client = result.data;

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/dashboard/clientes"
          className="text-sm text-slate-600 hover:text-slate-900 hover:underline transition-colors"
        >
          &larr; Volver al listado
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-slate-900">
          {client.fullName}
        </h2>
        <Link
          href={`/dashboard/clientes/${id}/editar`}
          className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 transition-colors"
        >
          Editar cliente
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <dl className="space-y-4">
          <Field label="RFC" value={client.rfc} />
          <Field label="CURP" value={client.curp} />
          <Field label="Email" value={client.email} />
          <Field label="Tel&eacute;fono" value={client.phone} />
          <Field
            label="Registrado"
            value={new Date(client.createdAt).toLocaleDateString("es-MX")}
          />
          <Field
            label="Actualizado"
            value={new Date(client.updatedAt).toLocaleDateString("es-MX")}
          />
        </dl>
      </div>
    </div>
  );
}

/** Small reusable field for the detail card. */
function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-slate-900">{value || "\u2014"}</dd>
    </div>
  );
}
