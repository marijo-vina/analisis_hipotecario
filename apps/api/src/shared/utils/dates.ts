/**
 * Computes the number of complete months between a date string and a reference date.
 * Uses date-only arithmetic (no time component) to avoid timezone drift.
 *
 * @param dateStr - ISO date string (YYYY-MM-DD)
 * @param refDate - reference date
 * @returns number of complete months (non-negative integer)
 */
export function completeMonthsBetween(dateStr: string, refDate: Date): number {
  const [startYear, startMonth, startDay] = dateStr.split('-').map(Number);

  // Extract date components from refDate (handles both UTC and local dates)
  const refYear = refDate.getUTCFullYear();
  const refMonth = refDate.getUTCMonth();
  const refDay = refDate.getUTCDate();

  let months = (refYear - startYear) * 12 + (refMonth - (startMonth - 1));

  // If the reference day is before the start day, subtract 1 (incomplete month)
  if (refDay < startDay) {
    months--;
  }

  return Math.max(0, months);
}
