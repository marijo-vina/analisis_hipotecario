# Technical Design: HU-07 — Cargar documentos al expediente

## Overview
Complete technical design for HU-07 — implementing real file upload to Google Cloud Storage via a multipart endpoint, extending the Document model with MIME type and size metadata, and building the frontend upload UI with a Next.js Route Handler proxy.

## Why
HU-06 prepared the metadata infrastructure (Document model, catalogs, StoragePathService). HU-07 is the bridge that converts metadata-only records into file-backed documents by uploading buffers to GCS and persisting the resulting URI, MIME type, and file size.

## Where
- `apps/api/prisma/schema.prisma` — Add `mimeType String?` and `sizeBytes Int?` to Document model
- `apps/api/src/documents/gcs.service.ts` — New service wrapping `@google-cloud/storage`
- `apps/api/src/documents/gcs.service.spec.ts` — Unit tests with mocked Storage client
- `apps/api/src/documents/documents.service.ts` — Add `uploadAndCreate()` method
- `apps/api/src/documents/documents.service.spec.ts` — Extended tests for uploadAndCreate
- `apps/api/src/documents/documents.controller.ts` — Add `POST upload` with FileInterceptor
- `apps/api/src/documents/documents.controller.spec.ts` — Extended controller tests
- `apps/api/src/documents/documents.module.ts` — Add GcsService to providers
- `apps/api/.env` — Uncomment GCS vars, add MAX_UPLOAD_SIZE_MB
- `apps/api/package.json` — Add @google-cloud/storage and @types/multer
- `apps/web/app/api/mortgage-cases/[id]/documents/upload/route.ts` — Route Handler proxy
- `apps/web/app/ui/documents/document-upload.tsx` — Client component
- `apps/web/app/ui/documents/document-list.tsx` — Document list component
- `apps/web/app/ui/documents/documents-client-section.tsx` — Client wrapper
- `apps/web/app/lib/definitions.ts` — Document and DocumentType interfaces
- `apps/web/app/dashboard/expedientes/[id]/page.tsx` — Integration

## Key Decisions

1. **GcsService location**: `documents/gcs.service.ts` (same module) — simpler; no separate UploadModule needed yet. Documents are the only GCS consumer. Extract later if shared.
2. **Frontend upload transport**: Route Handler proxies multipart, NOT server action — (1) httpOnly cookie inaccessible from client JS; (2) Next.js 16 server actions enforce body size limits incompatible with file uploads.
3. **Multer storage**: `memoryStorage()` — acceptable for ≤10 MB files. No cleanup, simpler than diskStorage. Switch to disk/stream if files grow ≥50 MB.
4. **GCS URI scheme**: Return `gs://{bucket}/{path}` (not public HTTP URL) — stable, GCS-native identifier. Bucket remains private; public access via signed URLs is out of scope for HU-07.
5. **GCS auth in dev**: Application Default Credentials (ADC) via `gcloud auth application-default login` — no need to manage service-account keys in .env. GCS_CLIENT_EMAIL/GCS_PRIVATE_KEY optional for CI/prod.
6. **File size limit**: `MAX_UPLOAD_SIZE_MB` env var (default 10) — configurable without code changes. Enforced by Multer `limits.fileSize`.

## Data Flow

```
Browser (DocumentUpload)                NestJS                          GCS
  │── FormData ──▶ Route Handler          │                              │
  │               │─ read"token"cookie    │                              │
  │               │─ POST + Bearer ──────▶│                              │
  │               │                       │─ JwtAuthGuard ✓              │
  │               │                       │─ FileInterceptor parse ✓     │
  │               │                       │─ uploadAndCreate():          │
  │               │                       │  1. validate case (404)      │
  │               │                       │  2. validate type (400)      │
  │               │                       │  3. buildPath() ─────────────│
  │               │                       │  4. bucket.file(path).save()─▶
  │               │                       │  5. Prisma create Document ◀─│
  │               │◀── 201 { data } ──────│                              │
  │◀─ JSON ───────│                       │                              │
  │─ refresh UI   │                       │                              │
```

## File Changes

### Backend (apps/api)

