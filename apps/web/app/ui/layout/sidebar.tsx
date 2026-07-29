"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/actions/auth";
import Image from "next/image";
import { LayoutDashboard, Users, FolderOpen, LogOut } from "lucide-react";

const NAV_ITEMS = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    href: "/dashboard/clientes",
    label: "Clientes",
    icon: Users,
  },
  {
    href: "/dashboard/expedientes",
    label: "Expedientes",
    icon: FolderOpen,
  },
] as const;

export default function Sidebar() {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  return (
    <aside className="fixed left-0 top-0 flex flex-col w-sidebar h-screen bg-[#111111] text-white z-40 shadow-lg">
      {/* Brand Header */}
      <div className="flex flex-col items-center justify-center px-4 py-5 border-b border-white/10 shrink-0 text-center">
        <Link href="/dashboard" className="flex items-center justify-center w-full">
          <Image
            src="/dark-logo.png"
            alt="Gestión Financiera"
            width={240}
            height={80}
            priority
            className="h-16 w-auto max-w-[220px] object-contain"
          />
        </Link>
        <span className="text-[11px] font-medium text-gray-400 mt-1.5">
          Operaciones Hipotecarias
        </span>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-6 space-y-1.5 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);

          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3.5 px-4 py-3 rounded-[10px] text-sm font-medium transition-all ${
                active
                  ? "bg-gf-red text-white font-semibold shadow-md"
                  : "text-gray-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon className="w-5 h-5 shrink-0" strokeWidth={active ? 2.2 : 1.8} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User Logout (Bottom) */}
      <div className="border-t border-white/10 p-3">
        <form action={logout}>
          <button
            type="submit"
            className="w-full flex items-center gap-3 px-4 py-3 rounded-[10px] text-sm font-medium text-gray-400 hover:bg-red-950/40 hover:text-red-400 transition-colors"
          >
            <LogOut className="w-5 h-5 shrink-0" strokeWidth={1.8} />
            <span>Cerrar sesión</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
