# Tasks: credit-bureau-gemini-timeout

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~480 (270 service + 3 gemini + 210 tests) |
| 800-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR (under 800 lines) |
| Delivery strategy | single-pr-default |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Full implementation + tests | PR 1 | Single PR — estimated ~480 lines, under 800-line budget |

## Phase 1: Foundation — Constants & Helpers

- [x] 1.1 Add `CREDIT_BUREAU_SCHEMA_LEAN` constant: strip inline descriptions from schema values (e.g., `"number | null — 'Monto a Pagar'..."` → `"number | null"`)
- [x] 1.2 Add `CREDIT_BUREAU_INSTRUCTIONS_LEAN` constant: keep anti-glossary rule, 2-line golden rule, formats, enums; remove OCR examples, ASCII decision tree, redundant sections
- [x] 1.3 Add `shouldUseLayoutPath(ocrLayout)` method: combines `isLayoutExtractionEnabled()` && `ocrLayout?.pages?.length`
- [x] 1.4 Raise `DEFAULT_TIMEOUT_MS` from 30000 to 60000 in `gemini.service.ts`

## Phase 2: Core Implementation — Layer 1 + Layer 2

- [x] 2.1 Add `preFilterOcrLayout(raw: string)` — extracts only "DETALLE DE CRÉDITOS" section from OCR; returns trimmed text (~5K chars)
- [x] 2.2 Add `extractBorrowerFromOcr(raw: string)` — regex extraction of `fullName`, `rfc`, `birthDate`, `consultationDate` from full OCR text
- [x] 2.3 Add `CREDIT_BUREAU_SCHEMA_REDUCED` — clone of LEAN schema minus 4 fields: `currentBalance`, `creditLimit`, `paymentDueAmount`, `lastPaymentAmount`
- [x] 2.4 Update `extract()` to use lean constants always (Layer 1: schema + instructions swapped)
- [x] 2.5 Gate `preFilterOcr` vs `preFilterOcrLayout` — use layout path when `shouldUseLayoutPath` true
- [x] 2.6 Apply `CREDIT_BUREAU_SCHEMA_REDUCED` in Gemini call when layout path active
- [x] 2.7 Skip `disambiguatePaymentFields()` when layout path active
- [x] 2.8 Add borrower fallback: if `extractBorrowerFromOcr` returns null for any field, log warning and rerun full `extract()` with Layer 1 pipeline

## Phase 3: Testing & Verification

- [x] 3.1 Test: `CREDIT_BUREAU_SCHEMA_LEAN` has no inline descriptions (content assertion, not length)
- [x] 3.2 Test: `CREDIT_BUREAU_INSTRUCTIONS_LEAN` excludes OCR examples, ASCII trees, redundant rules
- [x] 3.3 Test: `preFilterOcrLayout` excludes borrower/report sections when layout present
- [x] 3.4 Test: `extractBorrowerFromOcr` with real OCR snippets; fallback triggered when any field null
- [x] 3.5 Test: Reduced schema excludes the 4 fields; `maxCredit`/`pastDueAmount` not affected
- [x] 3.6 Test: `disambiguatePaymentFields()` NOT called when layout active; called when inactive
- [x] 3.7 Test: Borrower regex failure triggers full Layer 1 fallback
- [x] 3.8 Integration: Combined prompt < 10K chars for 20-credit PDF
- [x] 3.9 Regression: Full test suite passes (~492 tests)
