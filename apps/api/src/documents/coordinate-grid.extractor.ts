// ---------------------------------------------------------------------------
// Coordinate grid extractor — pure functions (no I/O, no NestJS DI).
//
// Ported from POC v3.1 at experiments/buro-pdf-coordinate-poc.
// All PDF I/O (pdfjs-dist) happens OUTSIDE this module — it receives
// pre-extracted words and returns structured credits.
// ---------------------------------------------------------------------------

import {
  CoordinateWord,
  CoordinateLine,
  CoordinateCredit,
  CoordinateExtractionResult,
  CoordinateExtractionOptions,
  SummaryEntry,
} from './coordinate-extraction.types';
import { PaymentDueAmountSource } from './document-ai.types';
import { parseInstitutionAndAccount } from './layout-lines-extractor';

// ── Defaults ───────────────────────────────────────────────────────────────

const DEFAULTS: CoordinateExtractionOptions = {
  yTolerance: 4,
  headerXMergeTolerance: 22,
  paymentDueBandExtraRight: 20,
};

// ── Column definitions ─────────────────────────────────────────────────────

interface ColumnDef {
  name: string;
  patterns: RegExp[];
  isFinancial: boolean;
}

const COLUMN_DEFINITIONS: ColumnDef[] = [
  { name: 'creditorInfo', patterns: [/otorgante/i, /crédito\s*\/\s*cuenta/i, /cuenta\s*\/\s*responsabilidad/i], isFinancial: false },
  { name: 'openingDate', patterns: [/apertura/i], isFinancial: false },
  { name: 'lastPaymentDate', patterns: [/^(?!.*monto).*último\s*pago/i], isFinancial: false },
  { name: 'closingDate', patterns: [/cierre/i], isFinancial: false },
  { name: 'currency', patterns: [/moneda/i], isFinancial: false },
  { name: 'creditLimit', patterns: [/límite\s*de\s*crédito/i, /línea\s*de\s*crédito/i], isFinancial: true },
  { name: 'maxCredit', patterns: [/crédito\s*máximo/i], isFinancial: true },
  { name: 'currentBalance', patterns: [/saldo\s*actual/i], isFinancial: true },
  { name: 'pastDueAmount', patterns: [/monto\s*\*\*/i], isFinancial: true },
  { name: 'lastPaymentAmount', patterns: [/monto\s*último\s*pago/i], isFinancial: true },
  { name: 'paymentDueAmount', patterns: [/monto\s*a\s*pagar/i], isFinancial: true },
  { name: 'payrollLinkedInfo', patterns: [/crédito\s*asociado/i, /nómina/i], isFinancial: false },
  { name: 'paymentHistory', patterns: [/histórico\s*de\s*pagos/i, /clave\s*de\s*observación/i], isFinancial: false },
];

const FINANCIAL_COLUMNS = ['creditLimit', 'maxCredit', 'currentBalance', 'pastDueAmount', 'lastPaymentAmount', 'paymentDueAmount'];

/** Maximum X-drift (px) tolerated when a word's center falls outside all bands.
 *  Raised from 12→20 after observing bottom-half credits losing creditLimit
 *  and paymentHistory due to accumulated X-skew in tall tables (>10 rows). */
const NEAREST_BAND_EPSILON = 20;

// ── Status mapping (Spanish → enum) ─────────────────────────────────────────

/**
 * Map Spanish credit-status text to the normalized enum.
 *
 * Recognized ACTIVE markers: "Vigente", "Al corriente", "CUENTA AL CORRIENTE", "ACTIVO"
 * Recognized CLOSED markers: "Cerrado", "Liquidado", "Castigado", "CERRADO"
 * Everything else (including empty text) maps to UNKNOWN.
 *
 * Matching is case-insensitive and accent-tolerant (á → a, etc.) via the ACSII-folding
 * regex.
 */
export function mapStatusCode(text: string): 'ACTIVE' | 'CLOSED' | 'UNKNOWN' {
  // Fold accents to plain letters so "Cerrado" and "CERRADO" both match
  const flat = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
  if (/\b(VIGENTE|AL\s+CORRIENTE|CUENTA\s+AL\s+CORRIENTE|ACTIVO)\b/.test(flat)) return 'ACTIVE';
  if (/\b(CERRADO|LIQUIDADO|CASTIGADO)\b/.test(flat)) return 'CLOSED';
  return 'UNKNOWN';
}

