/** True when the ABONOS-column sum matches the cover total to the peso. */
export function bbvaDepositsMatchCover(
  deposits: Array<{ amount: number }>,
  coverTotal: number | null | undefined,
): boolean {
  if (typeof coverTotal !== 'number' || !(coverTotal > 0)) return false;
  if (deposits.length === 0) return false;
  const sum = deposits.reduce((total, row) => total + row.amount, 0);
  return Math.abs(sum - coverTotal) <= 1;
}
