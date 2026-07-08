# Bureau Extraction Specification

## Purpose

Defines the credit bureau PDF extraction pipeline: OCR pre-filtering, Gemini structured extraction, layout-aware financial field merging, payment disambiguation, normalization, and alert computation.

## Requirements

### Requirement: Prompt Size Budget

The system SHALL keep the Gemini prompt under 10K characters for typical bureau PDFs (12-20 credits) to prevent GEMINI_TIMEOUT (>300s) and GEMINI_INVALID_JSON errors.

#### Scenario: Schema without inline descriptions

- GIVEN a CREDIT_BUREAU_SCHEMA is constructed for Gemini
- WHEN the schema is serialized
- THEN inline descriptions (e.g., `"number | null — 'Monto a Pagar'..."`) SHALL be stripped to type-only values (e.g., `"number | null"`)

#### Scenario: Trimmed instructions

- GIVEN CREDIT_BUREAU_INSTRUCTIONS are assembled
- WHEN layout extraction is NOT active
- THEN the instructions SHALL contain only: anti-glossary rule, payment golden rule (2 lines), date/amount formats, enum values
- AND SHALL NOT contain: OCR literal examples, ASCII decision trees, redundant sections

#### Scenario: Prompt size measurement

- GIVEN a 20-credit bureau PDF with full OCR text
- WHEN the prompt is built (instructions + schema + filtered OCR)
- THEN the total prompt size SHALL be under 10K characters

### Requirement: Aggressive OCR Pre-Filtering

The system MUST reduce OCR text sent to Gemini when `ocrLayout` is present, keeping only the DETALLE DE CRÉDITOS section plus borrower data.

#### Scenario: Layout-active pre-filter

- GIVEN a document with `ocrLayout` data present
- WHEN `preFilterOcr` is called
- THEN the system SHALL extract only the "DETALLE DE CRÉDITOS" section for Gemini
- AND SHALL extract `borrower.fullName`, `rfc`, `birthDate`, and `report.consultationDate` via regex from the full OCR text
- AND the filtered text sent to Gemini SHALL NOT include borrower or report metadata sections

#### Scenario: Fallback without layout

- GIVEN a document without `ocrLayout` data
- WHEN `preFilterOcr` is called
- THEN the system SHALL use the existing section-boundary filtering (borrower + summary + detail)
- AND the cap SHALL remain at 15K characters

#### Scenario: Regex misses borrower data

- GIVEN regex extraction returns null for any borrower field
- WHEN layout is active
- THEN the system SHALL fall back to the Layer 1 extraction flow (full OCR text + LEAN schema + LEAN instructions) for the entire document
- AND SHALL log a warning
- AND SHALL NOT make a separate Gemini call for borrower fields alone (Layer 2 trims OCR to "DETALLE DE CRÉDITOS" only, so Gemini never sees borrower/report data)

### Requirement: Reduced Schema When Layout Active

When `USE_LAYOUT_EXTRACTION=true`, the system SHALL use a reduced Gemini schema that excludes financial fields already handled by layout extraction.

#### Scenario: Reduced schema excludes layout-owned fields

- GIVEN `USE_LAYOUT_EXTRACTION=true` and document has `ocrLayout`
- WHEN the Gemini schema is constructed
- THEN the schema SHALL exclude: `currentBalance`, `creditLimit`, `paymentDueAmount`, `lastPaymentAmount`
- AND `maxCredit` and `pastDueAmount` are NOT affected (they are layout-merger fields in `FINANCIAL_FIELDS`, never part of the Gemini schema)
- AND all other schema fields SHALL remain unchanged

#### Scenario: Full schema when layout inactive

- GIVEN `USE_LAYOUT_EXTRACTION=false` or no `ocrLayout`
- WHEN the Gemini schema is constructed
- THEN the full schema SHALL be used (all fields included)

### Requirement: Skip Payment Disambiguation When Layout Active

The system SHALL skip `disambiguatePaymentFields()` when layout extraction is active, since layout owns financial field authority.

#### Scenario: Disambiguation bypass

- GIVEN `USE_LAYOUT_EXTRACTION=true` and document has `ocrLayout`
- WHEN the extraction pipeline reaches the disambiguation step
- THEN `disambiguatePaymentFields()` SHALL NOT be called
- AND layout merge (`mergeLayoutWithGemini`) SHALL remain the authoritative source for payment fields

#### Scenario: Disambiguation active without layout

- GIVEN `USE_LAYOUT_EXTRACTION=false` or no `ocrLayout`
- WHEN the extraction pipeline reaches the disambiguation step
- THEN `disambiguatePaymentFields()` SHALL be called with the full OCR text (existing behavior preserved)

### Requirement: Extraction Performance

The system SHALL complete bureau extraction for 20-credit PDFs in under 60 seconds.

#### Scenario: Large PDF extraction within budget

- GIVEN a bureau PDF with 20 credits
- WHEN `extract()` is called
- THEN the full pipeline SHALL complete in under 60 seconds
- AND the result SHALL contain all credits with correct fields

#### Scenario: No timeout or invalid JSON errors

- GIVEN any bureau PDF processed through the optimized pipeline
- WHEN extraction completes
- THEN the error code SHALL NOT be `GEMINI_TIMEOUT` or `GEMINI_INVALID_JSON`
