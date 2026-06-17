import Link from "next/link";
import { getSession } from "@/app/lib/session";
import { apiFetch } from "@/app/lib/api";
import type { MortgageCase, PaginatedResponse } from "@/app/lib/definitions";
import PageHeader from "@/app/ui/common/page-header";
import Card from "@/app/ui/common/card";
import DataTable from "@/app/ui/common/data-table";
import EmptyState from "@/app/ui/common/empty-state";
import Button from "@/app/ui/common/button";
import StatusBadge from "@/app/ui/common/badge";

// ── Status codes used for metric aggregation ─────────────────────
const STATUS = {
  PENDING_DOCUMENTS: "PENDING_DOCUMENTS",
  IN_REVIEW: "IN_REVIEW",
  CLOSED: "CLOSED",
  REJECTED: "REJECTED",
  OBSERVED: "OBSERVED",
} as const;

// ── Column configuration shared between recent cases and pending tasks ──
const caseColumns = [
  {
    key: "client",
    header: "Cliente",
    render: (item: MortgageCase) => item.client.fullName,
  },
  {
    key: "status",
    header: "Estatus",
    render: (item: MortgageCase) => (
      <StatusBadge code={item.status.code} name={item.status.name} />
    ),
  },
  {
    key: "updatedAt",
    header: "Última actualización",
    render: (item: MortgageCase) =>
      new Date(item.updatedAt).toLocaleDateString("es-MX"),
  },
  {
    key: "actions",
    header: "Acciones",
    render: (item: MortgageCase) => (
      <Link
        href={`/dashboard/expedientes/${item.id}`}
        className="text-gf-red hover:underline font-medium"
      >
        Ver
      </Link>
    ),
  },
];

/**
 * Decode the JWT payload (base64url-encoded JSON) to extract user claims.
 * Server-only — no external dependencies required.
 *
 * JWT payloads use URL-safe base64 without padding. We convert to standard
 * base64 and pad before decoding.
 */
function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const base64Url = token.split(".")[1];
    // URL-safe → standard base64
    let base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    // Pad to multiple of 4
    while (base64.length % 4 !== 0) base64 += "=";
    const json = Buffer.from(base64, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return {};
  }
}

/**
 * Dashboard home page — redesigned with greeting, metric cards,
 * recent cases table, and pending tasks section.
 *
 * Server Component rendered inside the dashboard layout.
 * All data fetching uses the existing apiFetch pattern against
 * the NestJS backend (no backend changes).
 */
export default async function DashboardPage() {
  // ── 1. User identity from JWT ────────────────────────────────────
  const token = await getSession();
  const claims = token ? decodeJwtPayload(token) : {};
  const userName =
    (claims.name as string) ||
    (claims.email as string) ||
    "Asesora";

  // ── 2. Fetch all cases for metrics and tables ────────────────────
  const result = await apiFetch<PaginatedResponse<MortgageCase>>(
    "/mortgage-cases?page=1&limit=1000",
  );

  const cases: MortgageCase[] = result.ok ? result.data.data : [];

  // ── 3. Compute metric counts ─────────────────────────────────────
  const activeCases = cases.filter(
    (c) => c.status.code !== STATUS.CLOSED && c.status.code !== STATUS.REJECTED,
  );
  const pendingDocuments = cases.filter(
    (c) => c.status.code === STATUS.PENDING_DOCUMENTS,
  );
  const inReview = cases.filter(
    (c) => c.status.code === STATUS.IN_REVIEW,
  );
  const closedCases = cases.filter(
    (c) => c.status.code === STATUS.CLOSED,
  );

  const metricCards = [
    {
      label: "Expedientes activos",
      value: activeCases.length,
      accent: "bg-gf-success",
    },
    {
      label: "Pendientes de documentos",
      value: pendingDocuments.length,
      accent: "bg-gf-warning",
    },
    {
      label: "En revisión",
      value: inReview.length,
      accent: "bg-gf-info",
    },
    {
      label: "Cerrados",
      value: closedCases.length,
      accent: "bg-gf-neutral",
    },
  ];

  // ── 4. Recent cases (last 5, newest first) ──────────────────────
  const recentCases = [...cases]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, 5);

  // ── 5. Pending tasks — OBSERVED cases needing advisor attention ──
  const pendingTasks = cases.filter(
    (c) => c.status.code === STATUS.OBSERVED,
  );

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader
        title={`Hola, ${userName}`}
        subtitle="Resumen de operaciones hipotecarias"
      />

      {/* ── Metric cards grid ──────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {metricCards.map((card) => (
          <Card key={card.label}>
            <div className="flex flex-col">
              <p className="text-gf-text-muted text-sm mb-1">{card.label}</p>
              <p className="text-3xl font-bold text-gf-text">{card.value}</p>
              <div
                className={`w-8 h-1 rounded-full mt-3 ${card.accent}`}
                aria-hidden="true"
              />
            </div>
          </Card>
        ))}
      </div>

      {/* ── Recent cases section ───────────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gf-text mb-4">
          Expedientes recientes
        </h2>
        {recentCases.length > 0 ? (
          <DataTable<MortgageCase>
            columns={caseColumns}
            rows={recentCases}
            emptyMessage="No hay expedientes recientes"
          />
        ) : (
          <EmptyState
            message="No hay expedientes recientes"
            ctaLabel="Crear primer expediente"
            ctaHref="/dashboard/expedientes/nuevo"
          />
        )}
      </section>

      {/* ── Pending tasks section ──────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold text-gf-text mb-4">
          Tareas pendientes
        </h2>
        {pendingTasks.length > 0 ? (
          <DataTable<MortgageCase>
            columns={caseColumns}
            rows={pendingTasks}
            emptyMessage="No hay tareas pendientes"
          />
        ) : (
          <EmptyState message="No hay tareas pendientes" />
        )}
      </section>
    </div>
  );
}
