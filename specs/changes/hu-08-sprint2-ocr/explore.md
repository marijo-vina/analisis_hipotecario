# Exploration: HU-08 Sprint 2 OCR — Procesar documentos con Document AI

## Executive Summary

The OCR processing pipeline is clearly scoped. The **DocumentStatus codes** (UPLOADED, PENDING_REVIEW, PROCESSING, PROCESSED, ERROR) **already exist** in `seed.ts` and the Data Model spec. The `Document` model needs 3 new nullable fields: `ocrText`, `processedAt`, `processingError`. A new `DocumentAiService` should be created following the same pattern as `GcsService` (standalone service inside DocumentsModule). The processing should be **synchronous** for Sprint 2 MVP — triggered by a new `POST .../process` endpoint. The Google Document AI processor is already configured in `.env`.

---

## Current State

### Prisma Schema (`apps/api/prisma/schema.prisma`)

The `Document` model (lines 70–87) has:
- `id`, `mortgageCaseId`, `documentTypeId`, `documentStatusId`
- `fileUrl` (String?, stores `gs://` URI), `storagePath` (String?), `mimeType` (String?)
- `sizeBytes` (Int?), `originalName` (String), `uploadedById` (String)
- `createdAt`, `updatedAt`
- Relations to `DocumentType`, `DocumentStatus`, `User`, `MortgageCase`

**Missing fields for OCR**: `ocrText`, `processedAt`, `processingError`

### DocumentStatus codes (seed.ts lines 24–30)

```typescript
const DOCUMENT_STATUSES = [
  { code: 'UPLOADED',       name: 'Cargado',             order: 1 },
  { code: 'PENDING_REVIEW', name: 'Pendiente de revisión',order: 2 },
  { code: 'PROCESSING',     name: 'En procesamiento',    order: 3 },
  { code: 'PROCESSED',      name: 'Procesado',            order: 4 },
  { code: 'ERROR',          name: 'Error',                order: 5 },
];
```

**All five statuses already exist.** The seed upserts them. No new status codes are needed. The `PROCESSING`, `PROCESSED`, and `ERROR` codes are ready to use.

### Documents module (`apps/api/src/documents/`)

| File | Role |
|------|------|
| `documents.module.ts` | Wires DocumentsService, GcsService, StoragePathService. Imports PrismaModule. Exports DocumentsService + StoragePathService. |
| `documents.service.ts` | CRUD: create, uploadAndCreate, findAllByCase, findOneByCase, getSignedUrl, delete |
| `gcs.service.ts` | Wraps `@google-cloud/storage`. uploadFile → gs:// URL, generateSignedUrl, deleteFile. Uses `ConfigService` for bucket name. |
| `storage-path.service.ts` | Builds GCS path: `{caseId}/{documentTypeCode}/{filename}` |
| `documents.controller.ts` | REST endpoints scoped under `/mortgage-cases/:caseId/documents`. All protected by `JwtAuthGuard`. |

### Existing delete gate (`documents.service.ts` line 167)

```typescript
if (document.documentStatus.code !== 'UPLOADED') {
  throw new BadRequestException('Solo se pueden eliminar documentos no procesados');
}
```

This already protects PROCESSING/PROCESSED/ERROR documents from deletion — exactly the behavior we want.

### ConfigService pattern (from `gcs.service.ts`)

```typescript
constructor(private configService: ConfigService) {
  this.bucketName = this.configService.get<string>('GCS_BUCKET_NAME') || '';
}
```

ConfigModule is global (`isGlobal: true` in `app.module.ts`). Any new service can inject `ConfigService` to read env vars.

### Environment (`apps/api/.env` lines 12–15)

```
GCLOUD_PROJECT_ID="gestion-financiera-499302"
GCLOUD_LOCATION="us"
GCLOUD_PROCESSOR_ID="3856012ede9fdbfd"
```

Google Application Credentials already configured (`GOOGLE_APPLICATION_CREDENTIALS=./gcp-credentials.json`).

### Dependencies

- `@google-cloud/documentai`: ^9.6.2 (already installed)
- `@google-cloud/storage`: ^7.21.0 (already installed)
- `@nestjs/config`: used globally

### Test patterns observed

- **Service tests**: `Test.createTestingModule` with `useValue` mocks for all injected dependencies
- **Controller tests**: Same pattern, mock only the service layer
- **GcsService test**: Module-level `jest.mock('@google-cloud/storage', ...)` for GCP SDK mocking. Mock functions hoisted with `jest.fn()` before imports
- **DTO tests**: Separate spec files (e.g., `create-document.dto.spec.ts`) using `class-validator` `validate()`
- All tests use `jest.clearAllMocks()` in `beforeEach`
- No integration/E2E tests found — pure unit tests with mocks

### No existing OCR code

A grep for `documentai|DocumentAI|ocr|OCR|OcrService|DocumentAiService|processDocument` across `apps/api/src` returned **zero results**. This is greenfield within the project.

---

## Affected Areas

