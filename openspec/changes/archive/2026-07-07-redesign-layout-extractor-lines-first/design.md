# Design: Lines-First LayoutFinancialExtractor

## Technical Approach

Full rewrite of `LayoutFinancialExtractorService` from tokens-first column clustering (772 lines) to a lines-first pipeline (~450 lines). The core insight: Document AI's `page.lines[]` preserves credit block structure natively ΓÇö institution lines, data rows, and payment lines each appear as separate `OcrLine` objects in topΓåÆbottom order. Token clustering fragmented this structure; line classification restores it.

### Pipeline (per page)

```
page.lines[] ΓåÆ filterDetailLines() ΓåÆ classifyLine() ΓåÆ groupLinesIntoBlocks()
    ΓåÆ detectHeaderFromLines() ΓåÆ extractBlockFields() per block
    ΓåÆ compose LayoutFinancialResult
```

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| `OcrLine` text format | Use `line.text` as-is (Document AI joins tokens with spaces) | Already proven in `buildOcrPage`. No custom reconstruction needed. |
| Credit block Y-boundary | Institution line = semantic boundary. Fallback: >2├ù median line-height Y-gap | Matches bureau structure exactly. Semantic boundary is reliable because institution lines are always uppercase names. |
| Header field mapping | Fuzzy alias matching on header line tokens. Fallback: positional column order. | Reuses existing `HEADER_ALIASES` + `normalizeText()` patterns. Positional fallback = leftΓåÆright: institution, currentBalance, maxCredit, creditLimit, pastDueAmount, lastPaymentAmount, paymentDueAmount. |
| Column detection within block | X-center gap Γëñ25px on data line tokens only | Scoped per block, not global. 25px accommodates wider real spacing vs 15px spike finding. |
| Closed credits ΓåÆ paymentDueAmount | `null` + `LOW` confidence + `needsManualReview` | Explicit rule from proposal: NEVER infer 0 from closed status. |
| Explicit zero payment | `0` + `HIGH` confidence | "0 PAGO M├ìNIMO" in OCR is authoritative truth, not missing data. |

## Core Types (new)

```typescript
enum LineType {
  subheader = 'subheader',   // "Cr├⌐ditos Bancarios", "Cr├⌐ditos No Bancarios"
  header = 'header',         // ΓëÑ3 financial field aliases
  institution = 'institution', // uppercase, ΓëÑ6 chars, starts with letter
  data = 'data',             // comma-formatted numbers, currency, dates
  payment = 'payment',       // solitary number + PAGO/MENSUAL keyword
  skip = 'skip',             // empty, page numbers, glossary, legal
}

interface CreditBlock {
  subsection: CreditSubsection | null;
  institutionLine: OcrLine;
  dataLines: OcrLine[];
  paymentLine: OcrLine | null;
}
```

## Pure Function Signatures

| Function | Signature | Returns |
|----------|-----------|---------|
| `classifyLine` | `(line: OcrLine) => LineType` | LineType enum |
| `filterDetailLines` | `(lines: OcrLine[]) => OcrLine[]` | Lines within "DETALLE DE CR├ëDITOS" boundaries |
| `groupLinesIntoBlocks` | `(lines: OcrLine[], classified: LineType[]) => CreditBlock[]` | Credit blocks from classified line stream |
| `detectHeaderFromLines` | `(lines: OcrLine[]) => HeaderFieldMap \| null` | Column index ΓåÆ field mapping |
| `extractInstitutionFromLine` | `(line: OcrLine) => { institution: string \| null; accountNumber: string \| null }` | Institution name + longest ΓëÑ6-digit run |
| `extractFinancialDataLine` | `(line: OcrLine, headerMap: HeaderFieldMap \| null, blockTokens: OcrToken[]) => { fields: LayoutFinancialFields; confidence: FinancialFieldsConfidenceMap }` | Financial fields from a data line |
| `extractPaymentFromLine` | `(line: OcrLine) => { paymentDueAmount: number \| null; confidence: FinancialFieldsConfidence }` | Payment amount from payment line |
| `extractBlockFields` | `(block: CreditBlock, headerMap: HeaderFieldMap \| null, allTokens: OcrToken[]) => LayoutCreditField` | Orchestrated per-block extraction |

