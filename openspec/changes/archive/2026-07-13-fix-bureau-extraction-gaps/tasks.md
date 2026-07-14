# Tasks: Fix Bureau Extraction Gaps

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 200–300 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR — all changes in 2–3 files |
| Delivery strategy | single-pr |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked-to-main
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Types + summary extraction + nearest-band + Y-order + MOP + merge | PR 1 (single) | All interdependent; single PR stays well under 400 lines |

## Phase 1: Types & Interfaces

- [x] 1.1 Add `mopCodes: string[]` and `status: 'ACTIVE' | 'CLOSED' | 'UNKNOWN'` to `CoordinateCredit` in `coordinate-extraction.types.ts`
- [x] 1.2 Add `SummaryEntry` interface (`index`, `institution`, `status`) to `coordinate-extraction.types.ts`
- [x] 1.3 Export `SummaryEntry` from `coordinate-extraction.types.ts`

## Phase 2: Core Implementation

- [x] 2.1 Add `extractSummaryStatuses(words: CoordinateWord[]): SummaryEntry[]` to `coordinate-grid.extractor.ts` — scan all pages for "RESUMEN DE CRÉDITOS" header, read lines across page boundaries until "DETALLE DE CRÉDITOS" or EOF, parse numbered entries (e.g. "1. SANTANDER ... ACTIVO"), return entries in global 1-indexed order
- [x] 2.2 Add nearest-band fallback in `processDataRows` — when word center X falls outside all bands, find nearest band by center-X distance; assign if distance ≤ 12px AND band name is NOT `paymentDueAmount`; log warning on fallback
- [x] 2.3 Add explicit `yStart` sort at end of `groupIntoBlocks` — sort blocks by `pageNum` ascending, then `yStart` ascending
- [x] 2.4 Add MOP extraction in `extractBlockValues` — scan `paymentHistory` column cells, filter each cell text to non-digit/non-whitespace characters, append to `mopCodes: string[]`
- [x] 2.5 Add status mapping in `extractBlockValues` — map Spanish text ("Vigente", "Al corriente" → `ACTIVE`; "Cerrado", "Liquidado", "Castigado" → `CLOSED`; else → `UNKNOWN`)
- [x] 2.6 Add global merge in `extractFromCoordinateWords` orchestrator — call `extractSummaryStatuses(words)` before section processing; after all sections processed, iterate `combinedBlockList` and assign `summaryEntries[k].status` to `combinedBlockList[k].status` for matching indices

## Phase 3: Testing

- [x] 3.1 Write unit test for `extractSummaryStatuses` — mock words spanning 2 pages with "RESUMEN DE CRÉDITOS" header and "DETALLE DE CRÉDITOS" boundary, verify entries parsed in global order
- [x] 3.2 Write unit test for global index merge — banking + non-banking blocks, verify `summaryEntries[K].status` maps to `combinedBlockList[K].status`
- [x] 3.3 Write unit test for nearest-band fallback — synthetic word at 10px outside band captured, word at 20px outside dropped, `paymentDueAmount` band excluded from fallback
- [x] 3.4 Write unit test for `groupIntoBlocks` Y-order — mock rows with scrambled Y order, verify returned blocks sorted by `pageNum` then `yStart` ascending
- [x] 3.5 Write unit test for MOP extraction — block with `paymentHistory` cells containing "N", "1", "0", verify `mopCodes` contains only ["N"] (digits filtered)
- [x] 3.6 Write unit test for status mapping — verify "Vigente" → `ACTIVE`, "Cerrado" → `CLOSED`, unknown text → `UNKNOWN`
- [x] 3.7 Run full regression suite — all existing `coordinate-grid.extractor.spec.ts` tests remain green

## Phase 4: Cleanup

- [x] 4.1 Add JSDoc comments to `extractSummaryStatuses` and nearest-band fallback logic
- [x] 4.2 Verify no `console.log` or debug statements left in production code
