"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { MortgageCase } from "@/app/lib/definitions";
import DashboardMetrics from "@/app/ui/dashboard/dashboard-metrics";
import {
  Search,
  FilterX,
  UserPlus,
  FolderPlus,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowUpDown,
  Sparkles,
  FileCheck,
} from "lucide-react";

interface DashboardClientProps {
  initialCases: MortgageCase[];
  userName: string;
}

const KANBAN_COLUMNS = [
  {
    code: "PENDING_DOCUMENTS",
    title: "Pendiente de documentos",
    headerBg: "bg-[#FFF0F0]",
    columnBg: "bg-[#FFF6F6]",
    borderColor: "border-[#F0C9CF]",
    badgeBg: "bg-amber-100 text-amber-900 border-amber-200",
  },
  {
    code: "DOCUMENTS_UPLOADED",
    title: "Documentación completa",
    headerBg: "bg-[#EBF3FF]",
    columnBg: "bg-[#F6FAFF]",
    borderColor: "border-[#D6E0F8]",
    badgeBg: "bg-sky-100 text-sky-900 border-sky-200",
  },
  {
    code: "DOCUMENTS_PROCESSED",
    title: "Documentos procesados",
    headerBg: "bg-[#E8F8F0]",
    columnBg: "bg-[#F5FCF8]",
    borderColor: "border-[#DCFCE7]",
    badgeBg: "bg-emerald-100 text-emerald-900 border-emerald-200",
  },
  {
    code: "PRELIMINARY_RESULT",
    title: "Resultado preliminar",
    headerBg: "bg-[#F3EEFF]",
    columnBg: "bg-[#FAF7FF]",
    borderColor: "border-[#E9D5FF]",
    badgeBg: "bg-purple-100 text-purple-900 border-purple-200",
  },
] as const;

