# Tasks: Redesign LayoutFinancialExtractor — Lines-First

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1,500–2,000 |
| 400-line budget risk | High |
| Review budget override | 800 lines (orchestrator-specified) |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (Foundation + Classification + Blocks) → PR 2 (Extraction + Service + Tests) |
| Delivery strategy | chained (stacked-to-main) |
| Chain strategy | stacked-to-main |
| size:exception | Accepted for chained PRs only |

Decision needed before apply: No (chained PRs accepted)
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units (if chained)

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Line types, classification, filtering, block grouping, header detection + tests | PR 1 | Self-verifying, no service compose |
| 2 | Field extraction functions, service compose, full spec + integration tests | PR 2 | Depends on PR 1 types |

## Phase 1: Line Classification + Filtering

- [x] 1.1 Add `LineType` enum + `classifyLine()` regex dispatch (6 variants)
- [x] 1.2 Add `filterDetailLines()` section boundary detection
- [x] 1.3 Write tests: classifyLine (12+ cases per variant) + filterDetailLines

## Phase 2: Block Grouping + Header Detection

- [x] 2.1 Add `CreditBlock` interface + `groupLinesIntoBlocks()` stream parser
- [x] 2.2 Add `detectHeaderFromLines()` fuzzy alias matcher
- [x] 2.3 Write tests: block grouping edge cases + header alias matching

## Phase 3: Field Extraction

- [ ] 3.1 Add `extractInstitutionFromLine()` name + account number parser
- [ ] 3.2 Add `extractFinancialDataLine()` column-parsed field extraction
- [ ] 3.3 Add `extractPaymentFromLine()` (0+HIGH, null+LOW, standard)
- [ ] 3.4 Write tests: all extractors with real PDF line fixtures

## Phase 4: Composition + Service

- [ ] 4.1 Add `extractBlockFields()` per-block orchestration
- [ ] 4.2 Rewrite service `extract(ocrLayout)` composing pipeline (1→4.1)
- [ ] 4.3 Delete old tokens-first implementation and dead code
- [ ] 4.4 Integration test: SANTANDER=8775, TELCEL=0, AMEX=1875, AMEX COMPANY≠49800

## Phase 5: Regression

- [ ] 5.1 Run all 457 existing unit tests — fix any regressions
- [ ] 5.2 Verify acceptance test assertions unchanged
- [ ] 5.3 Confirm file size ≤ 500 lines
