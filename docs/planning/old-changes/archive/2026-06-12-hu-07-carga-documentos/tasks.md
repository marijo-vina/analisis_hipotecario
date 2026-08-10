# Task Breakdown: HU-07 — Cargar documentos al expediente

## Phase 1: Foundation (Dependencies, Schema, Config)

- [x] 1.1 Install `@google-cloud/storage` as dependency in `apps/api/package.json`
  Files: `apps/api/package.json` (M)
  Depends on: []
  Acceptance: `node_modules/@google-cloud/storage` exists, importable
  Effort: S [P]

- [x] 1.2 Install `@types/multer` as devDependency in `apps/api/package.json`
  Files: `apps/api/package.json` (M)
  Depends on: []
  Acceptance: `@types/multer` in devDependencies, TypeScript recognizes `Express.Multer.File`
  Effort: S [P]

- [x] 1.3 Update `.env`: uncomment `GCS_BUCKET_NAME`, `GCS_PROJECT_ID`; add `MAX_UPLOAD_SIZE_MB=10`
  Files: `apps/api/.env` (M)
  Depends on: []
  Acceptance: GCS vars uncommented, MAX_UPLOAD_SIZE_MB=10 present
  Effort: S [P]

- [x] 1.4 Add `mimeType String?` and `sizeBytes Int?` fields to Document model in Prisma schema
  Files: `apps/api/prisma/schema.prisma` (M)
  Depends on: []
  Acceptance: `prisma validate` passes, schema includes both nullable fields
  Effort: S

- [x] 1.5 Run Prisma migration: `npx prisma migrate dev --name hu07_add_document_metadata`
  Files: `apps/api/prisma/migrations/` (C)
  Depends on: [1.4]
  Acceptance: Migration file created, DB columns added, existing rows unaffected
  Effort: S

- [x] 1.6 Regenerate Prisma Client: `npx prisma generate --config ./prisma.config.ts`
  Files: `apps/api/src/generated/prisma/` (M)
  Depends on: [1.5]
  Acceptance: Generated client includes `mimeType` and `sizeBytes` on Document type
  Effort: S

## Phase 2: Core Backend (GcsService + DocumentsService)

- [x] 2.1 Create `GcsService` with `uploadFile(bucketName, destination, buffer, mimeType): Promise<string>` returning `gs://` URI; throws `StorageUploadException` on GCS errors
  Files: `apps/api/src/documents/gcs.service.ts` (C)
  Depends on: [1.1, 1.6]
  Acceptance: Service injectable, reads `GCS_BUCKET_NAME` via ConfigService, wraps `@google-cloud/storage`
  Effort: M

- [x] 2.2 Create `gcs.service.spec.ts`: test uploadFile returns `gs://` URI; test GCS error → `StorageUploadException`
  Files: `apps/api/src/documents/gcs.service.spec.ts` (C)
  Depends on: [2.1]
  Acceptance: Tests pass with mocked `Storage` + `bucket.file().save()`
  Effort: M

- [x] 2.3 Add `uploadAndCreate(caseId, advisorId, file, documentTypeId)` to DocumentsService: validate case (404) → validate type + isActive (400) → validate file.size > 0 (400 "File is empty") → buildPath → GCS upload → ONLY THEN Prisma create → return Document with includes
  Files: `apps/api/src/documents/documents.service.ts` (M)
  Depends on: [1.6, 2.1]
  Acceptance: GCS failure throws 502 WITHOUT creating Document row; success creates Document with mimeType, sizeBytes, storagePath, fileUrl
  Effort: M

- [x] 2.4 Extend `documents.service.spec.ts` with uploadAndCreate tests: happy path (GCS success → Prisma create), GCS failure (no Prisma call), empty file (400), missing case (404), inactive type (400)
  Files: `apps/api/src/documents/documents.service.spec.ts` (M)
  Depends on: [2.3]
  Acceptance: All new tests pass, mock GcsService + StoragePathService + PrismaService
  Effort: M

## Phase 3: Controller + Module Wiring

- [x] 3.1 Add `POST upload` endpoint to DocumentsController: `@UseInterceptors(FileInterceptor('file', { limits, fileFilter }))`, fileFilter whitelists PDF/JPEG/PNG, limits.fileSize from env, calls `documentsService.uploadAndCreate()`, returns 201 `{ data }`
  Files: `apps/api/src/documents/documents.controller.ts` (M)
  Depends on: [2.3]
  Acceptance: Endpoint accepts multipart, rejects wrong MIME (400), oversized (413), missing file (400)
  Effort: M

