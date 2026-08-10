# Proposal: HU-07 — Cargar documentos al expediente

## Intent
Enable advisors to attach real files to a mortgage case. Right now HU-06 only stores metadata; HU-07 uploads files to Google Cloud Storage and persists their URL, MIME type, and size in PostgreSQL. This is the critical bridge between the document catalog and actual file storage.

## Scope

### In Scope
- Single multipart upload endpoint `POST /mortgage-cases/:caseId/documents/upload` with `FileInterceptor`
- `GcsService` (upload buffer to GCS, return public URL)
- `UploadModule` registering and exporting `GcsService`
- Prisma migration: add `mimeType String?` and `sizeBytes Int?` to `Document`
- `DocumentsService.uploadAndCreate()` orchestrating validation → GCS → Prisma create
- `DocumentsController` upload route with `@UseGuards(JwtAuthGuard)`
- Frontend: `DocumentUpload` client component, `DocumentList` section, `uploadDocument` server action
- Environment variables uncommented/extended: `GCS_BUCKET_NAME`, `GCS_PROJECT_ID`, `GCS_CLIENT_EMAIL`, `GCS_PRIVATE_KEY`
- Unit tests for GcsService, DocumentsService, controller, and DTO validation

### Out of Scope
- OCR, Document AI, Gemini, data extraction
- Automatic content validation beyond MIME type
- Financial calculations, reports, advanced state transitions
- Full document management UI beyond upload + list

## Capabilities

### New Capabilities
- `gcs-upload`: Google Cloud Storage file upload and path generation
- `document-upload-endpoint`: Multipart file upload with validation and metadata persistence
- `document-upload-ui`: Frontend components for uploading and listing documents in a case

### Modified Capabilities
- `documents-metadata`: Extends from metadata-only to include file-backed documents; adds `mimeType` and `sizeBytes` fields

## Approach
Single endpoint flow: `FileInterceptor` parses multipart → `DocumentsController` delegates to `DocumentsService.uploadAndCreate()` → validates case and document type → `StoragePathService.buildPath()` generates GCS path → `GcsService.uploadFile()` writes to GCS → Prisma creates `Document` with all fields. Frontend uses a client component that posts `FormData` directly to the NestJS backend (avoiding Next.js server-action body-size limits), then revalidates the page.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/prisma/schema.prisma` | Modified | Add `mimeType String?` and `sizeBytes Int?` to `Document` |
| `apps/api/src/upload/` | New | `UploadModule`, `GcsService` with GCS client |
| `apps/api/src/documents/` | Modified | New endpoint, `uploadAndCreate` in service, DTOs, tests |
| `apps/api/.env` | Modified | Uncomment GCS vars, add optional SA credentials |
| `apps/api/package.json` | Modified | Add `@google-cloud/storage` and `@types/multer` |
| `apps/web/app/dashboard/expedientes/[id]/page.tsx` | Modified | Add document section with upload + list |
| `apps/web/app/ui/document-upload.tsx` | New | Client component with file input and type selector |
| `apps/web/app/ui/document-list.tsx` | New | Server component listing documents |
| `apps/web/app/actions/documents.ts` | New | Server action for upload and revalidation |
| `apps/web/app/lib/definitions.ts` | Modified | Add `Document` and `DocumentType` interfaces |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| GCS without local emulator | Med | Use ADC (`gcloud auth application-default login`) or small real bucket; abstract `GcsService` for test mocking |
| Next.js server-action body-size limit | High | **Client component posts FormData directly to NestJS**; server action only revalidates page |
| Multer memory storage for large files | Med | Limit to 10 MB; switch to `diskStorage` only if needed later |
| Trusting client-provided MIME type | Low | Server-side whitelist check; for MVP, no magic-bytes validation |
| Testing GCS in CI | Low | Mock `@google-cloud/storage` in unit tests; integration tests use emulator if needed |

## Rollback Plan
1. Revert Prisma migration: `npx prisma migrate resolve --rolled-back {migration_name}` and drop `mimeType`/`sizeBytes` columns.
2. Remove `upload` endpoint and `GcsService`.
3. Revert frontend page changes.
4. All existing metadata-only documents remain untouched (new fields are nullable).

## Dependencies
- **HU-06** (complete): `DocumentsModule`, `StoragePathService`, catalog seeding
- **Future**: HU-XX (OCR extraction) will read `fileUrl` from documents created here
- **Packages**: `@google-cloud/storage`, `@types/multer` (dev)

## Success Criteria
- [x] `POST /mortgage-cases/:caseId/documents/upload` accepts multipart, validates file, returns `{ data: Document }` with `fileUrl`, `mimeType`, `sizeBytes`
- [x] File appears in GCS bucket at the expected path
- [x] Frontend shows uploaded document in the case detail page
- [x] All new code covered by unit tests (GcsService, DocumentsService, controller)
- [x] JWT guard protects upload endpoint
- [x] Document list displays original name, type, status, size, and date
