import { apiFetch } from "@/app/lib/api";
import type { Client, CreditType, PaginatedResponse } from "@/app/lib/definitions";
import PageHeader from "@/app/ui/common/page-header";
import CaseForm from "@/app/ui/case-form";

/**
 * New mortgage case page — server component wrapper.
 *
 * Fetches available credit types and the client list from the backend
 * to populate the select dropdowns. Filters credit types to only active.
 * Passes both lists as props to the client-side CaseForm.
 */
export default async function NuevoExpedientePage() {
  let creditTypes: CreditType[] = [];
  let clients: Client[] = [];

  const ctResult = await apiFetch<{ data: CreditType[] }>("/credit-types");
  if (ctResult.ok) {
    creditTypes = (ctResult.data.data ?? []).filter((ct) => ct.isActive);
  } else {
    console.warn(
      "No se pudieron cargar los tipos de crédito. El select quedará vacío.",
    );
  }

  const clientsResult = await apiFetch<PaginatedResponse<Client>>(
    "/clients?page=1&limit=100",
  );
  if (clientsResult.ok) {
    clients = clientsResult.data.data ?? [];
  } else {
    console.warn(
      "No se pudieron cargar los clientes. El select quedará vacío.",
    );
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Expedientes", href: "/dashboard/expedientes" },
          { label: "Nuevo expediente" },
        ]}
        title="Nuevo expediente"
      />
      <CaseForm creditTypes={creditTypes} clients={clients} />
    </div>
  );
}
