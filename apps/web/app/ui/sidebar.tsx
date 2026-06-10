"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/actions/auth";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard", emoji: "📊" },
  { href: "/dashboard/clientes", label: "Clientes", emoji: "👥" },
  { href: "/dashboard/expedientes", label: "Expedientes", emoji: "📁" },
] as const;

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 flex flex-col w-64 h-screen bg-slate-50 border-r border-slate-200">
      {/* Brand / title */}
      <div className="px-6 py-5 border-b border-slate-200">
        <span className="text-lg font-bold text-slate-900">
          Análisis Hipotecario
        </span>
      </div>

      {/* Navigation links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-auto">
        {NAV_LINKS.map(({ href, label, emoji }) => {
          const isActive =
            href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors
                ${isActive ? "bg-slate-200 font-semibold text-slate-900" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}
              `}
            >
              <span aria-hidden="true">{emoji}</span>
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Logout button at the bottom */}
      <div className="border-t border-slate-200 px-3 py-4">
        <form action={logout}>
          <button
            type="submit"
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-red-50 hover:text-red-700 transition-colors"
          >
            <span aria-hidden="true">🚪</span>
            Cerrar sesión
          </button>
        </form>
      </div>
    </aside>
  );
}
