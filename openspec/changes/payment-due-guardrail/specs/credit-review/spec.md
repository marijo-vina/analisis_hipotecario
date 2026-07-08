# Credit Review Specification

## Purpose

Defines the analyst review workflow for confirming or overriding `paymentDueAmount` per credit, with source tracking and effective amount resolution.

## Requirements

### Requirement: Manual Override Capability

The system MUST allow analysts to set `paymentDueAmountManualOverride` (numeric value) and `paymentDueAmountConfirmed` (boolean) per credit. When an override is saved, `paymentDueAmountSource` MUST be set to `MANUAL`.

#### Scenario: Analyst overrides amount

- GIVEN a credit with `paymentDueAmountSource=UNCONFIRMED`
- WHEN an analyst sets `paymentDueAmountManualOverride=7500` and confirms
- THEN `paymentDueAmountSource` SHALL be set to `MANUAL`
- AND `paymentDueAmountConfirmed` SHALL be set to `true`

#### Scenario: Analyst confirms auto-extracted amount

- GIVEN a credit with `paymentDueAmountSource=UNCONFIRMED`
- WHEN an analyst clicks "Confirm" without changing the amount
- THEN `paymentDueAmountSource` SHALL be set to `CONFIRMED_AUTO`
- AND `paymentDueAmountConfirmed` SHALL be set to `true`
- AND `paymentDueAmountManualOverride` SHALL remain unset

### Requirement: Review Visibility in Frontend

The frontend MUST display a "Requiere revisión" badge on any credit where `needsManualReview=true`. The UI MUST show a "Monto a pagar no confirmado" warning alongside the badge.

#### Scenario: Badge shown for unconfirmed credit

- GIVEN a credit with `needsManualReview=true`
- WHEN the credit list renders in `buro-tab.tsx`
- THEN a "Requiere revisión" badge SHALL be visible on the credit row
- AND a "Monto a pagar no confirmado" warning SHALL be displayed

#### Scenario: Badge hidden for confirmed credit

- GIVEN a credit with `paymentDueAmountSource=CONFIRMED_AUTO`
- WHEN the credit list renders
- THEN no review badge SHALL be visible on the credit row

### Requirement: Effective Amount Resolution

The system MUST resolve the effective `paymentDueAmount` using this priority: (1) `paymentDueAmountManualOverride` if set, (2) auto-extracted amount if `paymentDueAmountSource=CONFIRMED_AUTO`, (3) block (return `null`) otherwise.

#### Scenario: Manual override takes priority

- GIVEN `paymentDueAmountManualOverride=7500` and auto-extracted `paymentDueAmount=5000`
- WHEN effective amount is resolved
- THEN the result SHALL be `7500`

#### Scenario: Confirmed auto amount used when no override

- GIVEN `paymentDueAmountSource=CONFIRMED_AUTO` and no manual override
- WHEN effective amount is resolved
- THEN the result SHALL be the auto-extracted `paymentDueAmount`

#### Scenario: Unconfirmed amount blocks resolution

- GIVEN `paymentDueAmountSource=UNCONFIRMED` and no manual override
- WHEN effective amount is resolved
- THEN the result SHALL be `null`
- AND the credit SHALL be marked as pending review

### Requirement: Backend PATCH Endpoint

The system MUST provide a PATCH endpoint to update `paymentDueAmountManualOverride`, `paymentDueAmountConfirmed`, and `paymentDueAmountSource` for a specific credit within a document.

#### Scenario: PATCH updates override and source

- GIVEN a valid PATCH request with `{ paymentDueAmountManualOverride: 7500 }`
- WHEN the endpoint processes the request
- THEN the credit's override SHALL be saved
- AND `paymentDueAmountSource` SHALL be set to `MANUAL`
- AND the response SHALL return the updated credit

#### Scenario: PATCH validates numeric input

- GIVEN a PATCH request with non-numeric `paymentDueAmountManualOverride`
- WHEN the endpoint processes the request
- THEN the response SHALL be HTTP 400 with a validation error
