import { apiFetch } from "@/app/lib/api";
import type { Bank } from "@/app/lib/definitions";
import ErrorMessage from "@/app/ui/error-message";
import BanksTable from "@/app/ui/banks/banks-table";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Bank catalog list page — server component.
 *
 * Fetches the full bank list from the backend dynamically and delegates rendering
 * to the BanksTable client component.
 */
export default async function BancosPage() {
  const result = await apiFetch<{ data: Bank[] }>("/banks");

  if (!result.ok) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gf-text">Bancos</h1>
        <ErrorMessage message="Error al cargar el catálogo de bancos." />
      </div>
    );
  }

  const banks = result.data.data;

  return <BanksTable banks={banks} />;
}
