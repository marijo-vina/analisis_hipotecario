import { Injectable, Logger } from '@nestjs/common';
import {
  CreditSubsection,
  FinancialFieldsConfidence,
  FinancialFieldName,
  FinancialFieldsConfidenceMap,
  LayoutCreditField,
  LayoutFinancialFields,
  LayoutFinancialResult,
  OcrLayout,
  OcrPage,
  OcrToken,
} from './document-ai.types';

// ===========================================================================
// Pure helpers — column detection engine
// ===========================================================================

/** Default intra-column X-center gap threshold (px). See Phase 0 spike. */
const DEFAULT_GAP_THRESHOLD_PX = 15;

/** Minimum tokens per row for a row to count as a "grid" row. */
const MIN_TOKENS_PER_GRID_ROW = 5;

/** Minimum number of grid rows for a band to qualify as a table block. */
const MIN_GRID_ROWS_IN_BAND = 4;

/** Max consecutive sparse rows tolerated inside a running band. */
const MAX_NON_GRID_ROWS_IN_BAND = 2;

/**
 * A cluster of tokens sharing one X-column.
 * `index` is the left-to-right position (0-based) among the clusters found.
 */
export interface ColumnCluster {
  index: number;
  left: number;
  right: number;
  center: number;
  tokens: OcrToken[];
}

/** Token center X in pixels. */
function tokenCenterX(t: OcrToken): number {
  return (t.boundingBox.left + t.boundingBox.right) / 2;
}

/** Token center Y in pixels. */
function tokenCenterY(t: OcrToken): number {
  return (t.boundingBox.top + t.boundingBox.bottom) / 2;
}

/**
 * Cluster tokens into columns by X-center gap analysis.
 *
 * Sorts token centers left→right; opens a new cluster whenever the gap between
 * consecutive centers exceeds `gapThresholdPx` (Column boundary = vertical
 * whitespace strip between clusters). Tokens that horizontally span two
 * adjacent column ranges are assigned by center proximity (nearest cluster).
 *
 * The ≤15px default matches the Phase 0 spike finding (p90 intra-line token
 * X-gap = 8px → tight intra-column packing).
 */
export function clusterColumnsByGap(
  tokens: OcrToken[],
  gapThresholdPx: number = DEFAULT_GAP_THRESHOLD_PX,
): ColumnCluster[] {
  if (tokens.length === 0) return [];

  // 1. Split into raw bands by X-center gap analysis (sorted left→right).
  const sorted = [...tokens].sort((a, b) => tokenCenterX(a) - tokenCenterX(b));
  const rawBands: OcrToken[][] = [];
  let current: OcrToken[] = [sorted[0]];
  let lastCenter = tokenCenterX(sorted[0]);
  for (let i = 1; i < sorted.length; i++) {
    const t = sorted[i];
    const c = tokenCenterX(t);
    if (c - lastCenter > gapThresholdPx) {
      rawBands.push(current);
      current = [t];
    } else {
      current.push(t);
    }
    lastCenter = c;
  }
  rawBands.push(current);

  // 2. Collapse spurious singleton bands caused by a token that physically
  //    straddles the gap between two real columns. A lone band's single token
  //    is folded into an adjacent band ONLY IF its box horizontally overlaps
  //    that neighbor's X-range (a true multi-column span). Narrow tokens that
  //    merely sit in a gap are kept as their own column. This is the
  //    "span multiple columns gracefully" rule.
  const bandCenter = (b: OcrToken[]) =>
    b.reduce((s, t) => s + tokenCenterX(t), 0) / b.length;
  const bandRange = (b: OcrToken[]) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const t of b) {
      lo = Math.min(lo, t.boundingBox.left);
      hi = Math.max(hi, t.boundingBox.right);
    }
    return { lo, hi };
  };
  const overlaps = (t: OcrToken, lo: number, hi: number) =>
    t.boundingBox.left < hi && t.boundingBox.right > lo;

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < rawBands.length; i++) {
      const band = rawBands[i];
      if (band.length !== 1) continue;
      if (rawBands.length === 1) break; // nothing to merge into
      const lone = band[0];
      const loneC = tokenCenterX(lone);
      const prev = rawBands[i - 1];
      const next = rawBands[i + 1];
      // A neighbor is a collapse target only if the lone token physically
      // spans into that neighbor's X-range.
      const prevRange = prev ? bandRange(prev) : null;
      const nextRange = next ? bandRange(next) : null;
      const prevDist = prevRange && overlaps(lone, prevRange.lo, prevRange.hi)
        ? Math.abs(bandCenter(prev!) - loneC)
        : Infinity;
      const nextDist = nextRange && overlaps(lone, nextRange.lo, nextRange.hi)
        ? Math.abs(bandCenter(next!) - loneC)
        : Infinity;
      if (prevDist === Infinity && nextDist === Infinity) continue; // not a span
      const target = prevDist <= nextDist ? i - 1 : i + 1;
      if (target < 0 || target >= rawBands.length) continue;
      rawBands[target] = [...rawBands[target], lone];
      rawBands.splice(i, 1);
      changed = true;
      break; // restart scan after mutation
    }
  }

  // 3. Aggregate each surviving band into a ColumnCluster.
  const clusters: ColumnCluster[] = rawBands.map((band, index) => {
    const center = bandCenter(band);
    let left = Infinity;
    let right = -Infinity;
    for (const t of band) {
      left = Math.min(left, t.boundingBox.left);
      right = Math.max(right, t.boundingBox.right);
    }
    // Recompute center as the mean of assigned token centers (stabilizes spans).
    return { index, left, right, center, tokens: band };
  });

  return clusters;
}

