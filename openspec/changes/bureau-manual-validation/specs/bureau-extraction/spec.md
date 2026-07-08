# Delta for Bureau Extraction

## ADDED Requirements

### Requirement: Extracted/Manual/Effective Triple for paymentDueAmount

The system SHALL store three distinct values per credit: `paymentDueAmountExtracted` (auto-extracted), `paymentDueAmountManual` (analyst override), and `paymentDueAmountEffective` (resolved value). The `paymentDueAmountSource` enum SHALL expand to `LAYOUT | GEMINI | MANUAL | UNCONFIRMED`. A `paymentDueAmountNeedsReview` boolean SHALL indicate pending validation.

#### Scenario: New extraction populates triple

- GIVEN a bureau PDF is processed by the extraction pipeline
- WHEN a credit's `paymentDueAmount` is auto-extracted with source `GEMINI`
- THEN `paymentDueAmountExtracted` SHALL equal the extracted value
- AND `paymentDueAmountSource` SHALL be set to `GEMINI`
- AND `paymentDueAmountEffective` SHALL be `null` (unconfirmed)
- AND `paymentDueAmountNeedsReview` SHALL be `true`

#### Scenario: Layout source is tracked separately

- GIVEN `USE_LAYOUT_EXTRACTION=true` and layout provides `paymentDueAmount`
- WHEN the extraction pipeline normalizes the credit
- THEN `paymentDueAmountExtracted` SHALL equal the layout value
- AND `paymentDueAmountSource` SHALL be set to `LAYOUT`

#### Scenario: Manual override resolves effective

- GIVEN a credit with `paymentDueAmountExtracted=5000` and `paymentDueAmountManual=7500`
- WHEN `paymentDueAmountEffective` is resolved
- THEN the result SHALL be `7500` (manual wins)
- AND `paymentDueAmountSource` SHALL be `MANUAL`

#### Scenario: Confirmed auto resolves effective

- GIVEN `paymentDueAmountExtracted=5000`, no manual override, and source `GEMINI`
- WHEN an analyst confirms the auto-extracted amount
- THEN `paymentDueAmountEffective` SHALL be `5000`
- AND `paymentDueAmountNeedsReview` SHALL be `false`

#### Scenario: Unconfirmed amount blocks effective

- GIVEN `paymentDueAmountExtracted=5000` with source `UNCONFIRMED` and no manual override
- WHEN `paymentDueAmountEffective` is resolved
- THEN the result SHALL be `null`

## ADDED Requirements

### Requirement: Extracted/Manual/Effective Triple for numberOfInquiries

The system SHALL store the same triple pattern for `numberOfInquiries`: `inquiries24mExtracted`, `inquiries24mManual`, `inquiries24mEffective`, and `inquiries24mConfirmed` boolean.

#### Scenario: Inquiry extraction populates triple

- GIVEN the bureau PDF contains inquiry data for the last 24 months
- WHEN extraction completes
- THEN `inquiries24mExtracted` SHALL contain the extracted count
- AND `inquiries24mEffective` SHALL be `null` until confirmed

#### Scenario: Manual inquiry override

- GIVEN `inquiries24mExtracted=5` and analyst sets `inquiries24mManual=8`
- WHEN `inquiries24mEffective` is resolved
- THEN the result SHALL be `8`

## ADDED Requirements

### Requirement: Default Existing Records

When the triple fields are introduced, existing credit records SHALL be backfilled: `paymentDueAmountExtracted` set to current `paymentDueAmount`, `paymentDueAmountSource` set to `UNCONFIRMED`, and `paymentDueAmountEffective` set to `null`.

#### Scenario: Backfill on first read

- GIVEN an existing credit with `paymentDueAmount=3500` and no triple fields
- WHEN the record is read after migration
- THEN `paymentDueAmountExtracted` SHALL be `3500`
- AND `paymentDueAmountSource` SHALL be `UNCONFIRMED`
- AND `paymentDueAmountEffective` SHALL be `null`

## MODIFIED Requirements

### Requirement: Extraction Performance

The system SHALL complete bureau extraction for 20-credit PDFs in under 60 seconds. The extraction pipeline SHALL populate extracted/manual/effective triple fields for both `paymentDueAmount` and `numberOfInquiries`.

(Previously: Only specified completion time and result correctness without triple fields)

#### Scenario: Large PDF extraction within budget

- GIVEN a bureau PDF with 20 credits
- WHEN `extract()` is called
- THEN the full pipeline SHALL complete in under 60 seconds
- AND each credit SHALL have `paymentDueAmountExtracted` and `inquiries24mExtracted` populated

#### Scenario: No timeout or invalid JSON errors

- GIVEN any bureau PDF processed through the optimized pipeline
- WHEN extraction completes
- THEN the error code SHALL NOT be `GEMINI_TIMEOUT` or `GEMINI_INVALID_JSON`

## ADDED Requirements

### Requirement: monthlyDebtContribution Uses Effective Amount

The `monthlyDebtContribution` aggregation SHALL read `paymentDueAmountEffective` exclusively. Credits with `null` effective SHALL contribute `0` to the total.

#### Scenario: Effective amount used in aggregation

- GIVEN three active credits with effective amounts `[3500, 7500, null]`
- WHEN `monthlyDebtContribution` is calculated
- THEN the result SHALL be `11000` (null contributes 0)

#### Scenario: Unconfirmed credit excluded from debt total

- GIVEN a credit with `paymentDueAmountExtracted=5000` but `paymentDueAmountEffective=null`
- WHEN `monthlyDebtContribution` is calculated
- THEN this credit SHALL contribute `0` to the total