/**
 * Extract MOP (Method of Payment) codes from the `paymentHistory` column cells.
 *
 * MOP codes: non-digit, non-whitespace single-character tokens (e.g., U, -, N).
 * Per spec: digits and whitespace MUST be filtered out from the cell text.
 *
 * @returns array of MOP code strings, empty if no history cells
 */
export function extractMopCodes(paymentHistoryCells: ReadonlyArray<{ text: string }>): string[] {
  const codes: string[] = [];
  for (const cell of paymentHistoryCells) {
    const trimmed = cell.text.trim();
    if (!trimmed) continue;
    const tokens = trimmed.split(/\s+/);
    for (const tok of tokens) {
      // A MOP cell is one character: 0-9 (1 = al corriente), U, or dash.
      // Longer tokens are amounts or years and stay out of the history.
      if (tok.length === 1 && /[0-9A-Za-z\-]/.test(tok)) {
        codes.push(tok);
      }
    }
  }
  return codes;
}

// ── Types (internal) ───────────────────────────────────────────────────────

interface DetectedHeader {
  name: string; displayText: string; centerX: number; xMin: number; xMax: number;
  y: number; pageNum: number; isFinancial: boolean;
}

export interface ColumnBand {
  name: string; displayText: string; xMin: number; xMax: number; centerX: number; isFinancial: boolean;
}

export interface GridCell {
  columnName: string; text: string; x: number; y: number; pageNum: number;
}

export interface GridRow {
  y: number; pageNum: number; cells: GridCell[];
}

export interface CreditBlock {
  institution: string; rows: GridRow[]; pageNum: number; yStart: number; yEnd: number;
}

// ── Stage 1: Group words into lines ────────────────────────────────────────

function groupIntoLines(words: CoordinateWord[], yTolerance: number): CoordinateLine[] {
  const sorted = [...words].sort((a, b) => a.pageNum - b.pageNum || a.y - b.y || a.x - b.x);
  const lines: CoordinateLine[] = [];
  let group: CoordinateWord[] = [];
  let curY = sorted[0]?.y ?? 0;
  let curPage = sorted[0]?.pageNum ?? 1;

  for (const w of sorted) {
    if (w.pageNum !== curPage || Math.abs(w.y - curY) > yTolerance) {
      if (group.length > 0) lines.push(makeLine(group, curY, curPage));
      group = [w]; curY = w.y; curPage = w.pageNum;
    } else { group.push(w); }
  }
  if (group.length > 0) lines.push(makeLine(group, curY, curPage));
  return lines;
}

function makeLine(words: CoordinateWord[], y: number, pageNum: number): CoordinateLine {
  return {
    words, y, pageNum,
    xMin: Math.min(...words.map(w => w.x)),
    xMax: Math.max(...words.map(w => w.x + w.width)),
    fullText: words.map(w => w.text).join(' '),
  };
}

// ── Stage 1b: Extract summary statuses (cross-page) ────────────────────────

/**
 * Scan all pages for the "RESUMEN DE CRÉDITOS" header and parse numbered
 * credit entries until "DETALLE DE CRÉDITOS" or EOF.
 *
 * The summary section can span 1-3 pages before the detail tables. Credit
 * numbers are **global** (1..N) across all sub-sections (e.g., "CRÉDITOS
 * BANCARIOS", non-banking credits). Each line that starts with a number
 * followed by an institution name and a status keyword is parsed into a
 * {@link SummaryEntry}.
 *
 * @param words — all extracted words across all pages
 * @param yTolerance — Y proximity for grouping words into lines (default 4)
 * @returns entries in global 1-indexed order; empty if no summary header found
 */
