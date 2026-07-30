"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems?: number;
  limit?: number;
  basePath: string;
  itemLabel?: string;
}

/**
 * Client-side pagination controls aligned with Stitch design system.
 *
 * Supports page number buttons, item range counts ("Mostrando 1 a 10 de 50 clientes"),
 * and chevron controls. Navigates via `router.push` keeping search params in sync.
 */
export default function Pagination({
  currentPage,
  totalPages,
  totalItems,
  limit: customLimit,
  basePath,
  itemLabel = "elementos",
}: PaginationProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const limit = customLimit ?? parseInt(searchParams.get("limit") ?? "10", 10);

  const goToPage = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(newPage));
    params.set("limit", String(limit));
    router.push(`${basePath}?${params.toString()}`);
  };

  // Generate visible page numbers (max 5 around current page)
  const getPageNumbers = () => {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    const end = Math.min(totalPages, start + maxVisible - 1);
    
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

  if (totalPages <= 0) return null;

  const startItem = totalItems !== undefined && totalItems > 0 ? (currentPage - 1) * limit + 1 : 0;
  const endItem = totalItems !== undefined ? Math.min(currentPage * limit, totalItems) : 0;

  return (
    <div className="border-t border-gf-border px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 bg-gf-surface-dim/40 text-sm font-medium text-gf-text-muted">
      <div>
        {totalItems !== undefined && totalItems > 0 ? (
          <span>
            Mostrando <strong className="text-gf-text">{startItem}</strong> a{" "}
            <strong className="text-gf-text">{endItem}</strong> de{" "}
            <strong className="text-gf-text">{totalItems}</strong> {itemLabel}
          </span>
        ) : (
          <span>
            P&aacute;gina <strong className="text-gf-text">{currentPage}</strong> de{" "}
            <strong className="text-gf-text">{totalPages}</strong>
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage <= 1}
          className="p-1.5 rounded-lg text-gf-text-muted hover:text-gf-red hover:bg-gf-red-soft/30 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gf-text-muted transition-colors"
          title="Página anterior"
          aria-label="Página anterior"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-1">
          {getPageNumbers().map((pageNum) => {
            const isActive = pageNum === currentPage;
            return (
              <button
                key={pageNum}
                type="button"
                onClick={() => goToPage(pageNum)}
                className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-semibold transition-all ${
                  isActive
                    ? "bg-gf-red text-white shadow-xs"
                    : "text-gf-text-muted hover:bg-gf-surface-dim hover:text-gf-text"
                }`}
              >
                {pageNum}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="p-1.5 rounded-lg text-gf-text-muted hover:text-gf-red hover:bg-gf-red-soft/30 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gf-text-muted transition-colors"
          title="Página siguiente"
          aria-label="Página siguiente"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

