// ---------------------------------------------------------------------------
// LayoutFinancialExtractorService — Strict TDD spec.
//
// The extractor's core algorithms are pure functions (column clustering,
// table-block detection, header mapping, row grouping, currency parsing,
// confidence scoring) so they are tested WITHOUT NestJS mocks.
// The NestJS service layer is tested once at the end (Task 3.5) for wiring.
// ---------------------------------------------------------------------------

import { Test, TestingModule } from '@nestjs/testing';
import {
  CreditSubsection,
  FinancialFieldName,
  FinancialFieldsConfidence,
  OcrLayout,
  OcrPage,
  OcrToken,
} from './document-ai.types';
import {
  LayoutFinancialExtractorService,
  clusterColumnsByGap,
  detectTableBlocks,
  mapHeaderToFields,
  groupRowsByY,
  parseCurrencyNumber,
  scoreFieldConfidence,
  HeaderFieldMap,
  ColumnCluster,
  TableBlock,
} from './layout-financial-extractor.service';

// ---------------------------------------------------------------------------
// Spec-local builders — keep token/page construction terse and readable.
// ---------------------------------------------------------------------------

const DEFAULT_TOKEN_W = 30;
const DEFAULT_TOKEN_H = 12;

/** Build an OcrToken. Coordinates are pixel positions. */
function tok(text: string, left: number, top: number, right?: number, bottom?: number): OcrToken {
  return {
    text,
    boundingBox: {
      left,
      top,
      right: right ?? left + DEFAULT_TOKEN_W,
      bottom: bottom ?? top + DEFAULT_TOKEN_H,
    },
    confidence: 0.9,
  };
}

/** Token center X. */
function centerX(t: OcrToken): number {
  return (t.boundingBox.left + t.boundingBox.right) / 2;
}

/** Center Y. */
function centerY(t: OcrToken): number {
  return (t.boundingBox.top + t.boundingBox.bottom) / 2;
}

/** Build an OcrPage from tokens + optional dimensions. */
function page(tokens: OcrToken[], width = 1000, height = 4000, pageNumber = 1): OcrPage {
  return { pageNumber, width, height, lines: [], tokens };
}

// ===========================================================================
// Task 3.1 — Column detection engine
// ===========================================================================

describe('clusterColumnsByGap', () => {
  it('clusters tokens into 3 columns when intra-column gaps <=15px and inter-column gaps >15px', () => {
    // 3 distinct column groups: centers ~100, ~250, ~400
    const tokens: OcrToken[] = [
      // column A (3 stacked tokens)
      tok('A1', 90, 100),
      tok('A2', 92, 130),
      tok('A3', 88, 160),
      // column B (center ~250, well separated from A)
      tok('B1', 240, 100),
      tok('B2', 242, 130),
      // column C (center ~400)
      tok('C1', 390, 100),
      tok('C2', 392, 130),
    ];

    const clusters = clusterColumnsByGap(tokens);

    expect(clusters).toHaveLength(3);
    // Each cluster collects the right tokens
    expect(clusters[0].tokens.map((t) => t.text).sort()).toEqual(['A1', 'A2', 'A3']);
    expect(clusters[1].tokens.map((t) => t.text).sort()).toEqual(['B1', 'B2']);
    expect(clusters[2].tokens.map((t) => t.text).sort()).toEqual(['C1', 'C2']);
    // Clusters ordered left → right by center
    expect(clusters[0].center).toBeLessThan(clusters[1].center);
    expect(clusters[1].center).toBeLessThan(clusters[2].center);
    // Cluster index assigned
    expect(clusters.map((c) => c.index)).toEqual([0, 1, 2]);
  });

  it('returns a single cluster when all tokens share one X position', () => {
    const tokens = [tok('x', 100, 50), tok('y', 102, 70), tok('z', 98, 90)];

    const clusters = clusterColumnsByGap(tokens);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].tokens).toHaveLength(3);
  });

  it('returns an empty array for empty input', () => {
    expect(clusterColumnsByGap([])).toEqual([]);
  });

  it('assigns a token that horizontally spans two columns to the column whose center is nearest', () => {
    // column A centered ~120, column B centered ~400 (huge gap → 2 columns)
    const tokens: OcrToken[] = [
      tok('A', 100, 100), // center 115
      tok('A2', 100, 120),
      tok('B', 380, 100), // center 395
      tok('B2', 380, 120),
      // wide token spanning both, but centered toward B (center 305)
      tok('WIDE', 200, 150, 410, 165),
    ];

    const clusters = clusterColumnsByGap(tokens);

    expect(clusters).toHaveLength(2);
    const wideCluster = clusters.find((c) => c.tokens.some((t) => t.text === 'WIDE'))!;
    expect(wideCluster.index).toBe(1); // nearest = column B
  });
});

