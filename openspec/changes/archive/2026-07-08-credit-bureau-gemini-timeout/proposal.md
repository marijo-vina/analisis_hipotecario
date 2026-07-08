# Proposal: credit-bureau-gemini-timeout

## Intent

Production credit bureau PDFs with 12-20 credits cause Gemini timeouts (300s) and truncated JSON output. Root cause: inflated prompt (~20K chars from verbose instructions + schema with inline descriptions), insufficient OCR pre-filtering (MAX_OCR_CHARS=15000), and redundant Gemini work when layout extraction already handles financial fields. Combined optimization targets prompt ~8K chars, output ~4.5K chars, latency <60s.

## Scope

### In Scope
- Strip inline descriptions from `CREDIT_BUREAU_SCHEMA` (~800 chars saved)
- Trim `CREDIT_BUREAU_INSTRUCTIONS`: remove OCR examples, decision tree ASCII, redundant rules (~2,000 chars saved)
- Aggressive `preFilterOcr`: when `ocrLayout` exists, send only DETALLE DE CREDITOS section to Gemini; extract borrower/report via regex (~5,000 chars saved)
- Reduced Gemini schema when `USE_LAYOUT_EXTRACTION=true`: remove 6 financial fields (currentBalance, creditLimit, paymentDueAmount, lastPaymentAmount, maxCredit, pastDueAmount) — layout handles them
- Remove `disambiguatePaymentFields()` call when layout is active
- Extract `borrower.fullName`, `rfc`, `birthDate`, `consultationDate` via regex instead of Gemini

### Out of Scope
- Redesigning `LayoutFinancialExtractor` token-clustering (separate follow-up)
- Changing Gemini model or provider
- Modifying the `mergeLayoutWithGemini` authority hierarchy
- Frontend changes

## Capabilities

### New Capabilities
None

### Modified Capabilities
- `bureau-extraction`: Prompt reduction, schema slimming, aggressive pre-filter, regex borrower extraction, conditional financial field exclusion and disambiguation bypass when layout active

## Approach

**Layer 1 — Immediate (no architecture changes):**
1. Schema: remove all inline descriptions (e.g., `"number | null — 'Monto a Pagar'..."` → `"number | null"`)
2. Instructions: keep anti-glossary rule, 2-line payment golden rule, formats, enums only. Remove decision tree, OCR literal examples, redundant sections
3. Pre-filter: when `ocrLayout` present, extract only "DETALLE DE CRÉDITOS" section for Gemini; regex-extract borrower/report metadata from full OCR text

**Layer 2 — Structural (layout-aware):**
4. When `USE_LAYOUT_EXTRACTION=true`: use reduced schema without 6 financial fields → ~40% less output tokens
5. Skip `disambiguatePaymentFields()` when layout active (layout owns financial fields)
6. Regex extraction for borrower.fullName, rfc, birthDate, consultationDate — deterministic, no Gemini cost

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/src/documents/credit-bureau-extraction.service.ts` | Modified | Instructions, schema, preFilterOcr, disambiguatePaymentFields gating, regex borrower extraction |
| `apps/api/src/documents/gemini.service.ts` | Modified | HTTP timeout configuration for Vertex AI SDK |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Regex misses borrower data in unusual PDF layouts | Medium | Fallback to Gemini for borrower if regex returns null; log warning |
| Reduced schema loses edge-case fields layout can't handle | Low | Layout hard-gate already prevents Gemini fallback for financial fields |
| Trimming instructions causes Gemini to misparse payment fields | Medium | Keep the 2-line golden rule; test against Juan Pérez PDF (16 credits) |
| preFilterOcr cuts needed context sections | Low | Only trim when ocrLayout present; full OCR still used as fallback |

## Rollback Plan

Revert the commit. All changes are in two files with feature-flag compatibility (`USE_LAYOUT_EXTRACTION` already gates layer 2). Layer 1 changes (schema/instructions) can be individually reverted if they cause regressions.

## Dependencies

- Existing `USE_LAYOUT_EXTRACTION` feature flag (already deployed)
- Existing `LayoutFinancialExtractorService` (already deployed)
- Existing `ocrLayout` data on documents (already stored)

## Success Criteria

- [ ] Gemini completes bureau extraction for 20-credit PDFs in <60s (currently >300s timeout)
- [ ] No GEMINI_TIMEOUT or GEMINI_INVALID_JSON errors for real bureau PDFs
- [ ] All 457 existing unit tests pass
- [ ] Extraction output matches current quality (same credit count, fields, alerts) on Juan Pérez validation PDF
- [ ] Prompt size <10K chars for typical bureau PDF (from ~20K)
