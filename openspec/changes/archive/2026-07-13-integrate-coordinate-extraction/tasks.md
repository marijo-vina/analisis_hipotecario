# Tasks: Integrate Coordinate-Based PDF Extraction into Credit Bureau Flow

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~300-430 (PR #1: ~270-380, PR #2: ~35-55) |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (backend wiring) → PR 2 (frontend chips) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending — ask user: stacked-to-main or feature-branch-chain? |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Wire coordinate extraction into credit bureau pipeline, merge results, add tests | PR 1 | Base = main or feature/tracker; backend only |
| 2 | Add BAND_MATCH/RESCUE to frontend enum + source chips in buro-tab | PR 2 | Base = PR 1 branch; frontend only, depends on PR 1 |

## Phase 1: Backend Wiring (PR #1)

- [ ] 1.1 Inject `CoordinateExtractionService` and `GcsService` into `CreditBureauExtractionService` constructor in `apps/api/src/documents/credit-bureau-extraction.service.ts`
- [ ] 1.2 Add coordinate extraction block between OCR validation (step 6) and Gemini call (step 8) — gated by `COORDINATE_EXTRACTION_ENABLED` env var
- [ ] 1.3 Implement `mergeCoordinateResults()` private method: match coordinate credits to Gemini credits by normalized institution + positional order; BAND_MATCH overwrites, RESCUE/UNCONFIRMED defer to Gemini
- [ ] 1.4 Ensure BAND_MATCH credits skip Gemini for `paymentDueAmount` field (exclude from schema or discard result)
- [ ] 1.5 Compute `paymentDueAmountEffective` from triple pattern: `manual ?? (confirmed ? extracted : null)` with source tracking
- [ ] 1.6 Remove `COORDINATE_EXTRACTION_ENABLED` guard from `POST /documents/:id/coordinate-extract` dev endpoint in `documents.controller.ts` (lines 266-270) — keep endpoint for debugging
- [ ] 1.7 Verify `CoordinateExtractionService` is registered in `documents.module.ts` providers (add if missing)

## Phase 2: Backend Testing (PR #1)

- [ ] 2.1 Add test: BAND_MATCH coordinate result overwrites Gemini `paymentDueAmount` in `credit-bureau-extraction.service.spec.ts`
- [ ] 2.2 Add test: RESCUE coordinate result triggers Gemini fallback, Gemini value wins
- [ ] 2.3 Add test: UNCONFIRMED coordinate result triggers Gemini fallback, coordinate value NOT used
- [ ] 2.4 Add test: `COORDINATE_EXTRACTION_ENABLED=false` skips coordinate extraction entirely, Gemini-only flow
- [ ] 2.5 Add test: GCS `downloadFile` rejection falls back gracefully to Gemini-only pipeline
- [ ] 2.6 Verify all 7 existing coordinate extractor tests remain green (no changes to pure functions)

## Phase 3: Frontend Source Chips (PR #2)

- [ ] 3.1 Add `BAND_MATCH` and `RESCUE` to `PaymentDueAmountSource` enum in `apps/web/app/lib/extraction.ts` (currently missing — only has LAYOUT, GEMINI, UNCONFIRMED, CONFIRMED_AUTO, MANUAL)
- [ ] 3.2 Extend `renderStateBadge()` in `buro-tab.tsx` with BAND_MATCH chip: green ✅, bg-green-50, text-green-700, title "Extracción por coordenadas"
- [ ] 3.3 Extend `renderStateBadge()` with RESCUE chip: yellow ⚠️, bg-amber-50, text-amber-700, title "Rescate por coordenadas — verificar"
- [ ] 3.4 Verify existing MANUAL, GEMINI, UNCONFIRMED, CONFIRMED_AUTO/LAYOUT badges still render correctly after enum changes
- [ ] 3.5 Verify `parseBuro()` in `extraction.ts` correctly maps backend `paymentDueAmountSource` string to updated frontend enum values

## Phase 4: Verification (Both PRs)

- [ ] 4.1 Run full backend test suite: `npm test -- --testPathPattern=credit-bureau-extraction`
- [ ] 4.2 Run frontend type check: verify no enum mismatch errors in `buro-tab.tsx`
- [ ] 4.3 Manual test: upload bureau PDF, verify BAND_MATCH credits show green chip, skip Gemini API call
- [ ] 4.4 Manual test: verify RESCUE credits show yellow chip, Gemini is called as fallback
- [ ] 4.5 Manual test: set `COORDINATE_EXTRACTION_ENABLED=false`, verify system reverts to Gemini-only flow
