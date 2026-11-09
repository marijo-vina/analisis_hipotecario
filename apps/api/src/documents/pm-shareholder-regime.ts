export interface RegimeLike {
  description?: string | null;
  endDate?: string | null;
}

/** Active SAT regime that names the shareholder / partner path. */
export function hasActiveShareholderRegime(
  regimes: RegimeLike[] | null | undefined,
): boolean {
  if (!regimes) return false;
  return regimes.some((regime) => {
    if (regime.endDate) return false;
    return /\bsocios?\b|\baccionistas?\b/i.test(regime.description ?? '');
  });
}
