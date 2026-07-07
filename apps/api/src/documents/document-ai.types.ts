// ---------------------------------------------------------------------------
// Document AI layout-aware extraction — shared type contracts.
//
// Phase 1 (Schema & Foundation) of `layout-aware-buro-extraction`.
//
// These types describe the compact OCR layout JSON stored on `Document.ocrLayout`
// (see `prisma/schema.prisma`) and the result contract produced by the
// `LayoutFinancialExtractorService` (implemented in Phase 3).
//
// No runtime logic here — pure type declarations only. This keeps Phase 1
// strictly a schema + interfaces layer, decoupled from extraction logic.
// ---------------------------------------------------------------------------

/**
 * Axis-aligned bounding box in PIXEL coordinates.
 *
 * Document AI returns `normalizedVertices` (0..1); the layer that builds
 * `OcrLayout` multiplies by `page.dimension.width/height` to get pixels.
 * The column-detection algorithm (≤15px X-gap criterion) operates in pixels.
 */
export interface BoundingBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A single OCR token (word/fragment) with its pixel bounding box. */
export interface OcrToken {
  text: string;
  boundingBox: BoundingBox;
  confidence: number;
}

/** A single OCR line with its pixel bounding box. */
export interface OcrLine {
  text: string;
  boundingBox: BoundingBox;
  confidence: number;
}

/** One page of the OCR layout: dimension + lines + tokens. */
export interface OcrPage {
  pageNumber: number;
  width: number;
  height: number;
  lines: OcrLine[];
  /** Tighter bounding boxes than lines — the primitive column detection uses. */
  tokens: OcrToken[];
}

/**
 * Compact OCR layout structure persisted on `Document.ocrLayout`.
 * Mirrors the relevant subset of Document AI's `document.pages[]` so the
 * extractor never needs the full raw Document AI response at runtime.
 */
export interface OcrLayout {
  pages: OcrPage[];
}

// ---------------------------------------------------------------------------
// Financial field confidence & source
// ---------------------------------------------------------------------------

/**
 * Per-field confidence of a layout-extracted financial value.
 * - HIGH   : header matched + unambiguous single token in the column
 * - MEDIUM : header matched but value ambiguous (multiple candidates)
 * - LOW    : no column match, or layout could not confirm the field
 *
 * Authority rule (see design.md): only LAYOUT-HIGH values are authoritative.
 * LAYOUT-LOW → the field is set to `null`, `needsManualReview` is flagged,
 * and the Gemini value is archived as `candidatePaymentDueAmount`.
 */
export enum FinancialFieldsConfidence {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

/**
 * Coarse origin of a credit's financial field values.
 * - LAYOUT        : at least one field came from the layout extractor
 * - GEMINI        : no layout match / feature flag off; Gemini is the only source
 * - MANUAL_REVIEW : a critical field (paymentDueAmount) was LOW-confidence,
 *                   so it was nulled and flagged for human review
 *
 * NOTE: design.md models a 4-value union (`LAYOUT_HIGH` | `LAYOUT_LOW` |
 * `MANUAL_REVIEW` | `GEMINI_ONLY`) on `CreditAuditFields.financialFieldsSource`.
 * This enum is the coarse version requested by the apply spec; the
 * per-field `financialFieldsConfidence` map retains the HIGH/MEDIUM/LOW
 * distinction, so the combination is equivalent for audit purposes.
 */
export enum FinancialFieldsSource {
  LAYOUT = 'LAYOUT',
  GEMINI = 'GEMINI',
  MANUAL_REVIEW = 'MANUAL_REVIEW',
}

// ---------------------------------------------------------------------------
// Layout-extracted financial fields
// ---------------------------------------------------------------------------

/**
 * The 6 numeric financial fields extracted from the "Detalle de Créditos"
 * table. Each value is `number | null` (null when the column was not found
 * or the confidence was LOW and the field was intentionally blanked).
 */
export interface LayoutFinancialFields {
  currentBalance: number | null;
  creditLimit: number | null;
  maxCredit: number | null;
  lastPaymentAmount: number | null;
  paymentDueAmount: number | null;
  pastDueAmount: number | null;
}

/**
 * Per-field confidence map. Keys mirror `LayoutFinancialFields`.
 * Kept as a concrete interface (not `Record<string, …>`) so callers get
 * compile-time safety on field names.
 */
export interface FinancialFieldsConfidenceMap {
  currentBalance: FinancialFieldsConfidence;
  creditLimit: FinancialFieldsConfidence;
  maxCredit: FinancialFieldsConfidence;
  lastPaymentAmount: FinancialFieldsConfidence;
  paymentDueAmount: FinancialFieldsConfidence;
  pastDueAmount: FinancialFieldsConfidence;
}

/**
 * Which "Detalle de Créditos" subsection a reconstructed credit belongs to.
 * Bureau reports split credits into "Créditos Bancarios" and
 * "Créditos No Bancarios" sub-blocks; Phase 3 layout extraction records this
 * so the Phase 4 merge can bias matching and Phase 6 acceptance tests can
 * assert on subsection membership.
 */
export type CreditSubsection = 'BANCARIOS' | 'NO_BANCARIOS';

/**
 * One credit row as reconstructed from the layout tokens.
 * `accountNumber`/`institution` are the merge keys against Gemini credits
 * (fallback merge by `institution + orderInBlock`).
 */
export interface LayoutCreditField {
  accountNumber: string | null;
  institution: string | null;
  fields: LayoutFinancialFields;
  /** 0-based position of this row inside the "DETALLE DE CRÉDITOS" block. */
  orderInBlock: number;
  /** Subsection the row belongs to (`null` when no marker was detected). */
  subsection: CreditSubsection | null;
}

/**
 * Output of `LayoutFinancialExtractorService.extract(ocrLayout)`.
 * `confidence` is a per-credit, per-field confidence list aligned 1:1 with
 * `credits[]`. `warnings` captures non-fatal issues that did not abort
 * extraction (e.g. ambiguous header, missing account column).
 */
export interface LayoutFinancialResult {
  credits: LayoutCreditField[];
  /** Aligned 1:1 with `credits[]`; `confidence[i]` is per-field for `credits[i]`. */
  confidence: FinancialFieldsConfidenceMap[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Audit fields merged onto persisted credit objects
// ---------------------------------------------------------------------------

/**
 * Audit metadata attached to each credit after layout↔Gemini merge.
 * Persisted inside `Document.extractedData.credits[].*` so the UI and
 * downstream consumers know every financial field's provenance.
 */
export interface CreditAuditFields {
  financialFieldsSource: FinancialFieldsSource | null;
  financialFieldsConfidence: FinancialFieldsConfidenceMap | null;
  financialFieldsWarnings: string[];
  /** Gemini's paymentDueAmount preserved for audit when layout low-confidence nulls it. */
  candidatePaymentDueAmount: number | null;
}

/** Financial field names that carry per-field confidence. */
export type FinancialFieldName = keyof LayoutFinancialFields;