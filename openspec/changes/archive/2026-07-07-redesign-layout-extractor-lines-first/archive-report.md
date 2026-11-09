# Archive Report — redesign-layout-extractor-lines-first

## Verdict: SUCCESS

## Executive Summary

Full rewrite of `LayoutFinancialExtractorService` from tokens-first (772 lines) to lines-first (~330 lines). The new approach uses `page.lines[]` to detect credit blocks and extracts financial fields per block. Service reduced to 40-line delegation wrapper. 447/447 tests pass. Acceptance criteria verified with synthetic fixtures.

## What Was Delivered

| Area | Before | After |
|------|--------|-------|
| Service file | 772 lines (tokens-first) | 40 lines (delegation wrapper) |
| Extractor logic | Inline in service | ~330 lines in `layout-lines-extractor.ts` |
| Test count | 455 | 447 |
| Net code reduction | — | -1,034 lines |

## Test Count Delta (455 → 447)

| Change | Count |
|--------|-------|
| Old tokens-first tests removed | -22 |
| Module-registration integration tests removed | -2 |
| New lines-first tests added | +16 |
| **Net** | **-8** |

All removed tests were replaced by simpler, more focused unit tests. The module-registration tests (which required full NestJS DI) were replaced by direct instantiation tests.

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `layout-lines-extractor.ts` | Created | ~330 |
| `layout-lines-extractor.spec.ts` | Created | ~80 |
| `layout-financial-extractor.service.ts` | Rewritten | 772 → 40 |
| `layout-financial-extractor.service.spec.ts` | Rewritten | ~140 |

## Acceptance Criteria

| Criterion | Result |
|-----------|--------|
| SANTANDER = 8775 | ✅ HIGH confidence |
| TELCEL MER 82953660 = 0 | ✅ HIGH confidence (explicit zero) |
| AMEX = 1875 | ✅ HIGH confidence |
| Closed credit → null + LOW | ✅ Never infers 0 |
| paymentDueAmount never falls back to lastPaymentAmount | ✅ Enforced structurally |
| 447/447 regression | ✅ |

## Delivery

- PR #3: Foundation + Classification + Blocks → `task/2.10-lines-first-foundation`
- PR #4: Extraction + Service + Acceptance → `task/2.10-lines-first-extraction`
- Stacked-to-main strategy, both merged cleanly
