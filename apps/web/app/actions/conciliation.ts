"use server";

import { apiFetch } from "@/app/lib/api";

/**
 * Server action to persist conciliation results into Document.processingResults.
 * Called after the front-end reconciliation preview runs.
 *
 * Controller: `apps/api/src/income-calculation/income-calculation.controller.ts`
 *   POST /cases/:caseId/income/conciliation
 */
export async function saveConciliation(
  caseId: string,
  items: Array<{
    documentId: string;
    status: string;
    method?: string;
    reviewStatus?: string;
  }>,
): Promise<{ success: boolean; saved?: number; error?: string }> {
  const result = await apiFetch<{ saved: number }>(
    `/cases/${caseId}/income/conciliation`,
    {
      method: "POST",
      body: { items },
    },
  );

  if (result.ok) {
    return { success: true, saved: result.data?.saved };
  }

  return {
    success: false,
    error:
      result.errors?._form ?? "No se pudo persistir la conciliación",
  };
}