export function extractSummaryStatuses(words: CoordinateWord[], yTolerance: number = 4): SummaryEntry[] {
  const lines = groupIntoLines(words, yTolerance);

  // Locate the start of the summary section
  let summaryStartIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/RESUMEN\s+DE\s+CRÉDITOS/i.test(lines[i].fullText) ||
        /RESUMEN\s+DE\s+CREDITOS/i.test(lines[i].fullText)) {
      summaryStartIdx = i;
      break;
    }
  }
  if (summaryStartIdx === -1) return [];

  // Read lines until "DETALLE DE CRÉDITOS" boundary or EOF
  const summaryLines: CoordinateLine[] = [];
  for (let i = summaryStartIdx + 1; i < lines.length; i++) {
    const txt = lines[i].fullText;
    if (/DETALLE\s+DE\s+CRÉDITOS/i.test(txt) || /DETALLE\s+DE\s+CREDITOS/i.test(txt)) {
      break;
    }
    // Skip section markers like "CRÉDITOS BANCARIOS" (they don't start with a number)
    summaryLines.push(lines[i]);
  }

  // Parse numbered entries: "1. SANTANDER ... ACTIVO", "2. SOFOM ... CERRADO", etc.
  const entries: SummaryEntry[] = [];
  for (const line of summaryLines) {
    const match = line.fullText.match(/^\s*(\d+)\s*\.?\s+(.*)$/);
    if (!match) continue;

    const index = parseInt(match[1], 10);
    const rest = match[2].trim();
    if (!rest) continue;

    const status = mapStatusCode(rest);

    // Extract institution name — everything up to the status keyword
    let institution = rest;
    // Strip trailing status text to get clean institution name
    const statusRegex = /\s+(VIGENTE|AL\s+CORRIENTE|CUENTA\s+AL\s+CORRIENTE|ACTIVO|CERRADO|LIQUIDADO|CASTIGADO)\b/i;
    const statusMatch = rest.match(statusRegex);
    if (statusMatch) {
      institution = rest.substring(0, statusMatch.index).trim();
    }

    entries.push({ index, institution, status });
  }

  return entries;
}

// ── Stage 2: Detect all header sections ────────────────────────────────────

interface HeaderSection {
  headers: DetectedHeader[];
  pageNum: number;
  dataYStart: number;
  dataYEnd: number;
  /** Section classification inferred from PDF labels ("CRÉDITOS BANCARIOS" / "CRÉDITOS NO BANCARIOS"). */
  sectionType: 'banking' | 'non_banking' | 'unknown';
}

/**
 * Scan lines 40-80px above a "Monto a" anchor for section-type labels.
 * Returns 'banking' if "CRÉDITOS BANCARIOS" is found, 'non_banking' for
 * "CRÉDITOS NO BANCARIOS" (or "NO BANCARIOS"), 'unknown' otherwise.
 */
function detectSectionType(
  lines: CoordinateLine[],
  anchor: { pageNum: number; y: number },
): 'banking' | 'non_banking' | 'unknown' {
  // Section labels ("CRÉDITOS BANCARIOS" / "NO BANCARIOS") sit just above
  // the column header row, typically 10-40px above the "Monto a" anchor.
  for (const line of lines) {
    if (line.pageNum !== anchor.pageNum) continue;
    const dy = anchor.y - line.y;
    if (dy < 10 || dy > 45) continue;
    if (/CRÉDITOS\s+BANCARIOS/i.test(line.fullText)) return 'banking';
    if (/CRÉDITOS\s+NO\s+BANCARIOS|NO\s+BANCARIOS/i.test(line.fullText)) return 'non_banking';
  }
  return 'unknown';
}

