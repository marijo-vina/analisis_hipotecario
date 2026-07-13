# Delta for Bureau Extraction

## ADDED Requirements

### Requirement: Coordinate-First Extraction Pipeline

The system MUST run coordinate-based extraction for `paymentDueAmount` BEFORE calling Gemini. If coordinate extraction returns `BAND_MATCH`, the value is authoritative and Gemini SHALL NOT be called for `paymentDueAmount`. If coordinate extraction returns `RESCUE` or `UNCONFIRMED`, Gemini SHALL be called as fallback and its result merged with the coordinate result.

#### Scenario: BAND_MATCH skips Gemini for paymentDueAmount

- GIVEN a PDF where coordinate extraction finds a confident band match for paymentDueAmount
- WHEN `CreditBureauExtractionService.extract()` runs
- THEN the coordinate result is used as the authoritative `paymentDueAmount`
- AND Gemini SHALL NOT be called for `paymentDueAmount` extraction
- AND Gemini MAY still be called for other schema fields not handled by coordinate extraction

#### Scenario: RESCUE triggers Gemini fallback

- GIVEN a PDF where coordinate extraction returns RESCUE (partial match with rescue logic)
- WHEN `CreditBureauExtractionService.extract()` runs
- THEN Gemini SHALL be called for `paymentDueAmount` extraction
- AND the final `paymentDueAmount` SHALL prefer Gemini's result unless manual override exists

#### Scenario: UNCONFIRMED triggers Gemini fallback

- GIVEN a PDF where coordinate extraction returns UNCONFIRMED (no confident match)
- WHEN `CreditBureauExtractionService.extract()` runs
- THEN Gemini SHALL be called for `paymentDueAmount` extraction
- AND the coordinate result SHALL NOT be used as the extracted value

#### Scenario: Feature flag rollback to Gemini-only

- GIVEN `COORDINATE_EXTRACTION_ENABLED=false`
- WHEN `CreditBureauExtractionService.extract()` runs
- THEN coordinate extraction SHALL be skipped entirely
- AND Gemini SHALL be used for all fields including `paymentDueAmount` (pre-change behavior)

### Requirement: PaymentDueAmountEffective Computation

The system MUST compute `paymentDueAmountEffective` from the triple pattern: `paymentDueAmount` (extracted), `paymentDueAmountManual` (user override), and `paymentDueAmountSource` (provenance). When `paymentDueAmountManual` is set by the user, it becomes the effective value and source becomes `MANUAL`. Otherwise, the extracted value and its source are effective.

#### Scenario: Manual override sets effective value

- GIVEN an extracted `paymentDueAmount` with source BAND_MATCH
- WHEN the user sets `paymentDueAmountManual` to a different value
- THEN `paymentDueAmountEffective` SHALL equal `paymentDueAmountManual`
- AND `paymentDueAmountSource` SHALL be set to `MANUAL`

#### Scenario: No manual override uses extracted value

- GIVEN an extracted `paymentDueAmount` with source RESCUE
- WHEN `paymentDueAmountManual` is null or unset
- THEN `paymentDueAmountEffective` SHALL equal `paymentDueAmount`
- AND `paymentDueAmountSource` SHALL remain `RESCUE`

#### Scenario: Manual always wins over automatic

- GIVEN any extracted `paymentDueAmount` regardless of source (BAND_MATCH, RESCUE, GEMINI, UNCONFIRMED)
- WHEN the user sets `paymentDueAmountManual`
- THEN `paymentDueAmountEffective` SHALL always equal `paymentDueAmountManual`
- AND the original source SHALL be preserved for audit but overridden for display

## MODIFIED Requirements

### Requirement: Reduced Schema When Layout Active

When `USE_LAYOUT_EXTRACTION=true`, the system SHALL use a reduced Gemini schema that excludes financial fields already handled by layout extraction. When coordinate extraction yields `BAND_MATCH`, Gemini SHALL NOT be called for `paymentDueAmount` regardless of layout flag.

(Previously: Schema reduction was solely controlled by `USE_LAYOUT_EXTRACTION` flag; Gemini was always called for excluded fields when layout was active.)

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

#### Scenario: BAND_MATCH eliminates Gemini call for paymentDueAmount

- GIVEN coordinate extraction returns BAND_MATCH for `paymentDueAmount`
- WHEN the Gemini schema is constructed
- THEN `paymentDueAmount` SHALL be excluded from the Gemini schema regardless of `USE_LAYOUT_EXTRACTION`
- AND Gemini SHALL NOT be queried for `paymentDueAmount`

### Requirement: Skip Payment Disambiguation When Layout Active

The system SHALL skip `disambiguatePaymentFields()` when layout extraction is active, since layout owns financial field authority. When coordinate extraction yields `BAND_MATCH`, `paymentDueAmount` disambiguation SHALL be skipped regardless of layout flag.

(Previously: Disambiguation was skipped only when layout extraction was active.)

#### Scenario: Disambiguation bypass

- GIVEN `USE_LAYOUT_EXTRACTION=true` and document has `ocrLayout`
- WHEN the extraction pipeline reaches the disambiguation step
- THEN `disambiguatePaymentFields()` SHALL NOT be called
- AND layout merge (`mergeLayoutWithGemini`) SHALL remain the authoritative source for payment fields

#### Scenario: Disambiguation active without layout

- GIVEN `USE_LAYOUT_EXTRACTION=false` or no `ocrLayout`
- WHEN the extraction pipeline reaches the disambiguation step
- THEN `disambiguatePaymentFields()` SHALL be called with the full OCR text (existing behavior preserved)

#### Scenario: BAND_MATCH skips disambiguation for paymentDueAmount

- GIVEN coordinate extraction returns BAND_MATCH for `paymentDueAmount`
- WHEN the extraction pipeline reaches the disambiguation step
- THEN `paymentDueAmount` SHALL NOT be included in disambiguation
- AND the coordinate result SHALL be used directly

### Requirement: Extraction Performance

The system SHALL complete bureau extraction for 20-credit PDFs in under 60 seconds. Coordinate extraction SHALL complete within 3 seconds and reduce average Gemini API latency by skipping calls for BAND_MATCH cases.

(Previously: Performance budget was 60 seconds with no coordinate extraction timing requirement.)

#### Scenario: Large PDF extraction within budget

- GIVEN a bureau PDF with 20 credits
- WHEN `extract()` is called
- THEN the full pipeline SHALL complete in under 60 seconds
- AND the result SHALL contain all credits with correct fields

#### Scenario: No timeout or invalid JSON errors

- GIVEN any bureau PDF processed through the optimized pipeline
- WHEN extraction completes
- THEN the error code SHALL NOT be `GEMINI_TIMEOUT` or `GEMINI_INVALID_JSON`

#### Scenario: Coordinate extraction completes within budget

- GIVEN a bureau PDF of any size
- WHEN coordinate extraction runs
- THEN it SHALL complete within 3 seconds
- AND SHALL NOT block the overall pipeline if it fails (graceful fallback to Gemini)
