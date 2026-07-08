# Delta for Bureau Extraction

## ADDED Requirements

### Requirement: Payment Due Amount Guardrail

The system MUST NOT include `paymentDueAmount` in `monthlyDebtContribution` aggregation when `paymentDueAmountSource` is `UNCONFIRMED`. When `normalizeCreditBureau()` detects low layout confidence or no layout match, it MUST set `paymentDueAmountSource` to `UNCONFIRMED` and set `needsManualReview` to `true`.

#### Scenario: Unconfirmed amount excluded from aggregation

- GIVEN a credit with `paymentDueAmountSource=UNCONFIRMED` and `paymentDueAmount=5000`
- WHEN `monthlyDebtContribution` is computed
- THEN the credit's `paymentDueAmount` SHALL contribute `0` to the total
- AND the credit SHALL be flagged as pending review

#### Scenario: Low confidence triggers UNCONFIRMED source

- GIVEN layout extraction returns confidence score below threshold
- WHEN `mergeLayoutWithGemini()` processes the credit
- THEN `paymentDueAmountSource` SHALL be set to `UNCONFIRMED`
- AND `needsManualReview` SHALL be set to `true`

#### Scenario: No layout match triggers UNCONFIRMED source

- GIVEN a credit with no matching layout data
- WHEN `normalizeCreditBureau()` processes the credit
- THEN `paymentDueAmountSource` SHALL be set to `UNCONFIRMED`
- AND `needsManualReview` SHALL be set to `true`

### Requirement: Payment Due Amount Source Tracking

Every credit MUST have a `paymentDueAmountSource` field with one of: `UNCONFIRMED`, `CONFIRMED_AUTO`, `MANUAL`. The source MUST reflect how the effective amount was determined.

#### Scenario: Auto-extracted with high confidence

- GIVEN layout extraction returns high confidence and a valid `paymentDueAmount`
- WHEN `mergeLayoutWithGemini()` completes
- THEN `paymentDueAmountSource` SHALL be set to `CONFIRMED_AUTO`

#### Scenario: Manual override sets source

- GIVEN an analyst sets `paymentDueAmountManualOverride` to a value
- WHEN the override is saved
- THEN `paymentDueAmountSource` SHALL be set to `MANUAL`

### Requirement: Backward Compatibility for Existing Records

Records created before this change that lack `paymentDueAmountSource` MUST default to `UNCONFIRMED` when read. The system MUST NOT assume `CONFIRMED_AUTO` for legacy data.

#### Scenario: Missing source field defaults to UNCONFIRMED

- GIVEN a credit record without `paymentDueAmountSource` field
- WHEN the credit is loaded for liability computation
- THEN `paymentDueAmountSource` SHALL resolve to `UNCONFIRMED`
- AND the `paymentDueAmount` SHALL NOT contribute to `monthlyDebtContribution`

#### Scenario: Existing confirmed records unaffected

- GIVEN a credit with `paymentDueAmountSource=CONFIRMED_AUTO` explicitly set
- WHEN the credit is loaded
- THEN the source SHALL remain `CONFIRMED_AUTO`
- AND the `paymentDueAmount` SHALL contribute normally
