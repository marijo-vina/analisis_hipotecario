# Payment Source Tracking Specification

## Purpose

Defines the provenance tracking system for `paymentDueAmount` values, enabling users to understand whether a value came from coordinate extraction (BAND_MATCH/RESCUE), Gemini AI (GEMINI), or manual user override (MANUAL).

## Requirements

### Requirement: Source Enum Values

The system MUST track the provenance of each `paymentDueAmount` using the `PaymentDueAmountSource` enum with values: `BAND_MATCH`, `RESCUE`, `GEMINI`, `UNCONFIRMED`, and `MANUAL`. Each value represents a distinct extraction method with different confidence levels.

#### Scenario: BAND_MATCH indicates confident coordinate extraction

- GIVEN coordinate extraction finds a text band that matches the expected paymentDueAmount pattern
- WHEN the source is recorded
- THEN `PaymentDueAmountSource` SHALL be set to `BAND_MATCH`
- AND the value SHALL be considered authoritative (highest confidence)

#### Scenario: RESCUE indicates partial coordinate match

- GIVEN coordinate extraction finds a plausible value through rescue logic (fuzzy match, adjacent bands)
- WHEN the source is recorded
- THEN `PaymentDueAmountSource` SHALL be set to `RESCUE`
- AND the value SHALL be considered tentative (medium confidence)

#### Scenario: GEMINI indicates AI extraction

- GIVEN Gemini AI was called to extract paymentDueAmount
- WHEN the source is recorded
- THEN `PaymentDueAmountSource` SHALL be set to `GEMINI`
- AND the value SHALL be considered AI-derived (requires user verification)

#### Scenario: UNCONFIRMED indicates no confident extraction

- GIVEN coordinate extraction finds no confident match and Gemini was not called or also failed
- WHEN the source is recorded
- THEN `PaymentDueAmountSource` SHALL be set to `UNCONFIRMED`
- AND the value SHALL be null or empty, requiring user input

#### Scenario: MANUAL indicates user override

- GIVEN the user explicitly sets a paymentDueAmount value through the UI
- WHEN the source is recorded
- THEN `PaymentDueAmountSource` SHALL be set to `MANUAL`
- AND the value SHALL be considered user-confirmed (overrides all automatic sources)

### Requirement: Source Persistence

The system MUST persist the `paymentDueAmountSource` alongside the extracted value in the document data model. The source SHALL survive document reloads and SHALL be returned in API responses.

#### Scenario: Source stored with extracted value

- GIVEN coordinate extraction returns BAND_MATCH with value "$1,234.56"
- WHEN the extraction result is persisted
- THEN both `paymentDueAmount` and `paymentDueAmountSource` SHALL be saved together

#### Scenario: Source returned in API response

- GIVEN a document with `paymentDueAmount` and `paymentDueAmountSource` stored
- WHEN `GET /documents/:id` is called
- THEN the response SHALL include both fields
- AND `paymentDueAmountSource` SHALL be one of the valid enum values

### Requirement: Source Transition on Manual Override

When a user manually edits `paymentDueAmount`, the system MUST update `paymentDueAmountSource` to `MANUAL` and preserve the original source in an audit trail. The original source SHALL be restorable if the user clears the manual override.

#### Scenario: Manual override changes source to MANUAL

- GIVEN a document with `paymentDueAmount` source = BAND_MATCH
- WHEN the user edits the paymentDueAmount field
- THEN `paymentDueAmountSource` SHALL change to `MANUAL`
- AND the previous source SHALL be preserved in audit history

#### Scenario: Clearing manual override restores original source

- GIVEN a document where user overrode a BAND_MATCH value
- WHEN the user clears the manual override
- THEN `paymentDueAmount` SHALL revert to the original extracted value
- AND `paymentDueAmountSource` SHALL revert to `BAND_MATCH`

### Requirement: Dubious Amount Confirmation

The system SHOULD flag RESCUE and UNCONFIRMED sources as requiring user confirmation. Dubious amounts SHALL be visually distinguished in the UI and SHALL NOT be used for downstream calculations until confirmed.

#### Scenario: RESCUE source flagged for confirmation

- GIVEN a document with `paymentDueAmountSource` = RESCUE
- WHEN the document is displayed in the UI
- THEN the amount SHALL be marked as "needs confirmation"
- AND downstream calculations SHALL use the value but flag it as unconfirmed

#### Scenario: UNCONFIRMED source requires input

- GIVEN a document with `paymentDueAmountSource` = UNCONFIRMED
- WHEN the document is displayed in the UI
- THEN the amount field SHALL show as empty or placeholder
- AND the user SHALL be prompted to enter the correct value

### Requirement: No lastPaymentAmount Fallback

The system MUST NOT use `lastPaymentAmount` as a fallback for `paymentDueAmount` under any circumstances. These fields represent different financial concepts and SHALL remain independent.

#### Scenario: No fallback to lastPaymentAmount

- GIVEN coordinate extraction returns UNCONFIRMED and Gemini returns null for paymentDueAmount
- WHEN the extraction pipeline completes
- THEN `paymentDueAmount` SHALL remain null
- AND `lastPaymentAmount` SHALL NOT be copied or used as a substitute
