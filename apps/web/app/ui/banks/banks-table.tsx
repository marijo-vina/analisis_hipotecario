"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, Landmark, Search } from "lucide-react";
import EmptyState from "@/app/ui/common/empty-state";
import type { Bank } from "@/app/lib/definitions";

interface BanksTableProps {
  banks: Bank[];
}

/**
 * Bank catalog table — client component.
 *
 * Renders a full-width card with a table showing all banks and their
 * CMA policy configuration, with contextual search and active status indicators.
 * Inactive banks remain visible, styled in muted gray, and sorted at the bottom.
 */
export default function BanksTable({ banks }: BanksTableProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredBanks = banks
    .filter(
      (bank) =>
        bank.name.toLowerCase().includes(searchTerm.toLowerCase().trim()) ||
        bank.code.toLowerCase().includes(searchTerm.toLowerCase().trim())
    )
    .sort((a, b) => {
      if (a.isActive === b.isActive) {
        return a.name.localeCompare(b.name);
      }
      return a.isActive ? -1 : 1;
    });

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gf-text">
            Bancos
          </h1>
          <p className="text-sm text-gf-text-muted mt-1">
            Políticas CMA por banco y objetivo del crédito
          </p>
        </div>

        {/* Search input */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gf-text-muted pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar banco, ej. Banorte..."
            className="w-full h-10 pl-9 pr-4 rounded-[10px] border border-gf-border bg-white text-sm text-gf-text focus:outline-none focus:ring-2 focus:ring-gf-red/30 focus:border-gf-red shadow-xs"
          />
        </div>
      </div>

      {/* Table Card */}
      <div className="bg-white rounded-xl border border-gf-border shadow-xs overflow-hidden min-h-[400px] flex flex-col">
        {filteredBanks.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <EmptyState
              icon={<Landmark className="w-12 h-12 text-gf-text-muted stroke-[1.5]" />}
              message={
                banks.length === 0
                  ? "No hay bancos registrados en el catálogo."
                  : "No se encontraron bancos con el criterio de búsqueda."
              }
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
                    Objetivos Activos
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
                {filteredBanks.map((bank) => (
                  <tr
                    key={bank.id}
                    className={`h-[56px] transition-colors ${
                      !bank.isActive
                        ? "bg-gray-50/80 opacity-60 grayscale-[20%]"
                        : "hover:bg-gf-surface-dim/40"
                    }`}
                  >
                    <td className="py-3 px-6">
                      <Link
                        href={`/dashboard/bancos/${bank.code}`}
                        className="flex items-center gap-3 group"
                      >
                        <div
                          className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 ${
                            bank.isActive
                              ? "bg-gf-red-soft text-gf-red"
                              : "bg-gray-200 text-gray-500"
                          }`}
                        >
                          <Building2 className="w-4 h-4" />
                        </div>
                        <span
                          className={`text-sm font-semibold transition-colors ${
                            bank.isActive
                              ? "text-gf-text group-hover:text-gf-red"
                              : "text-gray-500"
                          }`}
                        >
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
                        <span className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full bg-gray-100 text-gf-text font-semibold text-xs border border-gf-border">
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
          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
          : "bg-gray-100 text-gray-500 border border-gray-200"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
          isActive ? "bg-emerald-500" : "bg-gray-400"
        }`}
      />
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