function detectSections(lines: CoordinateLine[], opts: CoordinateExtractionOptions): HeaderSection[] {
  // Find all "Monto a" anchors
  const anchors: { pageNum: number; y: number }[] = [];
  for (const line of lines) {
    if (!/monto\s*a\b/i.test(line.fullText)) continue;
    if (anchors.some(a => a.pageNum === line.pageNum && Math.abs(a.y - line.y) < 80)) continue;
    anchors.push({ pageNum: line.pageNum, y: line.y });
  }

  const sections: HeaderSection[] = [];

  for (const anchor of anchors) {
    // Collect all words within ±70px of the anchor
    const nearby = lines.filter(l => l.pageNum === anchor.pageNum && Math.abs(l.y - anchor.y) <= 70);

    // Group nearby words by X-center proximity
    const headerWords: { text: string; x: number; cx: number; y: number }[] = [];
    for (const l of nearby) {
      for (const w of l.words) {
        headerWords.push({ text: w.text, x: w.x, cx: w.x + w.width / 2, y: l.y });
      }
    }

    // X-cluster words
    const xGroups: { centerX: number; words: typeof headerWords }[] = [];
    const used = new Set<number>();
    for (let i = 0; i < headerWords.length; i++) {
      if (used.has(i)) continue;
      const cluster = [headerWords[i]];
      const cx = headerWords[i].cx;
      for (let j = i + 1; j < headerWords.length; j++) {
        if (used.has(j)) continue;
        if (Math.abs(headerWords[j].cx - cx) < 30) { cluster.push(headerWords[j]); used.add(j); }
      }
      used.add(i);
      xGroups.push({ centerX: cluster.reduce((s, w) => s + w.cx, 0) / cluster.length, words: cluster });
    }
    xGroups.sort((a, b) => a.centerX - b.centerX);

    // Match each X-group against column definitions
    const rawHeaders: DetectedHeader[] = [];
    for (const grp of xGroups) {
      const sorted = [...grp.words].sort((a, b) => a.y - b.y);
      const fullText = sorted.map(w => w.text).join(' ');
      const xMin = Math.min(...sorted.map(w => w.x));
      const xMax = Math.max(...sorted.map(w => w.x + (fullText.length * 4))); // approximate

      for (const def of COLUMN_DEFINITIONS) {
        if (def.patterns.some(p => p.test(fullText))) {
          rawHeaders.push({ name: def.name, displayText: fullText.substring(0, 60), centerX: grp.centerX, xMin, xMax, y: sorted[0].y, pageNum: anchor.pageNum, isFinancial: def.isFinancial });
          break;
        }
      }
    }

    if (rawHeaders.length >= 3) {
      // Detect section type from labels above the anchor (CRÉDITOS BANCARIOS / NO BANCARIOS).
      const sectionType = detectSectionType(lines, anchor);
      sections.push({
        headers: rawHeaders,
        pageNum: anchor.pageNum,
        dataYStart: anchor.y + 25,
        dataYEnd: Infinity,
        sectionType,
      });
    }
  }

  // Sort and set boundaries
  sections.sort((a, b) => a.pageNum - b.pageNum || a.dataYStart - b.dataYStart);
  for (let i = 0; i < sections.length; i++) {
    if (i < sections.length - 1 && sections[i + 1].pageNum === sections[i].pageNum) {
      const nextAnchorY = sections[i + 1].dataYStart - 25;
      sections[i].dataYEnd = nextAnchorY + 10;
    }
  }

  return sections;
}

// ── Stage 3: Merge multi-line headers, deduplicate ─────────────────────────

function mergeHeaders(raw: DetectedHeader[], opts: CoordinateExtractionOptions): DetectedHeader[] {
  const sorted = [...raw].sort((a, b) => a.centerX - b.centerX);
  const groups: DetectedHeader[][] = [[sorted[0]]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = groups[groups.length - 1][0];
    if (sorted[i].name === prev.name || Math.abs(sorted[i].centerX - prev.centerX) < opts.headerXMergeTolerance) {
      groups[groups.length - 1].push(sorted[i]);
    } else {
      groups.push([sorted[i]]);
    }
  }

  // Merge each group
  const merged: DetectedHeader[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    const primary = group.find(h => h.isFinancial) ?? group[0];
    const h: DetectedHeader = {
      ...primary,
      displayText: group.map(h => h.displayText).join(' | '),
      xMin: Math.min(...group.map(h => h.xMin)),
      xMax: Math.max(...group.map(h => h.xMax)),
      centerX: group.reduce((s, h) => s + h.centerX, 0) / group.length,
      y: Math.max(...group.map(h => h.y)),
      isFinancial: group.some(h => h.isFinancial),
    };
    if (!seen.has(h.name)) { seen.add(h.name); merged.push(h); }
  }
  return merged;
}

// ── Stage 4: Build column bands by midpoints ───────────────────────────────

