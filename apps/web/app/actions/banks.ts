"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/app/lib/api";
import type { ApiResult, BankDetail } from "@/app/lib/definitions";

/**
 * Update a bank's top-level fields (incomeCriterion, debtCommitmentFactor,
 * minimumBureauScore, isActive).
 *
 * Revalidates the bank detail page and list page so server components reflect the change.
 */
export async function updateBank(
  code: string,
  data: Record<string, unknown>,
): Promise<ApiResult<BankDetail>> {
  const result = await apiFetch<BankDetail>(`/banks/${code}`, {
    method: "PATCH",
    body: data,
  });

  if (result.ok) {
    revalidatePath(`/dashboard/bancos/${code}`);
    revalidatePath("/dashboard/bancos");
  }

  return result;
}

/**
 * Update a single policy row for a bank+destination pair.
 *
 * Revalidates the bank detail page and list page so server components reflect the change.
 */
export async function updatePolicy(
  code: string,
  destination: string,
  data: Record<string, unknown>,
): Promise<ApiResult<unknown>> {
  const result = await apiFetch(`/banks/${code}/policies/${destination}`, {
    method: "PATCH",
    body: data,
  });

  if (result.ok) {
    revalidatePath(`/dashboard/bancos/${code}`);
    revalidatePath("/dashboard/bancos");
  }

  return result;
}
