"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import DataTable from "@/app/ui/common/data-table";
import EmptyState from "@/app/ui/common/empty-state";
import StatusBadge from "@/app/ui/status-badge";
import type { MortgageCase } from "@/app/lib/definitions";

// ── Person type → human-readable Spanish label ─────────────────────────
const PERSON_TYPE_LABELS: Record<string, string> = {
  SALARIED: "Asalariado",
};

function personTypeLabel(code: string): string {
  return PERSON_TYPE_LABELS[code] ?? code;
}

interface CasesTableProps {
  cases: MortgageCase[];
}

/**
 * Client-side wrapper for the cases list table.
 *
 * Renders filter dropdowns (Cliente, Estatus, Tipo de crédito) that filter
 * on the client side using the current page's data. The DataTable displays
 * cases with Spanish labels, StatusBadge, and action links.
 */
export default function CasesTable({ cases }: CasesTableProps) {
  const [searchClient, setSearchClient] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCreditType, setFilterCreditType] = useState("");

  // Derive unique filter options from current page data
  const clientOptions = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const c of cases) {
      if (!seen.has(c.client.fullName)) {
        seen.add(c.client.fullName);
        result.push(c.client.fullName);
      }
    }
    return result.sort((a, b) => a.localeCompare(b, "es"));
  }, [cases]);

  const statusOptions = useMemo(() => {
    const seen = new Set<string>();
    const result: { code: string; name: string }[] = [];
    for (const c of cases) {
      if (!seen.has(c.status.code)) {
        seen.add(c.status.code);
        result.push({ code: c.status.code, name: c.status.name });
      }
    }
    return result;
  }, [cases]);

  const creditTypeOptions = useMemo(() => {
    const seen = new Set<number>();
    const result: { id: number; name: string }[] = [];
    for (const c of cases) {
      if (!seen.has(c.creditType.id)) {
        seen.add(c.creditType.id);
        result.push({ id: c.creditType.id, name: c.creditType.name });
      }
    }
    return result;
  }, [cases]);

  // Apply filters
  const filtered = cases.filter((c) => {
    if (searchClient && !c.client.fullName.toLowerCase().includes(searchClient.toLowerCase()))
      return false;
    if (filterStatus && c.status.code !== filterStatus) return false;
    if (filterCreditType && String(c.creditType.id) !== filterCreditType) return false;
    return true;
  });

  const hasActiveFilters = !!searchClient || !!filterStatus || !!filterCreditType;

  // Zero cases total — server returned empty page
  if (cases.length === 0) {
    return (
      <EmptyState
        message="No hay expedientes"
        ctaLabel="Crear primer expediente"
        ctaHref="/dashboard/expedientes/nuevo"
      />
    );
  }

  return (
    <>
      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        {/* Cliente filter — select dropdown */}
        <div className="min-w-[200px]">
          <label className="block text-sm font-medium text-gf-text mb-1">
            Cliente
          </label>
          <select
            value={searchClient}
            onChange={(e) => setSearchClient(e.target.value)}
            className="w-full h-[42px] rounded-[var(--radius-sm)] border border-gf-border px-3 py-2 text-sm text-gf-text bg-white focus:outline-none focus:border-gf-red focus:ring-1 focus:ring-gf-red"
          >
            <option value="">Todos</option>
            {clientOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        {/* Estatus filter */}
        <div className="min-w-[200px]">
          <label className="block text-sm font-medium text-gf-text mb-1">
            Estatus
          </label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="w-full h-[42px] rounded-[var(--radius-sm)] border border-gf-border px-3 py-2 text-sm text-gf-text bg-white focus:outline-none focus:border-gf-red focus:ring-1 focus:ring-gf-red"
          >
            <option value="">Todos</option>
            {statusOptions.map(({ code, name }) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </div>

        {/* Tipo de crédito filter */}
        <div className="min-w-[200px]">
          <label className="block text-sm font-medium text-gf-text mb-1">
            Tipo de crédito
          </label>
          <select
            value={filterCreditType}
            onChange={(e) => setFilterCreditType(e.target.value)}
            className="w-full h-[42px] rounded-[var(--radius-sm)] border border-gf-border px-3 py-2 text-sm text-gf-text bg-white focus:outline-none focus:border-gf-red focus:ring-1 focus:ring-gf-red"
          >
            <option value="">Todos</option>
            {creditTypeOptions.map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Active filter with zero matches */}
      {hasActiveFilters && filtered.length === 0 ? (
        <EmptyState message="No se encontraron expedientes con los filtros seleccionados" />
      ) : (
        <>
          <DataTable
            columns={[
              {
                key: "id",
                header: "Expediente",
                render: (c: MortgageCase) => (
                  <span className="font-mono text-xs">
                    {c.id.slice(0, 12)}...
                  </span>
                ),
              },
              {
                key: "client",
                header: "Cliente",
                render: (c: MortgageCase) => c.client.fullName,
              },
              {
                key: "creditType",
                header: "Tipo crédito",
                render: (c: MortgageCase) => c.creditType.name,
              },
              {
                key: "personType",
                header: "Tipo persona",
                render: (c: MortgageCase) => (
                  <span>{personTypeLabel(c.personType)}</span>
                ),
              },
              {
                key: "status",
                header: "Estatus",
                render: (c: MortgageCase) => (
                  <StatusBadge code={c.status.code} name={c.status.name} />
                ),
              },
              {
                key: "documents",
                header: "Documentos",
                render: () => (
                  <span className="text-gf-text-muted">&mdash;</span>
                ),
              },
              {
                key: "actions",
                header: "Acciones",
                render: (c: MortgageCase) => (
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/dashboard/expedientes/${c.id}`}
                      className="text-gf-text font-medium hover:underline"
                    >
                      Ver
                    </Link>
                    <Link
                      href={`/dashboard/expedientes/${c.id}/editar`}
                      className="text-gf-text-muted hover:text-gf-text hover:underline transition-colors"
                    >
                      Editar
                    </Link>
                  </div>
                ),
              },
            ]}
            rows={filtered}
            emptyMessage="No hay expedientes"
          />
          {hasActiveFilters && (
            <p className="text-gf-text-muted text-sm mt-2">
              Mostrando {filtered.length} de {cases.length} expediente
              {cases.length !== 1 ? "s" : ""} en esta página (filtrado)
            </p>
          )}
        </>
      )}
    </>
  );
}
