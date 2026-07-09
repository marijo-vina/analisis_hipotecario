/**
 * Deterministic text normalization for cross-document identity comparison.
 *
 * Pipeline (per identity-match-validation spec):
 *  1. Uppercase
 *  2. Strip accents (NFD + remove combining marks)
 *  3. Handle special characters per field mode:
 *     - 'identifier' (RFC, CURP): remove -, /, ., _ entirely
 *     - 'name' (fullName): convert -, /, ., _ to space
 *  4. Collapse runs of whitespace to a single space
 *  5. Trim leading/trailing whitespace
 *
 * No fuzzy matching or ML-based similarity is used.
 */

export type NormalizeMode = 'name' | 'identifier' | 'default';

const SPECIAL_CHARS_RE = /[-/._]/g;

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
    // Convert separators to space to preserve word boundaries
    result = result.replace(SPECIAL_CHARS_RE, ' ');
  } else {
    // identifier + default: remove special chars entirely
    result = result.replace(SPECIAL_CHARS_RE, '');
  }

  // 4. Collapse runs of whitespace to a single space
  result = result.replace(/\s+/g, ' ');

  // 5. Trim
  return result.trim();
}
