"use client";

import Link from "next/link";

export default function Topbar() {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-topbar px-content bg-gf-surface border-b border-gf-border ml-sidebar">
      {/* ── Left: search input (visual placeholder only) ──────── */}
      <div className="relative w-full max-w-md">
        {/* Search icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#9CA3AF"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          placeholder="Buscar expedientes, clientes..."
          className="w-full h-input pl-10 pr-4 rounded-lg text-sm bg-gf-bg border border-gf-border text-gf-text placeholder:text-gf-text-soft focus:outline-none focus:border-gf-red focus:ring-2 focus:ring-gf-red/15 transition-colors"
          readOnly
          tabIndex={-1}
          aria-label="Buscar (búsqueda global próximamente)"
        />
      </div>

      {/* ── Right: quick actions ───────────────────────────────── */}
      <div className="flex items-center gap-3 ml-4 shrink-0">
        {/* Nuevo expediente button */}
        <Link
          href="/dashboard/expedientes/nuevo"
          className="inline-flex items-center gap-2 h-input px-4 rounded-lg text-sm font-semibold text-white bg-gf-red hover:bg-gf-red-dark transition-colors shadow-sm"
        >
          {/* Plus icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Nuevo expediente
        </Link>

        {/* Notification bell (visual, non-functional) */}
        <button
          type="button"
          className="relative p-2 rounded-lg text-gf-text-muted hover:bg-gf-bg hover:text-gf-text transition-colors"
          aria-label="Notificaciones"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {/* Dot indicator */}
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-gf-red ring-2 ring-gf-surface" />
        </button>

        {/* User avatar + name placeholder */}
        <div className="flex items-center gap-2.5 pl-4 border-l border-gf-border">
          {/* Avatar circle */}
          <div className="w-9 h-9 rounded-full bg-gf-red-soft flex items-center justify-center shrink-0">
            <span className="text-sm font-semibold text-gf-red">A</span>
          </div>
          <span className="text-sm font-medium text-gf-text hidden md:inline">
            Asesora
          </span>
        </div>
      </div>
    </header>
  );
}
