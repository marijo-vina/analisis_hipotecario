# Design: Fix Bureau Extraction Gaps

## Summary

Fixes four data quality gaps in the coordinate-based credit bureau extraction pipeline:

1. **Missing MOPs** — payment history codes not extracted
2. **Missing credit limits** — bottom-table credits lose creditLimit due to X-drift
3. **Scrambled credit ordering** — credits not always in top-to-bottom order
4. **Incorrect isClosed** — date heuristics unreliable; use status text instead

## Technical Approach

### 1. MOP Extraction

Add `extractMopCodes()` helper that scans `paymentHistory` column cells and extracts single-character MOP codes (letters and dashes only — digits and whitespace are filtered). Store in `CoordinateCredit.mopCodes: string[]`.

### 2. Nearest-Band Fallback

When a word's center X falls outside all column bands, find the nearest band by center-X distance. If ≤ 12px, assign. Exclude `paymentDueAmount` band (it has its own rescue path). Log warning on fallback.

### 3. Y-Order Preservation

Add explicit `.sort()` at end of `groupIntoBlocks`: sort by `pageNum` ascending, then `yStart` ascending. This guarantees top-to-bottom visual order matching the PDF.

### 4. Status Mapping

Add `mapStatusCode()` that converts Spanish status text to enum: "Vigente", "Al corriente" → ACTIVE; "Cerrado", "Liquidado", "Castigado" → CLOSED; else → UNKNOWN. Apply in `extractBlockValues` and also via cross-page `extractSummaryStatuses()`.

### 5. Cross-Page Summary Extraction

Add `extractSummaryStatuses()` that scans all pages for "RESUMEN DE CRÉDITOS" header, reads numbered entries until "DETALLE DE CRÉDITOS" boundary, and parses institution + status. Entries are globally numbered 1..N across all sub-sections.

### 6. Global Merge

In `extractFromCoordinateWords` orchestrator, call `extractSummaryStatuses()` before section processing. After all credits are collected, merge `summaryEntries[k].status` → `combinedBlockList[k].status` for matching indices.

## Type Changes

```typescript
interface CoordinateCredit {
  // ... existing fields
  mopCodes: string[];  // NEW
  status: 'ACTIVE' | 'CLOSED' | 'UNKNOWN';  // NEW
}

interface SummaryEntry {  // NEW
  index: number;
  institution: string;
  status: 'ACTIVE' | 'CLOSED' | 'UNKNOWN';
}
```

## Files Affected

- `apps/api/src/documents/coordinate-extraction.types.ts` — type additions
- `apps/api/src/documents/coordinate-grid.extractor.ts` — implementation
- `apps/api/src/documents/coordinate-grid.extractor.spec.ts` — tests
