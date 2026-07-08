# Delta for Credit Review

## ADDED Requirements

### Requirement: All Active Credits Are Editable

The system SHALL allow analysts to edit "Monto a pagar" on ALL active credits, regardless of extraction status or confirmation state. This extends beyond unconfirmed-only editing.

#### Scenario: Edit confirmed credit amount

- GIVEN an active credit with `paymentDueAmountSource=CONFIRMED_AUTO`
- WHEN an analyst enters edit mode and changes the amount
- THEN the new value SHALL be saved as `paymentDueAmountManual`
- AND `paymentDueAmountSource` SHALL be updated to `MANUAL`
- AND `paymentDueAmountEffective` SHALL resolve to the new manual value

#### Scenario: Edit extracted but unconfirmed credit

- GIVEN an active credit with `paymentDueAmountSource=GEMINI` and `needsReview=true`
- WHEN an analyst edits and saves the amount
- THEN `paymentDueAmountManual` SHALL be set
- AND `paymentDueAmountNeedsReview` SHALL be `false`

## MODIFIED Requirements

### Requirement: Manual Override Capability

The system MUST allow analysts to set `paymentDueAmountManualOverride` (numeric value) and `paymentDueAmountConfirmed` (boolean) per credit. When an override is saved, `paymentDueAmountSource` MUST be set to `MANUAL`. The same pattern applies to `inquiries24mManual` for inquiry counts.

(Previously: Only covered unconfirmed credits; now extends to ALL active credits)

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

#### Scenario: Analyst edits inquiry count

- GIVEN a credit with `inquiries24mExtracted=5`
- WHEN an analyst sets `inquiries24mManual=8` and saves
- THEN `inquiries24mEffective` SHALL resolve to `8`
- AND `inquiries24mConfirmed` SHALL be `true`

## ADDED Requirements

### Requirement: Visual States for Payment Due Amount

The UI SHALL display one of four visual states per credit's "Monto a pagar": **Extraído** (auto-extracted, pending review), **Requiere revisión** (needs validation), **Confirmado manualmente** (analyst override), **Confirmado automático** (confirmed auto-extracted). Each state SHALL have distinct color coding.

#### Scenario: Extraído state renders

- GIVEN `paymentDueAmountExtracted` is set with source `GEMINI` and no confirmation
- WHEN the credit row renders
- THEN a badge labeled "Extraído" SHALL display with the appropriate color

#### Scenario: Requiere revisión state renders

- GIVEN `paymentDueAmountNeedsReview=true`
- WHEN the credit row renders
- THEN a badge labeled "Requiere revisión" SHALL display with warning styling

#### Scenario: Confirmado manualmente state renders

- GIVEN `paymentDueAmountSource=MANUAL`
- WHEN the credit row renders
- THEN a badge labeled "Confirmado manualmente" SHALL display

#### Scenario: Confirmado automático state renders

- GIVEN `paymentDueAmountSource=CONFIRMED_AUTO`
- WHEN the credit row renders
- THEN a badge labeled "Confirmado automático" SHALL display

## ADDED Requirements

### Requirement: Inline Edit Mode

Each credit's "Monto a pagar" and "Consultas 24 meses" fields SHALL support inline edit mode with save and cancel actions.

#### Scenario: Enter and save edit mode

- GIVEN a credit row displaying "Monto a pagar"
- WHEN an analyst clicks the edit icon
- THEN an inline input field SHALL appear with the current value
- AND save/cancel buttons SHALL be visible
- WHEN the analyst clicks save
- THEN the new value SHALL be persisted and the field returns to display mode

#### Scenario: Cancel edit mode

- GIVEN an analyst is in inline edit mode
- WHEN the analyst clicks cancel
- THEN the field SHALL revert to the previous value
- AND no changes SHALL be persisted

## ADDED Requirements

### Requirement: Empty/Unconfirmed Field UI

When `paymentDueAmountEffective` is `null` or the field is unconfirmed, the UI SHALL display "—" (em dash) with a tooltip reading "Dato pendiente de validación manual". Unconfirmed inquiry counts SHALL show "No confirmado" with the same tooltip pattern.

#### Scenario: Empty payment amount shows placeholder

- GIVEN `paymentDueAmountEffective=null`
- WHEN the credit row renders
- THEN the "Monto a pagar" field SHALL display "—"
- AND hovering SHALL show tooltip "Dato pendiente de validación manual"

#### Scenario: Unconfirmed inquiry shows placeholder

- GIVEN `inquiries24mEffective=null`
- WHEN the credit row renders
- THEN the "Consultas 24 meses" field SHALL display "No confirmado"
- AND hovering SHALL show the validation-pending tooltip
