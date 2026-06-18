# Apply Progress: HU-08 Sprint 2 — Procesar documentos con OCR

**Mode**: Strict TDD (hybrid persistence: engram + files)
**Date**: 2026-06-18

## Completed Tasks

- [x] T01 — Schema + Migration (add ocrText, processedAt, processingError to Document)
- [x] T02 — DocumentAiService + tests (6 tests, all passing)
- [x] T03 — Module Registration (DocumentAiService added to providers)
- [x] T04 — DocumentsService.processDocument() + tests (10 new tests, 37 total passing)
- [x] T05 — Controller Endpoint + tests (5 new tests, 21 total passing)
- [x] T06 — Integration Verification (187 tests, 21 suites, build clean)

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| T01 | N/A (schema) | N/A | ✅ 20/20 | ➖ Structural | ✅ Migration created | ➖ N/A | ➖ N/A |
| T02 | `document-ai.service.spec.ts` | Unit | N/A (new file) | ✅ Written (module missing) | ✅ 6/6 passed | ✅ 6 cases (happy+empty+undefined+error+input validation) | ➖ Code clean |
| T03 | N/A (wiring) | N/A | N/A (new) | ➖ Structural | ✅ Module compiles | ➖ N/A | ➖ N/A |
| T04 | `documents.service.spec.ts` | Unit | ✅ 27/27 | ✅ 10 written (method missing) | ✅ 37/37 passed | ✅ 10 cases (success+reprocess+gate×2+guard×2+404×2+AI error+DB error) | ✅ Separate catch blocks for AI vs DB errors |
| T05 | `documents.controller.spec.ts` | Unit | ✅ 16/16 | ✅ 5 written (method missing) | ✅ 21/21 passed | ✅ 5 cases (200+400×2+404+502) | ➖ Code clean |
| T06 | Full suite | Integration | N/A (final) | N/A | ✅ 187/187 + build clean | N/A | N/A |

### Test Summary
- **Total tests written**: 21 (6 DocumentAiService + 10 DocumentsService + 5 Controller)
- **Total tests passing**: 187 (166 pre-existing + 21 new)
- **Layers used**: Unit (21)
- **Approval tests**: None — no refactoring tasks
- **Pure functions created**: 0 (service-level methods with DI)

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `apps/api/prisma/schema.prisma` | Modified | Added `ocrText String?`, `processedAt DateTime?`, `processingError String?` to Document model |
| `apps/api/prisma/migrations/20260618000000_add_ocr_fields/migration.sql` | Created | Migration SQL for 3 nullable OCR columns |
| `apps/api/src/documents/document-ai.service.ts` | Created | Thin wrapper over `@google-cloud/documentai` DocumentProcessorServiceClient |
| `apps/api/src/documents/document-ai.service.spec.ts` | Created | 6 unit tests with jest.mock'd SDK |
| `apps/api/src/documents/documents.module.ts` | Modified | Added `DocumentAiService` to providers |
| `apps/api/src/documents/documents.service.ts` | Modified | Added `processDocument()`, injected `DocumentAiService` + `Logger`, added `resolveStatusId()` helper |
| `apps/api/src/documents/documents.service.spec.ts` | Modified | Added `mockDocumentAiService`, `update` to prisma mock, 10 processDocument tests |
| `apps/api/src/documents/documents.controller.ts` | Modified | Added `@Post(':documentId/process')` endpoint |
| `apps/api/src/documents/documents.controller.spec.ts` | Modified | Added `BadGatewayException` import, `processDocument` mock, 5 endpoint tests |

## Deviations from Design

1. **gcsDocument input**: Design said `gcsDocument: [{gcsUri, mimeType}]` (array). Verified against `@google-cloud/documentai` v9.6.2 types — `IProcessRequest.gcsDocument` is `IGcsDocument|null` (singular), NOT an array. Implementation uses `{ gcsUri, mimeType }` (singular object). This matches the critical implementation note.

2. **Error flow separation**: Design suggested single try/catch wrapping AI call + DB update. Implementation separates AI failure catch from DB write failure catch to prevent double-handling (BadGatewayException from inner catch being caught by outer catch). This ensures exactly one ERROR status update and one BadGatewayException throw.

3. **Migration naming**: Used `add-ocr-fields` instead of `add_document_ocr_fields` (as per orchestrator's explicit instructions with `--config` flag). Created migration manually due to unavailable database.

## Issues Found

- **Database unavailable for migration**: PostgreSQL at localhost:5432 was not running. Created migration SQL file manually. The migration will be applied when the database becomes available. `prisma generate` succeeded, so the Prisma client includes the new fields.

## Implementation Details

- **DocumentAiService**: Follows GcsService pattern — `@Injectable()`, constructor-injected ConfigService, eager client instantiation. Uses `DocumentProcessorServiceClient.processDocument({ name: processorResource, gcsDocument: { gcsUri, mimeType } })`. Returns `result.document?.text ?? ''`.

- **DocumentsService.processDocument()**: Uses `findOneByCase()` for 404 handling. Resolves all 3 status IDs (PROCESSING, PROCESSED, ERROR) upfront. Status gate checks PROCESSING/PROCESSED before any external call. Metadata guard checks fileUrl/mimeType are non-null. Logger from `@nestjs/common` logs server-side errors. Separate catch blocks for AI failure vs DB write failure prevent double-handling.

- **Controller**: `@Post(':documentId/process')` with `@HttpCode(200)` and `@UseGuards(JwtAuthGuard)` (inherited from class decorator). Returns `{ data: document }` envelope matching existing pattern. No request body required.
