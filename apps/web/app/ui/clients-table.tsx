"use client";

import { useState } from "react";
import Link from "next/link";
import DataTable from "@/app/ui/common/data-table";
import EmptyState from "@/app/ui/common/empty-state";
import type { Client } from "@/app/lib/definitions";

interface ClientsTableProps {
  clients: Client[];
}

/**
 * Client-side wrapper for the clients list table.
 *
 * Adds a search input that filters the client list by name or email
 * on the client side — no additional backend calls. Preserves the
 * existing pagination contract by only filtering the current page's
 * data.
 */
export default function ClientsTable({ clients }: ClientsTableProps) {
  const [search, setSearch] = useState("");

  const term = search.trim().toLowerCase();
  const filtered = term
    ? clients.filter(
        (c) =>
          c.fullName.toLowerCase().includes(term) ||
          c.email.toLowerCase().includes(term),
      )
    : clients;

  // ---- Zero clients total (no data from server) ---------------------------
  if (clients.length === 0) {
    return (
      <EmptyState
        icon={
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-12 w-12"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
        }
        message="No hay clientes registrados"
        ctaLabel="Crear primer cliente"
        ctaHref="/dashboard/clientes/nuevo"
      />
    );
  }

  // ---- Search active but zero matches -------------------------------------
  if (term && filtered.length === 0) {
    return (
      <>
        <SearchInput value={search} onChange={setSearch} />
        <EmptyState
          icon={
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-12 w-12"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          }
          message={`No se encontraron clientes para "${term}"`}
        />
      </>
    );
  }

  // ---- Data with optional search filter -----------------------------------
  return (
    <>
      <SearchInput value={search} onChange={setSearch} />
      <DataTable
        columns={[
          { key: "fullName", header: "Nombre completo" },
          { key: "email", header: "Correo" },
          { key: "phone", header: "Teléfono" },
          { key: "rfc", header: "RFC" },
          {
            key: "actions",
            header: "Acciones",
            render: (client: Client) => (
              <Link
                href={`/dashboard/clientes/${client.id}`}
                className="text-gf-text font-medium hover:underline"
              >
                Ver
              </Link>
            ),
          },
        ]}
        rows={filtered}
        emptyMessage="No hay clientes"
      />
      {term && (
        <p className="text-gf-text-muted text-sm mt-2">
          Mostrando {filtered.length} de {clients.length} cliente
          {clients.length !== 1 ? "s" : ""} en esta p&aacute;gina
          {clients.length > filtered.length ? " (filtrado)" : ""}
        </p>
      )}
    </>
  );
}

/** Small search input that lives above the table. */
function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="mb-4">
      <div className="relative max-w-md">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gf-text-soft"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          placeholder="Buscar por nombre o correo..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full pl-10 pr-4 py-2 text-sm border border-gf-border rounded-[var(--radius-sm)]
                     focus:outline-none focus:border-gf-red focus:ring-1 focus:ring-gf-red
                     text-gf-text placeholder-gf-text-soft bg-white"
        />
      </div>
    </div>
  );
}