describe('detectTableBlocks', () => {
  it('detects the dense grid region and excludes sparse tokens above/below', () => {
    // sparse rows (1 token each) above and below; dense grid in the middle
    const sparseTop = [tok('header-label', 50, 40)];
    const grid: OcrToken[] = [];
    for (let r = 0; r < 6; r++) {
      const top = 200 + r * 30;
      // 6 tokens per row, spread across columns
      for (let c = 0; c < 6; c++) {
        grid.push(tok(`r${r}c${c}`, 50 + c * 60, top));
      }
    }
    const sparseBottom = [tok('footer', 50, 2000)];

    const p = page([...sparseTop, ...grid, ...sparseBottom]);
    const blocks = detectTableBlocks(p);

    expect(blocks).toHaveLength(1);
    const block = blocks[0];
    // block Y-range covers the grid exactly
    expect(block.top).toBeLessThanOrEqual(200);
    expect(block.bottom).toBeGreaterThanOrEqual(200 + 5 * 30);
    // grid tokens included; sparse excluded
    expect(block.tokens).toHaveLength(grid.length);
    expect(block.tokens.some((t) => t.text === 'header-label')).toBe(false);
    expect(block.tokens.some((t) => t.text === 'footer')).toBe(false);
  });

  it('returns no blocks when the page has only sparse single-token rows', () => {
    const tokens = [tok('a', 50, 40), tok('b', 200, 80), tok('c', 80, 120)];
    expect(detectTableBlocks(page(tokens))).toEqual([]);
  });

  it('returns no blocks when tokens array is empty', () => {
    expect(detectTableBlocks(page([]))).toEqual([]);
  });
});

// ===========================================================================
// Task 3.2 — Table header detection
// ===========================================================================

/**
 * Build a header row: place one header string per visual column, 80px apart.
 * Returns the tokens and the clusters derived from them.
 */
function headerRow(headers: string[]) {
  const tokens: OcrToken[] = headers.map((h) => tok(h, 50 + headers.indexOf(h) * 80, 100));
  return { tokens, clusters: clusterColumnsByGap(tokens) };
}

