import Link from "next/link";
import { apiFetch } from "@/app/lib/api";
import ErrorMessage from "@/app/ui/error-message";
import PageHeader from "@/app/ui/common/page-header";
import Button from "@/app/ui/common/button";
import Card from "@/app/ui/common/card";
import DataTable from "@/app/ui/common/data-table";
import StatusBadge from "@/app/ui/status-badge";
import type { Client, MortgageCase, PaginatedResponse } from "@/app/lib/definitions";

interface ClientDetailPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Client detail page — server component.
 *
 * Fetches a single client by ID and renders a detail card with
 * personal information plus a table of associated mortgage cases.
 * Cases are fetched from the mortgage-cases endpoint and filtered
 * by clientId on the server side (backend does not yet support
 * clientId query param — see HU-08 design).
 */
export default async function ClientDetailPage({
  params,
}: ClientDetailPageProps) {
  const { id } = await params;

  // Fetch client and cases in parallel
  const [clientResult, casesResult] = await Promise.all([
    apiFetch<Client>(`/clients/${id}`),
    // Fetch all cases with high limit to filter by clientId client-side.
    // Known limitation: clients with >100 cases will be truncated.
    apiFetch<PaginatedResponse<MortgageCase>>("/mortgage-cases?page=1&limit=100"),
  ]);

  // ---- Not found ----------------------------------------------------------
  if (!clientResult.ok && clientResult.notFound) {
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
        <Card>
          <p className="text-slate-600 mb-4">
            No se encontr&oacute; un cliente con el ID especificado.
          </p>
          <Link
            href="/dashboard/clientes"
            className="text-gf-text font-medium hover:underline"
          >
            &larr; Volver al listado
          </Link>
        </Card>
      </div>
    );
  }

  // ---- Generic error ------------------------------------------------------
  if (!clientResult.ok) {
    return (
      <div>
        <PageHeader
          breadcrumbs={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Clientes", href: "/dashboard/clientes" },
            { label: "Cliente" },
          ]}
          title="Cliente"
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
  const client = clientResult.data;

  // Derive associated cases from the full case list
  const allCases: MortgageCase[] =
    casesResult.ok ? casesResult.data.data : [];
  const associatedCases = allCases.filter((c) => c.clientId === id);

  return (
    <div>
      {/* Page header with breadcrumb + actions */}
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Clientes", href: "/dashboard/clientes" },
          { label: client.fullName },
        ]}
        title={client.fullName}
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              href={`/dashboard/clientes/${id}/editar`}
            >
              Editar cliente
            </Button>
          </div>
        }
      />

      {/* ── Datos personales card ─────────────────────────────────────── */}
      <Card className="mb-6">
        <h3 className="text-base font-semibold text-gf-text mb-4">
          Datos personales
        </h3>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Nombre completo" value={client.fullName} />
          <Field label="Correo electr&oacute;nico" value={client.email} />
          <Field label="Tel&eacute;fono" value={client.phone} />
          <Field label="RFC" value={client.rfc} />
          <Field label="CURP" value={client.curp} />
          <Field
            label="Registrado"
            value={new Date(client.createdAt).toLocaleDateString("es-MX")}
          />
          <Field
            label="Actualizado"
            value={new Date(client.updatedAt).toLocaleDateString("es-MX")}
          />
        </dl>
      </Card>

      {/* ── Expedientes vinculados section ──────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gf-text">
          Expedientes vinculados
        </h2>
        <Button variant="primary" href="/dashboard/expedientes/nuevo">
          Crear expediente
        </Button>
      </div>

      {!casesResult.ok ? (
        <ErrorMessage message="Error al cargar expedientes" />
      ) : (
        <DataTable
          columns={[
            {
              key: "id",
              header: "ID expediente",
              render: (c: MortgageCase) => (
                <span className="font-mono text-xs">{c.id.slice(0, 8)}...</span>
              ),
            },
            {
              key: "creditType",
              header: "Tipo cr\u00e9dito",
              render: (c: MortgageCase) => c.creditType.name,
            },
            {
              key: "amount",
              header: "Monto",
              render: (c: MortgageCase) =>
                c.requestedAmount != null
                  ? `$${Number(c.requestedAmount).toLocaleString("es-MX")}`
                  : "\u2014",
            },
            {
              key: "status",
              header: "Estado",
              render: (c: MortgageCase) => (
                <StatusBadge code={c.status.code} name={c.status.name} />
              ),
            },
            {
              key: "actions",
              header: "Acciones",
              render: (c: MortgageCase) => (
                <Link
                  href={`/dashboard/expedientes/${c.id}`}
                  className="text-gf-text font-medium hover:underline"
                >
                  Ver
                </Link>
              ),
            },
          ]}
          rows={associatedCases}
          emptyMessage="Sin expedientes vinculados"
        />
      )}
    </div>
  );
}

/** Small reusable field for the detail card. */
function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-gf-text-muted">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-gf-text">{value || "\u2014"}</dd>
    </div>
  );
}
