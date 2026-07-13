// ---------------------------------------------------------------------------
// Coordinate grid extractor — unit tests (pure functions)
// ---------------------------------------------------------------------------

import { extractFromCoordinateWords } from './coordinate-grid.extractor';
import { CoordinateWord } from './coordinate-extraction.types';
import { PaymentDueAmountSource } from './document-ai.types';

function w(text: string, x: number, y: number, width = text.length * 8, height = 10, pageNum = 1): CoordinateWord {
  return { text, x, y, width, height, pageNum };
}

describe('extractFromCoordinateWords', () => {
  // ── Edge cases ──────────────────────────────────────────────────────────
  it('returns empty for no words', () => {
    const r = extractFromCoordinateWords([], 'test.pdf');
    expect(r.credits).toHaveLength(0);
  });

  it('returns empty when no headers found', () => {
    const r = extractFromCoordinateWords([w('Hello', 100, 100)], 'test.pdf');
    expect(r.credits).toHaveLength(0);
  });

  // ── Full pipeline with realistic bureau mock ────────────────────────────
  describe('full pipeline', () => {
    // These mock words simulate a minimal credit bureau table with:
    // - Multi-line headers across Y=200/215/230
    // - 3 institutions: SANTANDER (has payment), GRIBMA (no payment), TELCEL (payment=0)
    // - paymentDueAmount column at X≈555 devuelve payment

    const mockWords: CoordinateWord[] = [
      // ── Headers Y=200 ────────────────────────────────────────────
      w('Otorgante', 20, 200),  w('Apertura', 170, 200),  w('Cierre', 240, 200),
      w('Moneda', 280, 200),    w('Límite', 330, 200),    w('Crédito', 380, 200),
      w('Saldo', 420, 200),     w('Monto', 470, 200),     w('Monto', 510, 200),
      w('Monto', 555, 200),     w('a', 555, 200),
      // ── Headers Y=215 ────────────────────────────────────────────
      w('de', 380, 215),        w('Máximo', 380, 215),    w('Actual', 420, 215),
      w('**', 473, 215),        w('Último', 510, 215),    w('Pagar', 555, 215),
      // ── Headers Y=230 ────────────────────────────────────────────
      w('Cuenta', 20, 230),     w('Pago', 510, 230),
      // ── SANTANDER block (payment in band) ────────────────────────
      w('SANTANDER', 25, 290),  w('8,775', 560, 315),
      // ── TELCEL block (payment=0) ──────────────────────────────────
      w('TELCEL', 25, 380),     w('MER', 65, 380),        w('0', 560, 405),
      // ── GRIBMA block (no payment in band) ────────────────────────
      w('GRIBMA', 25, 470),
    ];

    const result = extractFromCoordinateWords(mockWords, 'test.pdf');

    it('detects at least 4 columns including financial ones', () => {
      expect(result.columnsDetected.length).toBeGreaterThanOrEqual(4);
      const hasFinancial = result.columnsDetected.some((c) =>
        ['paymentDueAmount', 'pastDueAmount', 'currentBalance', 'maxCredit', 'lastPaymentAmount'].includes(c),
      );
      expect(hasFinancial).toBe(true);
    });

    it('finds 3 credit blocks', () => {
      expect(result.credits.length).toBeGreaterThanOrEqual(3);
    });

    it('identifies SANTANDER and TELCEL as known institutions', () => {
      const names = result.credits.map((c) => c.institution);
      expect(names.some((n) => n.includes('SANTANDER'))).toBe(true);
      expect(names.some((n) => n.includes('TELCEL'))).toBe(true);
    });

    it('marks credit without payment band value as UNCONFIRMED', () => {
      const gribma = result.credits.find((c) => c.institution.includes('GRIBMA'));
      expect(gribma).toBeDefined();
      expect(gribma!.paymentSource).toBe(PaymentDueAmountSource.UNCONFIRMED);
    });

    it('payment source is never null or undefined', () => {
      for (const c of result.credits) {
        expect(c.paymentSource).toBeDefined();
        expect([
          PaymentDueAmountSource.BAND_MATCH,
          PaymentDueAmountSource.RESCUE,
          PaymentDueAmountSource.UNCONFIRMED,
        ]).toContain(c.paymentSource);
      }
    });
  });
});