describe('mapHeaderToFields', () => {
  it('maps clean Spanish headers to field names at the correct column indices', () => {
    const headers = [
      'SALDO ACTUAL',
      'CRÉDITO MÁXIMO',
      'LÍMITE DE CRÉDITO',
      'MONTO',
      'MONTO ÚLTIMO PAGO',
      'MONTO A PAGAR',
    ];
    const { tokens, clusters } = headerRow(headers);
    expect(clusters).toHaveLength(headers.length);

    const map = mapHeaderToFields(tokens, clusters);

    expect(map.fieldToColumn.currentBalance).toBe(0);
    expect(map.fieldToColumn.maxCredit).toBe(1);
    expect(map.fieldToColumn.creditLimit).toBe(2);
    expect(map.fieldToColumn.pastDueAmount).toBe(3);
    expect(map.fieldToColumn.lastPaymentAmount).toBe(4);
    expect(map.fieldToColumn.paymentDueAmount).toBe(5);
  });

  it('matches OCR-variant headers without accents (fuzzy tolerance)', () => {
    const headers = [
      'SALDO ACTUAL',
      'CREDITO MAXIMO',
      'LIMITE DE CREDITO',
      'MONTO',
      'MONTO ULTIMO PAGO',
      'MONTO A PAGAR',
    ];
    const { tokens, clusters } = headerRow(headers);
    const map = mapHeaderToFields(tokens, clusters);

    expect(map.fieldToColumn.currentBalance).toBe(0);
    expect(map.fieldToColumn.maxCredit).toBe(1);
    expect(map.fieldToColumn.creditLimit).toBe(2);
    expect(map.fieldToColumn.pastDueAmount).toBe(3);
    expect(map.fieldToColumn.lastPaymentAmount).toBe(4);
    expect(map.fieldToColumn.paymentDueAmount).toBe(5);
  });

  it('NEVER routes MONTO A PAGAR to pastDueAmount (critical disambiguation rule)', () => {
    // Only the three MONTO columns exist in this fixture
    const headers = ['MONTO', 'MONTO ÚLTIMO PAGO', 'MONTO A PAGAR'];
    const { tokens, clusters } = headerRow(headers);
    const map = mapHeaderToFields(tokens, clusters);

    expect(map.fieldToColumn.paymentDueAmount).toBe(2);
    expect(map.fieldToColumn.lastPaymentAmount).toBe(1);
    expect(map.fieldToColumn.pastDueAmount).toBe(0);
    // Reverse map confirms paymentDueAmount is NOT on the pastDue column
    expect(map.columnToField.get(0)).toBe('pastDueAmount');
    expect(map.columnToField.get(2)).toBe('paymentDueAmount');
  });

  it('leaves unmatched columns out of the field map (e.g. a "FECHA" column)', () => {
    const headers = ['SALDO ACTUAL', 'FECHA', 'MONTO A PAGAR'];
    const { tokens, clusters } = headerRow(headers);
    const map = mapHeaderToFields(tokens, clusters);

    expect(map.fieldToColumn.currentBalance).toBe(0);
    expect(map.fieldToColumn.paymentDueAmount).toBe(2);
    // No field maps to the middle column
    const mappedFields = new Set(Object.keys(map.fieldToColumn) as FinancialFieldName[]);
    expect(mappedFields.has('creditLimit')).toBe(false);
    expect(map.columnToField.has(1)).toBe(false);
  });

  it('returns empty map when header tokens are empty', () => {
    const map = mapHeaderToFields([], []);
    expect(map.fieldToColumn).toEqual({});
    expect(map.columnToField.size).toBe(0);
  });
});

// ===========================================================================
// Task 3.3 — Row extraction & currency parsing
// ===========================================================================

describe('groupRowsByY', () => {
  it('groups tokens into rows sharing a Y-band, ordered top→bottom', () => {
    const tokens: OcrToken[] = [
      // row 1 (y ~100)
      tok('A', 50, 100),
      tok('B', 200, 102),
      // row 2 (y ~150) — small gap tolerance
      tok('C', 50, 148),
      tok('D', 200, 150),
      // row 3 (y ~400) — large gap → separate row
      tok('E', 50, 400),
      tok('F', 200, 400),
    ];

    const rows = groupRowsByY(tokens);

    expect(rows).toHaveLength(3);
    expect(rows[0].map((t) => t.text).sort()).toEqual(['A', 'B']);
    expect(rows[1].map((t) => t.text).sort()).toEqual(['C', 'D']);
    expect(rows[2].map((t) => t.text).sort()).toEqual(['E', 'F']);
  });

  it('tolerates small vertical offsets within a row (sub-pixel alignment noise)', () => {
    const tokens: OcrToken[] = [
      tok('A', 50, 100, 80, 112),
      tok('B', 200, 106, 230, 118), // baseline ~6px lower → same row
      tok('C', 50, 160, 80, 172), // next row
    ];

    const rows = groupRowsByY(tokens);

    expect(rows).toHaveLength(2);
    expect(rows[0].map((t) => t.text).sort()).toEqual(['A', 'B']);
    expect(rows[1].map((t) => t.text)).toEqual(['C']);
  });

  it('returns empty array for empty input', () => {
    expect(groupRowsByY([])).toEqual([]);
  });
});