| File | Action | Description |
|------|--------|-------------|
| `prisma/schema.prisma` | Modify | Add `mimeType String?` and `sizeBytes Int?` to Document model |
| `src/documents/gcs.service.ts` | Create | Wraps `@google-cloud/storage` Storage client; `uploadFile(bucket, path, buffer, mimeType): Promise<string>` returns `gs://` URI |
| `src/documents/gcs.service.spec.ts` | Create | Unit tests with mocked `@google-cloud/storage` (mock `bucket.upload`) |
| `src/documents/documents.service.ts` | Modify | Add `uploadAndCreate(caseId, advisorId, file, documentTypeId): Promise<Document>` |
| `src/documents/documents.service.spec.ts` | Modify | Add tests for `uploadAndCreate` (mock GcsService + Prisma) |
| `src/documents/documents.controller.ts` | Modify | Add `@Post('upload')` with `@UseInterceptors(FileInterceptor('file', opts))` |
| `src/documents/documents.controller.spec.ts` | Modify | Add controller tests for upload endpoint |
| `src/documents/documents.module.ts` | Modify | Add `GcsService` to providers |
| `.env` | Modify | Uncomment `GCS_BUCKET_NAME`, `GCS_PROJECT_ID`; add `MAX_UPLOAD_SIZE_MB=10` |
| `package.json` | Modify | Add `@google-cloud/storage` (dep), `@types/multer` (devDep) |

### Frontend (apps/web)

| File | Action | Description |
|------|--------|-------------|
| `app/api/mortgage-cases/[id]/documents/upload/route.ts` | Create | POST handler: reads `token` cookie → forwards FormData to NestJS with `Authorization: Bearer` |
| `app/ui/documents/document-upload.tsx` | Create | Client component: file input + document type `<select>` + submit button; posts FormData to Route Handler |
| `app/ui/documents/document-list.tsx` | Create | Displays document table (type name, original name, upload date, status badge) with empty state |
| `app/dashboard/expedientes/[id]/page.tsx` | Modify | Fetch documents via `apiFetch` + render DocumentUpload + DocumentList |
| `app/lib/definitions.ts` | Modify | Add `Document` and `DocumentType` interfaces |

## Interfaces / Contracts

```typescript
// GcsService
async uploadFile(
  bucketName: string,
  destination: string,
  buffer: Buffer,
  mimeType: string,
): Promise<string>  // "gs://{bucket}/{destination}"

// DocumentsService (new method)
async uploadAndCreate(
  caseId: string,
  advisorId: string,
  file: Express.Multer.File,
  documentTypeId: number,
): Promise<Document>

// Prisma Document model additions
model Document {
  // ... existing fields ...
  mimeType  String?
  sizeBytes Int?
}
```

## Error Handling Matrix

| Scenario | HTTP | Exception | message |
|----------|------|-----------|---------|
| File missing | 400 | BadRequestException | `"File is required"` |
| Invalid MIME | 400 | BadRequestException | `"File type not allowed. Allowed: application/pdf, image/jpeg, image/png"` |
| Empty file (0 bytes) | 400 | BadRequestException | `"File is empty"` |
| File exceeds limit | 413 | PayloadTooLargeException | `"File size exceeds limit of X MB"` |
| documentTypeId not found | 400 | BadRequestException | `"Document type not found"` |
| documentTypeId inactive | 400 | BadRequestException | `"Document type is not active"` |
| Case not found | 404 | NotFoundException | `"Mortgage case not found"` |
| Missing JWT | 401 | UnauthorizedException | (JwtAuthGuard default) |
| GCS upload fails | 502 | BadGatewayException | `"File storage service unavailable"` |
| Success | 201 | — | `{ data: Document }` |

## Testing Strategy

| Test file | Layer | What | Mock strategy |
|-----------|-------|------|---------------|
| `gcs.service.spec.ts` | Unit | uploadFile returns gs:// URI; catches GCS errors → StorageUploadException | Mock `Storage` + `bucket.file().save()` |
| `documents.service.spec.ts` | Unit | uploadAndCreate validates case/type, calls GCS + Prisma, returns with includes | Mock PrismaService + GcsService + StoragePathService |
| `documents.controller.spec.ts` | Unit | upload endpoint: file validation, 201 response, error propagation | Mock DocumentsService |
| Route Handler | Unit | Proxies FormData with Bearer token; returns NestJS status+body | Mock global `fetch` |

## Environment Variables

```env
GCS_BUCKET_NAME=hipotecario-documentos-dev
GCS_PROJECT_ID=hipotecario-analisis
MAX_UPLOAD_SIZE_MB=10
# GCS_CLIENT_EMAIL=   (optional, for explicit SA key)
# GCS_PRIVATE_KEY=    (optional, for explicit SA key)
```

## Migration / Rollout

- Migration: `npx prisma migrate dev --name add_mime_type_and_size_bytes_to_document` adds two nullable columns — non-destructive (existing records get null)
- Rollback: `npx prisma migrate resolve --rolled-back {name}` drops columns; all existing metadata-only documents untouched
- No feature flags needed — endpoint is additive

## Open Questions

- None — all decisions resolved in exploration phase