function buildBands(headers: DetectedHeader[], allWords: CoordinateWord[], pageNum: number, opts: CoordinateExtractionOptions): ColumnBand[] {
  const sorted = [...headers].sort((a, b) => a.centerX - b.centerX);
  const pageWords = allWords.filter(w => w.pageNum === pageNum);
  const pageXMin = Math.min(...pageWords.map(w => w.x));
  const pageXMax = Math.max(...pageWords.map(w => w.x + w.width));

  const bands: ColumnBand[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const left = i === 0 ? pageXMin : (sorted[i - 1].centerX + sorted[i].centerX) / 2;
    const right = i === sorted.length - 1 ? pageXMax : (sorted[i].centerX + sorted[i + 1].centerX) / 2;

    const band: ColumnBand = {
      name: sorted[i].name, displayText: sorted[i].displayText,
      xMin: left, xMax: right, centerX: sorted[i].centerX, isFinancial: sorted[i].isFinancial,
    };
    if (band.name === 'paymentDueAmount') band.xMax += opts.paymentDueBandExtraRight;
    bands.push(band);
  }
  return bands;
}

// ── Nearest-band fallback (exported for unit testing) ──────────────────────

/**
 * Find the nearest column band for a word whose center X falls outside all
 * band boundaries. Returns the band when center-X distance ≤ NEAREST_BAND_EPSILON,
 * skipping the `paymentDueAmount` band (which has its own rescue path in
 * `extractBlockValues`).
 *
 * This is a defensive fallback — in the normal pipeline `buildBands` creates
 * bands that cover the full page X range, so direct containment almost always
 * succeeds. The fallback handles edge cases such as narrow bands or words
 * slightly offset by OCR drift.
 *
 * @param wcx — center X coordinate of the word seeking a band assignment
 * @param bands — all column bands for the current page section
 * @returns the nearest non-`paymentDueAmount` band within epsilon, or `null`
 */
export function findNearestBandFallback(wcx: number, bands: ColumnBand[]): ColumnBand | null {
  let nearest: { band: ColumnBand; dist: number } | null = null;
  for (const band of bands) {
    if (band.name === 'paymentDueAmount') continue;
    const dist = Math.abs(wcx - band.centerX);
    if (!nearest || dist < nearest.dist) {
      nearest = { band, dist };
    }
  }
  return nearest && nearest.dist <= NEAREST_BAND_EPSILON ? nearest.band : null;
}

// ── Stage 5: Process data rows ─────────────────────────────────────────────

function processDataRows(words: CoordinateWord[], bands: ColumnBand[], pageNum: number, yStart: number, yEnd: number, yTolerance: number): GridRow[] {
  const dataWords = words.filter(w => w.pageNum === pageNum && w.y > yStart && (yEnd === Infinity || w.y < yEnd));
  const sorted = [...dataWords].sort((a, b) => a.y - b.y || a.x - b.x);

  const lineGroups: CoordinateWord[][] = [];
  let curGroup: CoordinateWord[] = [];
  let curY = sorted[0]?.y ?? 0;
  for (const w of sorted) {
    if (Math.abs(w.y - curY) > yTolerance) { if (curGroup.length > 0) lineGroups.push(curGroup); curGroup = [w]; curY = w.y; }
    else { curGroup.push(w); }
  }
  if (curGroup.length > 0) lineGroups.push(curGroup);

  const rows: GridRow[] = [];
  for (const group of lineGroups) {
    const cells: GridCell[] = [];
    for (const word of group) {
      const wcx = word.x + word.width / 2;

      // First pass: try direct band containment
      let assignedBand: ColumnBand | null = null;
      for (const band of bands) {
        if (wcx >= band.xMin && wcx <= band.xMax) {
          assignedBand = band;
          break;
        }
      }

      // Nearest-band fallback: if word center falls outside all bands,
      // find the nearest band within epsilon (12px). Skip paymentDueAmount
      // — it already has a tailored rescue path in extractBlockValues.
      if (!assignedBand) {
        assignedBand = findNearestBandFallback(wcx, bands);
      }

      if (!assignedBand) continue;

      const band = assignedBand;
      const existing = cells.find(c => c.columnName === band.name);
      if (band.isFinancial) {
        if (existing) {
          const newNum = /^[\d,\.]+$/.test(word.text);
          const oldNum = /^[\d,\.]+$/.test(existing.text);
          if (newNum && !oldNum) existing.text = word.text;
        } else {
          cells.push({ columnName: band.name, text: word.text, x: word.x, y: word.y, pageNum: word.pageNum });
        }
      } else {
        if (existing) { if (!/^[\d,\.]+$/.test(word.text)) existing.text += ' ' + word.text; }
        else { cells.push({ columnName: band.name, text: word.text, x: word.x, y: word.y, pageNum: word.pageNum }); }
      }
    }
    rows.push({ y: curY, pageNum, cells });
    curY = group[0].y;
  }
  return rows;
}