describe('parseCurrencyNumber', () => {
  it('parses comma thousands separator: "8,775" → 8775', () => {
    expect(parseCurrencyNumber('8,775')).toBe(8775);
  });

  it('parses comma decimal indicator: "1,75" → 1.75', () => {
    expect(parseCurrencyNumber('1,75')).toBe(1.75);
  });

  it('parses values starting with thousands AND comma decimal: "49,800" → 49800', () => {
    // Mexican comma-only format: "49,800" with three trailing digits → thousands
    expect(parseCurrencyNumber('49,800')).toBe(49800);
  });

  it('strips currency symbols MXN / $ / spaces', () => {
    expect(parseCurrencyNumber('$1,875')).toBe(1875);
    expect(parseCurrencyNumber('$ 1,875 MXN')).toBe(1875);
    expect(parseCurrencyNumber('MXN 8,775')).toBe(8775);
  });

  it('returns 0 for explicit zero', () => {
    expect(parseCurrencyNumber('0')).toBe(0);
    expect(parseCurrencyNumber('$0')).toBe(0);
  });

  it('returns null for non-numeric text', () => {
    expect(parseCurrencyNumber('NO APLICA')).toBeNull();
    expect(parseCurrencyNumber('N/A')).toBeNull();
    expect(parseCurrencyNumber('--')).toBeNull();
    expect(parseCurrencyNumber('')).toBeNull();
  });
});

// ===========================================================================
// Task 3.4 — Per-field confidence scoring
// ===========================================================================

describe('scoreFieldConfidence', () => {
  it('returns HIGH when the column had a single unambiguous, parsed, sane value', () => {
    // value present, parsed, column matched, single candidate, in-range
    const score = scoreFieldConfidence({
      value: 8775,
      parsed: true,
      columnMatched: true,
      candidateCount: 1,
      sane: true,
    });
    expect(score).toBe(FinancialFieldsConfidence.HIGH);
  });

  it('returns MEDIUM when the column matched but multiple candidate tokens exist (ambiguous)', () => {
    const score = scoreFieldConfidence({
      value: 8775,
      parsed: true,
      columnMatched: true,
      candidateCount: 2,
      sane: true,
    });
    expect(score).toBe(FinancialFieldsConfidence.MEDIUM);
  });

  it('returns MEDIUM when the column matched and the value fails the sanity range', () => {
    // absurdly large value (out of expected 0..50,000,000 sane range)
    const score = scoreFieldConfidence({
      value: 9_000_000_000,
      parsed: true,
      columnMatched: true,
      candidateCount: 1,
      sane: false,
    });
    expect(score).toBe(FinancialFieldsConfidence.MEDIUM);
  });

  it('returns LOW when no token was found at the expected column position', () => {
    const score = scoreFieldConfidence({
      value: null,
      parsed: false,
      columnMatched: false,
      candidateCount: 0,
      sane: false,
    });
    expect(score).toBe(FinancialFieldsConfidence.LOW);
  });

  it('returns LOW when the column matched but the value failed to parse', () => {
    const score = scoreFieldConfidence({
      value: null,
      parsed: false,
      columnMatched: true,
      candidateCount: 1,
      sane: false,
    });
    expect(score).toBe(FinancialFieldsConfidence.LOW);
  });

  it('treats explicit zero as a sane, parseable value (HIGH not LOW)', () => {
    const score = scoreFieldConfidence({
      value: 0,
      parsed: true,
      columnMatched: true,
      candidateCount: 1,
      sane: true,
    });
    expect(score).toBe(FinancialFieldsConfidence.HIGH);
  });
});

// ===========================================================================
// Task 3.5 — NestJS service integration
// ===========================================================================

