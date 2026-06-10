"use client";

import { useState, useRef, useEffect } from "react";
import type { Client } from "@/app/lib/definitions";

interface ClientSelectorProps {
  clients: Client[];
}

/**
 * Searchable client selector — replaces a plain <select>.
 *
 * The user types a name, email, or phone number to filter the client list
 * locally. Matching clients appear in a dropdown. On selection the chosen
 * client is displayed as a chip and a hidden input carries the UUID into
 * the parent form (name="clientId").
 */
export default function ClientSelector({ clients }: ClientSelectorProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Client | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = query.trim()
    ? clients.filter((c) => {
        const q = query.toLowerCase();
        return (
          c.fullName.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          (c.phone && c.phone.includes(q))
        );
      })
    : [];

  const handleSelect = (client: Client) => {
    setSelected(client);
    setQuery("");
    setIsOpen(false);
  };

  const handleClear = () => {
    setSelected(null);
    setQuery("");
  };

  const handleFocus = () => {
    if (query.trim()) setIsOpen(true);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    if (selected) setSelected(null);
    setIsOpen(true);
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Hidden input: carries the actual value for the Server Action */}
      <input
        type="hidden"
        name="clientId"
        value={selected?.id ?? ""}
      />

      {selected ? (
        /* ---- Selected client chip ---- */
        <div className="flex items-center justify-between rounded-lg border border-slate-300 bg-slate-50 px-3 py-2">
          <span className="text-sm text-slate-900">
            {selected.fullName}
            <span className="ml-2 text-xs text-slate-500">
              {selected.email}
            </span>
          </span>
          <button
            type="button"
            onClick={handleClear}
            className="ml-2 text-slate-400 hover:text-red-500 transition-colors"
            aria-label="Quitar cliente seleccionado"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      ) : (
        /* ---- Search input ---- */
        <input
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={handleFocus}
          placeholder="Buscar por nombre, email o teléfono..."
          autoComplete="off"
          className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm placeholder-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
      )}

      {/* ---- Dropdown ---- */}
      {isOpen && filtered.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg max-h-60 overflow-auto">
          {filtered.map((client) => (
            <li key={client.id}>
              <button
                type="button"
                onClick={() => handleSelect(client)}
                className="w-full text-left px-3 py-2 text-sm text-slate-900 hover:bg-slate-100 transition-colors"
              >
                <span className="font-medium">{client.fullName}</span>
                <span className="ml-2 text-xs text-slate-500">
                  {client.email}
                  {client.phone && ` — ${client.phone}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Empty state: query entered but no matches */}
      {isOpen && query.trim() && filtered.length === 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg px-3 py-2 text-sm text-slate-500">
          No se encontraron clientes.
        </div>
      )}
    </div>
  );
}
