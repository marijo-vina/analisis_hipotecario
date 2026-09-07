export type PfaeFactorMode = 'MATRIX' | 'FLAT' | 'NONE';

export interface ActivityFactorRow {
  nativeLabel: string;
  satAliases: unknown;
  factor: { toString(): string } | number | string;
  factorTaxReturn?: { toString(): string } | number | string | null;
}

export interface MatchActivityFactorInput {
  pfaeFactorMode: PfaeFactorMode;
  satDescription: string | null | undefined;
  activityFactors: ActivityFactorRow[];
}

export type ActivityFactorMatchResult =
  | { kind: 'skip'; mode: 'FLAT' | 'NONE' }
  | {
      kind: 'hit';
      nativeLabel: string;
      factor: number;
      factorTaxReturn: number | null;
    }
  | { kind: 'miss' };

export function normalizeSatText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/-/g, ' ');
}

function aliasesOf(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === 'string');
}

function toNumber(value: { toString(): string } | number | string | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(value.toString());
  return Number.isFinite(n) ? n : null;
}

/**
 * Shared giro matcher for Phase A ACTIVITY_UNMAPPED and Phase C factor apply.
 * FLAT/NONE skip alias lookup. MATRIX miss must never invent 1.0.
 */
export function matchActivityFactor(
  input: MatchActivityFactorInput,
): ActivityFactorMatchResult {
  if (input.pfaeFactorMode === 'FLAT' || input.pfaeFactorMode === 'NONE') {
    return { kind: 'skip', mode: input.pfaeFactorMode };
  }

  const haystack = input.satDescription ? normalizeSatText(input.satDescription) : '';
  if (!haystack) return { kind: 'miss' };

  for (const row of input.activityFactors) {
    const aliases = aliasesOf(row.satAliases);
    const hit = aliases.some((alias) => haystack.includes(normalizeSatText(alias)));
    if (!hit) continue;
    return {
      kind: 'hit',
      nativeLabel: row.nativeLabel,
      factor: toNumber(row.factor) ?? 0,
      factorTaxReturn: toNumber(row.factorTaxReturn),
    };
  }

  return { kind: 'miss' };
}
