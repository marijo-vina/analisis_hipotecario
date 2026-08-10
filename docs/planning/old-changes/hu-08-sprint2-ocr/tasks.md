# Tasks: HU-08 Sprint 2 — Procesar documentos con OCR

## Task 1: Add OCR fields to Document model and generate migration

**Order**: 1 (first — database foundation)
**Spec Requirements**: Implicit for REQ-OCR-002 (processedAt, processingError), REQ-OCR-006 (ocrText in response)
**Files**:
- `apps/api/prisma/schema.prisma` — add `ocrText String?`, `processedAt DateTime?`, `processingError String?` to Document model
- `apps/api/prisma/migrations/` — generate via `npx prisma migrate dev --name add_document_ocr_fields`

**Acceptance**:
- [x] Schema has 3 new nullable fields on Document
- [x] Migration file generated successfully
- [x] `npx prisma generate` runs without errors
- [x] Existing tests still pass (backward compatible — no code changes yet)

---

## Task 2: Create DocumentAiService with unit tests

**Order**: 2 (leaf dependency — no internal deps)
**Spec Requirements**: REQ-OCR-001 (extractText with gcsDocument input), REQ-OCR-007 (fully tested with mocked SDK)
**Files**:
- `apps/api/src/documents/document-ai.service.ts` — new
- `apps/api/src/documents/document-ai.service.spec.ts` — new

**Implementation**:
- Constructor injects `ConfigService`, reads `GCLOUD_PROJECT_ID`, `GCLOUD_LOCATION`, `GCLOUD_PROCESSOR_ID`
- Instantiates `DocumentProcessorServiceClient` from `@google-cloud/documentai`
- Single public method: `extractText(gcsUri: string, mimeType: string): Promise<string>`
- Builds processor resource name: `projects/${projectId}/locations/${location}/processors/${processorId}`
- Calls `client.processDocument({ name, gcsDocument: [{ gcsUri, mimeType }] })`
- Returns `result.document.text ?? ''`
- Errors propagate as-is (caller wraps in BadGatewayException)

**Tests** (following `gcs.service.spec.ts` pattern — `jest.mock` at module top):
- [x] `extractText` returns text from `result.document.text` when Document AI succeeds
- [x] `extractText` returns empty string when `result.document.text` is empty (REQ-OCR-001 edge case)
- [x] `extractText` propagates error when Document AI throws gRPC/network error
- [x] `extractText` constructs correct `gcsDocument` input with `{ gcsUri, mimeType }`
- [x] `extractText` uses correct processor resource name format
- [x] Service is defined / instantiable with ConfigService mock

**Acceptance**:
- [x] `npm test -- document-ai.service.spec.ts` passes
- [x] No real GCP calls — fully mocked via `jest.mock('@google-cloud/documentai')`

---

## Task 3: Register DocumentAiService in DocumentsModule

**Order**: 3a (wiring — needed before Task 4)
**Spec Requirements**: Infrastructure for REQ-OCR-002 through REQ-OCR-006
**Files**:
- `apps/api/src/documents/documents.module.ts` — add `DocumentAiService` to providers

**Acceptance**:
- [x] `DocumentAiService` listed in `providers` array
- [x] Module compiles without errors

---

## Task 4: Add processDocument() to DocumentsService with unit tests

**Order**: 3b (depends on Task 2 + Task 3)
**Spec Requirements**: REQ-OCR-002 (status transitions), REQ-OCR-003 (reprocessing gate), REQ-OCR-004 (metadata validation), REQ-OCR-005 (error handling), REQ-OCR-007 (tested success/failure paths)
**Files**:
- `apps/api/src/documents/documents.service.ts` — add `processDocument()`, inject `DocumentAiService` + `Logger`
- `apps/api/src/documents/documents.service.spec.ts` — add `mockDocumentAiService` provider + test suite

**Implementation**:
- Inject `DocumentAiService` and `Logger` into constructor
- `processDocument(caseId: string, documentId: string): Promise<Document>`
- Step 1: `findOneByCase()` — throws NotFoundException if not found (REQ-OCR-002)
- Step 2: Status gate — reject PROCESSING (400 "Document is already being processed") and PROCESSED (400 "Document has already been processed") (REQ-OCR-003)
- Step 3: Metadata gate — reject null `fileUrl` (400 "Document has no file to process") and null `mimeType` (400 "Document has no MIME type") (REQ-OCR-004)
- Step 4: `prisma.document.update({ status=PROCESSING })`
- Step 5: `documentAiService.extractText(fileUrl, mimeType)`
- Step 6a (success): `prisma.document.update({ ocrText, processedAt: new Date(), status=PROCESSED })`
- Step 6b (error): `prisma.document.update({ processingError, status=ERROR })`, then throw BadGatewayException (REQ-OCR-005)
- Private helper `resolveStatusId(code: string)` — same pattern as `create()` which resolves `UPLOADED`

