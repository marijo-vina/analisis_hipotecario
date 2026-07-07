# Archive Report — layout-aware-buro-extraction

## Verdict: PARTIAL / BLOCKED BY FOLLOW-UP

## Executive Summary

Change to add layout-aware credit bureau financial extraction using Document AI bounding-box data. 22/23 tasks completed. 457 unit tests pass. Infrastructure is solid, safety mechanisms work correctly. However, the `LayoutFinancialExtractor`'s token-clustering approach cannot reliably extract `paymentDueAmount` from real bureau PDFs — a follow-up change is required.

## What Was Delivered

| Area | Status |
|------|--------|
| Document AI ocrLayout extraction | ✅ Working |
| LayoutFinancialExtractor (column detection, header mapping, field extraction) | ⚠️ Insufficient for real PDFs |
| mergeLayoutWithGemini (authority hierarchy, audit fields) | ✅ Working |
| Hard gate (unmatched → MANUAL_REVIEW, never GEMINI) | ✅ Working |
| Feature flag USE_LAYOUT_EXTRACTION | ✅ Working |
| OCR pre-filter (reduces Gemini input noise) | ✅ Working |
| OrderInBlock fallback matching | ✅ Working |
| 457 unit tests | ✅ All pass |
| Web audit fields (extraction.ts) | ✅ Done |

## What Was NOT Achieved

- `paymentDueAmount` cannot be reliably extracted from real bureau PDFs using the current token-clustering approach
- Acceptance tests (SANTANDER=8775, TELCEL=0, AMEX=1875, AMEX COMPANY≠49800/41600) could not be proven against real GCP
- `LayoutFinancialExtractor` needs redesign for complex table structures

## Follow-Up Required

Create follow-up change to redesign `LayoutFinancialExtractor`:
- Evaluate `page.lines[]` in addition to `tokens[]`
- Grid reconstruction approach
- Visual credit-block detection
- Real column extraction (hybrid lines + tokens)
- Test with Juan Pérez and Carlos Lopez PDFs

## Sprint 3 Rule

`paymentDueAmount` may only feed `monthlyDebtContribution` if:
- `financialFieldsSource = LAYOUT` (HIGH confidence), OR
- Value was manually confirmed

## Files Changed

| File | Action |
|------|--------|
| `apps/api/prisma/schema.prisma` | Added `ocrLayout Json?` to Document |
| `apps/api/src/documents/document-ai.types.ts` | Created — OcrLayout, LayoutFinancialResult, types |
| `apps/api/src/documents/document-ai.service.ts` | Added `extractTextWithLayout()` |
| `apps/api/src/documents/layout-financial-extractor.service.ts` | Created — column detection, field extraction |
| `apps/api/src/documents/layout-financial-extractor.service.spec.ts` | Created — 34 strict-TDD tests |
| `apps/api/src/documents/credit-bureau-extraction.service.ts` | Added merge, hard gate, pre-filter |
| `apps/api/src/documents/credit-bureau-extraction.service.spec.ts` | Added 9 merge tests |
| `apps/api/src/documents/documents.service.ts` | Wired `extractTextWithLayout()`, stores ocrLayout |
| `apps/api/src/documents/documents.module.ts` | Registered LayoutFinancialExtractorService |
| `apps/api/src/documents/bureau-acceptance.spec.ts` | Created — 4 E2E acceptance tests |
| `apps/api/src/documents/document-ai-integration.spec.ts` | Created — 1 integration test |
| `apps/web/app/lib/extraction.ts` | Added CreditAuditFields |