export default function DashboardClient({
  initialCases,
  userName,
}: DashboardClientProps) {
  const [search, setSearch] = useState("");
  const [creditTypeFilter, setCreditTypeFilter] = useState("");
  const [sortOrder, setSortOrder] = useState<"updated_desc" | "updated_asc" | "name_asc">("updated_desc");
  const [onlyObservations, setOnlyObservations] = useState(false);

  // ── Global KPI Counts (from all cases) ───────────────────────────
  const globalCounts = useMemo(() => {
    const counts = {
      PENDING_DOCUMENTS: 0,
      DOCUMENTS_UPLOADED: 0,
      DOCUMENTS_PROCESSED: 0,
      PRELIMINARY_RESULT: 0,
    };
    for (const c of initialCases) {
      const code = c.status.code as keyof typeof counts;
      if (counts[code] !== undefined) {
        counts[code]++;
      }
    }
    return counts;
  }, [initialCases]);

  // ── Filtered & Sorted Cases ─────────────────────────────────────
  const filteredCases = useMemo(() => {
    return initialCases.filter((c) => {
      // Search filter (client name or case ID)
      if (search.trim()) {
        const query = search.toLowerCase();
        const clientName = c.client?.fullName?.toLowerCase() || "";
        const caseId = c.id.toLowerCase();
        if (!clientName.includes(query) && !caseId.includes(query)) {
          return false;
        }
      }

      // Credit Type filter
      if (creditTypeFilter && c.creditType?.code !== creditTypeFilter && c.creditType?.name !== creditTypeFilter) {
        return false;
      }

      // Observations filter
      if (onlyObservations) {
        const hasErrorDoc = c.documents?.some(
          (d) => d.processingError || d.documentStatus?.code === "REQUIRES_REVIEW" || d.documentStatus?.code === "OBSERVED"
        );
        if (!hasErrorDoc) return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortOrder === "updated_asc") {
        return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      }
      if (sortOrder === "name_asc") {
        return (a.client?.fullName || "").localeCompare(b.client?.fullName || "");
      }
      // default: updated_desc
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [initialCases, search, creditTypeFilter, sortOrder, onlyObservations]);

  // Group filtered cases by column
  const casesByStatus = useMemo(() => {
    const map = new Map<string, MortgageCase[]>();
    for (const col of KANBAN_COLUMNS) {
      map.set(col.code, []);
    }
    for (const c of filteredCases) {
      const list = map.get(c.status.code);
      if (list) list.push(c);
    }
    return map;
  }, [filteredCases]);

  const hasActiveFilters = search || creditTypeFilter || onlyObservations || sortOrder !== "updated_desc";

  const clearFilters = () => {
    setSearch("");
    setCreditTypeFilter("");
    setSortOrder("updated_desc");
    setOnlyObservations(false);
  };

  return (
    <div className="space-y-6">
      {/* ── Page Header & Action Buttons ──────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gf-border-variant">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gf-text">
            Dashboard
          </h1>
          <p className="text-sm text-gf-text-muted mt-1">
            Seguimiento operativo de expedientes hipotecarios para <span className="font-semibold text-gf-text">{userName}</span>.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/clientes/nuevo"
            className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-[10px] bg-white border border-gf-border text-sm font-medium text-gf-text shadow-sm hover:bg-gf-surface-dim transition-colors"
          >
            <UserPlus className="w-4 h-4 text-gf-text-muted" strokeWidth={2} />
            <span>Nuevo cliente</span>
          </Link>
          <Link
            href="/dashboard/expedientes/nuevo"
            className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-[10px] bg-gf-red text-sm font-medium text-white shadow-sm hover:bg-gf-red-dark transition-colors"
          >
            <FolderPlus className="w-4 h-4 text-white" strokeWidth={2} />
            <span>Nuevo expediente</span>
          </Link>
        </div>
      </div>

      {/* ── Top Summary KPI Cards ────────────────────────────────────── */}
      <DashboardMetrics counts={globalCounts} />

      {/* ── Filter & Search Control Bar ──────────────────────────────── */}
      <div className="bg-white p-4 rounded-[12px] border border-gf-border shadow-[0px_2px_8px_rgba(0,0,0,0.02)] flex flex-wrap gap-4 items-center justify-between">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gf-text-muted pointer-events-none" strokeWidth={2} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por cliente o folio..."
            className="w-full pl-9 pr-4 py-2 text-sm h-10 rounded-[10px] border border-gf-border bg-white text-gf-text placeholder-gf-text-muted focus:outline-none focus:ring-2 focus:ring-gf-red/20 focus:border-gf-red transition-all"
          />
        </div>

        {/* Filters & Order Dropdowns */}
        <div className="flex flex-wrap gap-3 items-center">
          <select
            value={creditTypeFilter}
            onChange={(e) => setCreditTypeFilter(e.target.value)}
            className="h-10 text-sm rounded-[10px] border border-gf-border px-3 bg-white text-gf-text focus:outline-none focus:ring-2 focus:ring-gf-red/20 focus:border-gf-red transition-all"
          >
            <option value="">Todos los objetivos</option>
            <option value="ADQUISICION">Adquisición</option>
            <option value="LIQUIDEZ">Liquidez</option>
            <option value="SUSTITUCION">Sustitución</option>
            <option value="CONSTRUCCION">Construcción</option>
          </select>

          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as any)}
            className="h-10 text-sm rounded-[10px] border border-gf-border px-3 bg-white text-gf-text focus:outline-none focus:ring-2 focus:ring-gf-red/20 focus:border-gf-red transition-all"
          >
            <option value="updated_desc">Más recientes primero</option>
            <option value="updated_asc">Más antiguos primero</option>
            <option value="name_asc">Nombre (A-Z)</option>
          </select>

          <label className={`flex items-center gap-2 cursor-pointer border rounded-[10px] px-3 h-10 text-xs font-medium transition-colors ${
            onlyObservations
              ? "bg-amber-50 border-amber-300 text-amber-900"
              : "bg-white border-gf-border text-gf-text-muted hover:bg-gf-surface-dim"
          }`}>
            <input
              type="checkbox"
              checked={onlyObservations}
              onChange={(e) => setOnlyObservations(e.target.checked)}
              className="rounded text-gf-red focus:ring-gf-red border-gf-border"
            />
            <span>Con observaciones</span>
          </label>
        </div>

        {/* Counter & Clear Filters */}
        <div className="flex items-center gap-3 border-l border-gf-border-variant pl-4 ml-auto">
          <span className="text-xs font-semibold text-gf-text-muted">
            {filteredCases.length} {filteredCases.length === 1 ? "expediente" : "expedientes"}
          </span>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-xs text-gf-red hover:underline font-medium flex items-center gap-1 transition-colors"
            >
              <FilterX className="w-3.5 h-3.5" strokeWidth={2} />
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* ── 4-Column Kanban Board ────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
        {KANBAN_COLUMNS.map((col) => {
          const columnCases = casesByStatus.get(col.code) ?? [];

          return (
            <div
              key={col.code}
              className={`rounded-[12px] border ${col.borderColor} ${col.columnBg} p-3 flex flex-col min-h-[500px] shadow-[0px_2px_8px_rgba(0,0,0,0.02)]`}
            >
              {/* Column Header */}
              <div className={`flex items-center justify-between mb-3 px-3 py-2.5 rounded-[10px] ${col.headerBg} border border-black/5`}>
                <h2 className="text-xs font-bold text-gf-text uppercase tracking-wide">
                  {col.title}
                </h2>
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${col.badgeBg}`}>
                  {columnCases.length}
                </span>
              </div>

              {/* Cards List */}
              <div className="flex flex-col gap-3 flex-1">
                {columnCases.length === 0 ? (
                  <div className="flex flex-col items-center justify-center flex-1 py-12 text-center text-gf-text-muted">
                    <p className="text-xs italic">Sin expedientes en esta columna</p>
                  </div>
                ) : (
                  columnCases.map((c) => {
                    const totalDocs = c.documents?.length || 0;
                    const expectedTotal = 7;
                    const docPercentage = Math.min(100, Math.round((totalDocs / expectedTotal) * 100));

                    const errorDocs = c.documents?.filter(
                      (d) => d.processingError || d.documentStatus?.code === "REQUIRES_REVIEW" || d.documentStatus?.code === "OBSERVED"
                    ) || [];

                    return (
                      <Link
                        key={c.id}
                        href={`/dashboard/expedientes/${c.id}`}
                        className={`block bg-white rounded-[10px] border border-gf-border p-4 shadow-[0px_2px_4px_rgba(0,0,0,0.03)] hover:shadow-md hover:border-gf-red/40 transition-all ${
                          errorDocs.length > 0 ? "border-l-4 border-l-amber-500" : ""
                        }`}
                      >
                        {/* Header: Credit type badge & Date */}
                        <div className="flex justify-between items-center mb-2">
                          <span className="bg-gf-surface-dim text-gf-text font-medium text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider">
                            {c.creditType?.name || "Hipotecario"}
                          </span>
                          <span className="text-[10px] text-gf-text-muted">
                            {new Date(c.updatedAt).toLocaleDateString("es-MX", {
                              day: "numeric",
                              month: "short",
                            })}
                          </span>
                        </div>

                        {/* Client Full Name */}
                        <h3 className="text-sm font-semibold text-gf-text hover:text-gf-red transition-colors line-clamp-1 mb-2">
                          {c.client?.fullName || "Cliente sin nombre"}
                        </h3>

                        {/* Context info depending on Column */}
                        {col.code === "PENDING_DOCUMENTS" && (
                          <div className="space-y-2 mt-3">
                            <div className="flex justify-between items-center text-xs text-gf-text-muted">
                              <span>{totalDocs} de {expectedTotal} documentos</span>
                              <span className="font-semibold text-gf-text">{docPercentage}%</span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-gf-red h-full rounded-full transition-all duration-300"
                                style={{ width: `${docPercentage}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {col.code === "DOCUMENTS_UPLOADED" && (
                          <div className="space-y-2 mt-3">
                            <div className="flex justify-between items-center text-xs text-gf-text-muted">
                              <span>Procesamiento inicial</span>
                              <span className="font-semibold text-sky-700 flex items-center gap-1">
                                <FileCheck className="w-3 h-3" /> Listo
                              </span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                              <div className="bg-sky-600 h-full rounded-full w-full" />
                            </div>
                          </div>
                        )}

                        {col.code === "DOCUMENTS_PROCESSED" && (
                          <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded-[6px]">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span className="font-medium">{totalDocs > 0 ? `${totalDocs} documentos extraídos` : "Documentos analizados"}</span>
                          </div>
                        )}

                        {col.code === "PRELIMINARY_RESULT" && (
                          <div className="mt-3 flex items-center justify-between text-xs bg-purple-50 px-2.5 py-1.5 rounded-[6px] text-purple-900 border border-purple-100">
                            <span className="font-semibold flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-purple-600" /> Resultado listo
                            </span>
                            <span className="text-[10px] text-purple-700 underline font-medium">Ver análisis</span>
                          </div>
                        )}

                        {/* Observation alert banner if present */}
                        {errorDocs.length > 0 && (
                          <div className="mt-3 bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-medium px-2 py-1 rounded-[6px] flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>{errorDocs.length} observaciones por revisar</span>
                          </div>
                        )}
                      </Link>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