## Data Flow

```
page.lines[]                    page.tokens[]
     Γöé                                Γöé
     Γû╝                                Γöé
filterDetailLines()                   Γöé
     Γöé                                Γöé
     Γû╝                                Γöé
classifyLine() per line               Γöé
     Γöé                                Γöé
     Γû╝                                Γöé
groupLinesIntoBlocks()                Γöé
     Γöé                                Γöé
     Γö£ΓöÇΓöÇΓöÇΓöÇ detectHeaderFromLines() ΓùäΓöÇΓöÇΓöÿ (tokens within header line bbox)
     Γöé         Γöé
     Γöé         Γû╝ HeaderFieldMap
     Γöé
     ΓööΓöÇΓöÇΓöÇΓöÇ extractBlockFields() per CreditBlock
              Γöé
              Γö£ΓöÇΓöÇ extractInstitutionFromLine()
              Γö£ΓöÇΓöÇ extractFinancialDataLine()  ΓåÉ tokens filtered by data line bbox
              Γö£ΓöÇΓöÇ extractPaymentFromLine()    ΓåÉ payment line text
              Γöé
              Γû╝ LayoutCreditField[]
                       Γöé
                       Γû╝
              compose ΓåÆ LayoutFinancialResult
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/documents/layout-financial-extractor.service.ts` | Rewrite | Lines-first pipeline (~450 lines), replaces 772-line tokens-first implementation |
| `apps/api/src/documents/layout-financial-extractor.service.spec.ts` | Rewrite | New tests: line classification, block grouping, header detection, per-block extraction, integration compose |
| `apps/api/src/documents/credit-bureau-extraction.service.ts` | No change | Merge contract unchanged |
| `apps/api/src/documents/document-ai.types.ts` | No change | `LineType` enum stays in extractor file (internal) |

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit ΓÇö classifyLine | Each LineType variant (subheader, header, institution, data, payment, skip) | 12+ test cases per variant, realistic line strings from real PDFs |
| Unit ΓÇö filterDetailLines | Section boundary detection, cut markers | Lines array with markers, verify exact output set |
| Unit ΓÇö groupLinesIntoBlocks | Institution boundary grouping, subheader scoping | Classified lines ΓåÆ verify block count and membership |
| Unit ΓÇö detectHeaderFromLines | Fuzzy alias matching, fallback positional | Header line tokens + known alias ΓåÆ verify fieldToColumn map |
| Unit ΓÇö extractInstitutionFromLine | Name extraction, account number isolation | Uppercase institution lines from real PDFs |
| Unit ΓÇö extractFinancialDataLine | Per-column parsing, confidence scoring | Data line OcrLine + headerMap ΓåÆ fields + confidence |
| Unit ΓÇö extractPaymentFromLine | "0 PAGO M├ìNIMO" ΓåÆ 0+HIGH, no payment ΓåÆ null+LOW, standard payment | Payment line variants from real PDFs |
| Integration | Full extract() compose | Real OcrLayout fixtures ΓåÆ LayoutFinancialResult, verify SANTANDER=8775, TELCEL=0, AMEX=1875 |
| Acceptance | Existing test assertions | All 457 existing unit tests remain green |

## Rollback Plan

Set `USE_LAYOUT_EXTRACTION=false` ΓåÆ entire layout pipeline disabled, Gemini+regex flow preserved. Does NOT switch to old tokens-first extractor (deleted). The feature flag gates `maybeMergeLayout()`; when false, the new extractor is not invoked at all.

## Open Questions

- [ ] No spec exists for this change (ran in parallel with sdd-spec) ΓÇö design addresses all 10 functions from proposal directly.
- [ ] Median line-height computation for Y-gap fallback: use all lines or only detail-section lines? Resolve during apply.