// ---------------------------------------------------------------------------
// Table-block detection (density-based, NOT keyword-bounded — see spike note)
// ---------------------------------------------------------------------------

/**
 * Result of mapping a detected header row to the 6 financial field names.
 *
 * - `fieldToColumn` : field → {@link ColumnCluster.index} holding its values.
 * - `columnToField` : reverse map (cluster index → field) for diagnostics.
 *
 * Only columns whose header text matched a known alias appear in the maps.
 */
export interface HeaderFieldMap {
  fieldToColumn: Partial<Record<FinancialFieldName, number>>;
  columnToField: Map<number, FinancialFieldName>;
}

/** Normalize text for fuzzy header comparison: lowercase, strip accents & punctuation. */
function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Meaningful tokens (length ≥ 3) after normalization — drops "a","de","el",… */
function meaningfulTokens(s: string): string[] {
  return normalizeText(s)
    .split(' ')
    .filter((w) => w.length >= 3);
}

/** Levenshtein distance (bounded, small strings) for OCR tolerance. */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 1 && (m === 0 || n === 0)) return Math.max(m, n);
  const dp = Array.from({ length: m + 1 }, (_, i) => i);
  for (let j = 1; j <= n; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= m; i++) {
      const tmp = dp[i];
      dp[i] = Math.min(dp[i - 1] + 1, dp[i] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[m];
}

/** Does an alias token fuzzy-match any header token (exact / 1-edit / substring)? */
function tokenMatchesHeader(aliasTok: string, headerTokens: string[]): boolean {
  return headerTokens.some(
    (ht) => ht === aliasTok || levenshtein(ht, aliasTok) <= 1 || ht.includes(aliasTok) || aliasTok.includes(ht),
  );
}

/**
 * Alias registry, ordered by PRIORITY (most specific first — checked earlier).
 *
 * Critical disambiguation: the bare "monto" alias (pastDueAmount) is checked
 * LAST so that "monto a pagar" / "monto ultimo pago" win for their columns.
 * This enforces the rule that `paymentDueAmount` comes ONLY from the
 * "Monto a Pagar" column and `lastPaymentAmount` ONLY from the
 * "Monto Último Pago" column.
 */
const HEADER_ALIASES: ReadonlyArray<{ field: FinancialFieldName; aliases: string[] }> = [
  { field: 'paymentDueAmount', aliases: ['monto a pagar'] },
  { field: 'lastPaymentAmount', aliases: ['monto ultimo pago'] },
  { field: 'currentBalance', aliases: ['saldo actual'] },
  { field: 'maxCredit', aliases: ['credito maximo', 'credito max'] },
  { field: 'creditLimit', aliases: ['limite de credito', 'limite credito', 'limite'] },
  { field: 'lastPaymentAmount', aliases: ['ultimo pago'] },
  { field: 'paymentDueAmount', aliases: ['a pagar'] },
  { field: 'pastDueAmount', aliases: ['monto'] }, // generic fallback — lowest priority
];

/** Join a cluster's header tokens (left→right) into one header string. */
function clusterHeaderText(headerTokens: OcrToken[], cluster: ColumnCluster): string {
  return [...cluster.tokens]
    .sort((a, b) => tokenCenterX(a) - tokenCenterX(b))
    .map((t) => t.text)
    .join(' ');
}

/**
 * Map detected header tokens to financial field names per column cluster.
 *
 * Each cluster's header text (tokens joined left→right) is matched against the
 * {@link HEADER_ALIASES} registry with fuzzy OCR tolerance. All meaningful
 * tokens of an alias must be present for a match, guaranteeing "MONTO A PAGAR"
 * never collapses into the bare "MONTO" past-due alias.
 */
export function mapHeaderToFields(
  headerTokens: OcrToken[],
  clusters: ColumnCluster[],
): HeaderFieldMap {
  const fieldToColumn: Partial<Record<FinancialFieldName, number>> = {};
  const columnToField = new Map<number, FinancialFieldName>();

  if (headerTokens.length === 0 || clusters.length === 0) {
    return { fieldToColumn, columnToField };
  }

  // Assign each header token to its nearest cluster, then build per-cluster text.
  const clusteredHeaderTexts = clusters.map((cluster) => {
    const assigned = headerTokens.filter((t) => {
      const cx = tokenCenterX(t);
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < clusters.length; i++) {
        const d = Math.abs(clusters[i].center - cx);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
      return best === cluster.index;
    });
    return clusterHeaderText(assigned, cluster);
  });

  for (let ci = 0; ci < clusters.length; ci++) {
    const header = clusteredHeaderTexts[ci];
    const headerTokensNormalized = meaningfulTokens(header);
    if (headerTokensNormalized.length === 0) continue;

    for (const { field, aliases } of HEADER_ALIASES) {
      if (fieldToColumn[field] !== undefined) continue; // already assigned
      const matched = aliases.some((alias) => {
        const aliasTokens = meaningfulTokens(alias);
        if (aliasTokens.length === 0) return false;
        return aliasTokens.every((at) => tokenMatchesHeader(at, headerTokensNormalized));
      });
      if (matched) {
        fieldToColumn[field] = ci;
        columnToField.set(ci, field);
        break;
      }
    }
  }

  return { fieldToColumn, columnToField };
}

/** A horizontal band of the page identified as a tabular region. */
export interface TableBlock {
  top: number;
  bottom: number;
  tokens: OcrToken[];
}

interface RowBand {
  top: number;
  bottom: number;
  tokens: OcrToken[];
}

/** Group tokens into horizontal rows by Y-extent overlap, ordered top→bottom. */
export function groupRowsByY(tokens: OcrToken[]): OcrToken[][] {
  if (tokens.length === 0) return [];
  const sorted = [...tokens].sort((a, b) => tokenCenterY(a) - tokenCenterY(b));
  const rows: OcrToken[][] = [];
  let row: OcrToken[] = [sorted[0]];
  let rowTop = sorted[0].boundingBox.top;
  let rowBottom = sorted[0].boundingBox.bottom;
  for (let i = 1; i < sorted.length; i++) {
    const t = sorted[i];
    const overlap = t.boundingBox.top <= rowBottom && t.boundingBox.bottom >= rowTop;
    // tolerate a small vertical gap (≤ row height) to stay in same row
    // Fixed 15px gap threshold — NOT height-dependent (the old
    // Math.max(8, rowHeight) grew unboundedly, collapsing the entire
    // table into one row for dense PDFs like Alejandro Díaz).
    const smallGap = t.boundingBox.top - rowBottom < 15;
    if (overlap || smallGap) {
      row.push(t);
      rowTop = Math.min(rowTop, t.boundingBox.top);
      rowBottom = Math.max(rowBottom, t.boundingBox.bottom);
    } else {
      rows.push(row);
      row = [t];
      rowTop = t.boundingBox.top;
      rowBottom = t.boundingBox.bottom;
    }
  }
  rows.push(row);
  return rows;
}

/** Convert a row of tokens into a RowBand (with explicit Y-bounds). */
function toBand(tokens: OcrToken[]): RowBand {
  let top = Infinity;
  let bottom = -Infinity;
  for (const t of tokens) {
    top = Math.min(top, t.boundingBox.top);
    bottom = Math.max(bottom, t.boundingBox.bottom);
  }
  return { top, bottom, tokens };
}

// ---------------------------------------------------------------------------
// Numeric value parsing (Mexican currency format)
// ---------------------------------------------------------------------------

/**
 * Parse a token/cell string into a numeric financial value.
 *
 * Handles Mexican currency formatting:
 *  - strips `$`, `MXN`, spaces and surrounding labels
 *  - comma ambiguity resolved by position: a single comma followed by exactly
 *    two digits → decimal separator ("1,75" → 1.75); otherwise comma →
 *    thousands ("8,775" → 8775, "49,800" → 49800). A `.` is always decimal.
 *  - placeholders ("NO APLICA", "N/A", "--", "") → `null`
 *  - explicit "0" → `0`
 *
 * Returns `null` when the cell is not a recognizable number rather than
 * `0`, so downstream confidence scoring can distinguish a true zero payment
 * from a missing/unreadable cell.
 */
export function parseCurrencyNumber(text: string): number | null {
  if (text == null) return null;
  // Strip currency symbols and the word letters M/X/N (covers "MXN") and spaces.
  const cleaned = text.replace(/[$\s]/g, '').replace(/[MXN]/gi, '').trim();
  if (cleaned === '') return null;
  // Only accept characters that can form a number.
  if (!/^[0-9.,-]+$/.test(cleaned)) return null;

  let normalized: string;
  if (cleaned.includes('.') && cleaned.includes(',')) {
    // comma = thousands, dot = decimal
    normalized = cleaned.replace(/,/g, '');
  } else if (cleaned.includes(',')) {
    const parts = cleaned.split(',');
    if (parts.length === 2 && parts[1].length === 2) {
      // single comma with exactly 2 trailing digits → decimal separator
      normalized = parts[0] + '.' + parts[1];
    } else {
      // otherwise treat commas as thousands grouping
      normalized = cleaned.replace(/,/g, '');
    }
  } else {
    normalized = cleaned;
  }

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

// ---------------------------------------------------------------------------
// Per-field confidence scoring
// ---------------------------------------------------------------------------

/**
 * Plausible upper bound for a single bureau financial amount (MXN).
 * Values above this are treated as out-of-range (sanity failure → MEDIUM
 * confidence) rather than authoritative.
 */
const SANE_FINANCIAL_MAX = 50_000_000;

/** A financial amount is sane when it is non-negative and below the sane cap. */
export function isSaneFinancialValue(value: number | null): boolean {
  return value != null && value >= 0 && value <= SANE_FINANCIAL_MAX;
}

/** Inputs to confidence scoring for a single extracted field. */
export interface FieldConfidenceInput {
  /** Parsed numeric value (`null` when parsing/ extraction failed). */
  value: number | null;
  /** Whether the cell text was successfully parsed as a number. */
  parsed: boolean;
  /** Whether a token was found at the expected column position. */
  columnMatched: boolean;
  /** Number of candidate tokens competing for the column cell. */
  candidateCount: number;
  /** Whether the value passes the sanity range check. */
  sane: boolean;
}

/**
 * Score the confidence of one extracted financial field:
 *  - HIGH   : column matched + parsed + single unambiguous candidate + sane
 *  - MEDIUM : column matched + parsed but ambiguous (multiple candidates)
 *             OR the value failed the sanity range
 *  - LOW    : no column match / not parseable
 *
 * Authority rule (design.md): only HIGH-confidence layout values are
 * authoritative. LOW → `null` + `needsManualReview` in the merge step
 * (Phase 4). An explicit `0` parses & is sane → HIGH (a true zero payment is
 * authoritative, NOT a missing cell).
 */
export function scoreFieldConfidence(input: FieldConfidenceInput): FinancialFieldsConfidence {
  if (!input.columnMatched || !input.parsed || input.value == null) {
    return FinancialFieldsConfidence.LOW;
  }
  if (input.candidateCount <= 1 && input.sane) {
    return FinancialFieldsConfidence.HIGH;
  }
  return FinancialFieldsConfidence.MEDIUM;
}

/**
 * Detect tabular regions of a page by token density.
 *
 * Wraps the densest contiguous run of "grid rows" (rows with ≥ MIN_TOKENS_PER_GRID_ROW
 * tokens) into a {@link TableBlock}. This is block-level detection: it does NOT
 * rely on a "DETALLE DE CRÉDITOS" keyword (which the Phase 0 spike flagged as
 * fragile) — instead it recognizes the table by its characteristic layout
 * (many tokens per row arranged in a consistent grid).
 */
export function detectTableBlocks(p: OcrPage): TableBlock[] {
  const tokenRows = groupRowsByY(p.tokens);
  if (tokenRows.length === 0) return [];
  const rows: RowBand[] = tokenRows.map(toBand);

  const isGridRow = (r: RowBand) => r.tokens.length >= MIN_TOKENS_PER_GRID_ROW;

  // Find maximal contiguous bands of grid rows (allowing a few sparse rows inside).
  const bands: TableBlock[] = [];
  let run: RowBand[] = [];
  let nonGridStreak = 0;

  const flush = () => {
    // Trim leading/trailing non-grid rows — the in-band tolerance is only for
    // sparse rows BETWEEN grid rows (e.g. "Créditos Bancarios" subheaders),
    // so a sparse row that starts or ends the run must not extend the block.
    let start = 0;
    while (start < run.length && !isGridRow(run[start])) start++;
    let end = run.length - 1;
    while (end > start && !isGridRow(run[end])) end--;
    const trimmed = run.slice(start, end + 1);
    const gridCount = trimmed.filter(isGridRow).length;
    if (gridCount >= MIN_GRID_ROWS_IN_BAND) {
      const top = trimmed[0].top;
      const bottom = trimmed[trimmed.length - 1].bottom;
      const blockTokens: OcrToken[] = [];
      for (const r of trimmed) blockTokens.push(...r.tokens);
      bands.push({ top, bottom, tokens: blockTokens });
    }
    run = [];
    nonGridStreak = 0;
  };

  for (const row of rows) {
    if (isGridRow(row)) {
      run.push(row);
      nonGridStreak = 0;
    } else if (run.length > 0 && nonGridStreak < MAX_NON_GRID_ROWS_IN_BAND) {
      // tolerate a sparse row inside a running band (e.g. a subsection header)
      run.push(row);
      nonGridStreak++;
    } else if (run.length > 0) {
      flush();
    }
  }
  flush();

  // Pick the single densest block (most tokens) — the Detalle table.
  bands.sort((a, b) => b.tokens.length - a.tokens.length);
  return bands;
}

// ===========================================================================
// Row → credit composition
// ===========================================================================

/** Minimum faint fields mapped for a row to count as the header row. */
const HEADER_MIN_FIELDS = 3;

/** Smallest all-digit run treated as an account number. */
const MIN_ACCOUNT_DIGITS = 6;

/** The 6 financial fields we extract, in a stable iteration order. */
const FINANCIAL_FIELDS: FinancialFieldName[] = [
  'currentBalance',
  'creditLimit',
  'maxCredit',
  'lastPaymentAmount',
  'paymentDueAmount',
  'pastDueAmount',
];

/** Index of the {@link ColumnCluster} nearest to a token's center X. */
function nearestClusterIndex(t: OcrToken, clusters: ColumnCluster[]): number {
  const cx = tokenCenterX(t);
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < clusters.length; i++) {
    const d = Math.abs(clusters[i].center - cx);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/**
 * Detect the bureau subsection a row belongs to from its text.
 * Returns `null` when the row text contains no "Bancarios" marker.
 * "No Bancarios" is checked first to avoid the bare "Bancarios" alias.
 */
function detectSubsection(rowText: string): CreditSubsection | null {
  const norm = normalizeText(rowText).replace(/\s+/g, ' ');
  if (norm.includes('no bancarios')) return 'NO_BANCARIOS';
  if (norm.includes('bancarios')) return 'BANCARIOS';
  return null;
}

/** Longest all-digit run (≥ MIN_ACCOUNT_DIGITS) across a row's token texts. */
function extractAccountNumber(rowTokens: OcrToken[]): string | null {
  let best: string | null = null;
  for (const t of rowTokens) {
    const digits = t.text.replace(/[^0-9]/g, '');
    if (digits.length >= MIN_ACCOUNT_DIGITS && (best === null || digits.length > best.length)) {
      best = digits;
    }
  }
  return best;
}

/** Build the per-field values + confidence map for one credit row. */
function extractRowFields(
  rowTokens: OcrToken[],
  clusters: ColumnCluster[],
  fieldToColumn: Partial<Record<FinancialFieldName, number>>,
): { fields: LayoutFinancialFields; confidence: FinancialFieldsConfidenceMap } {
  const fields: LayoutFinancialFields = {
    currentBalance: null,
    creditLimit: null,
    maxCredit: null,
    lastPaymentAmount: null,
    paymentDueAmount: null,
    pastDueAmount: null,
  };
  const confidence: FinancialFieldsConfidenceMap = {
    currentBalance: FinancialFieldsConfidence.LOW,
    creditLimit: FinancialFieldsConfidence.LOW,
    maxCredit: FinancialFieldsConfidence.LOW,
    lastPaymentAmount: FinancialFieldsConfidence.LOW,
    paymentDueAmount: FinancialFieldsConfidence.LOW,
    pastDueAmount: FinancialFieldsConfidence.LOW,
  };

  // Bucket this row's tokens by their nearest column cluster.
  const byCluster: OcrToken[][] = clusters.map(() => []);
  for (const t of rowTokens) byCluster[nearestClusterIndex(t, clusters)].push(t);

  for (const field of FINANCIAL_FIELDS) {
    const col = fieldToColumn[field];
    if (col === undefined) continue; // unmapped column → stays null/LOW
    const cellTokens = byCluster[col]
      .slice()
      .sort((a, b) => tokenCenterX(a) - tokenCenterX(b));
    const cellText = cellTokens.map((t) => t.text).join('');
    const value = parseCurrencyNumber(cellText);
    confidence[field] = scoreFieldConfidence({
      value,
      parsed: value !== null,
      columnMatched: cellTokens.length > 0,
      candidateCount: cellTokens.length,
      sane: isSaneFinancialValue(value),
    });
    fields[field] = value;
  }

  return { fields, confidence };
}

/** Resolve institution text from the leftmost non-financial column cluster. */
function extractInstitution(
  rowTokens: OcrToken[],
  clusters: ColumnCluster[],
  fieldToColumn: Partial<Record<FinancialFieldName, number>>,
): string | null {
  const financialCols = new Set(Object.values(fieldToColumn));
  let institutionIdx = -1;
  for (const c of clusters) {
    if (!financialCols.has(c.index)) {
      institutionIdx = c.index;
      break;
    }
  }
  if (institutionIdx < 0) return null;
  const byCluster: OcrToken[] = [];
  const targetCenter = clusters[institutionIdx].center;
  for (const t of rowTokens) {
    if (nearestClusterIndex(t, clusters) === institutionIdx) byCluster.push(t);
  }
  // institution = non-all-digit tokens, left→right
  const parts = byCluster
    .slice()
    .sort((a, b) => tokenCenterX(a) - tokenCenterX(b))
    .map((t) => t.text.trim())
    .filter((txt) => {
      const digits = txt.replace(/[^0-9]/g, '');
      return digits.length < MIN_ACCOUNT_DIGITS; // drop account-number-like tokens
    });
  return parts.length > 0 ? parts.join(' ').trim() : null;
}

// ===========================================================================
// NestJS service — composes the pure helpers into extract()
// ===========================================================================

/**
 * Deterministic, layout-aware extractor for the 6 financial fields of the
 * "Detalle de Créditos" table.
 *
 * Pipeline (per page):
 *   1. {@link detectTableBlocks} — find the tabular region by token density
 *      (NOT by "DETALLE DE CRÉDITOS" keyword — see Phase 0 spike).
 *   2. {@link clusterColumnsByGap} — X-gap column clustering of block tokens.
 *   3. {@link mapHeaderToFields} — header row → field/column mapping (fuzzy).
 *   4. Rows after the header → credit rows; {@link extractRowFields} parses
 *      each mapped column's cell and scores per-field confidence.
 *
 * Critical invariant: `paymentDueAmount` is read ONLY from the "Monto a Pagar"
 * column and `lastPaymentAmount` ONLY from the "Monto Último Pago" column —
 * enforced by the header alias priority order (never cross-substituted).
 */
@Injectable()
export class LayoutFinancialExtractorService {
  private readonly logger = new Logger(LayoutFinancialExtractorService.name);

  extract(ocrLayout: OcrLayout | null | undefined): LayoutFinancialResult {
    const credits: LayoutCreditField[] = [];
    const confidence: FinancialFieldsConfidenceMap[] = [];
    const warnings: string[] = [];

    if (!ocrLayout || !Array.isArray(ocrLayout.pages) || ocrLayout.pages.length === 0) {
      warnings.push('No OCR pages found.');
      return { credits, confidence, warnings };
    }

    for (const page of ocrLayout.pages) {
      const blocks = detectTableBlocks(page);
      if (!blocks.length) {
        warnings.push(`Page ${page.pageNumber}: no table block detected.`);
        continue;
      }
      const block = blocks[0]; // densest block
      const tokens = block.tokens;
      if (tokens.length === 0) {
        warnings.push(`Page ${page.pageNumber}: table block has no tokens.`);
        continue;
      }

      const clusters = clusterColumnsByGap(tokens);
      const rows = groupRowsByY(tokens);

      // Adaptive gap: when the default gap produces fragmented columns
      // (>15 narrow clusters), retry with a wider gap that merges
      // header-word fragments into proper column headers. Common with
      // PDFs where individual header words ("Monto", "a", "Pagar") sit
      // >15px apart but belong to the same logical column.
      const adaptiveClusters =
        clusters.length > 15
          ? clusterColumnsByGap(tokens, 25)
          : clusters;
      const gapPx = clusters.length > 15 ? 25 : DEFAULT_GAP_THRESHOLD_PX;

      // 1. Detect header row + field/column map.
      let headerRowIdx = -1;
      let headerMap: HeaderFieldMap | null = null;
      for (let i = 0; i < rows.length; i++) {
        const candidate = mapHeaderToFields(rows[i], adaptiveClusters);
        if (Object.keys(candidate.fieldToColumn).length >= HEADER_MIN_FIELDS) {
          headerRowIdx = i;
          headerMap = candidate;
          break;
        }
      }
      if (!headerMap || headerRowIdx < 0) {
        warnings.push(`Page ${page.pageNumber}: header row not detected.`);
        continue;
      }

      // 2. Walk rows after the header; classify subheaders vs credit rows.
      let currentSubsection: CreditSubsection | null = null;
      let orderInBlock = 0;
      for (let i = headerRowIdx + 1; i < rows.length; i++) {
        const rowTokens = rows[i];
        const rowText = rowTokens.map((t) => t.text).join(' ');
        const sub = detectSubsection(rowText);

        // A subheader marker row is sparse (< MIN_TOKENS_PER_GRID_ROW) and
        // carries a "Bancarios" / "No Bancarios" label — set scope, not a credit.
        if (sub !== null && rowTokens.length < MIN_TOKENS_PER_GRID_ROW) {
          currentSubsection = sub;
          continue;
        }

        const { fields, confidence: rowConf } = extractRowFields(
          rowTokens,
          adaptiveClusters,
          headerMap.fieldToColumn,
        );
        const institution = extractInstitution(rowTokens, adaptiveClusters, headerMap.fieldToColumn);
        const accountNumber = extractAccountNumber(rowTokens);

        credits.push({
          accountNumber,
          institution,
          fields,
          orderInBlock,
          subsection: currentSubsection,
        });
        confidence.push(rowConf);
        orderInBlock++;
      }
    }

    return { credits, confidence, warnings };
  }
}