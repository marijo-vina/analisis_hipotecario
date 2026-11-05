/**
 * A month whose movements do not match the cover is already out of the
 * average. The advisor should see that warning, not a row-by-row queue.
 */
export function showsDepositReviewQueue(
  integrityStatus: string | null | undefined,
): boolean {
  return integrityStatus !== "CRITICAL_DISCREPANCY";
}

/**
 * The cleaner already excluded this deposit from valid income.
 * Own-account transfers and every other automatic reason stay out of the
 * statement breakdown. A discard the advisor made herself stays visible
 * so she can undo it.
 */
export function isAutomaticallyDiscardedDeposit(deposit: {
  classification?: string | null;
  reason?: string | null;
}): boolean {
  if (deposit.classification !== "TRASH") return false;
  return !/manualmente/i.test(deposit.reason ?? "");
}