/**
 * Synthetic bureau layout fixture.
 *
 * Columns (pixel X centers), left→right:
 *   institution(70) | SALDO ACTUAL(220) | CRÉDITO MÁXIMO(370) |
 *   LÍMITE DE CRÉDITO(520) | MONTO(670) | MONTO ÚLTIMO PAGO(820) | MONTO A PAGAR(970)
 *
 * Layout = header row + "Créditos Bancarios" subheader + 2 bancario credits
 * (SANTANDER, TELCEL MER 82953660) + "Créditos No Bancarios" subheader + 1
 * no-bancario credit (BANAMEX). Header + 3 credit rows = 4 grid rows so the
 * density-based table-block detector recognizes the region.
 */
function bureauLayout(): OcrLayout {
  const COLS = {
    institution: 70,
    currentBalance: 220,
    maxCredit: 370,
    creditLimit: 520,
    pastDue: 670,
    lastPayment: 820,
    paymentDue: 970,
  };
  const W = 30; // token width
  /** token centered at `cx` */
  const cell = (text: string, cx: number, top: number): OcrToken =>
    tok(text, cx - W / 2, top, cx + W / 2, top + 12);

  let top = 100;
  const row = (cells: OcrToken[], dt = 30) => {
    const y = top;
    top += dt;
    return cells.map((c) => ({ ...c, boundingBox: { ...c.boundingBox, top: y, bottom: y + (c.boundingBox.bottom - c.boundingBox.top) } }));
  };

  // Header row — 6 column headers (no institution-column header)
  const header = row([
    cell('SALDO ACTUAL', COLS.currentBalance, 0),
    cell('CRÉDITO MÁXIMO', COLS.maxCredit, 0),
    cell('LÍMITE DE CRÉDITO', COLS.creditLimit, 0),
    cell('MONTO', COLS.pastDue, 0),
    cell('MONTO ÚLTIMO PAGO', COLS.lastPayment, 0),
    cell('MONTO A PAGAR', COLS.paymentDue, 0),
  ]);

  // Subheader: Créditos Bancarios (sparse, 2 tokens)
  const subBancarios = row([
    cell('Créditos', 70, 0),
    cell('Bancarios', 220, 0),
  ]);

  // Credit row helper for the 7 logical columns
  const creditRow = (
    institution: string,
    accountNumber: string | null,
    currentBalance: string,
    maxCredit: string,
    creditLimit: string,
    pastDue: string,
    lastPayment: string,
    paymentDue: string,
  ): OcrToken[] => {
    const cells = [cell(institution, COLS.institution, 0)];
    if (accountNumber) cells.push(cell(accountNumber, COLS.institution + 40, 0));
    cells.push(
      cell(currentBalance, COLS.currentBalance, 0),
      cell(maxCredit, COLS.maxCredit, 0),
      cell(creditLimit, COLS.creditLimit, 0),
      cell(pastDue, COLS.pastDue, 0),
      cell(lastPayment, COLS.lastPayment, 0),
      cell(paymentDue, COLS.paymentDue, 0),
    );
    return row(cells);
  };

  // SANTANDER — paymentDueAmount=8,775 ; lastPaymentAmount=1,843
  const santander = creditRow('SANTANDER', null, '53,763', '42,400', '0', '0', '1,843', '8,775');
  // TELCEL MER — account number 82953660, paymentDueAmount=0, lastPayment=229
  const telcel = creditRow('TELCEL MER', '82953660', '1,200', '5,000', '3,000', '0', '229', '0');

  // Subheader: Créditos No Bancarios
  const subNoBancarios = row([
    cell('Créditos', 70, 0),
    cell('No Bancarios', 220, 0),
  ]);

  // BANAMEX (no-bancario) — paymentDueAmount=1,875 ; lastPayment=50,000
  const banamex = creditRow('BANAMEX', null, '30,283', '193,336', '150,000', '0', '50,000', '1,875');

  const tokens = [...header, ...subBancarios, ...santander, ...telcel, ...subNoBancarios, ...banamex];

  return {
    pages: [{ pageNumber: 1, width: 1200, height: 4000, lines: [], tokens }],
  } satisfies OcrLayout;
}

