"use server";

import { apiFetch } from "@/app/lib/api";
import { revalidatePath } from "next/cache";
import type { AnalysisRun, AnalysisResult, ReviewDecision } from "@/app/lib/definitions";

/**
 * Triggers a synchronous identity-match analysis for a mortgage case.
 * Returns the AnalysisResult with outcome, detail, and alerts.
 */
export async function triggerAnalysis(
  caseId: string,
): Promise<{ success: boolean; data?: AnalysisResult; error?: string }> {
  const result = await apiFetch<AnalysisResult>(
    `/mortgage-cases/${caseId}/analyze`,
    { method: "POST" },
  );

  if (result.ok) {
    revalidatePath(`/dashboard/expedientes/${caseId}`);
    return { success: true, data: result.data };
  }

  return {
    success: false,
    error: result.errors?._form ?? "No se pudo ejecutar el análisis",
  };
}

/**
 * Fetches the most recent analysis run for a case.
 * Returns null when no analysis runs exist.
 */
export async function fetchLatestAnalysis(
  caseId: string,
): Promise<{ success: boolean; data?: AnalysisRun | null; error?: string }> {
  const result = await apiFetch<AnalysisRun | null>(
    `/mortgage-cases/${caseId}/analysis/latest`,
  );

  if (result.ok) {
    return { success: true, data: result.data };
  }

  // 404 = no runs exist — valid state, not an error
  if (result.notFound) {
    return { success: true, data: null };
  }

  return {
    success: false,
    error: result.errors?._form ?? "No se pudo obtener el análisis",
  };
}

/**
 * Submits a review decision (MARK_FALSE_POSITIVE, CONFIRM_ISSUE, CANCEL_CASE)
 * for a specific analysis run.
 */
export async function submitReviewDecision(
  caseId: string,
  runId: string,
  action: ReviewDecision["action"],
  justification?: string,
): Promise<{ success: boolean; data?: ReviewDecision; error?: string }> {
  const body: Record<string, unknown> = { action };
  if (justification) body.justification = justification;

  const result = await apiFetch<ReviewDecision>(
    `/mortgage-cases/${caseId}/analysis/${runId}/review-decision`,
    { method: "POST", body },
  );

  if (result.ok) {
    revalidatePath(`/dashboard/expedientes/${caseId}`);
    return { success: true, data: result.data };
  }

  return {
    success: false,
    error: result.errors?._form ?? "No se pudo registrar la decisión",
  };
}