// ── Stage 6: Group rows into credit blocks ─────────────────────────────────

const KNOWN_INSTITUTIONS = /santander|sofom|inbursa|telcel|telmex|gribma|vw leasing|sky tv|mercado credito|nu mexico|nu bn|banamex|banorte|bbva|hsbc|amex|scotiabank/i;

export function groupIntoBlocks(rows: GridRow[]): CreditBlock[] {
  const blocks: CreditBlock[] = [];
  let current: CreditBlock | null = null;

  for (const row of rows) {
    const cCell = row.cells.find(c => c.columnName === 'creditorInfo');
    const cText = cCell?.text?.trim() ?? '';
    const isKnown = KNOWN_INSTITUTIONS.test(cText);

    if (isKnown) {
      if (current && current.rows.length > 0) blocks.push(current);
      current = { institution: cText, rows: [row], pageNum: row.pageNum, yStart: row.y, yEnd: row.y };
    } else if (current) {
      current.rows.push(row);
      current.yEnd = row.y;
    }
  }
  if (current && current.rows.length > 0) blocks.push(current);

  // Post-process: name orphan blocks
  for (const b of blocks) {
    if (!b.institution || b.institution.length < 2) {
      for (const r of b.rows) {
        const c = r.cells.find(x => x.columnName === 'creditorInfo');
        if (c && c.text.length > 2 && !/^[\d\s\-\.]+$/.test(c.text)) { b.institution = c.text.substring(0, 50); break; }
      }
    }
  }

  // Defensive sort: guarantee blocks are in top-to-bottom visual order
  // (pageNum ascending, then yStart ascending), regardless of row iteration order.
  blocks.sort((a, b) => a.pageNum - b.pageNum || a.yStart - b.yStart);

  return blocks;
}

// ── Stage 7: Extract financial values per block ────────────────────────────

