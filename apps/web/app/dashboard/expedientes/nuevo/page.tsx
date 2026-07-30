import { apiFetch } from "@/app/lib/api";
import type { Client, CreditType, PaginatedResponse } from "@/app/lib/definitions";
import CaseForm from "@/app/ui/case-form";

interface NuevoExpedientePageProps {
  searchParams: Promise<{ clientId?: string }>;
}

/**
 * New mortgage case page — server component wrapper.
 *
 * Fetches available credit types and the client list from the backend.
 * Optionally reads `clientId` from query params (when navigated from Client Detail)
 * and passes it down to pre-select the client.
 */
export default async function NuevoExpedientePage({
  searchParams,
}: NuevoExpedientePageProps) {
  const { clientId } = await searchParams;
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
    <CaseForm
      creditTypes={creditTypes}
      clients={clients}
      initialClientId={clientId}
    />
  );
}

