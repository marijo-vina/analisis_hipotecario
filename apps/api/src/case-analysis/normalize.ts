/**
 * Deterministic text normalization for cross-document identity comparison.
 *
 * Pipeline (per identity-match-validation spec):
 *  1. Uppercase
 *  2. Strip accents (NFD + remove combining marks)
 *  3. Handle special characters per field mode:
 *     - 'identifier' (RFC, CURP): remove -, /, ., _ entirely
 *     - 'name' (fullName): convert -, /, ., _, # to space
 *  4. Collapse runs of whitespace to a single space
 *  5. Trim leading/trailing whitespace
 *
 * No fuzzy matching or ML-based similarity is used.
 */

export type NormalizeMode = 'name' | 'identifier' | 'default';

const SPECIAL_CHARS_RE = /[-/._]/g;
const NAME_SPECIAL_CHARS_RE = /[-/._#]/g;
const NON_STANDARD_NAME_RE = /[^A-Za-zÀ-ÿÑñ0-9\s]/g;

export function normalizeText(
  value: string | null | undefined,
  mode: NormalizeMode = 'default',
): string {
  if (value == null) {
    return '';
  }

  let result = String(value)
    // 1. Uppercase
    .toUpperCase()
    // 2. Strip accents: decompose + remove combining diacritical marks
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // 3. Handle special characters per field mode
  if (mode === 'name') {
    // Convert separators (including # from source docs) to space
    result = result.replace(NAME_SPECIAL_CHARS_RE, ' ');
  } else {
    // identifier + default: remove special chars entirely
    result = result.replace(SPECIAL_CHARS_RE, '');
  }

  // 4. Collapse runs of whitespace to a single space
  result = result.replace(/\s+/g, ' ');

  // 5. Trim
  return result.trim();
}

/** Split a normalized name into non-empty tokens. */
export function getTokens(value: string | null): string[] {
  if (value == null || value.trim() === '') return [];
  return value.split(' ').filter(Boolean);
}

/**
 * Token-set comparison for fullName.
 *
 * INE lists names as "PaternalLastName MaternalLastName FirstName(s)"
 * while other documents use "FirstName(s) PaternalLastName MaternalLastName".
 * Direct string comparison would flag a false mismatch.
 *
 * This function splits each normalized name into tokens (words) and
 * returns true when both sets are identical — same words, any order.
 * No fuzzy matching: tokens must be exact after normalization.
 */
export function namesMatch(
  a: string | null,
  b: string | null,
): boolean {
  if (a == null || b == null) return false;
  if (a === b) return true;

  const tokensA = getTokens(a);
  const tokensB = getTokens(b);

  if (tokensA.length !== tokensB.length) return false;

  const setB = new Set(tokensB);
  return tokensA.every((t) => setB.has(t));
}

/** Result of comparing two normalized names beyond simple match/mismatch. */
export type NameComparisonDetail =
  | 'exact-match'
  | 'token-order-diff'   // same tokens, different order (INE scenario)
  | 'token-diff';         // different tokens

/**
 * Classify HOW two normalized names differ.
 * Use this to produce more specific alerts than a generic MISMATCH.
 */
export function classifyNameMatch(
  a: string | null,
  b: string | null,
): NameComparisonDetail {
  if (a == null || b == null) return 'token-diff';
  if (a === b) return 'exact-match';

  const tokensA = getTokens(a);
  const tokensB = getTokens(b);

  if (tokensA.length !== tokensB.length) return 'token-diff';

  const setB = new Set(tokensB);
  const allMatch = tokensA.every((t) => setB.has(t));

  return allMatch ? 'token-order-diff' : 'token-diff';
}

/**
 * Check whether the original (pre-normalization) value contains characters
 * that are not standard in a person's name: #, @, $, %, etc.
 * These often come from watermark artifacts or blur in the source document.
 */
export function hasNonStandardChars(value: string | null | undefined): boolean {
  if (value == null) return false;
  // After stripping accents and uppercasing, check for non-alphanumeric
  const cleaned = value
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  // A standard name should only have letters, spaces, hyphens, dots, apostrophes.
  // Characters like #, @, *, etc. are non-standard.
  return NON_STANDARD_NAME_RE.test(cleaned);
}