export function extractBlockValues(block: CreditBlock, bands: ColumnBand[]): { credit: CoordinateCredit; warnings: string[] } {
  const warnings: string[] = [];
  const parsed = parseInstitutionAndAccount(block.institution);
  const credit: CoordinateCredit = {
    institution: parsed.institution ?? block.institution,
    accountNumber: parsed.accountNumber,
    creditType: null,
    paymentType: null,
    creditLimit: '', maxCredit: '', currentBalance: '', pastDueAmount: '', lastPaymentAmount: '', paymentDueAmount: '',
    paymentSource: PaymentDueAmountSource.UNCONFIRMED,
    mopCodes: [],
    status: 'UNKNOWN' as const,
    sectionType: 'unknown' as const,
  };

  const pdBand = bands.find(b => b.name === 'paymentDueAmount');
  const lpBand = bands.find(b => b.name === 'lastPaymentAmount');

  // ── MOP extraction from paymentHistory column ──────────────────────────
  const historyCells: GridCell[] = [];
  for (const row of block.rows) {
    const cell = row.cells.find(c => c.columnName === 'paymentHistory');
    if (cell && cell.text.trim()) historyCells.push(cell);
  }
  credit.mopCodes = extractMopCodes(historyCells);

  // ── Status detection from block cells ───────────────────────────────────
  // Scan all cell texts for Spanish status keywords; the orchestrator's
  // global merge will overwrite this with the summary's authoritative status.
  for (const row of block.rows) {
    for (const cell of row.cells) {
      const s = mapStatusCode(cell.text);
      if (s !== 'UNKNOWN') {
        credit.status = s;
        break;
      }
    }
    if (credit.status !== 'UNKNOWN') break;
  }

  // Normal extraction
  for (const col of FINANCIAL_COLUMNS) {
    let best: GridCell | null = null;
    for (const row of block.rows) {
      const cell = row.cells.find(c => c.columnName === col);
      if (!cell || !cell.text.trim()) continue;
      const isNum = /^[\d,\.]+$/.test(cell.text.trim());
      if (col === 'paymentDueAmount') {
        if (isNum && !best) { best = cell; credit.paymentSource = PaymentDueAmountSource.BAND_MATCH; break; }
      } else {
        if (!best) best = cell;
        else if (isNum && !/^[\d,\.]+$/.test(best.text.trim())) best = cell;
      }
    }
    if (best) (credit as unknown as Record<string, string>)[col] = best.text.trim();
  }

  // Conservative rescue
  if (!credit.paymentDueAmount && pdBand && lpBand) {
    const bzMin = lpBand.xMax - 15;
    const bzMax = pdBand.xMin + 30;
    const pdC = (pdBand.xMin + pdBand.xMax) / 2;
    const lpC = (lpBand.xMin + lpBand.xMax) / 2;
    let bestRescue: { text: string; distPd: number } | null = null;

    for (const row of block.rows) {
      for (const cell of row.cells) {
        if (cell.columnName === 'lastPaymentAmount') continue;
        const wx = cell.x + cell.text.length * 4;
        if (wx < bzMin || wx > bzMax) continue;
        if (!/^[\d,\.]+$/.test(cell.text.trim())) continue;
        const dPd = Math.abs(wx - pdC);
        const dLp = Math.abs(wx - lpC);
        if (dPd >= dLp * 0.9) continue;
        if (credit.lastPaymentAmount && dLp < dPd * 1.2) continue;
        if (!bestRescue || dPd < bestRescue.distPd) bestRescue = { text: cell.text, distPd: dPd };
      }
    }
    if (bestRescue) {
      credit.paymentDueAmount = bestRescue.text;
      credit.paymentSource = PaymentDueAmountSource.RESCUE;
    }
  }

  // Validate
  if (!credit.paymentDueAmount || !/^[\d,\.]+$/.test(credit.paymentDueAmount)) {
    credit.paymentDueAmount = '';
    credit.paymentSource = PaymentDueAmountSource.UNCONFIRMED;
  }

  // Limit and maximum stay in their own columns. The Python grid is what
  // separates them; copying máximo into límite here was the Banamex miss.
  return { credit, warnings };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Extract credit financial data from pre-extracted coordinate words.
 *
 * @param words  — output of pdfjs-dist getTextContent(), converted to pixel coords
 * @param sourceFileName — for metadata only
 * @param opts   — tuning knobs (uses safe defaults if omitted)
 */
export function extractFromCoordinateWords(
  words: CoordinateWord[],
  sourceFileName: string,
  opts: Partial<CoordinateExtractionOptions> = {},
): CoordinateExtractionResult {
  const o = { ...DEFAULTS, ...opts };
  const warnings: string[] = [];

  const lines = groupIntoLines(words, o.yTolerance);
  const sections = detectSections(lines, o);

  if (sections.length === 0) {
    return { sourceFile: sourceFileName, totalPages: new Set(words.map(w => w.pageNum)).size, totalWords: words.length, columnsDetected: [], sectionsFound: 0, credits: [], warnings: ['No header sections detected.'] };
  }

  // Extract summary statuses (cross-page) BEFORE detail processing.
  // Summary entries are globally numbered (1..N) and merged into the combined
  // detail credit list by positional index after all sections are processed.
  const summaryEntries = extractSummaryStatuses(words, o.yTolerance);

  const allColumns = new Set<string>();
  const allCredits: CoordinateCredit[] = [];

  for (const section of sections) {
    const merged = mergeHeaders(section.headers, o);
    const bands = buildBands(merged, words, section.pageNum, o);
    for (const h of merged) allColumns.add(h.name);

    const rows = processDataRows(words, bands, section.pageNum, section.dataYStart, section.dataYEnd, o.yTolerance);
    const blocks = groupIntoBlocks(rows);

    for (const block of blocks) {
      const { credit, warnings: bw } = extractBlockValues(block, bands);
      credit.sectionType = section.sectionType;
      warnings.push(...bw);
      allCredits.push(credit);
    }
  }

  // Global merge: summary[K].status → combinedBlockList[K].status
  // The PDF guarantees the same global order — summary credit #K maps to the
  // K-th credit in the combined list (banking blocks first, then non-banking).
  for (let k = 0; k < summaryEntries.length && k < allCredits.length; k++) {
    allCredits[k].status = summaryEntries[k].status;
  }

  return {
    sourceFile: sourceFileName,
    totalPages: new Set(words.map(w => w.pageNum)).size,
    totalWords: words.length,
    columnsDetected: [...allColumns],
    sectionsFound: sections.length,
    credits: allCredits,
    warnings,
  };
}
