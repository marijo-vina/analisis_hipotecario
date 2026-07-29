import Link from "next/link";
import { getSession } from "@/app/lib/session";
import { apiFetch } from "@/app/lib/api";
import type { MortgageCase, PaginatedResponse } from "@/app/lib/definitions";
import PageHeader from "@/app/ui/common/page-header";
import StatusBadge from "@/app/ui/common/badge";

// ── Kanban columns — one per case status ─────────────────────────
const KANBAN_COLUMNS = [
  {
    code: "PENDING_DOCUMENTS",
    title: "Pendiente de documentos",
    accent: "border-amber-400",
    bgAccent: "bg-amber-50",
  },
  {
    code: "DOCUMENTS_UPLOADED",
    title: "Documentación completa",
    accent: "border-sky-400",
    bgAccent: "bg-sky-50",
  },
  {
    code: "DOCUMENTS_PROCESSED",
    title: "Documentos procesados",
    accent: "border-green-400",
    bgAccent: "bg-green-50",
  },
  {
    code: "PRELIMINARY_RESULT",
    title: "Resultado preliminar",
    accent: "border-blue-400",
    bgAccent: "bg-blue-50",
  },
] as const;

/**
 * Decode the JWT payload (base64url-encoded JSON) to extract user claims.
 * Server-only — no external dependencies required.
 */
function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const base64Url = token.split(".")[1];
    let base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4 !== 0) base64 += "=";
    const json = Buffer.from(base64, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return {};
  }
}

/**
 * Dashboard home page — 4-column Kanban layout.
 *
 * Each column represents one case status. Cases are distributed
 * into columns by their current status code.
 */
export default async function DashboardPage() {
  // ── 1. User identity from JWT ────────────────────────────────────
  const token = await getSession();
  const claims = token ? decodeJwtPayload(token) : {};
  const userName =
    (claims.name as string) ||
    (claims.email as string) ||
    "Asesora";

  // ── 2. Fetch all cases ──────────────────────────────────────────
  const result = await apiFetch<PaginatedResponse<MortgageCase>>(
    "/mortgage-cases?page=1&limit=1000",
  );

  const cases: MortgageCase[] = result.ok ? result.data.data : [];

  // ── 3. Group cases by status code ──────────────────────────────
  const casesByStatus = new Map<string, MortgageCase[]>();
  for (const col of KANBAN_COLUMNS) {
    casesByStatus.set(col.code, []);
  }
  for (const c of cases) {
    const list = casesByStatus.get(c.status.code);
    if (list) list.push(c);
  }

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader
        title={`Hola, ${userName}`}
        subtitle="Resumen de operaciones hipotecarias"
      />

      {/* ── Kanban board ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {KANBAN_COLUMNS.map((col) => {
          const columnCases = casesByStatus.get(col.code) ?? [];
          return (
            <div
              key={col.code}
              className={`rounded-lg border-t-4 ${col.accent} ${col.bgAccent} p-3`}
            >
              {/* Column header */}
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gf-text">
                  {col.title}
                </h2>
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white text-xs font-bold text-gf-text-muted shadow-sm">
                  {columnCases.length}
                </span>
              </div>

              {/* Case cards */}
              <div className="flex flex-col gap-2">
                {columnCases.length === 0 ? (
                  <p className="text-xs text-gf-text-muted italic text-center py-4">
                    Sin expedientes
                  </p>
                ) : (
                  columnCases.map((c) => (
                    <Link
                      key={c.id}
                      href={`/dashboard/expedientes/${c.id}`}
                      className="block bg-white rounded-md border border-gf-border p-3 hover:shadow-md transition-shadow focus-visible:ring-2 focus-visible:ring-gf-red/40 focus-visible:outline-none"
                    >
                      <p className="text-sm font-medium text-gf-text truncate">
                        {c.client.fullName}
                      </p>
                      <p className="text-xs text-gf-text-muted mt-0.5">
                        EXP-{c.id.slice(0, 8).toUpperCase()}
                      </p>
                      <div className="mt-2">
                        <StatusBadge code={c.status.code} name={c.status.name} />
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
