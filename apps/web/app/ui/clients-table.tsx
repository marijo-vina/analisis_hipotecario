"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, UserPlus, Eye, Pencil, Users } from "lucide-react";
import EmptyState from "@/app/ui/common/empty-state";
import Pagination from "@/app/ui/pagination";
import type { Client } from "@/app/lib/definitions";

interface ClientsTableProps {
  clients: Client[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Redesigned Client-side list view for Clientes.
 *
 * Implements the Stitch "Gestión de clientes - listado detallado" layout:
 * - Header section with Title, Subtitle, Search Input, and "+ Nuevo cliente" CTA
 * - Elevated data table with 56px row height and subtle hover states
 * - Direct action icons (Eye for details, Pencil for editing)
 * - Integrated Pagination bar with item counts and numbered buttons
 */
export default function ClientsTable({
  clients,
  total,
  page,
  limit,
}: ClientsTableProps) {
  const [search, setSearch] = useState("");

  const term = search.trim().toLowerCase();
  const filtered = term
    ? clients.filter(
        (c) =>
          c.fullName.toLowerCase().includes(term) ||
          c.email.toLowerCase().includes(term) ||
          (c.curp && c.curp.toLowerCase().includes(term)) ||
          (c.rfc && c.rfc.toLowerCase().includes(term))
      )
    : clients;

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      {/* Top Header & Action Controls Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 w-full">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gf-text">
            Clientes
          </h1>
          <p className="text-sm text-gf-text-muted mt-1">
            Gestiona la información de tus clientes y sus expedientes.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Search Input */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gf-text-muted" />
            <input
              type="text"
              placeholder="Buscar por nombre o correo"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gf-border rounded-xl text-sm font-medium text-gf-text placeholder-gf-text-muted focus:outline-none focus:ring-2 focus:ring-gf-red focus:border-transparent transition-all h-11 shadow-2xs"
            />
          </div>

          {/* CTA Button */}
          <Link
            href="/dashboard/clientes/nuevo"
            className="inline-flex items-center justify-center gap-2 bg-gf-red hover:bg-gf-red-dark text-white px-5 h-11 rounded-xl text-sm font-semibold transition-all shadow-xs shrink-0 whitespace-nowrap active:scale-[0.98]"
          >
            <UserPlus className="w-4 h-4" />
            <span>Nuevo cliente</span>
          </Link>
        </div>
      </div>

      {/* Main Table Card Container */}
      <div className="bg-white rounded-xl border border-gf-border shadow-xs overflow-hidden min-h-[400px] flex flex-col">
        {clients.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <EmptyState
              icon={<Users className="w-12 h-12 text-gf-text-muted stroke-[1.5]" />}
              message="No hay clientes registrados"
              ctaLabel="Crear primer cliente"
              ctaHref="/dashboard/clientes/nuevo"
            />
          </div>
        ) : term && filtered.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <EmptyState
              icon={<Search className="w-12 h-12 text-gf-text-muted stroke-[1.5]" />}
              message={`No se encontraron clientes para "${term}"`}
            />
          </div>
        ) : (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse min-w-[760px]">
              <thead>
                <tr className="border-b border-gf-border bg-gf-surface-dim/60">
                  <th scope="col" className="py-4 px-6 text-xs font-semibold text-gf-text-muted uppercase tracking-wider">
                    Nombre completo
                  </th>
                  <th scope="col" className="py-4 px-6 text-xs font-semibold text-gf-text-muted uppercase tracking-wider">
                    Correo electrónico
                  </th>
                  <th scope="col" className="py-4 px-6 text-xs font-semibold text-gf-text-muted uppercase tracking-wider">
                    Teléfono
                  </th>
                  <th scope="col" className="py-4 px-6 text-xs font-semibold text-gf-text-muted uppercase tracking-wider">
                    CURP / RFC
                  </th>
                  <th scope="col" className="py-4 px-6 text-xs font-semibold text-gf-text-muted uppercase tracking-wider text-right">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gf-border">
                {filtered.map((client) => (
                  <tr
                    key={client.id}
                    className="hover:bg-gf-surface-dim/40 transition-colors h-[56px] group"
                  >
                    <td className="py-3 px-6 text-sm font-semibold text-gf-text">
                      {client.fullName}
                    </td>
                    <td className="py-3 px-6 text-sm text-gf-text-muted">
                      {client.email}
                    </td>
                    <td className="py-3 px-6 text-sm text-gf-text-muted">
                      {client.phone}
                    </td>
                    <td className="py-3 px-6 text-sm font-mono text-gf-text-muted">
                      {client.curp || client.rfc || "—"}
                    </td>
                    <td className="py-3 px-6 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          href={`/dashboard/clientes/${client.id}`}
                          className="p-2 text-gf-text-muted hover:text-gf-red hover:bg-gf-red-soft/40 transition-colors rounded-lg"
                          title="Ver expediente del cliente"
                          aria-label={`Ver expediente de ${client.fullName}`}
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                        <Link
                          href={`/dashboard/clientes/${client.id}/editar`}
                          className="p-2 text-gf-text-muted hover:text-gf-red hover:bg-gf-red-soft/40 transition-colors rounded-lg"
                          title="Editar información del cliente"
                          aria-label={`Editar cliente ${client.fullName}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Integrated Pagination Footer */}
        {clients.length > 0 && (
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={total}
            limit={limit}
            basePath="/dashboard/clientes"
            itemLabel="clientes"
          />
        )}
      </div>
    </div>
  );
}