describe('LayoutFinancialExtractorService', () => {
  let service: LayoutFinancialExtractorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LayoutFinancialExtractorService],
    }).compile();
    service = module.get(LayoutFinancialExtractorService);
  });

  it('is defined (NestJS injectable wiring)', () => {
    expect(service).toBeDefined();
    expect(service.extract).toBeDefined();
  });

  describe('extract', () => {
    it('returns credits with paymentDueAmount ONLY from Monto a Pagar and lastPaymentAmount ONLY from Monto Último Pago (no cross-substitution)', () => {
      const result = service.extract(bureauLayout());

      expect(result.credits.length).toBeGreaterThanOrEqual(3);

      const santander = result.credits[0];
      // CRITICAL: paymentDueAmount comes from the "Monto a Pagar" column (8,775),
      // never from lastPaymentAmount (1,843). The two must not be swapped.
      expect(santander.fields.paymentDueAmount).toBe(8775);
      expect(santander.fields.lastPaymentAmount).toBe(1843);
      expect(santander.fields.paymentDueAmount).not.toBe(santander.fields.lastPaymentAmount);
      expect(santander.fields.currentBalance).toBe(53763);
      expect(santander.fields.maxCredit).toBe(42400);
      expect(santander.fields.creditLimit).toBe(0);
      expect(santander.fields.pastDueAmount).toBe(0);
      // institution detected from leftmost non-financial column
      expect(santander.institution).toContain('SANTANDER');

      // Confidence: clean single-candidate parsed sane values → HIGH
      expect(result.confidence[0].paymentDueAmount).toBe(FinancialFieldsConfidence.HIGH);
      expect(result.confidence[0].lastPaymentAmount).toBe(FinancialFieldsConfidence.HIGH);
      expect(result.confidence[0].currentBalance).toBe(FinancialFieldsConfidence.HIGH);
    });

    it('parses explicit-zero paymentDueAmount as HIGH (TELCEL MER 82953660 = 0)', () => {
      const result = service.extract(bureauLayout());
      const telcel = result.credits[1];

      expect(telcel.fields.paymentDueAmount).toBe(0);
      expect(telcel.institution).toContain('TELCEL');
      expect(telcel.accountNumber).toBe('82953660');
      // a true zero is a parsed, sane value → HIGH (not LOW)
      expect(result.confidence[1].paymentDueAmount).toBe(FinancialFieldsConfidence.HIGH);
    });

    it('tracks Créditos Bancarios vs No Bancarios subsections per credit row', () => {
      const result = service.extract(bureauLayout());

      expect(result.credits[0].subsection).toBe('BANCARIOS');
      expect(result.credits[1].subsection).toBe('BANCARIOS');
      expect(result.credits[2].subsection).toBe('NO_BANCARIOS');
    });

    it('preserves row order via orderInBlock', () => {
      const result = service.extract(bureauLayout());
      expect(result.credits.map((c) => c.orderInBlock)).toEqual([0, 1, 2]);
    });

    it('returns empty credits and a warning when no tabular grid is found', () => {
      // only sparse single tokens — detectTableBlocks returns nothing
      const layout: OcrLayout = {
        pages: [{ pageNumber: 1, width: 1000, height: 2000, lines: [], tokens: [tok('a', 50, 50)] }],
      };
      const result = service.extract(layout);
      expect(result.credits).toEqual([]);
      expect(result.confidence).toEqual([]);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  it("is registered as a provider in DocumentsModule", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DocumentsModule } = require('./documents.module');
    const providers = Reflect.getMetadata('providers', DocumentsModule) as unknown[];
    expect(providers).toBeDefined();
    expect(providers).toContain(LayoutFinancialExtractorService);
  });
});