- [x] 3.2 Extend `documents.controller.spec.ts` with upload endpoint tests: 201 on valid upload, 400 on missing file, 400 on wrong MIME, 413 on oversize, error propagation from service
  Files: `apps/api/src/documents/documents.controller.spec.ts` (M)
  Depends on: [3.1]
  Acceptance: Tests pass with mocked DocumentsService.uploadAndCreate
  Effort: M

- [x] 3.3 Add `GcsService` to DocumentsModule providers; verify exports still include DocumentsService + StoragePathService
  Files: `apps/api/src/documents/documents.module.ts` (M)
  Depends on: [2.1]
  Acceptance: Module compiles, GcsService injectable in DocumentsService
  Effort: S

## Phase 4: Frontend (Route Handler + Components)

- [x] 4.1 Create Route Handler `POST /api/mortgage-cases/[id]/documents/upload/route.ts`: reads FormData from request, reads JWT from httpOnly cookie, forwards to NestJS with `Authorization: Bearer`, returns NestJS response
  Files: `apps/web/app/api/mortgage-cases/[id]/documents/upload/route.ts` (C)
  Depends on: [3.1]
  Acceptance: Proxies multipart to NestJS, JWT never exposed to browser, returns appropriate status + body
  Effort: M [P]

- [x] 4.2 Create `DocumentUpload` client component: file input (accept PDF/JPEG/PNG), document type dropdown (fetches from API), loading state, error display, success callback, submits FormData to Route Handler
  Files: `apps/web/app/ui/documents/document-upload.tsx` (C)
  Depends on: [3.1]
  Acceptance: Renders file input + type selector, submits FormData, shows loading/error/success states
  Effort: M [P]

- [x] 4.3 Create `DocumentList` component: fetches documents for case, table with type name, original name, upload date, status badge, empty state; NO download/preview buttons
  Files: `apps/web/app/ui/documents/document-list.tsx` (C)
  Depends on: []
  Acceptance: Displays document metadata table, shows "No documents uploaded" when empty, no download links
  Effort: S [P]

- [x] 4.4 Add `Document` and `DocumentType` interfaces to `apps/web/app/lib/definitions.ts`
  Files: `apps/web/app/lib/definitions.ts` (M)
  Depends on: [1.4]
  Acceptance: Interfaces include mimeType, sizeBytes, storagePath, fileUrl, relations
  Effort: S

- [x] 4.5 Integrate DocumentUpload + DocumentList in case detail page `apps/web/app/dashboard/expedientes/[id]/page.tsx`
  Files: `apps/web/app/dashboard/expedientes/[id]/page.tsx` (M)
  Depends on: [4.2, 4.3, 4.4]
  Acceptance: Detail page shows upload form + document list below case details, refreshes after upload
  Effort: M

## Phase 5: Testing & Verification

- [x] 5.1 Run full API test suite: verify all pre-existing tests still pass after new additions
  Files: N/A (verify)
  Depends on: [2.4, 3.2, 3.3]
  Acceptance: `npm test` in apps/api passes with 0 failures (115/115 tests pass)
  Effort: S

- [ ] 5.2 Manual integration test: upload valid PDF via frontend → verify 201, Document in DB with mimeType/sizeBytes, file in GCS
  Files: N/A (verify)
  Depends on: [4.5]
  Acceptance: End-to-end flow works: browser → Route Handler → NestJS → GCS → Prisma → UI refresh
  Effort: M

### Parallelism Summary

- **Wave 1 (parallel)**: 1.1, 1.2, 1.3, 1.4
- **Wave 2**: 1.5 (after 1.4)
- **Wave 3**: 1.6 (after 1.5)
- **Wave 4 (parallel)**: 2.1, 4.3, 4.4
- **Wave 5 (parallel)**: 2.2 (after 2.1), 2.3 (after 1.6, 2.1), 4.1 (after 3.1), 4.2 (after 3.1)
- **Wave 6**: 2.4 (after 2.3)
- **Wave 7 (parallel)**: 3.1 (after 2.3), 4.5 (after 4.2, 4.3, 4.4)
- **Wave 8 (parallel)**: 3.2 (after 3.1), 3.3 (after 2.1)
- **Wave 9**: 5.1 (after 2.4, 3.2, 3.3)
- **Wave 10**: 5.2 (after 4.5, 5.1)

### Total Effort
- Small (S): 6 tasks
- Medium (M): 11 tasks
- Large (L): 0 tasks
- Status: 17/18 COMPLETE
