/** Display helpers for expediente dates and tenure. Avoid Date() on date-only ISO strings (UTC shift). */

export function formatCalendarDate(
  iso: string | null | undefined,
): string | undefined {
  if (!iso) return undefined;
  const trimmed = iso.trim();
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (day) return `${day[3]}/${day[2]}/${day[1]}`;
  const month = /^(\d{4})-(\d{2})$/.exec(trimmed);
  if (month) return `${month[2]}/${month[1]}`;
  const dmy = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/.exec(trimmed);
  if (dmy) {
    return `${dmy[1].padStart(2, "0")}/${dmy[2].padStart(2, "0")}/${dmy[3]}`;
  }
  return trimmed;
}

export function formatMonthKey(
  value: string | null | undefined,
): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  const month = /^(\d{4})-(\d{2})$/.exec(trimmed);
  if (month) return `${month[2]}/${month[1]}`;
  return formatCalendarDate(trimmed) ?? trimmed;
}

export function formatTenureMonths(months: number): string {
  if (!Number.isFinite(months) || months < 0) return `${months} meses`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} ${years === 1 ? "año" : "años"}`);
  if (rem > 0) parts.push(`${rem} ${rem === 1 ? "mes" : "meses"}`);
  return parts.join(" ") || "0 meses";
}
