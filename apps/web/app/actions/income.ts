"use server";

import { apiFetch } from "@/app/lib/api";
import { revalidatePath } from "next/cache";

/**
 * Server actions bridging the web client to the income calculation API
 * (HU-12). Mirrors the pattern in `liability.ts` — `apiFetch` is server-only
 * (reads the JWT from the httpOnly cookie), so the client component never
 * handles tokens directly.
 *
 * Controller: `apps/api/src/income-calculation/income-calculation.controller.ts`
 *   POST   /cases/:caseId/income/calculate
 *   GET    /cases/:caseId/income/latest
 *   PATCH  /cases/:caseId/income/receipts/:receiptIndex
 *   POST   /cases/:caseId/income/confirm
 */

// ── Types (mirror backend income-calculation.types.ts) ─────────────────────

export type IncomeCalculationStatus =
  | "CALCULATED"
  | "CONFIRMED"
  | "REQUIRES_REVIEW";

export interface IncomeReceiptResult {
  documentId: string;
  period: string | null;
  paymentDate: string | null;
  employer: string | null;
  employerRfc: string | null;
  grossIncome: number | null;
  netIncome: number | null;
  conciliationStatus: string | null;
  reviewStatus: string | null;
  included: boolean;
}

export interface IncomeCalculationResult {
  id: string;
  caseId: string;
  calculatedAt: string;
  receiptResults: IncomeReceiptResult[];
  averageGrossIncome: number;
  averageNetIncome: number;
  confirmedGrossIncome: number | null;
  confirmedNetIncome: number | null;
  receiptCount: number;
  includedCount: number;
  status: IncomeCalculationStatus;
  confirmedBy: string | null;
  confirmedAt: string | null;
  observations: string | null;
}

// ── Server actions ─────────────────────────────────────────────────────────

/**
 * Fetches the most recent income calculation snapshot for a case.
 * Returns `null` when no snapshot exists yet (backend 404).
 */
export async function fetchIncomeLatest(
  caseId: string,
): Promise<{
  success: boolean;
  data?: IncomeCalculationResult | null;
  error?: string;
}> {
  const result = await apiFetch<IncomeCalculationResult | null>(
    `/cases/${caseId}/income/latest`,
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
    error:
      result.errors?._form ??
      "No se pudo obtener el cálculo de ingresos",
  };
}

/**
 * Triggers a fresh income calculation for the case (reads PAYROLL_RECEIPT
 * documents server-side). Returns the new snapshot so the UI can refresh
 * without a second round-trip.
 */
export async function calculateIncome(
  caseId: string,
  excludedDocumentIds?: string[],
): Promise<{
  success: boolean;
  data?: IncomeCalculationResult;
  error?: string;
}> {
  const result = await apiFetch<IncomeCalculationResult>(
    `/cases/${caseId}/income/calculate`,
    {
      method: "POST",
      body: excludedDocumentIds?.length
        ? { excludedDocumentIds }
        : undefined,
    },
  );

  if (result.ok) {
    revalidatePath(`/dashboard/expedientes/${caseId}`);
    return { success: true, data: result.data };
  }

  return {
    success: false,
    error:
      result.errors?._form ??
      "No se pudo ejecutar el cálculo de ingresos",
  };
}

/**
 * Toggles the inclusion flag on a single receipt within the latest snapshot.
 * The backend recalculates averages and returns the new snapshot.
 */
export async function toggleIncomeReceipt(
  caseId: string,
  receiptIndex: number,
  included: boolean,
): Promise<{
  success: boolean;
  data?: IncomeCalculationResult;
  error?: string;
}> {
  const result = await apiFetch<IncomeCalculationResult>(
    `/cases/${caseId}/income/receipts/${receiptIndex}`,
    { method: "PATCH", body: { included } },
  );

  if (result.ok) {
    revalidatePath(`/dashboard/expedientes/${caseId}`);
    return { success: true, data: result.data };
  }

  return {
    success: false,
    error:
      result.errors?._form ?? "No se pudo actualizar el recibo",
  };
}

/**
 * Confirms the income calculation with analyst-verified values.
 * Transitions status to CONFIRMED without overwriting calculated averages.
 */
export async function confirmIncome(
  caseId: string,
  confirmedGrossIncome: number,
  confirmedNetIncome: number,
  observations?: string,
): Promise<{
  success: boolean;
  data?: IncomeCalculationResult;
  error?: string;
}> {
  const result = await apiFetch<IncomeCalculationResult>(
    `/cases/${caseId}/income/confirm`,
    {
      method: "POST",
      body: {
        confirmedGrossIncome,
        confirmedNetIncome,
        ...(observations ? { observations } : {}),
      },
    },
  );

  if (result.ok) {
    revalidatePath(`/dashboard/expedientes/${caseId}`);
    return { success: true, data: result.data };
  }

  return {
    success: false,
    error:
      result.errors?._form ?? "No se pudo confirmar el cálculo de ingresos",
  };
}
