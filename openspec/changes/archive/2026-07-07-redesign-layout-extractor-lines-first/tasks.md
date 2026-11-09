# Tasks: Redesign LayoutFinancialExtractor ΓÇö Lines-First

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1,500ΓÇô2,000 |
| 400-line budget risk | High |
| Review budget override | 800 lines (orchestrator-specified) |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (Foundation + Classification + Blocks) ΓåÆ PR 2 (Extraction + Service + Tests) |
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
| 1 | Line types, classification, filtering, block grouping, header detection + tests | PR 1 | Γ£à Merged |
| 2 | Field extraction functions, service compose, full spec + integration tests | PR 2 | This PR |

## Phase 1: Line Classification + Filtering

- [x] 1.1 Add `LineType` enum + `classifyLine()` regex dispatch (6 variants)
- [x] 1.2 Add `filterDetailLines()` section boundary detection
- [x] 1.3 Write tests: classifyLine (12+ cases per variant) + filterDetailLines

## Phase 2: Block Grouping + Header Detection

- [x] 2.1 Add `CreditBlock` interface + `groupLinesIntoBlocks()` stream parser
- [x] 2.2 Add `detectHeaderFromLines()` fuzzy alias matcher
- [x] 2.3 Write tests: block grouping edge cases + header alias matching

## Phase 3: Field Extraction

- [x] 3.1 Add `extractInstitutionFromLine()` name + account number parser
- [x] 3.2 Add `extractFinancialDataLine()` column-parsed field extraction
- [x] 3.3 Add `extractPaymentFromLine()` (0+HIGH, null+LOW, standard)
- [x] 3.4 Write tests: all extractors with real PDF line fixtures

## Phase 4: Composition + Service

- [x] 4.1 Add `extractBlockFields()` per-block orchestration
- [x] 4.2 Rewrite service `extract(ocrLayout)` composing pipeline (1ΓåÆ4.1)
- [x] 4.3 Delete old tokens-first implementation and dead code
- [x] 4.4 Integration test: SANTANDER=8775, TELCEL=0, AMEX=1875, AMEX COMPANYΓëá49800

## Phase 5: Regression

- [x] 5.1 Run all existing unit tests ΓÇö fix any regressions (447/447)
- [x] 5.2 Verify acceptance test assertions unchanged
- [x] 5.3 Service file Γëñ 40 lines, extractor ~330 lines (lines-first)

## PR 2 Documentation

### Regression change: 447/447 (was 455/455)
- Removed: 2 NestJS module-registration integration tests (replaced by simpler unit tests)
- Removed: 22 old tokens-first tests (clusterColumnsByGap, groupRowsByY, detectTableBlocks, etc.)
- Added: 16 PR2 tests (extraction functions + service compose)
- Net: -2 module + -22 old + 16 new = -8 tests. All passing.

### File size: ~330 lines (layout-lines-extractor.ts)
Target was Γëñ500. The combined file (PR1 foundation + PR2 extraction) is ~330 lines including imports, types, and all functions. Well within budget.

### Acceptance criteria (verified with synthetic fixtures)
- Γ£à SANTANDER = 8775 (HIGH confidence)
- Γ£à TELCEL MER 82953660 = 0 (HIGH confidence, explicit zero)
- Γ£à AMEX = 1875 (HIGH confidence)
- Γ£à Closed credit without payment line ΓåÆ null + LOW confidence
- Γ£à paymentDueAmount NEVER uses lastPaymentAmount as fallback
