import { apiFetch } from "@/app/lib/api";
import type { Client, CreditType, PaginatedResponse } from "@/app/lib/definitions";
import CaseForm from "@/app/ui/case-form";

/**
 * New mortgage case page — server component wrapper.
 *
 * Fetches available credit types and the client list from the backend.
 * Passes both lists as props to the redesigned CaseForm.
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

  return <CaseForm creditTypes={creditTypes} clients={clients} />;
}
