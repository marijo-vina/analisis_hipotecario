# Proposal: Fix Bureau Extraction Gaps

## Intent

Fix four data quality gaps in the coordinate-based credit bureau extraction that block accurate loan approval decisions.

## Problem

1. **Missing MOP codes** — Payment history behavior (MOP codes) not extracted, making it impossible to assess payment patterns
2. **Missing credit limits** — Credits at the bottom of PDF tables lose their `creditLimit` due to X-position drift exceeding band boundaries
3. **Scrambled credit ordering** — Credits not always returned in the visual top-to-bottom order of the PDF, causing confusion
4. **Incorrect isClosed flags** — Date-based heuristics for closed-status are unreliable; actual status text ("Cerrado", "Vigente") is available in the PDF but not extracted

## Scope

- Coordinate extraction pipeline (`coordinate-grid.extractor.ts`)
- Types (`coordinate-extraction.types.ts`)
- Bureau extraction integration (downstream consumer of the new fields)

## Approach

- **MOP**: Extract single-character codes from `paymentHistory` column cells, filter digits/whitespace
- **Credit limits**: Add nearest-band fallback (≤12px center-X distance) in `processDataRows`
- **Ordering**: Add explicit Y-sort at end of `groupIntoBlocks`
- **Status**: Map Spanish status text to enum, with cross-page summary extraction for authoritative status

## Non-Goals

- Changing the Gemini extraction flow
- Modifying the frontend display
- Handling PDFs without coordinate extraction
