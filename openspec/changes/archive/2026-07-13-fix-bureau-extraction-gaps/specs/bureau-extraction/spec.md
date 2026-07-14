# Delta for Bureau Extraction

## ADDED Requirements

### Requirement: Coordinate MOP Extraction

The system MUST extract payment history MOP codes from the coordinate grid for every credit block, not only financial fields.

#### Scenario: MOP codes populated for all credits

- GIVEN a PDF with payment history columns in the coordinate grid
- WHEN `extractBlockValues` processes a credit block
- THEN the resulting `CoordinateCredit` MUST include `mopCodes` populated from the `paymentHistory` column cells
- AND `mopCodes` MUST be an array of single-character strings (one per month)

#### Scenario: MOP codes empty when column absent

- GIVEN a PDF section without a `paymentHistory` header column
- WHEN `extractBlockValues` processes a credit block
- THEN `mopCodes` MUST be an empty array (not null or undefined)

### Requirement: Coordinate Status Extraction

The system MUST extract the credit status code from the coordinate grid so that downstream `isClosed` derivation uses actual status rather than date heuristics.

#### Scenario: Status extracted from coordinate grid

- GIVEN a PDF with a status column (e.g., "Vigente", "Cerrado", "Castigado")
- WHEN coordinate extraction processes a credit block
- THEN the `CoordinateCredit` MUST include a `status` field mapped from the extracted text
- AND status values MUST be normalized to the enum: `ACTIVE`, `CLOSED`, `UNKNOWN`

#### Scenario: Status fallback when column absent

- GIVEN a PDF without a recognizable status column
- WHEN coordinate extraction processes a credit block
- THEN `status` MUST default to `UNKNOWN`

## MODIFIED Requirements

### Requirement: Coordinate Credit Limit Extraction

The system MUST populate `creditLimit` for every credit in the coordinate grid, including credits at the bottom of tables where X-position drift may cause words to fall outside band boundaries.

(Previously: creditLimit only populated for credits whose words fell within strict band boundaries)

#### Scenario: Credit limit extracted for bottom-table credits

- GIVEN a credit at the bottom of a PDF table with slight X-position drift (< 15px)
- WHEN `processDataRows` assigns words to column bands
- THEN words for `creditLimit` MUST still be captured via nearest-band fallback
- AND the credit's `creditLimit` field MUST be populated

#### Scenario: Credit limit extracted for top-table credits (unchanged)

- GIVEN a credit at the top of a PDF table with normal X positions
- WHEN `processDataRows` assigns words to column bands
- THEN `creditLimit` MUST be captured as before (no regression)

## REMOVED Requirements

None.

## RENAMED Requirements

None.
