"use client";

import Link from "next/link";
import { Bell, User } from "lucide-react";

export default function Topbar() {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-topbar px-content bg-white border-b border-gf-border shadow-[0px_1px_3px_rgba(0,0,0,0.02)]">
      {/* Left side empty — page header owns local titles */}
      <div />

      {/* Right side: quick actions & user info */}
      <div className="flex items-center gap-4 ml-auto shrink-0">
        {/* Notification bell */}
        <button
          type="button"
          className="relative p-2 rounded-[8px] text-gf-text-muted hover:bg-gf-surface-dim hover:text-gf-text transition-colors"
          aria-label="Notificaciones"
        >
          <Bell className="w-5 h-5" strokeWidth={1.8} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-gf-red ring-2 ring-white" />
        </button>

        {/* User avatar + label */}
        <div className="flex items-center gap-2.5 pl-3 border-l border-gf-border-variant">
          <div className="w-8 h-8 rounded-full bg-gf-red-soft flex items-center justify-center shrink-0 border border-gf-red/20">
            <User className="w-4 h-4 text-gf-red" strokeWidth={2} />
          </div>
          <span className="text-xs font-semibold text-gf-text hidden md:inline">
            Asesora Hipotecaria
          </span>
        </div>
      </div>
    </header>
  );
}
