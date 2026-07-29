import Link from "next/link";
import { apiFetch } from "@/app/lib/api";
import ErrorMessage from "@/app/ui/error-message";
import PageHeader from "@/app/ui/common/page-header";
import ClientEditForm from "@/app/ui/client-edit-form";
import type { Client } from "@/app/lib/definitions";

interface ClientEditPageProps {
  params: Promise<{ id: string }>;
}

export default async function ClientEditPage({ params }: ClientEditPageProps) {
  const { id } = await params;

  const result = await apiFetch<Client>(`/clients/${id}`);

  // ---- Not found ----------------------------------------------------------
  if (!result.ok && result.notFound) {
    return (
      <div>
        <PageHeader
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Clientes", href: "/dashboard/clientes" },
            { label: "Cliente no encontrado" },
          ]}
          title="Cliente no encontrado"
        />
        <p className="text-slate-600 mb-4">
          No se encontró un cliente con el ID especificado.
        </p>
        <Link
          href="/dashboard/clientes"
          className="text-gf-text font-medium hover:underline"
        >
          &larr; Volver al listado
        </Link>
      </div>
    );
  }

  // ---- Generic error ------------------------------------------------------
  if (!result.ok) {
    return (
      <div>
        <PageHeader
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Clientes", href: "/dashboard/clientes" },
            { label: "Editar cliente" },
          ]}
          title="Editar cliente"
        />
        <ErrorMessage message="Error al cargar el cliente" />
        <div className="mt-4">
          <Link
            href="/dashboard/clientes"
            className="text-gf-text font-medium hover:underline"
          >
            &larr; Volver al listado
          </Link>
        </div>
      </div>
    );
  }

  // ---- Success ------------------------------------------------------------
  const client = result.data;

  return <ClientEditForm client={client} />;
}
