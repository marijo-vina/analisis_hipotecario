# Delta for Coordinate Extraction

## ADDED Requirements

### Requirement: Parse Account Number from Creditor Info

Coordinate extraction MUST parse `accountNumber` from `creditorInfo` digit runs. `accountNumber` MUST NOT be hardcoded null when digits are present. `CoordinateCredit` MUST include `accountNumber` (`string | null`).

#### Scenario: Digits in creditorInfo

- GIVEN `creditorInfo` containing a usable digit run
- WHEN `extractBlockValues` processes the block
- THEN `accountNumber` MUST be that digit run (not null)

#### Scenario: No digits

- GIVEN `creditorInfo` with no usable digit run
- WHEN `extractBlockValues` processes the block
- THEN `accountNumber` MUST be null
