# Design: HU-08 Sprint 2 — Procesar documentos con OCR

## Technical Approach

Add OCR processing pipeline following the existing `GcsService` → `DocumentsService` → `DocumentsController` layered pattern. New `DocumentAiService` wraps `@google-cloud/documentai` with the same constructor-injection pattern. `DocumentsService.processDocument()` orchestrates status transitions (UPLOADED/ERROR → PROCESSING → PROCESSED/ERROR) with hard validation gates. Three nullable fields added to Document model with backward-compatible migration.

## Architecture Decisions

### Decision: Service separation

**Choice**: New standalone `DocumentAiService` in `document-ai.service.ts`
**Alternatives**: Inline in DocumentsService | separate ProcessingService
**Rationale**: Mirrors GcsService pattern exactly — thin SDK wrapper, single responsibility. DocumentsService remains the orchestrator (already does this for upload+create). No new ProcessingService needed — only one orchestration method.

### Decision: Exception strategy

**Choice**: Use existing NestJS exceptions (BadRequestException, NotFoundException, BadGatewayException)
**Alternatives**: Custom exception classes | HttpException subclasses
**Rationale**: Codebase already uses these three consistently. No custom exception infrastructure exists. Spec's error matrix maps directly to these three types.

### Decision: Client instantiation

**Choice**: Constructor, like GcsService (eager)
**Alternatives**: Lazy/getter pattern
**Rationale**: Follows existing pattern. ConfigService already available. GCP client constructors don't make network calls — just config objects.

### Decision: Crash during PROCESSING

**Choice**: Accept orphaned PROCESSING risk for MVP; document as known limitation
**Alternatives**: Cron cleanup | state machine with timeout | DB transaction rollback
**Rationale**: MVP scope. Two-phase DB update (set PROCESSING before call, set ERROR/outcome after) means crash leaves PROCESSING. Document in code comments and README. REQ-OCR-003 gate blocks re-processing of orphaned PROCESSING — future cleanup needed.

## Data Flow

```
Controller ──→ DocumentsService.processDocument()
                   │
                   ├─[1] findOneByCase() → 404 if !found
                   ├─[2] Status gate → 400 if PROCESSING/PROCESSED
                   ├─[3] Metadata gate → 400 if !fileUrl||!mimeType
                   ├─[4] prisma.document.update(status=PROCESSING)
                   ├─[5] documentAiService.extractText(fileUrl, mimeType)
                   │       └─ DocumentProcessorServiceClient.processDocument()
                   │              gcsDocument: [{gcsUri, mimeType}]
                   ├─[6a] Success: save ocrText, processedAt, status=PROCESSED
                   └─[6b] Error: save processingError, status=ERROR → throw 502
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/api/prisma/schema.prisma` | Modify | Add `ocrText String?`, `processedAt DateTime?`, `processingError String?` to Document |
| `apps/api/prisma/migrations/*` | New | Migration for 3 nullable fields |
| `apps/api/src/documents/document-ai.service.ts` | New | Thin wrapper over `@google-cloud/documentai` |
| `apps/api/src/documents/document-ai.service.spec.ts` | New | Unit tests with jest.mock'd SDK |
| `apps/api/src/documents/documents.module.ts` | Modify | Add `DocumentAiService` to providers |
| `apps/api/src/documents/documents.service.ts` | Modify | Add `processDocument()`, inject `DocumentAiService` + `Logger` |
| `apps/api/src/documents/documents.service.spec.ts` | Modify | Add processor tests, add mock `DocumentAiService` |
| `apps/api/src/documents/documents.controller.ts` | Modify | Add `@Post(':documentId/process')` |
| `apps/api/src/documents/documents.controller.spec.ts` | Modify | Add process endpoint tests |

## Interfaces / Contracts

**DocumentAiService.extractText**:
```ts
extractText(gcsUri: string, mimeType: string): Promise<string>
```
Constructs `processDocument` request with `name` (full processor resource), `gcsDocument: [{gcsUri, mimeType}]`. Returns `result.document.text ?? ''`. Propagates errors as-is (caller wraps in BadGatewayException).

**DocumentsService.processDocument**:
```ts
processDocument(caseId: string, documentId: string): Promise<Document>
```
Full include: `documentType`, `documentStatus`, `uploadedBy`. Private helper `resolveStatusId(code: string)` resolves status codes to IDs (same pattern as `create()` which resolves `UPLOADED`).

**Controller endpoint**:
```ts
@Post(':documentId/process')
@HttpCode(200)
async process(@Param('caseId') caseId: string, @Param('documentId') documentId: string): Promise<{ data: Document }>
```

**Status code resolution**: `DocumentStatus` table already seeded with `PROCESSING` (order 3), `PROCESSED` (order 4), `ERROR` (order 5). Service resolves by `code` field via `findUnique`.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit: DocumentAiService | extractText returns text / propagates errors / handles empty text | `jest.mock('@google-cloud/documentai')` at module top (same hoisting pattern as gcs.service.spec.ts). Mock `processDocument` returns shaped response |
| Unit: DocumentsService | Success: UPLOADED→PROCESSED. Error: UPLOADED→ERROR. Gate: PROCESSING/PROCESSED→400. Guard: null fileUrl/mimeType→400. Doc not found→404 | Add `mockDocumentAiService = { extractText: jest.fn() }` to existing mock providers. Test status transitions and error persistence |
| Unit: Controller | 200 with data envelope. 400/404/502 propagation | Add `mockDocumentsService.processDocument = jest.fn()` to existing controller mock. Test delegates and wraps |

## Migration / Rollout

Prisma migration adds 3 nullable columns — fully backward compatible. Existing documents continue working with null OCR fields. Rollback: revert migration, remove `DocumentAiService`, revert service/controller/module. Seed already has `PROCESSING`, `PROCESSED`, `ERROR` document statuses — no seed changes needed.

## Open Questions

None — all design decisions resolved by following existing patterns and spec requirements.
