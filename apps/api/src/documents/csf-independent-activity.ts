export type CsfActivityLike = {
  description?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  percentage?: unknown;
  order?: unknown;
};

export function isSalariedActivityDescription(description: string): boolean {
  return /asalariado|sueldos/i.test(description);
}

export function pickPrimaryIndependentActivity(
  activities: unknown,
): {
  description: string;
  startDate: string | null;
  percentage: number | null;
} | null {
  if (!Array.isArray(activities)) return null;

  const independent = activities.filter((item): item is CsfActivityLike => {
    if (item == null || typeof item !== 'object') return false;
    const row = item as CsfActivityLike;
    if (row.endDate != null && row.endDate !== '') return false;
    const description =
      typeof row.description === 'string' ? row.description.trim() : '';
    if (!description || isSalariedActivityDescription(description)) return false;
    return true;
  });

  if (independent.length === 0) return null;

  independent.sort((a, b) => {
    const pctA = typeof a.percentage === 'number' ? a.percentage : -1;
    const pctB = typeof b.percentage === 'number' ? b.percentage : -1;
    if (pctB !== pctA) return pctB - pctA;
    const orderA = typeof a.order === 'number' ? a.order : 999;
    const orderB = typeof b.order === 'number' ? b.order : 999;
    return orderA - orderB;
  });

  const best = independent[0];
  const description =
    typeof best.description === 'string' ? best.description.trim() : '';
  const startDate =
    typeof best.startDate === 'string' && best.startDate.trim() !== ''
      ? best.startDate
      : null;

  return {
    description,
    startDate,
    percentage: typeof best.percentage === 'number' ? best.percentage : null,
  };
}
