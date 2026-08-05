"use client";

import Link from "next/link";
import { Building2, Landmark } from "lucide-react";
import EmptyState from "@/app/ui/common/empty-state";
import type { Bank } from "@/app/lib/definitions";

interface BanksTableProps {
  banks: Bank[];
}

/**
 * Bank catalog table — client component.
 *
 * Renders a full-width card with a table showing all banks and their
 * CMA policy configuration. Each row is a clickable link navigating
 * to the bank detail page at /dashboard/bancos/[code].
 */
export default function BanksTable({ banks }: BanksTableProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gf-text">
          Bancos
        </h1>
        <p className="text-sm text-gf-text-muted mt-1">
          Políticas CMA por banco y destino
        </p>
      </div>

      {/* Table Card */}
      <div className="bg-white rounded-xl border border-gf-border shadow-xs overflow-hidden min-h-[400px] flex flex-col">
        {banks.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <EmptyState
              icon={<Landmark className="w-12 h-12 text-gf-text-muted stroke-[1.5]" />}
              message="No hay bancos registrados en el catálogo."
            />
          </div>
        ) : (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse min-w-[760px]">
              <thead>
                <tr className="border-b border-gf-border bg-gf-surface-dim/60">
                  <th
                    scope="col"
                    className="py-4 px-6 text-xs font-semibold text-gf-text-muted uppercase tracking-wider"
                  >
                    Banco
                  </th>
                  <th
                    scope="col"
                    className="py-4 px-6 text-xs font-semibold text-gf-text-muted uppercase tracking-wider"
                  >
                    Tipo Ingreso
                  </th>
                  <th
                    scope="col"
                    className="py-4 px-6 text-xs font-semibold text-gf-text-muted uppercase tracking-wider"
                  >
                    CE
                  </th>
                  <th
                    scope="col"
                    className="py-4 px-6 text-xs font-semibold text-gf-text-muted uppercase tracking-wider"
                  >
                    Score Mínimo
                  </th>
                  <th
                    scope="col"
                    className="py-4 px-6 text-xs font-semibold text-gf-text-muted uppercase tracking-wider text-center"
                  >
                    Destinos Activos
                  </th>
                  <th
                    scope="col"
                    className="py-4 px-6 text-xs font-semibold text-gf-text-muted uppercase tracking-wider"
                  >
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gf-border">
                {banks.map((bank) => (
                  <tr
                    key={bank.id}
                    className="hover:bg-gf-surface-dim/40 transition-colors h-[56px]"
                  >
                    <td className="py-3 px-6">
                      <Link
                        href={`/dashboard/bancos/${bank.code}`}
                        className="flex items-center gap-3 group"
                      >
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gf-red-soft text-gf-red shrink-0">
                          <Building2 className="w-4 h-4" />
                        </div>
                        <span className="text-sm font-semibold text-gf-text group-hover:text-gf-red transition-colors">
                          {bank.name}
                        </span>
                      </Link>
                    </td>
                    <td className="py-3 px-6">
                      <Link href={`/dashboard/bancos/${bank.code}`} className="block h-full">
                        <IncomeCriterionBadge criterion={bank.incomeCriterion} />
                      </Link>
                    </td>
                    <td className="py-3 px-6">
                      <Link href={`/dashboard/bancos/${bank.code}`} className="block h-full">
                        <span className="text-sm text-gf-text font-medium">
                          {formatPercentage(bank.debtCommitmentFactor)}
                        </span>
                      </Link>
                    </td>
                    <td className="py-3 px-6">
                      <Link href={`/dashboard/bancos/${bank.code}`} className="block h-full">
                        <span className="text-sm text-gf-text-muted">
                          {bank.minimumBureauScore ?? "—"}
                        </span>
                      </Link>
                    </td>
                    <td className="py-3 px-6 text-center">
                      <Link href={`/dashboard/bancos/${bank.code}`} className="block h-full">
                        <span className="text-sm text-gf-text font-medium">
                          {bank._count?.policies ?? 0}
                        </span>
                      </Link>
                    </td>
                    <td className="py-3 px-6">
                      <Link href={`/dashboard/bancos/${bank.code}`} className="block h-full">
                        <ActiveBadge isActive={bank.isActive} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Inline sub-components (badges)
 * ------------------------------------------------------------------------- */

function IncomeCriterionBadge({ criterion }: { criterion: string }) {
  const isNet = criterion === "NET";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        isNet
          ? "bg-blue-50 text-blue-700"
          : "bg-gray-100 text-gray-700"
      }`}
    >
      {isNet ? "Neto" : "Bruto"}
    </span>
  );
}

function ActiveBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        isActive
          ? "bg-emerald-50 text-emerald-700"
          : "bg-gray-100 text-gray-500"
      }`}
    >
      {isActive ? "Activo" : "Inactivo"}
    </span>
  );
}

/* ---------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

function formatPercentage(value: number): string {
  return `${Math.round(value * 100)}%`;
}
