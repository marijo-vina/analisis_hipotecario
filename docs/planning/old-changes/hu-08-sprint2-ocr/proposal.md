# Proposal: HU-08 Sprint 2 — Procesar documentos con OCR

## Intent

Enable the backend to process uploaded mortgage documents through Google Document AI OCR, extract raw text, and store it alongside the document record. This reduces manual data entry for advisors and establishes the pipeline for future structured extraction (HU-10 through HU-13).

## Scope

### In Scope
- Add 3 nullable fields to `Document` model: `ocrText`, `processedAt`, `processingError`
- Create `DocumentAiService` following the existing `GcsService` pattern
- Add `POST /mortgage-cases/:caseId/documents/:documentId/process` endpoint
- Orchestrate synchronous processing: validate → set PROCESSING → call Document AI → save text → set PROCESSED/ERROR
- Guard against missing `fileUrl` (GCS URI) or `mimeType` before processing
- Unit tests with mocked `@google-cloud/documentai` (no real GCP calls)
- Keep `npm test` and `npm run build` green

### Out of Scope
- Structured data extraction with Gemini (HU-10–HU-13)
- Payroll / bank statement / credit bureau interpretation
- Cross-document validation
- Financial calculations (liability, payment capacity, bank comparison)
- Reports or automatic credit approval
- Batch or queue/background processing

## Capabilities

### New Capabilities
- `document-processing`: Orchestrate document status transitions and OCR pipeline
- `document-ocr`: Communicate with Google Document AI to extract raw text from GCS-stored documents

### Modified Capabilities
- None at the spec level — existing document CRUD behavior does not change

## Approach

### Database Migration
Add to `Document` model in Prisma schema:
```prisma
ocrText          String?
processedAt      DateTime?
processingError  String?
```
Generate and apply migration. All fields are nullable — existing documents remain valid.

### DocumentAiService
New standalone injectable inside `DocumentsModule`, mirroring `GcsService`:
- Injects `ConfigService` to read `GCLOUD_PROJECT_ID`, `GCLOUD_LOCATION`, `GCLOUD_PROCESSOR_ID`
- Instantiates `DocumentProcessorServiceClient` from `@google-cloud/documentai`
- Single public method: `extractText(gcsUri: string, mimeType: string): Promise<string>`
- Uses `gcsDocument` input (not `rawDocument`) — documents are already in GCS

### Processing Flow
1. Controller receives `POST .../:documentId/process`
2. `DocumentsService.processDocument(caseId, documentId)`:
   - Fetch document with status; 404 if not found or wrong case
   - **Reprocessing gate**: only `UPLOADED` and `ERROR` are allowed; `PROCESSING` and `PROCESSED` return 400
   - Guard: `fileUrl` (GCS URI, e.g., `gs://bucket/path`) and `mimeType` must be present; 400 if missing
   - Update status to `PROCESSING`
   - Call `DocumentAiService.extractText(document.fileUrl, document.mimeType)`
   - On success: save `ocrText`, `processedAt=now()`, status → `PROCESSED`
   - On failure: save `processingError=message`, status → `ERROR`, then re-throw so controller returns 502/504
3. Return updated document with `ocrText` — status 200 (processing an existing document, not creating one)

### Error Handling
- **Invalid status for processing**: 400 `BadRequestException` if document status is not `UPLOADED` or `ERROR`
- **Missing metadata**: 400 `BadRequestException` if `fileUrl` or `mimeType` is null before any external call
- **Document AI failure**: catch and map to `BadGatewayException`; persist ERROR status and `processingError`
- **Unexpected errors**: same pattern — always leave document in a terminal status (PROCESSED or ERROR)

### Testing
- `document-ai.service.spec.ts`: mock `@google-cloud/documentai` at module level, assert `extractText` returns text from `result.document.text`
- `documents.service.spec.ts`: mock `DocumentAiService`, test success path (PROCESSING → PROCESSED) and failure path (PROCESSING → ERROR)
- `documents.controller.spec.ts`: mock `DocumentsService`, test 200 success and 400/404/502 error responses

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/prisma/schema.prisma` | Modified | Add `ocrText`, `processedAt`, `processingError` to `Document` |
| `apps/api/prisma/migrations/` | New | Migration for the 3 new fields |
| `apps/api/src/documents/document-ai.service.ts` | New | Wraps `@google-cloud/documentai` client |
| `apps/api/src/documents/document-ai.service.spec.ts` | New | Unit tests with mocked SDK |
| `apps/api/src/documents/documents.module.ts` | Modified | Register `DocumentAiService` as provider |
| `apps/api/src/documents/documents.service.ts` | Modified | Add `processDocument()` orchestration method |
| `apps/api/src/documents/documents.service.spec.ts` | Modified | Add tests for `processDocument()` |
| `apps/api/src/documents/documents.controller.ts` | Modified | Add `POST .../process` endpoint |
| `apps/api/src/documents/documents.controller.spec.ts` | Modified | Add tests for process endpoint |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|-------------|
| Document AI latency spikes (10–30s for complex scans) | Medium | Synchronous MVP is acceptable; document expected latency. If timeouts occur in production, add client-side timeout and consider polling for HU-09+. |
| Large/multi-page PDFs exceed size/time limits | Low | Simple `sizeBytes` guard documented in code; no complex page-limit logic for MVP. If no limit defined, left as technical debt for future hardening. |
| `mimeType` or `fileUrl` null on legacy documents | Low | Hard guard in `processDocument`: 400 if `mimeType` or `fileUrl` missing. |
| Processor misconfiguration (bad env var) | Low | Catch 404/401 from Document AI and surface as 502 with clear message. |
| Cost per page | Low | Operational, not code risk. Monitor via GCP billing alerts. |

## Rollback Plan

1. Revert Prisma schema changes and delete migration file.
2. Remove `DocumentAiService` and its spec.
3. Revert `DocumentsService`, `DocumentsController`, and `DocumentsModule` to previous state.
4. Run `npx prisma migrate reset` or restore DB from pre-migration backup.
5. Re-deploy. Existing documents keep working; OCR fields simply become unavailable.

## Dependencies

- `@google-cloud/documentai` ^9.6.2 (already installed)
- `@google-cloud/storage` ^7.21.0 (already installed)
- Env vars `GCLOUD_PROJECT_ID`, `GCLOUD_LOCATION`, `GCLOUD_PROCESSOR_ID` (already configured in `.env`)
- `GOOGLE_APPLICATION_CREDENTIALS` (already configured)

## Success Criteria

- [ ] `POST /mortgage-cases/:caseId/documents/:documentId/process` returns updated document with `ocrText` on success
- [ ] Document status transitions: UPLOADED → PROCESSING → PROCESSED (or ERROR on failure)
- [ ] `processingError` is persisted and readable when Document AI fails
- [ ] Missing `mimeType` or `fileUrl` returns 400 before any external call
- [ ] Reprocessing gate: only `UPLOADED` and `ERROR` allowed; `PROCESSING` and `PROCESSED` return 400
- [ ] All unit tests pass (`npm test`)
- [ ] Build passes (`npm run build`)
- [ ] No real GCP calls during tests (fully mocked)
