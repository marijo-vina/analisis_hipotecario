# Proposal: Redesign LayoutFinancialExtractor — Lines-First Approach

## Intent

The current `LayoutFinancialExtractorService` (772 lines, tokens-first) cannot reliably extract `paymentDueAmount` from real bureau PDFs. Token clustering fragments institution names, produces too many narrow columns, and fails on the multi-line credit block structure that Document AI's Line API preserves natively. This change replaces the entire extractor with a ~400-500 line lines-first implementation that uses `page.lines[]` as primary input, maintaining the same output contract (`LayoutFinancialResult`) and zero changes to the merge layer.

## Scope

### In Scope
- Full rewrite of `layout-financial-extractor.service.ts` (~300 lines removed)
- New test suite `layout-financial-extractor.service.spec.ts`
- Line classification: `classifyLine()`, `filterDetailLines()`, `groupLinesIntoBlocks()`
- Header detection from lines: `detectHeaderFromLines()`
- Block-level field extraction: `extractBlockFields()`, `extractInstitutionFromLine()`, `extractPaymentFromLine()`
- Same NestJS service interface: `extract(ocrLayout): LayoutFinancialResult`
- Reuse existing pure helpers: `parseCurrencyNumber()`, `normalizeText()`, `scoreFieldConfidence()`, `isSaneFinancialValue()`

### Out of Scope
- No changes to `credit-bureau-extraction.service.ts` (merge logic)
- No changes to `document-ai.service.ts` or `document-ai.types.ts`
- No schema changes, no feature flag changes
- No web layer changes
- No acceptance test changes (assertions already validate correct values)

## Capabilities

### New Capabilities
- `layout-financial-extraction`: Lines-first credit block detection and financial field extraction from OCR layout pages. Replaces the tokens-first column-clustering approach with line classification, credit block grouping, and per-block field extraction.

### Modified Capabilities
- None (no existing specs in `openspec/specs/` for this domain)

## Approach

Seven pure functions composed into the service:

1. **`classifyLine(line)`** — regex pattern matching: institution header, data row, payment line, subsection marker, detail section header, noise
2. **`filterDetailLines(lines)`** — extract only lines within "DETALLE DE CRÉDITOS" section boundaries
3. **`groupLinesIntoBlocks(lines)`** — institution line as block boundary; each block = institution + data lines + payment line
4. **`detectHeaderFromLines(lines)`** — find line with ≥3 financial field aliases (SALDO ACTUAL, MONTO A PAGAR, etc.)
5. **`extractBlockFields(block, headerInfo)`** — parse financial values from data/payment lines within a block
6. **`extractInstitutionFromLine(line)`** — institution name from the institution line (first line of block)
7. **`extractPaymentFromLine(line)`** — paymentDueAmount from solitary number + PAGO/MENSUAL keyword on payment line. **Explicit rule**: if the PDF explicitly shows "0 PAGO MÍNIMO..." → extract 0 with HIGH confidence. If no payment line is detectable → return null + LOW confidence (never infer 0 from closed status).

Column detection scoped per credit block (not global). Positional column mapping as fallback when header detection fails.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/src/documents/layout-financial-extractor.service.ts` | Replaced | Full rewrite: 772 → ~400-500 lines, lines-first pipeline |
| `apps/api/src/documents/layout-financial-extractor.service.spec.ts` | Replaced | New test suite covering line classification, block grouping, field extraction |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Lines cross credit boundaries when credits are vertically close | Low | Document AI Line API "does not cross column boundaries" by design |
| OCR fragments institution names across lines | Medium | Institution line detection uses flexible regex; fallback to first non-data line in block |
| Closed credits have no payment line | Low | Explicit rule: no payment line → null + LOW confidence + needsManualReview. NEVER infer 0 from closed status |
| Full rewrite introduces regressions | Medium | Feature flag `USE_LAYOUT_EXTRACTION` allows instant rollback to tokens-first |

## Rollback Plan

Set `USE_LAYOUT_EXTRACTION=false` in environment. This disables the ENTIRE layout extraction pipeline — reverts to Gemini-only extraction with regex disambiguator. No code deploy needed for rollback. Note: this does NOT switch back to the old tokens-first extractor; the old extractor is deleted by this rewrite.

## Dependencies

- `layout-aware-buro-extraction` (archived PARTIAL) — all infrastructure reused: `OcrLayout` types, `page.lines[]` data, feature flag, merge layer, hard gate

## Success Criteria

- [ ] SANTANDER paymentDueAmount = 8775
- [ ] TELCEL MER 82953660 paymentDueAmount = 0
- [ ] AMEX paymentDueAmount = 1875
- [ ] AMEX COMPANY paymentDueAmount ≠ 49800 and ≠ 41600
- [ ] All 457 existing unit tests still pass
- [ ] Existing acceptance test assertions unchanged
- [ ] File size ≤ 500 lines (from 772)
