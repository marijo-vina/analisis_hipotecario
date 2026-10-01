# Coordinate Extraction Specification

## Purpose

Defines the coordinate-based credit bureau extraction pipeline: word-to-line grouping, header detection, column band construction, data row processing, credit block grouping, and financial value extraction from PDF text coordinates.

## Requirements

### Requirement: Word-to-Line Grouping

The system MUST group individual PDF words into lines based on Y-coordinate proximity within a configurable tolerance.

#### Scenario: Words on same visual line grouped together

- GIVEN words with Y positions within `yTolerance` (default: 4px) of each other on the same page
- WHEN `groupIntoLines` is called
- THEN all words MUST be grouped into a single `CoordinateLine`
- AND the line's `fullText` MUST concatenate word texts with spaces

#### Scenario: Words on different pages remain separate

- GIVEN words with identical Y positions but different `pageNum` values
- WHEN `groupIntoLines` is called
- THEN words MUST NOT be grouped across pages
- AND each page's words MUST form independent lines

### Requirement: Header Section Detection

The system MUST detect all "Monto a Pagar" header anchor points and build header sections around them.

#### Scenario: Single header section detected

- GIVEN a PDF page with one "Monto a Pagar" header row
- WHEN `detectSections` is called
- THEN exactly one `HeaderSection` MUST be returned
- AND the section's `pageNum` MUST match the anchor page

#### Scenario: Multiple header sections on same page

- GIVEN a PDF page with two separate credit table headers (e.g., banking and non-banking)
- WHEN `detectSections` is called
- THEN two `HeaderSection` entries MUST be returned
- AND each section's `dataYStart` MUST be below its respective header

#### Scenario: No headers detected

- GIVEN a PDF without any "Monto a Pagar" text
- WHEN `detectSections` is called
- THEN an empty array MUST be returned

### Requirement: Column Band Construction

The system MUST build column bands from detected headers using midpoint boundaries between adjacent headers.

#### Scenario: Bands cover full page width

- GIVEN N sorted headers by centerX
- WHEN `buildBands` is called
- THEN N bands MUST be created
- AND the first band's `xMin` MUST equal the page's minimum X
- AND the last band's `xMax` MUST equal the page's maximum X
- AND intermediate band boundaries MUST be midpoints between adjacent header centers

#### Scenario: Payment due band extended right

- GIVEN a `paymentDueAmount` band
- WHEN `buildBands` is called
- THEN the band's `xMax` MUST be increased by `paymentDueBandExtraRight` (default: 20px)

### Requirement: Band Tolerance with Nearest-Band Fallback

The system MUST handle X-position drift in lower-table rows by falling back to the nearest column band when a word's center falls just outside all band boundaries.

#### Scenario: Nearest-band assignment for drifted words

- GIVEN a word whose center X falls outside all band boundaries by less than epsilon (default: 12px)
- WHEN `processDataRows` assigns the word to a band
- THEN the word MUST be assigned to the nearest band by center-X distance
- AND a warning MUST be logged indicating the fallback was used

#### Scenario: No assignment for words far from all bands

- GIVEN a word whose center X falls more than epsilon (12px) outside all bands
- WHEN `processDataRows` assigns the word to a band
- THEN the word MUST NOT be assigned to any band
- AND the word MUST be excluded from the row's cells

#### Scenario: Normal band assignment (unchanged)

- GIVEN a word whose center X falls within a band's [xMin, xMax]
- WHEN `processDataRows` assigns the word to a band
- THEN the word MUST be assigned to that band (direct match, no fallback)

### Requirement: Credit Block Grouping

The system MUST group data rows into credit blocks using known institution name patterns.

#### Scenario: New block on known institution

- GIVEN a row whose `creditorInfo` cell matches a known institution pattern
- WHEN `groupIntoBlocks` processes the row
- THEN a new `CreditBlock` MUST be started with that institution name

#### Scenario: Continuation rows appended to current block

- GIVEN a row without a known institution name
- WHEN `groupIntoBlocks` processes the row and a current block exists
- THEN the row MUST be appended to the current block's rows

#### Scenario: Orphan blocks named from content

- GIVEN a block with an empty or short institution name (< 2 chars)
- WHEN `groupIntoBlocks` post-processes blocks
- THEN the system MUST scan the block's rows for a non-numeric `creditorInfo` cell
- AND use that cell's text (first 50 chars) as the institution name

### Requirement: Credit Ordering Preservation

The system MUST preserve the top-to-bottom Y-order of credits as they appear in the PDF.

#### Scenario: Credits ordered by Y-start position

- GIVEN multiple credit blocks detected in a single section
- WHEN `groupIntoBlocks` returns the blocks
- THEN blocks MUST be sorted by their `yStart` value in ascending order
- AND the order MUST match the visual top-to-bottom sequence in the PDF

#### Scenario: Cross-page credits maintain order

- GIVEN credits spanning multiple PDF pages
- WHEN `groupIntoBlocks` returns all blocks
- THEN blocks MUST be sorted first by `pageNum` ascending, then by `yStart` ascending

### Requirement: Financial Value Extraction

The system MUST extract financial values from credit block cells, prioritizing numeric values and handling the paymentDueAmount band match / rescue / unconfirmed provenance model.

#### Scenario: BAND_MATCH payment due amount

- GIVEN a block with a numeric cell in the `paymentDueAmount` band
- WHEN `extractBlockValues` processes the block
- THEN `paymentDueAmount` MUST be set to the cell's text
- AND `paymentSource` MUST be `BAND_MATCH`

#### Scenario: RESCUE payment due amount

- GIVEN a block without a direct `paymentDueAmount` band match but with a numeric candidate in the rescue zone
- WHEN `extractBlockValues` processes the block
- THEN `paymentDueAmount` MAY be set from the rescued candidate
- AND `paymentSource` MUST be `RESCUE`

#### Scenario: UNCONFIRMED when no payment found

- GIVEN a block with no numeric candidates in either band match or rescue zone
- WHEN `extractBlockValues` processes the block
- THEN `paymentDueAmount` MUST be empty string
- AND `paymentSource` MUST be `UNCONFIRMED`

### Requirement: Coordinate Extractor Output Completeness

The `CoordinateCredit` type MUST include `mopCodes` (string array) and `status` (enum) fields so that downstream merging can populate payment history and closed-status on bureau credits.

#### Scenario: Extended CoordinateCredit type

- GIVEN the `coordinate-extraction.types.ts` module
- WHEN the `CoordinateCredit` interface is defined
- THEN it MUST include `mopCodes: string[]` and `status: 'ACTIVE' | 'CLOSED' | 'UNKNOWN'`

#### Scenario: extractBlockValues populates new fields

- GIVEN a credit block with `paymentHistory` and status column cells
- WHEN `extractBlockValues` processes the block
- THEN the returned `CoordinateCredit` MUST have `mopCodes` and `status` populated from the respective column cells

#### Scenario: MOP codes extracted from payment history column

- GIVEN a credit block with cells in the `paymentHistory` column
- WHEN `extractBlockValues` processes the block
- THEN `mopCodes` MUST be an array of the cell texts (one per month row)
- AND non-MOP characters (digits, whitespace) MUST be filtered out

#### Scenario: Status mapped from Spanish text

- GIVEN a status cell containing "Vigente" or "Al corriente"
- WHEN `extractBlockValues` processes the block
- THEN `status` MUST be set to `ACTIVE`

#### Scenario: Status mapped from closed text

- GIVEN a status cell containing "Cerrado", "Liquidado", or "Castigado"
- WHEN `extractBlockValues` processes the block
- THEN `status` MUST be set to `CLOSED`

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
