import Link from "next/link";
import { apiFetch } from "@/app/lib/api";
import type { BankDetail } from "@/app/lib/definitions";
import ErrorMessage from "@/app/ui/error-message";
import BankDetailCard from "@/app/ui/banks/bank-detail-card";

interface BankDetailPageProps {
  params: Promise<{ code: string }>;
}

/**
 * Bank detail page — server component.
 *
 * Fetches the bank with its policies and delegates rendering to
 * BankDetailCard (client), which handles inline editing for both
 * top-level fields and per-policy rows.
 */
export default async function BankDetailPage({ params }: BankDetailPageProps) {
  const { code } = await params;
  const result = await apiFetch<{ data: BankDetail }>(`/banks/${code}`);

  if (!result.ok && result.notFound) {
    return (
      <div>
        <p className="text-gf-text-muted mb-4">
          No se encontró el banco con el código especificado.
        </p>
        <Link
          href="/dashboard/bancos"
          className="text-gf-text font-medium hover:underline"
        >
          &larr; Volver al listado
        </Link>
      </div>
    );
  }

  if (!result.ok) {
    return (
      <div>
        <ErrorMessage message="Error al cargar los datos del banco." />
        <div className="mt-4">
          <Link
            href="/dashboard/bancos"
            className="text-gf-text font-medium hover:underline"
          >
            &larr; Volver al listado
          </Link>
        </div>
      </div>
    );
  }

  return <BankDetailCard bank={result.data.data} />;
}
