# Proposal: Bank Statement Extraction Service

## Intent

Implement `BankStatementExtractionService` to extract structured data from bank statements via Gemini AI, following the established `PayrollExtractionService` template pattern. The schema v1.1 is finalized; all infrastructure (GeminiService, PrismaService, document types, status codes) already exists. Zero DB migrations required.

## Scope

### In Scope
- `BankStatementExtractionService` (~500 lines) with full Gemini integration
- POST endpoint `:documentId/extract-bank-statement` in DocumentsController
- Alert computation: non-MXN currency, negative balance, joint account, missing payroll deposits, RFC validation failures
- RFC regex post-validation (`[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}`) on `detectedPayerRfc`
- Trash deposit analysis for `otherRelevantMovements`
- 3-array normalization: `payrollDeposits[]`, `possiblePayrollProviders[]`, `otherRelevantMovements[]`
- Unit tests for service and controller endpoint

### Out of Scope
- Frontend UI for extraction results
- Batch/multi-document extraction
- Webhook or async notification delivery
- Payroll receipt cross-matching (Sprint 3)
- DB migrations (none needed)

## Capabilities

### New Capabilities
None

### Modified Capabilities
- `bank-statement-extraction`: Extend with service-level behavior — Gemini prompt instructions, inline TypeScript schema constant, normalization logic, alert generation, controller endpoint wiring

## Approach

Copy `PayrollExtractionService` template and adapt:

1. **Schema constant**: Convert `bank-statement.schema.md` v1.1 JSON to inline TypeScript object (3 nested arrays)
2. **Instructions**: Bank-statement-specific Gemini prompt (currency detection, RFC regex in concept text, balance fields, joint account signals, trash deposit classification)
3. **Normalization**: Post-Gemini field normalization — RFC regex verification, balance non-negative validation, currency enum enforcement
4. **Alerts**: `BANK_` prefix codes (`BANK_NON_MXN_CURRENCY`, `BANK_NEGATIVE_BALANCE`, `BANK_JOINT_ACCOUNT`, `BANK_NO_PAYROLL_DEPOSITS`, `BANK_INVALID_RFC`)
5. **Status gate**: Allow `PROCESSED` and `EXTRACTION_ERROR` (retry pattern from PayrollExtractionService)
6. **Module registration**: Add `BankStatementExtractionService` to `DocumentsModule` providers

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/src/documents/bank-statement-extraction.service.ts` | New | Service (~500 lines) |
| `apps/api/src/documents/bank-statement-extraction.service.spec.ts` | New | Unit tests (~300 lines) |
| `apps/api/src/documents/documents.controller.ts` | Modified | Add extraction endpoint (+15 lines) |
| `apps/api/src/documents/documents.controller.spec.ts` | Modified | Add endpoint tests (+20 lines) |
| `apps/api/src/documents/documents.module.ts` | Modified | Register provider (+2 lines) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Schema complexity (3 nested arrays) may cause Gemini JSON failures | Medium | Retry logic in GeminiService (3 attempts); fallback to partial extraction |
| Bank statement OCR quality (tabular layouts) | High | Service returns `OCR_TEXT_EMPTY` error; quality issues surface as missing fields/alerts |
| Prompt token limits with long OCR + large schema | Low | Schema is compact; monitor token usage in logging |

## Rollback Plan

Remove `BankStatementExtractionService` from `DocumentsModule` providers and delete the controller endpoint. No DB changes to revert. Existing extraction services unaffected.

## Dependencies

- `specs/ai-extraction/schemas/bank-statement.schema.md` v1.1 (finalized)
- `GeminiService.extractStructuredData()` (existing, no changes needed)
- `DocumentType` seed: `BANK_STATEMENT` (already seeded)

## Success Criteria

- [ ] `BankStatementExtractionService.extract()` returns structured data matching schema v1.1
- [ ] All alert codes generate correctly for non-MXN, negative balance, joint account, missing payroll
- [ ] RFC regex post-validation catches invalid RFCs
- [ ] Controller endpoint `POST :documentId/extract-bank-statement` returns 200/400/500 correctly
- [ ] Unit tests pass with >80% coverage on service logic
- [ ] No regressions in existing payroll/official-id extraction
