// ---------------------------------------------------------------------------
// Coordinate grid extraction — shared type contracts (POC v3.1 → integration)
// ---------------------------------------------------------------------------

import { PaymentDueAmountSource } from './document-ai.types';

/**
 * A single word token extracted from a PDF page with its pixel position.
 * Mirrors the shape returned by pdfjs-dist's getTextContent().
 */
export interface CoordinateWord {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pageNum: number;
}

/**
 * A text line — words grouped by Y-coordinate proximity.
 */
export interface CoordinateLine {
  words: CoordinateWord[];
  y: number;
  xMin: number;
  xMax: number;
  fullText: string;
  pageNum: number;
}

/**
 * One credit extracted from the coordinate grid.
 * `paymentDueAmount` is the raw string from the band.
 * `paymentConfidence` maps to PaymentDueAmountSource.
 */
export interface CoordinateCredit {
  institution: string;
  accountNumber: string | null;
  creditType: string | null;
  paymentType: string | null;

  // Financial fields (raw strings from the grid bands)
  creditLimit: string;
  maxCredit: string;
  currentBalance: string;
  pastDueAmount: string;
  lastPaymentAmount: string;
  paymentDueAmount: string;

  /** Provenance of paymentDueAmount */
  paymentSource: PaymentDueAmountSource;

  /**
   * MOP (Method of Payment) codes extracted from the `paymentHistory` column.
   * Each entry is a single character (0-9, U, -, N, etc.) from the column cells.
   * Empty array when the column is absent.
   */
  mopCodes: string[];

  /**
   * Credit status normalized to an enum.
   * `ACTIVE` — Vigente / Al corriente / ACTIVO
   * `CLOSED` — Cerrado / Liquidado / Castigado / CERRADO
   * `UNKNOWN` — no status text found or unmatched
   */
  status: 'ACTIVE' | 'CLOSED' | 'UNKNOWN';

  /**
   * Section classification inferred from the PDF layout.
   * Detected from "CRÉDITOS BANCARIOS" / "CRÉDITOS NO BANCARIOS" labels
   * immediately above the column headers. `unknown` when no label found.
   */
  sectionType: 'banking' | 'non_banking' | 'unknown';
}

/**
 * A single numbered entry from the "RESUMEN DE CRÉDITOS" summary section.
 * The `index` is the global 1-based credit number assigned by the bureau.
 * Merged into detail credits by positional order: summary[K] → combined credit list[K].
 */
export interface SummaryEntry {
  /** Global 1-based credit number as printed in the summary section. */
  index: number;
  /** Institution name as printed in the summary (may differ from detail table format). */
  institution: string;
  /** Normalized status parsed from Spanish text in the summary. */
  status: 'ACTIVE' | 'CLOSED' | 'UNKNOWN';
}

/**
 * Full extraction result for one PDF.
 */
export interface CoordinateExtractionResult {
  sourceFile: string;
  totalPages: number;
  totalWords: number;
  columnsDetected: string[];
  sectionsFound: number;
  credits: CoordinateCredit[];
  warnings: string[];
}

/** Configuration knobs for the grid extractor (tunable without code changes). */
export interface CoordinateExtractionOptions {
  /** Y tolerance in px for grouping words into lines. Default: 4 */
  yTolerance: number;
  /** X tolerance in px for merging multi-line headers. Default: 22 */
  headerXMergeTolerance: number;
  /** Extra px added to the right of the paymentDueAmount band. Default: 20 */
  paymentDueBandExtraRight: number;
}
