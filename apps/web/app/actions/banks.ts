"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/app/lib/api";
import type { ApiResult, BankActivityFactor, BankDetail } from "@/app/lib/definitions";

function revalidateBankPages(code: string) {
  revalidatePath(`/dashboard/bancos/${code}`);
  revalidatePath("/dashboard/bancos");
}

/**
 * Update a bank's top-level fields (incomeCriterion, debtCommitmentFactor,
 * minimumBureauScore, isActive, PFAE factor card).
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
    revalidateBankPages(code);
  }

  return result;
}

/**
 * Update a single policy row for a bank+destination pair (including PFAE CMA cells).
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
    revalidateBankPages(code);
  }

  return result;
}

export async function createActivityFactor(
  code: string,
  data: {
    nativeLabel: string;
    satAliases: string[];
    factor: number;
    factorTaxReturn?: number | null;
  },
): Promise<ApiResult<BankActivityFactor>> {
  const result = await apiFetch<BankActivityFactor>(
    `/banks/${code}/activity-factors`,
    {
      method: "POST",
      body: data,
    },
  );

  if (result.ok) {
    revalidateBankPages(code);
  }

  return result;
}

export async function updateActivityFactor(
  code: string,
  factorId: string,
  data: Record<string, unknown>,
): Promise<ApiResult<BankActivityFactor>> {
  const result = await apiFetch<BankActivityFactor>(
    `/banks/${code}/activity-factors/${factorId}`,
    {
      method: "PATCH",
      body: data,
    },
  );

  if (result.ok) {
    revalidateBankPages(code);
  }

  return result;
}

export async function deleteActivityFactor(
  code: string,
  factorId: string,
): Promise<ApiResult<unknown>> {
  const result = await apiFetch(`/banks/${code}/activity-factors/${factorId}`, {
    method: "DELETE",
  });

  if (result.ok) {
    revalidateBankPages(code);
  }

  return result;
}
