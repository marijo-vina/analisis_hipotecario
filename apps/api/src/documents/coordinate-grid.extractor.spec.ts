// ---------------------------------------------------------------------------
// Coordinate grid extractor — unit tests (pure functions)
// ---------------------------------------------------------------------------

import {
  extractFromCoordinateWords,
  extractSummaryStatuses,
  extractMopCodes,
  mapStatusCode,
  findNearestBandFallback,
  groupIntoBlocks,
  extractBlockValues,
  type ColumnBand,
  type GridRow,
  type CreditBlock,
} from './coordinate-grid.extractor';
import { CoordinateWord, CoordinateCredit, SummaryEntry } from './coordinate-extraction.types';
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

    // ── Phase 1: CoordinateCredit type fields (tasks 1.1) ──────────────
    it('every returned credit has a mopCodes string array', () => {
      for (const c of result.credits) {
        expect(c.mopCodes).toBeDefined();
        expect(Array.isArray(c.mopCodes)).toBe(true);
        for (const code of c.mopCodes) {
          expect(typeof code).toBe('string');
        }
      }
    });

    it('every returned credit has a status field with valid enum value', () => {
      for (const c of result.credits) {
        expect(c.status).toBeDefined();
        expect(['ACTIVE', 'CLOSED', 'UNKNOWN']).toContain(c.status);
      }
    });
  });

  // ── Phase 1: SummaryEntry interface (tasks 1.2-1.3) ──────────────────
  describe('SummaryEntry interface', () => {
    it('is exported and has correct shape', () => {
      const entry: SummaryEntry = {
        index: 1,
        institution: 'SANTANDER',
        status: 'ACTIVE',
      };
      expect(entry.index).toBe(1);
      expect(entry.institution).toBe('SANTANDER');
      expect(entry.status).toBe('ACTIVE');
    });

    it('accepts all valid status values', () => {
      const active: SummaryEntry = { index: 1, institution: 'A', status: 'ACTIVE' };
      const closed: SummaryEntry = { index: 2, institution: 'B', status: 'CLOSED' };
      const unknown: SummaryEntry = { index: 3, institution: 'C', status: 'UNKNOWN' };

      expect(active.status).toBe('ACTIVE');
      expect(closed.status).toBe('CLOSED');
      expect(unknown.status).toBe('UNKNOWN');
    });
  });

  // ── Phase 2: Core Implementation ─────────────────────────────────────
  describe('Phase 2 - Core Implementation', () => {

    // Helper: create words for a line of text at given position
    function makeLine(text: string, x: number, y: number, pageNum: number = 1): CoordinateWord[] {
      const tokens = text.split(/\s+/);
      const out: CoordinateWord[] = [];
      let curX = x;
      for (const tok of tokens) {
        out.push(w(tok, curX, y, tok.length * 8, 10, pageNum));
        curX += tok.length * 8 + 4;
      }
      return out;
    }

    // Reused header word set matching the baseline mock (SANTANDER, TELCEL, GRIBMA pipeline)
    function baselineHeaderWords(pageNum: number): CoordinateWord[] {
      return [
        w('Otorgante', 20, 200, 10, 10, pageNum), w('Apertura', 170, 200, 10, 10, pageNum),
        w('Cierre', 240, 200, 10, 10, pageNum), w('Moneda', 280, 200, 10, 10, pageNum),
        w('Límite', 330, 200, 10, 10, pageNum), w('Crédito', 380, 200, 10, 10, pageNum),
        w('Saldo', 420, 200, 10, 10, pageNum), w('Monto', 470, 200, 10, 10, pageNum),
        w('Monto', 510, 200, 10, 10, pageNum), w('Monto', 555, 200, 10, 10, pageNum),
        w('a', 555, 200, 5, 10, pageNum),
        w('de', 380, 215, 10, 10, pageNum), w('Máximo', 380, 215, 40, 10, pageNum),
        w('Actual', 420, 215, 40, 10, pageNum), w('**', 473, 215, 10, 10, pageNum),
        w('Último', 510, 215, 40, 10, pageNum), w('Pagar', 555, 215, 40, 10, pageNum),
        w('Cuenta', 20, 230, 40, 10, pageNum), w('Pago', 510, 230, 30, 10, pageNum),
      ];
    }

    // ── Task 2.1: extractSummaryStatuses ──────────────────────────────────
    describe('extractSummaryStatuses (task 2.1)', () => {
      it('parses numbered entries spanning 2 pages with DETALLE boundary', () => {
        const words: CoordinateWord[] = [
          ...makeLine('RESUMEN DE CRÉDITOS', 50, 50, 1),
          ...makeLine('1. SANTANDER ACTIVO', 50, 80, 1),
          ...makeLine('2. SOFOM INBURSA CERRADO', 50, 110, 1),
          ...makeLine('3. BBVA VIGENTE', 50, 50, 2),
          ...makeLine('DETALLE DE CRÉDITOS', 50, 80, 2),
        ];
        const entries = extractSummaryStatuses(words);
        expect(entries).toHaveLength(3);
        expect(entries[0]).toEqual({ index: 1, institution: 'SANTANDER', status: 'ACTIVE' });
        expect(entries[1]).toEqual({ index: 2, institution: 'SOFOM INBURSA', status: 'CLOSED' });
        expect(entries[2]).toEqual({ index: 3, institution: 'BBVA', status: 'ACTIVE' });
      });

      it('returns empty array when no RESUMEN header is present', () => {
        const words = [w('hello', 50, 50), w('world', 100, 50)];
        expect(extractSummaryStatuses(words)).toEqual([]);
      });

      it('stops reading at DETALLE DE CRÉDITOS boundary', () => {
        const words: CoordinateWord[] = [
          ...makeLine('RESUMEN DE CRÉDITOS', 50, 50, 1),
          ...makeLine('1. SANTANDER ACTIVO', 50, 80, 1),
          ...makeLine('DETALLE DE CRÉDITOS', 50, 110, 1),
          ...makeLine('99. POSTBOUNDARY UNKNOWN', 50, 140, 1),
        ];
        const entries = extractSummaryStatuses(words);
        expect(entries).toHaveLength(1);
        expect(entries[0].index).toBe(1);
      });
    });

    // ── Task 2.2: Nearest-band fallback (findNearestBandFallback) ──────────
    describe('findNearestBandFallback (task 2.2)', () => {
      const makeBand = (
        name: string, xMin: number, xMax: number, isFinancial = false,
      ): ColumnBand => ({
        name,
        displayText: name,
        xMin,
        xMax,
        centerX: (xMin + xMax) / 2,
        isFinancial,
      });

      it('assigns word to nearest band when center is within 12px of band center', () => {
        // Narrow band creditLimit [195, 205] center=200; word center=207 → 7px away (within 12)
        const bands = [makeBand('creditorInfo', 0, 100), makeBand('creditLimit', 195, 205)];
        const band = findNearestBandFallback(207, bands);
        expect(band).not.toBeNull();
        expect(band!.name).toBe('creditLimit');
      });

      it('rejects words more than 12px from any non-payment band center', () => {
        const bands = [makeBand('creditorInfo', 0, 100), makeBand('creditLimit', 195, 205)];
        // Word center 260 → 60px from creditLimit center (200), 160px from creditorInfo center (50). Both > 12.
        expect(findNearestBandFallback(260, bands)).toBeNull();
      });

      it('excludes paymentDueAmount band from fallback even when closest', () => {
        // creditLimit center=200, paymentDueAmount center=400. Word center=408 → 8px from paymentDue,
        // 208px from creditLimit. paymentDue excluded → no fallback candidate within epsilon.
        const bands = [
          makeBand('creditLimit', 195, 205),
          makeBand('paymentDueAmount', 395, 405, true),
        ];
        expect(findNearestBandFallback(408, bands)).toBeNull();
      });

      it('picks the closest of multiple candidate bands within epsilon', () => {
        // Two narrow bands: creditLimit center=200, maxCredit center=216.
        // Word center=210 → 10px from creditLimit, 6px from maxCredit → picks maxCredit.
        const bands = [
          makeBand('creditLimit', 195, 205),
          makeBand('maxCredit', 211, 221),
        ];
        const band = findNearestBandFallback(210, bands);
        expect(band).not.toBeNull();
        expect(band!.name).toBe('maxCredit');
      });
    });

    // ── Task 2.3: groupIntoBlocks Y-order (direct test) ───────────────────
    describe('groupIntoBlocks ordering (task 2.3)', () => {
      it('sorts blocks by pageNum then yStart ascending on scrambled input rows', () => {
        // Provide rows in deliberately SCRAMBLED pageNum/yStart order so the
        // explicit sort at the end of groupIntoBlocks is REQUIRED to put
        // them back into top-to-bottom visual order.
        const rows: GridRow[] = [
          { y: 600, pageNum: 2, cells: [
            { columnName: 'creditorInfo', text: 'GRIBMA', x: 25, y: 600, pageNum: 2 },
          ]},
          { y: 400, pageNum: 1, cells: [
            { columnName: 'creditorInfo', text: 'TELCEL', x: 25, y: 400, pageNum: 1 },
          ]},
          { y: 300, pageNum: 1, cells: [
            { columnName: 'creditorInfo', text: 'SANTANDER', x: 25, y: 300, pageNum: 1 },
          ]},
        ];
        const blocks = groupIntoBlocks(rows);
        expect(blocks).toHaveLength(3);
        // After sort: SANTANDER (page 1, y=300), TELCEL (page 1, y=400), GRIBMA (page 2, y=600)
        expect(blocks[0].institution).toBe('SANTANDER');
        expect(blocks[1].institution).toBe('TELCEL');
        expect(blocks[2].institution).toBe('GRIBMA');
      });

      it('is a no-op when rows are already in Y order', () => {
        const rows: GridRow[] = [
          { y: 300, pageNum: 1, cells: [
            { columnName: 'creditorInfo', text: 'SANTANDER', x: 25, y: 300, pageNum: 1 },
          ]},
          { y: 400, pageNum: 1, cells: [
            { columnName: 'creditorInfo', text: 'TELCEL', x: 25, y: 400, pageNum: 1 },
          ]},
        ];
        const blocks = groupIntoBlocks(rows);
        expect(blocks[0].institution).toBe('SANTANDER');
        expect(blocks[1].institution).toBe('TELCEL');
      });
    });

    // ── Task 2.4: MOP extraction (extractMopCodes) ────────────────────────
    describe('extractMopCodes (task 2.4)', () => {
      it('extracts non-digit single-character MOP codes from cells', () => {
        const cells = [{ text: 'N' }, { text: 'U' }, { text: '-' }];
        expect(extractMopCodes(cells)).toEqual(['N', 'U', '-']);
      });

      it('filters out digits per spec (1, 0 should not appear in mopCodes)', () => {
        const cells = [{ text: 'N' }, { text: '1' }, { text: '0' }];
        expect(extractMopCodes(cells)).toEqual(['N']);
      });

      it('returns empty array when all cells are empty or whitespace', () => {
        expect(extractMopCodes([{ text: '' }, { text: '   ' }])).toEqual([]);
      });

      it('skips multi-character tokens (financial numbers)', () => {
        const cells = [{ text: 'N' }, { text: '1,234' }, { text: '56' }];
        const codes = extractMopCodes(cells);
        expect(codes).toEqual(['N']);
      });
    });

    // ── Task 2.5: Status mapping (mapStatusCode) ───────────────────────────
    describe('mapStatusCode (task 2.5)', () => {
      it('maps "Vigente" and "Al corriente" to ACTIVE', () => {
        expect(mapStatusCode('Vigente')).toBe('ACTIVE');
        expect(mapStatusCode('Al corriente')).toBe('ACTIVE');
      });

      it('maps "Cerrado", "Liquidado", "Castigado" to CLOSED', () => {
        expect(mapStatusCode('Cerrado')).toBe('CLOSED');
        expect(mapStatusCode('Liquidado')).toBe('CLOSED');
        expect(mapStatusCode('Castigado')).toBe('CLOSED');
      });

      it('defaults unknown text and empty strings to UNKNOWN', () => {
        expect(mapStatusCode('some random text')).toBe('UNKNOWN');
        expect(mapStatusCode('')).toBe('UNKNOWN');
      });

      it('is case-insensitive and accent-tolerant', () => {
        expect(mapStatusCode('VIGENTE')).toBe('ACTIVE');
        expect(mapStatusCode('cerrado')).toBe('CLOSED');
        expect(mapStatusCode('AL CORRIENTE')).toBe('ACTIVE');
      });
    });

    // ── Task 2.6: Global merge in extractFromCoordinateWords ──────────────
    describe('global merge: summary → detail blocks (task 2.6)', () => {
      it('merges summary statuses into detail blocks by global position', () => {
        const mockWords: CoordinateWord[] = [
          // ── Summary section (page 1, Y=50–140, before the detail header) ────
          ...makeLine('RESUMEN DE CRÉDITOS', 50, 50, 1),
          ...makeLine('1. SANTANDER ACTIVO', 50, 80, 1),
          ...makeLine('2. TELCEL CERRADO', 50, 110, 1),
          ...makeLine('DETALLE DE CRÉDITOS', 50, 140, 1),
          // ── Detail section (page 1, Y=200–470) ───────────────────────────
          ...baselineHeaderWords(1),
          // Blocks DETAIL data — no Spanish status text in cells so block-level
          // status detection maps to UNKNOWN; only the summary merge populates ACTIVE/CLOSED.
          w('SANTANDER', 25, 290, 10, 10, 1), w('8,775', 560, 315, 40, 10, 1),
          w('TELCEL', 25, 380, 10, 10, 1), w('MER', 65, 380, 30, 10, 1), w('0', 560, 405, 8, 10, 1),
          w('GRIBMA', 25, 470, 10, 10, 1),
        ];
        const result = extractFromCoordinateWords(mockWords, 'merge-test.pdf');
        expect(result.credits.length).toBeGreaterThanOrEqual(2);

        const santander = result.credits.find((c) => c.institution.includes('SANTANDER'));
        const telcel = result.credits.find((c) => c.institution.includes('TELCEL'));
        expect(santander).toBeDefined();
        expect(telcel).toBeDefined();
        // Summary assigns ACTIVE to #1 (SANTANDER) — merge overwrites UNKNOWN.
        expect(santander!.status).toBe('ACTIVE');
        // Summary assigns CLOSED to #2 (TELCEL) — merge overwrites UNKNOWN.
        expect(telcel!.status).toBe('CLOSED');
      });

      it('leaves status as UNKNOWN for blocks beyond the summary count', () => {
        const mockWords: CoordinateWord[] = [
          ...makeLine('RESUMEN DE CRÉDITOS', 50, 50, 1),
          ...makeLine('1. SANTANDER ACTIVO', 50, 80, 1),
          ...makeLine('DETALLE DE CRÉDITOS', 50, 110, 1),
          ...baselineHeaderWords(1),
          // Two detail blocks but only one summary entry → block #2 stays UNKNOWN.
          w('SANTANDER', 25, 290, 10, 10, 1), w('8,775', 560, 315, 40, 10, 1),
          w('TELCEL', 25, 380, 10, 10, 1), w('MER', 65, 380, 30, 10, 1), w('0', 560, 405, 8, 10, 1),
        ];
        const result = extractFromCoordinateWords(mockWords, 'merge-test2.pdf');
        const telcel = result.credits.find((c) => c.institution.includes('TELCEL'));
        expect(telcel).toBeDefined();
        // Summary has only 1 entry → TELCEL (block #2) keeps UNKNOWN (no summary to merge).
        expect(telcel!.status).toBe('UNKNOWN');
      });
    });

    describe('extractBlockValues accountNumber from creditorInfo', () => {
      function makeBlock(institution: string): CreditBlock {
        return {
          institution,
          rows: [{
            y: 290,
            pageNum: 1,
            cells: [{
              columnName: 'creditorInfo',
              text: institution,
              x: 25,
              y: 290,
              pageNum: 1,
            }],
          }],
          pageNum: 1,
          yStart: 290,
          yEnd: 290,
        };
      }

      it('parses a ≥6-digit run from creditorInfo into accountNumber and strips it from institution', () => {
        const { credit } = extractBlockValues(makeBlock('SANTANDER 10002030'), []);
        expect(credit.accountNumber).toBe('10002030');
        expect(credit.institution).toBe('SANTANDER');
      });

      it('sets accountNumber null when creditorInfo has no usable digit run', () => {
        const { credit } = extractBlockValues(makeBlock('SANTANDER'), []);
        expect(credit.accountNumber).toBeNull();
        expect(credit.institution).toBe('SANTANDER');
      });

      it('does not treat a 5-digit run as accountNumber', () => {
        const { credit } = extractBlockValues(makeBlock('SANTANDER 12345'), []);
        expect(credit.accountNumber).toBeNull();
        expect(credit.institution).toBe('SANTANDER 12345');
      });
    });
  });
});
