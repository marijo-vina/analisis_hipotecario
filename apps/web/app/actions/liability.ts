"use server";

import { apiFetch } from "@/app/lib/api";
import { revalidatePath } from "next/cache";
import type { LiabilityCalculationResult } from "@/app/lib/extraction";

/**
 * Server actions bridging the web client to the liability calculation API
 * (HU-11). Mirrors the pattern in `analysis.ts` — `apiFetch` is server-only
 * (reads the JWT from the httpOnly cookie), so the client component never
 * handles tokens directly.
 *
 * Controller: `apps/api/src/liability/liability.controller.ts`
 *   GET    /cases/:caseId/liability/calculate               (POST actually)
 *   POST   /cases/:caseId/liability/calculate
 *   GET    /cases/:caseId/liability/latest
 *   PATCH  /cases/:caseId/liability/credits/:creditIndex
 */

/** Body accepted by PATCH override (reason is always required). */
export interface OverrideCreditPayload {
  reason: string;
  creditNature?: "REVOLVING" | "FIXED";
  currentBalance?: number;
  paymentDueAmountEffective?: number;
}

/**
 * Fetches the most recent liability snapshot for a case.
 * Returns `null` when no snapshot exists yet (backend 404).
 */
export async function fetchLiabilityLatest(
  caseId: string,
): Promise<{
  success: boolean;
  data?: LiabilityCalculationResult | null;
  error?: string;
}> {
  const result = await apiFetch<LiabilityCalculationResult | null>(
    `/cases/${caseId}/liability/latest`,
  );

  if (result.ok) {
    return { success: true, data: result.data };
  }

  // 404 = no snapshot yet — valid "no calculation" state, not an error
  if (result.notFound) {
    return { success: true, data: null };
  }

  return {
    success: false,
    error: result.errors?._form ?? "No se pudo obtener el cálculo de pasivos",
  };
}

/**
 * Triggers a fresh liability calculation for the case (reads credits from
 * the latest CREDIT_BUREAU_REPORT document server-side). Returns the new
 * snapshot so the UI can refresh without a second round-trip.
 */
export async function calculateLiability(
  caseId: string,
): Promise<{
  success: boolean;
  data?: LiabilityCalculationResult;
  error?: string;
}> {
  const result = await apiFetch<LiabilityCalculationResult>(
    `/cases/${caseId}/liability/calculate`,
    { method: "POST" },
  );

  if (result.ok) {
    revalidatePath(`/dashboard/expedientes/${caseId}`);
    return { success: true, data: result.data };
  }

  return {
    success: false,
    error: result.errors?._form ?? "No se pudo ejecutar el cálculo de pasivos",
  };
}

/**
 * Applies a manual override to a single credit within the latest snapshot.
 * The backend recalculates aggregates and returns the new snapshot.
 */
export async function overrideLiabilityCredit(
  caseId: string,
  creditIndex: number,
  payload: OverrideCreditPayload,
): Promise<{
  success: boolean;
  data?: LiabilityCalculationResult;
  error?: string;
}> {
  const result = await apiFetch<LiabilityCalculationResult>(
    `/cases/${caseId}/liability/credits/${creditIndex}`,
    { method: "PATCH", body: payload as unknown as Record<string, unknown> },
  );

  if (result.ok) {
    revalidatePath(`/dashboard/expedientes/${caseId}`);
    return { success: true, data: result.data };
  }

  return {
    success: false,
    error: result.errors?._form ?? "No se pudo guardar la corrección",
  };
}