**Tests** (add `mockDocumentAiService = { extractText: jest.fn() }` to existing mock providers):
- [x] Success: UPLOADED → PROCESSING → PROCESSED, ocrText saved, processedAt set
- [x] Success: ERROR → PROCESSING → PROCESSED (reprocessing allowed) (REQ-OCR-003)
- [x] Success: response includes ocrText, documentType, documentStatus relations
- [x] Gate: PROCESSING status → 400 "Document is already being processed"
- [x] Gate: PROCESSED status → 400 "Document has already been processed"
- [x] Guard: null fileUrl → 400 "Document has no file to process" (no external call)
- [x] Guard: null mimeType → 400 "Document has no MIME type" (no external call)
- [x] Not found → 404 "Document not found"
- [x] Error: Document AI throws → processingError persisted, status → ERROR, BadGatewayException thrown
- [x] Error: unexpected runtime error after PROCESSING → status → ERROR, no orphaned PROCESSING

**Acceptance**:
- [x] `npm test -- documents.service.spec.ts` passes (all new + existing tests)
- [x] Mocked `DocumentAiService` — no real GCP calls

---

## Task 5: Add POST process endpoint to DocumentsController with unit tests

**Order**: 4 (depends on Task 4)
**Spec Requirements**: REQ-OCR-006 (endpoint contract), REQ-OCR-007 (controller tested for all response codes)
**Files**:
- `apps/api/src/documents/documents.controller.ts` — add `@Post(':documentId/process')`
- `apps/api/src/documents/documents.controller.spec.ts` — add `process` test suite

**Implementation**:
- `@Post(':documentId/process')` with `@HttpCode(200)`
- Method: `async process(@Param('caseId') caseId: string, @Param('documentId') documentId: string)`
- Calls `documentsService.processDocument(caseId, documentId)`
- Returns `{ data: Document }`
- Exceptions propagate: BadRequestException (400), NotFoundException (404), BadGatewayException (502)

**Tests** (add `mockDocumentsService.processDocument = jest.fn()` to existing controller mock):
- [x] 200: success returns `{ data: document }` with ocrText
- [x] 400: propagates BadRequestException from service (status gate / metadata guard)
- [x] 404: propagates NotFoundException from service (document not found)
- [x] 502: propagates BadGatewayException from service (Document AI failure)
- [x] Delegates correctly: calls `processDocument(caseId, documentId)` with right params

**Acceptance**:
- [x] `npm test -- documents.controller.spec.ts` passes (all new + existing tests)

---

## Task 6: Integration verification — npm test + npm run build

**Order**: 5 (final — verify everything together)
**Spec Requirements**: REQ-OCR-007 (npm test passes), REQ-OCR-008 (npm run build passes, existing endpoints unchanged)
**Files**: All affected files

**Acceptance**:
- [x] `npm test` passes — all new and existing tests, zero real GCP calls
- [x] `npm run build` passes — zero TypeScript errors
- [x] Existing document CRUD endpoints still work (create, upload, findAllByCase, findOneByCase, viewDocument, delete)
- [x] Existing tests for CRUD still pass unchanged

---

## Dependency Graph

```
Task 1 (Schema + Migration)
    │
    ▼
Task 2 (DocumentAiService + tests) ──┐
    │                                 │
    ▼                                 ▼
Task 3 (Module registration)     Task 4 (DocumentsService.processDocument + tests)
                                      │
                                      ▼
                                 Task 5 (Controller endpoint + tests)
                                      │
                                      ▼
                                 Task 6 (Integration verification)
```

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| `@google-cloud/documentai` types mismatch | Verify package version matches installed `^9.6.2` before implementing service |
| Prisma migration conflicts | Run `npx prisma migrate status` before generating; ensure no pending migrations |
| Test mock hoisting conflicts | Use separate `jest.mock` blocks per file — do not share mock state between spec files |
| Existing tests break | Run full `npm test` after each task, not just at the end |
