"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  basePath: string;
}

/**
 * Client-side pagination controls.
 *
 * Reads the current `limit` from search params to preserve it across
 * page changes. Navigates via `router.push` to keep the URL in sync.
 */
export default function Pagination({
  currentPage,
  totalPages,
  basePath,
}: PaginationProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const limit = searchParams.get("limit") ?? "10";

  const goToPage = (newPage: number) => {
    router.push(`${basePath}?page=${newPage}&limit=${limit}`);
  };

  return (
    <div className="flex items-center justify-between mt-4 text-sm">
      <button
        onClick={() => goToPage(currentPage - 1)}
        disabled={currentPage <= 1}
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        &larr; Anterior
      </button>

      <span className="text-slate-600">
        P&aacute;gina {currentPage} de {totalPages}
      </span>

      <button
        onClick={() => goToPage(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Siguiente &rarr;
      </button>
    </div>
  );
}
