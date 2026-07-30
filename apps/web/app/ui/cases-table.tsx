"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Plus, Search, Eye, Pencil, FolderOpen, Filter, Folder, CheckCircle, AlertCircle, X } from "lucide-react";
import EmptyState from "@/app/ui/common/empty-state";
import Pagination from "@/app/ui/pagination";
import StatusBadge from "@/app/ui/status-badge";
import type { MortgageCase } from "@/app/lib/definitions";

// ── Person type → human-readable Spanish label ─────────────────────────
const PERSON_TYPE_LABELS: Record<string, string> = {
  SALARIED: "Física (Asalariado)",
};

function personTypeLabel(code: string): string {
  return PERSON_TYPE_LABELS[code] ?? code;
}

function getInitials(name: string): string {
  if (!name) return "EX";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

interface CasesTableProps {
  cases: MortgageCase[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Redesigned Client-side list view for Expedientes.
 *
 * Implements the Stitch "Expedientes - Gestión Financiera" layout:
 * - Header section with Title, Subtitle, and "+ Nuevo expediente" CTA
 * - Bento-style Filter Card (Cliente, Estatus, Tipo de Crédito, Filter Clear)
 * - Data table with Client initial avatars, mono Expediente IDs, document progress, and Eye/Pencil action icons
 * - Integrated Pagination bar
 */
export default function CasesTable({
  cases,
  total,
  page,
  limit,
}: CasesTableProps) {
  const [searchClient, setSearchClient] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCreditType, setFilterCreditType] = useState("");

  const statusOptions = useMemo(() => {
    const seen = new Set<string>();
    const result: { code: string; name: string }[] = [];
    for (const c of cases) {
      if (c.status && !seen.has(c.status.code)) {
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
      if (c.creditType && !seen.has(c.creditType.id)) {
        seen.add(c.creditType.id);
        result.push({ id: c.creditType.id, name: c.creditType.name });
      }
    }
    return result;
  }, [cases]);

  // Apply client-side filters
  const filtered = cases.filter((c) => {
    if (
      searchClient &&
      !c.client.fullName.toLowerCase().includes(searchClient.toLowerCase()) &&
      !c.id.toLowerCase().includes(searchClient.toLowerCase())
    ) {
      return false;
    }
    if (filterStatus && c.status?.code !== filterStatus) return false;
    if (filterCreditType && String(c.creditType?.id) !== filterCreditType) return false;
    return true;
  });

  const hasActiveFilters = !!searchClient || !!filterStatus || !!filterCreditType;

  const resetFilters = () => {
    setSearchClient("");
    setFilterStatus("");
    setFilterCreditType("");
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      {/* Header & Main Action CTA */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 w-full">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gf-text">
            Expedientes
          </h1>
          <p className="text-sm text-gf-text-muted mt-1">
            Gestiona y da seguimiento a todas las operaciones hipotecarias.
          </p>
        </div>

        <Link
          href="/dashboard/expedientes/nuevo"
          className="inline-flex items-center justify-center gap-2 bg-gf-red hover:bg-gf-red-dark text-white px-5 h-11 rounded-xl text-sm font-semibold transition-all shadow-xs shrink-0 whitespace-nowrap active:scale-[0.98] w-full sm:w-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Nuevo expediente</span>
        </Link>
      </div>

      {/* Bento Style Filters Card */}
      <div className="bg-white border border-gf-border rounded-xl p-5 shadow-2xs">
        <div className="flex flex-col md:flex-row gap-4 items-end">
          {/* Cliente search */}
          <div className="w-full md:w-1/3 flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-gf-text-muted uppercase tracking-wider">
              Cliente o ID
            </label>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gf-text-muted" />
              <input
                type="text"
                placeholder="Nombre o ID del expediente"
                value={searchClient}
                onChange={(e) => setSearchClient(e.target.value)}
                className="w-full h-11 pl-10 pr-4 rounded-xl border border-gf-border bg-white text-gf-text text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gf-red focus:border-transparent transition-all shadow-2xs placeholder-gf-text-muted"
              />
            </div>
          </div>

          {/* Estatus select */}
          <div className="w-full md:w-1/4 flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-gf-text-muted uppercase tracking-wider">
              Estatus
            </label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full h-11 px-4 rounded-xl border border-gf-border bg-white text-gf-text text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gf-red focus:border-transparent transition-all cursor-pointer shadow-2xs"
            >
              <option value="">Todos los estatus</option>
              {statusOptions.map(({ code, name }) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {/* Tipo de crédito select */}
          <div className="w-full md:w-1/4 flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-gf-text-muted uppercase tracking-wider">
              Tipo de crédito
            </label>
            <select
              value={filterCreditType}
              onChange={(e) => setFilterCreditType(e.target.value)}
              className="w-full h-11 px-4 rounded-xl border border-gf-border bg-white text-gf-text text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gf-red focus:border-transparent transition-all cursor-pointer shadow-2xs"
            >
              <option value="">Todos los tipos</option>
              {creditTypeOptions.map(({ id, name }) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {/* Action button */}
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={resetFilters}
              className="w-full md:w-auto h-11 px-5 rounded-xl border border-gf-border text-gf-text-muted hover:text-gf-text hover:bg-gf-surface-dim transition-colors text-sm font-semibold flex items-center justify-center gap-2 shrink-0 shadow-2xs"
            >
              <X className="w-4 h-4" />
              <span>Limpiar</span>
            </button>
          ) : (
            <div className="w-full md:w-auto h-11 px-5 rounded-xl border border-gf-border text-gf-text-muted/60 text-sm font-medium flex items-center justify-center gap-2 shrink-0 bg-gf-surface-dim/40 cursor-default">
              <Filter className="w-4 h-4" />
              <span>Filtros</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Table Card Container */}
      <div className="bg-white rounded-xl border border-gf-border shadow-xs overflow-hidden min-h-[400px] flex flex-col">
        {cases.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <EmptyState
              icon={<FolderOpen className="w-12 h-12 text-gf-text-muted stroke-[1.5]" />}
              message="No hay expedientes registrados"
              ctaLabel="Crear primer expediente"
              ctaHref="/dashboard/expedientes/nuevo"
            />
          </div>
        ) : hasActiveFilters && filtered.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <EmptyState
              icon={<Search className="w-12 h-12 text-gf-text-muted stroke-[1.5]" />}
              message="No se encontraron expedientes con los filtros seleccionados"
            />
          </div>
        ) : (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="border-b border-gf-border bg-gf-surface-dim/60">
                  <th scope="col" className="py-4 px-6 text-xs font-semibold text-gf-text-muted uppercase tracking-wider">
                    Expediente
                  </th>
                  <th scope="col" className="py-4 px-6 text-xs font-semibold text-gf-text-muted uppercase tracking-wider">
                    Cliente
                  </th>
                  <th scope="col" className="py-4 px-6 text-xs font-semibold text-gf-text-muted uppercase tracking-wider">
                    Objetivo del crédito
                  </th>
                  <th scope="col" className="py-4 px-6 text-xs font-semibold text-gf-text-muted uppercase tracking-wider">
                    Perfil del solicitante
                  </th>
                  <th scope="col" className="py-4 px-6 text-xs font-semibold text-gf-text-muted uppercase tracking-wider">
                    Estatus
                  </th>
                  <th scope="col" className="py-4 px-6 text-xs font-semibold text-gf-text-muted uppercase tracking-wider">
                    Documentos
                  </th>
                  <th scope="col" className="py-4 px-6 text-xs font-semibold text-gf-text-muted uppercase tracking-wider text-right">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gf-border">
                {filtered.map((c) => {
                  const clientName = c.client?.fullName || "Cliente sin nombre";
                  const initials = getInitials(clientName);
                  const caseCode = `EXP-${c.id.slice(0, 8).toUpperCase()}`;
                  const docCount = c.documents?.length ?? 0;

                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-gf-surface-dim/40 transition-colors h-[56px] group"
                    >
                      {/* Expediente ID */}
                      <td className="py-3 px-6 text-sm font-semibold font-mono text-gf-red">
                        {caseCode}
                      </td>

                      {/* Cliente with Avatar */}
                      <td className="py-3 px-6 text-sm text-gf-text">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gf-red-soft text-gf-red flex items-center justify-center font-bold text-xs shrink-0">
                            {initials}
                          </div>
                          <span className="font-semibold text-gf-text">{clientName}</span>
                        </div>
                      </td>

                      {/* Objetivo del crédito */}
                      <td className="py-3 px-6 text-sm text-gf-text-muted font-medium">
                        {c.creditType?.name || "—"}
                      </td>

                      {/* Perfil del solicitante */}
                      <td className="py-3 px-6 text-sm text-gf-text-muted">
                        {personTypeLabel(c.personType)}
                      </td>

                      {/* Estatus Badge */}
                      <td className="py-3 px-6 text-sm">
                        <StatusBadge code={c.status?.code ?? "PENDING"} name={c.status?.name ?? "En Proceso"} />
                      </td>

                      {/* Documentos Status */}
                      <td className="py-3 px-6 text-sm text-gf-text-muted">
                        {docCount > 0 ? (
                          <div className="flex items-center gap-1.5 text-xs font-medium">
                            <Folder className="w-4 h-4 text-gf-tertiary" />
                            <span>{docCount} doc{docCount !== 1 ? "s" : ""}</span>
                          </div>
                        ) : (
                          <span className="text-gf-text-muted/60">&mdash;</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href={`/dashboard/expedientes/${c.id}`}
                            className="p-2 text-gf-text-muted hover:text-gf-red hover:bg-gf-red-soft/40 transition-colors rounded-lg"
                            title="Ver detalles del expediente"
                            aria-label={`Ver expediente ${caseCode}`}
                          >
                            <Eye className="w-4 h-4" />
                          </Link>
                          <Link
                            href={`/dashboard/expedientes/${c.id}/editar`}
                            className="p-2 text-gf-text-muted hover:text-gf-red hover:bg-gf-red-soft/40 transition-colors rounded-lg"
                            title="Editar expediente"
                            aria-label={`Editar expediente ${caseCode}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Integrated Pagination Footer */}
        {cases.length > 0 && (
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={total}
            limit={limit}
            basePath="/dashboard/expedientes"
            itemLabel="expedientes"
          />
        )}
      </div>
    </div>
  );
}

