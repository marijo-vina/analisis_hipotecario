/**
 * A month whose movements do not match the cover is already out of the
 * average. The advisor should see that warning, not a row-by-row queue.
 */
export function showsDepositReviewQueue(
  integrityStatus: string | null | undefined,
): boolean {
  return integrityStatus !== "CRITICAL_DISCREPANCY";
}
