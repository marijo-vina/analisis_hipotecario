import Link from "next/link";
import { apiFetch } from "@/app/lib/api";
import ErrorMessage from "@/app/ui/error-message";
import ClientEditForm from "@/app/ui/client-edit-form";
import type { Client } from "@/app/lib/definitions";

interface ClientEditPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Client edit page — server component.
 *
 * Fetches client data and renders a pre-populated edit form.
 * Handles 404 and generic error states (same pattern as detail page).
 */
export default async function ClientEditPage({ params }: ClientEditPageProps) {
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
        <h2 className="text-2xl font-bold text-slate-900 mb-6">
          Editar cliente
        </h2>
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
          href={`/dashboard/clientes/${id}`}
          className="text-sm text-slate-600 hover:text-slate-900 hover:underline transition-colors"
        >
          &larr; Volver al cliente
        </Link>
      </div>

      <h2 className="text-2xl font-bold text-slate-900 mb-6">
        Editar cliente: {client.fullName}
      </h2>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <ClientEditForm client={client} />
      </div>
    </div>
  );
}
