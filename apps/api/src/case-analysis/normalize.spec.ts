import { normalizeText, namesMatch } from './normalize';
import type { NormalizeMode } from './normalize';

describe('normalizeText', () => {
  // ── default mode (backward-compatible: removes special chars) ──────────
  describe('default mode', () => {
    it.each([
      ['josé pérez', 'JOSE PEREZ'],
      ['JOSÉ PÉREZ', 'JOSE PEREZ'],
      ['  JOSE   PEREZ  ', 'JOSE PEREZ'],
      ['JOSE PEREZ-GARCIA', 'JOSE PEREZGARCIA'],
      ['JOSE/PEREZ', 'JOSEPEREZ'],
      ['JOSE.PEREZ', 'JOSEPEREZ'],
      ['JOSE_PEREZ', 'JOSEPEREZ'],
      ['  María José  López-Núñez ', 'MARIA JOSE LOPEZNUNEZ'],
      ['JOSE\tPEREZ\nGARCIA', 'JOSE PEREZ GARCIA'],
      ['XAXX010101000', 'XAXX010101000'],
      ['', ''],
      ['JOSE PEREZ', 'JOSE PEREZ'],
    ])('normalizes %p → %p', (input, expected) => {
      expect(normalizeText(input, 'default')).toBe(expected);
    });

    it('returns empty string for null', () => {
      expect(normalizeText(null as unknown as string, 'default')).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(normalizeText(undefined as unknown as string, 'default')).toBe('');
    });
  });

  // ── name mode: separators → space (preserves word boundaries) ──────────
  describe('name mode', () => {
    it.each([
      // Hyphen becomes space
      ['PÉREZ-GARCÍA', 'PEREZ GARCIA'],
      // Dot becomes space
      ['PÉREZ.GARCÍA', 'PEREZ GARCIA'],
      // Slash becomes space
      ['PÉREZ/GARCÍA', 'PEREZ GARCIA'],
      // Mixed separators + accents + whitespace
      ['  María-José.López/Núñez ', 'MARIA JOSE LOPEZ NUNEZ'],
      // Underscore becomes space
      ['GARCIA_LOPEZ', 'GARCIA LOPEZ'],
      // Multiple separators → single space
      ['PÉREZ--GARCÍA', 'PEREZ GARCIA'],
      // No separators: unchanged after other steps
      ['JOSE PEREZ GARCIA', 'JOSE PEREZ GARCIA'],
      // Empty
      ['', ''],
    ])('name mode: %p → %p', (input, expected) => {
      expect(normalizeText(input, 'name')).toBe(expected);
    });

    it('name mode: null returns empty', () => {
      expect(normalizeText(null as unknown as string, 'name')).toBe('');
    });
  });

  // ── identifier mode: remove special chars (RFC/CURP) ────────────────────
  describe('identifier mode', () => {
    it.each([
      // Standard RFC
      ['GOLM-920412-MTS', 'GOLM920412MTS'],
      // RFC with dots
      ['GOLM.920412.MTS', 'GOLM920412MTS'],
      // CURP with hyphens
      ['GOLM-920412-MTSNPR07', 'GOLM920412MTSNPR07'],
      // CURP clean (no change)
      ['PEJ900315HYNRLN08', 'PEJ900315HYNRLN08'],
      // Mixed separators + accents (though RFC/CURP shouldn't have them)
      ['GÓLM-920412-MTS', 'GOLM920412MTS'],
      // Empty
      ['', ''],
    ])('identifier mode: %p → %p', (input, expected) => {
      expect(normalizeText(input, 'identifier')).toBe(expected);
    });
  });
});

describe('namesMatch', () => {
  it('matches when tokens are identical (same order)', () => {
    expect(namesMatch('JOSE PEREZ GARCIA', 'JOSE PEREZ GARCIA')).toBe(true);
  });

  it('matches when tokens are in different order (INE scenario)', () => {
    // INE: "PEREZ GARCIA JOSE" vs Payroll: "JOSE PEREZ GARCIA"
    expect(namesMatch('PEREZ GARCIA JOSE', 'JOSE PEREZ GARCIA')).toBe(true);
  });

  it('matches with varying amounts of whitespace after normalization', () => {
    expect(namesMatch('JOSE  PEREZ   GARCIA', 'JOSE PEREZ GARCIA')).toBe(true);
  });

  it('does NOT match when tokens differ', () => {
    expect(namesMatch('JOSE PEREZ GARCIA', 'JUAN PEREZ GARCIA')).toBe(false);
  });

  it('does NOT match when one name has extra tokens', () => {
    expect(namesMatch('JOSE PEREZ', 'JOSE PEREZ GARCIA')).toBe(false);
  });

  it('does NOT match when one value is null', () => {
    expect(namesMatch(null, 'JOSE PEREZ')).toBe(false);
    expect(namesMatch('JOSE PEREZ', null)).toBe(false);
    expect(namesMatch(null, null)).toBe(false);
  });
});
