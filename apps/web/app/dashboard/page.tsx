import { getSession } from "@/app/lib/session";
import { apiFetch } from "@/app/lib/api";
import type { MortgageCase, PaginatedResponse } from "@/app/lib/definitions";
import DashboardClient from "@/app/ui/dashboard/dashboard-client";

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
 * Dashboard page — Operative 4-column Kanban layout matching Stitch & design.md.
 */
export default async function DashboardPage() {
  const token = await getSession();
  const claims = token ? decodeJwtPayload(token) : {};
  const userName =
    (claims.name as string) ||
    (claims.email as string) ||
    "Asesora";

  const result = await apiFetch<PaginatedResponse<MortgageCase>>(
    "/mortgage-cases?page=1&limit=1000",
  );

  const cases: MortgageCase[] = result.ok ? result.data.data : [];

  return <DashboardClient initialCases={cases} userName={userName} />;
}