| File | Why affected |
|------|-------------|
| `apps/api/prisma/schema.prisma` | Add `ocrText`, `processedAt`, `processingError` fields to Document model |
| `apps/api/prisma/migrations/` | New migration for the 3 new fields |
| `apps/api/src/documents/documents.module.ts` | Register new `DocumentAiService` as provider |
| `apps/api/src/documents/documents.service.ts` | Add `processDocument(caseId, documentId)` method |
| `apps/api/src/documents/documents.controller.ts` | Add `POST .../process` endpoint |
| `apps/api/src/documents/dto/` | Possibly a new DTO for process response (or reuse existing) |
| `apps/api/src/documents/documents.service.spec.ts` | Add tests for processDocument method |
| `apps/api/src/documents/documents.controller.spec.ts` | Add tests for process endpoint |
| **NEW** `apps/api/src/documents/document-ai.service.ts` | New service wrapping `@google-cloud/documentai` |
| **NEW** `apps/api/src/documents/document-ai.service.spec.ts` | Tests for DocumentAiService |

---

## Document AI API Flow

Using `@google-cloud/documentai` v9.x with **GCS input** (no need to download file first):

```typescript
import { DocumentProcessorServiceClient } from '@google-cloud/documentai';

// 1. Build processor name
const name = `projects/${projectId}/locations/${location}/processors/${processorId}`;

// 2. Send GCS document directly
const [result] = await client.processDocument({
  name,
  gcsDocument: {
    gcsUri: 'gs://bucket-name/path/to/file.pdf',
    mimeType: 'application/pdf',
  },
});

// 3. Extract text
const text = result.document?.text || '';
```

**Key decisions**:
- Use `gcsDocument` (not `rawDocument`) — documents are already in GCS, avoids memory overhead
- The `fileUrl` field already stores `gs://` URIs — can be passed directly to Document AI
- `mimeType` is already stored on the Document model — can be passed directly

---

## Approaches

### 1. New DocumentAiService inside DocumentsModule (RECOMMENDED)

Create `DocumentAiService` as a standalone injectable following the same pattern as `GcsService`. Register it as a provider in `DocumentsModule`. Add `processDocument()` method to `DocumentsService` that orchestrates: validate document → update status to PROCESSING → call DocumentAiService → update to PROCESSED/ERROR.

- **Pros**: Follows existing pattern (GcsService), minimal module changes, separation of OCR logic from orchestration, easy to test
- **Cons**: DocumentsModule grows — but only by one service (still small at 4 services)
- **Effort**: Low

### 2. New standalone OcrModule

Create a separate `OcrModule` with its own `OcrService` and import it into `DocumentsModule`.

- **Pros**: Stronger separation of concerns, could be reused by other modules later
- **Cons**: Over-engineering for a single-file service that only DocumentsModule uses, extra module boilerplate, goes against KISS for Sprint 2
- **Effort**: Medium

### 3. Add OCR logic directly to DocumentsService

Put the Document AI call directly in `DocumentsService.processDocument()` without a separate service.

- **Pros**: Fewest files
- **Cons**: Violates Single Responsibility, mixes GCP SDK calls with orchestration, harder to test in isolation, design spec says "Separar OCR de extracción estructurada"
- **Effort**: Low (but risky)

---

## Recommendation

**Approach 1 — New DocumentAiService inside DocumentsModule.**

This follows the exact same pattern already established by `GcsService`:
- `GcsService` wraps `@google-cloud/storage`
- `DocumentAiService` wraps `@google-cloud/documentai`
- Both are providers in `DocumentsModule`
- `DocumentsService` orchestrates both

The processing flow:
1. `POST /mortgage-cases/:caseId/documents/:documentId/process` → `DocumentsController.process()`
2. Controller calls `DocumentsService.processDocument(caseId, documentId)`
3. Service validates document exists, has `fileUrl`, has `mimeType`
4. Updates status to `PROCESSING`
5. Calls `DocumentAiService.extractText(fileUrl, mimeType)`
6. On success: updates `ocrText`, `processedAt`, status → `PROCESSED`
7. On failure: updates `processingError`, status → `ERROR`, re-throws to controller

### Synchronous vs Asynchronous

**Synchronous for Sprint 2 MVP.** The Google Document AI `processDocument` API returns in seconds for typical documents (1-5 pages). Adding a queue/bull for Sprint 2 adds unnecessary complexity. The controller awaits the result and returns the updated document with OCR text. If performance becomes an issue in later sprints (e.g., batch processing 20+ documents), we can add a Bull queue then.

---

## Risks

- **Document AI latency variability**: Some complex documents (scanned, multi-page) could take 10-30 seconds. A synchronous HTTP request with a 30s timeout could be problematic if the load balancer/gateway has a shorter timeout. Mitigation: set a reasonable timeout on the Document AI client, document the expected latency, consider polling for HU-09+ if needed.
- **Large documents**: PDFs with 50+ pages may exceed Document AI size limits or take too long. Mitigation: validate file size before processing, document limits.
- **mimeType null on legacy documents**: Documents created via `create()` (not `uploadAndCreate()`) have `mimeType: null`. Mitigation: require `fileUrl` + `mimeType` guard before processing, return 400 if missing.
- **Processor not found**: If `GCLOUD_PROCESSOR_ID` is wrong or processor is deleted, the call fails. Mitigation: validate env vars at startup or catch 404 from Document AI.
- **Cost**: Document AI charges per page. Need to be aware of this for budget. Not a code risk but operational.

---

## Ready for Proposal

**Yes.** All unknowns are resolved:
- Status codes exist → no new migration needed for statuses
- Document model needs 3 new fields → one migration
- One new service file → follows GcsService pattern
- One new controller endpoint → `POST .../process`
- Synchronous processing → no queue infrastructure needed

The orchestrator should proceed to **sdd-propose** with this exploration as input.
