# Delta Spec: HU-07 — Cargar documentos al expediente

## NEW: document-upload

Multipart upload endpoint `POST /mortgage-cases/:caseId/documents/upload`. Accepts file binary + documentTypeId, validates inputs, stores file in GCS via GcsService, creates Document record with all fields.

### Requirements

| ID | Requirement | Strength |
|----|-----------|----------|
| REQ-UPL-001 | Accept file upload with associated document type | MUST |
| REQ-UPL-002 | Validate file: required, MIME ∈ [application/pdf, image/jpeg, image/png], size ≤ MAX_UPLOAD_SIZE_MB (default 10 MB) | MUST |
| REQ-UPL-003 | Validate caseId exists; return 404 if not | MUST |
| REQ-UPL-004 | Validate documentTypeId exists and isActive; return 400 if not | MUST |
| REQ-UPL-005 | Upload file buffer to GCS via GcsService using path from StoragePathService | MUST |
| REQ-UPL-006 | Create Document record: mortgageCaseId, documentTypeId, documentStatus=UPLOADED, uploadedById (from JWT), originalName, mimeType, sizeBytes, storagePath, fileUrl (gs://) | MUST |
| REQ-UPL-007 | Return 201 `{ data: Document }` with documentType, documentStatus, uploadedBy relations | MUST |
| REQ-UPL-008 | Require valid JWT; return 401 if missing/invalid/expired | MUST |

### API Contract

| Property | Value |
|----------|-------|
| Method | POST |
| Path | `/mortgage-cases/:caseId/documents/upload` |
| Auth | Bearer JWT |
| Content-Type | multipart/form-data |
| Fields | `file` (binary, required), `documentTypeId` (number, required) |
| Success | 201 `{ data: Document }` |
| Errors | 400, 401, 404, 413, 502 |

### Error Matrix

| Status | Condition | `message` |
|--------|-----------|-----------|
| 400 | No file attached | `"File is required"` |
| 400 | MIME not in [application/pdf, image/jpeg, image/png] | `"File type not allowed. Allowed: application/pdf, image/jpeg, image/png"` |
| 400 | File is 0 bytes | `"File is empty"` |
| 400 | documentTypeId not a number | `"documentTypeId must be a number"` |
| 400 | Document type not found | `"Document type not found"` |
| 400 | Document type inactive | `"Document type is not active"` |
| 401 | Missing/invalid/expired JWT | `"Unauthorized"` |
| 404 | Mortgage case not found | `"Mortgage case not found"` |
| 413 | File exceeds MAX_UPLOAD_SIZE_MB | `"File exceeds maximum size of XMB"` |
| 502 | GCS upload fails | `"File storage service unavailable"` |

### Scenarios

**Happy paths:**
- GIVEN authenticated advisor, existing case, active document type, AND valid PDF ≤10 MB → WHEN POST upload → THEN 201, file in GCS at `{caseId}/{code}/{filename}`, Document with mimeType=application/pdf, sizeBytes set, fileUrl=gs://bucket/path, storagePath set
- GIVEN same preconditions with image/jpeg → THEN 201, mimeType=image/jpeg
- GIVEN same with image/png → THEN 201, mimeType=image/png

**Edge cases / errors:**
- GIVEN request without file field → THEN 400 `"File is required"`
- GIVEN file with MIME text/html → THEN 400 `"File type not allowed..."`
- GIVEN file exceeding MAX_UPLOAD_SIZE_MB → THEN 413 `"File exceeds maximum size"`
- GIVEN empty file (0 bytes) → THEN 400 `"File is empty"`
- GIVEN documentTypeId pointing to inactive type → THEN 400 `"Document type is not active"`
- GIVEN documentTypeId not in catalog → THEN 400 `"Document type not found"`
- GIVEN non-existent caseId → THEN 404 `"Mortgage case not found"`
- GIVEN request without Authorization header → THEN 401 `"Unauthorized"`
- GIVEN expired JWT → THEN 401 `"Unauthorized"`
- GIVEN GCS unreachable → THEN 502 `"File storage service unavailable"`
- GIVEN duplicate filename in same case → THEN 201 (unique storagePath via UUID in buildPath)

**Security:**
- GIVEN upload proxied via Route Handler → THEN httpOnly JWT never reaches browser JS
- GIVEN upload complete → THEN bucket remains private, fileUrl uses `gs://` scheme, no public HTTP URL

## NEW: gcs-integration

GcsService wraps `@google-cloud/storage` Storage client. Uploads file buffers to private bucket at specified path with content type metadata. Returns stable `gs://` URIs. Bucket name from `GCS_BUCKET_NAME` env var.

### Requirements

| ID | Requirement | Strength |
|----|-----------|----------|
| REQ-GCS-001 | `uploadFile(buffer: Buffer, path: string, mimeType: string): Promise<string>` stores file in private GCS bucket at path with contentType set | MUST |
| REQ-GCS-002 | Returns `gs://{GCS_BUCKET_NAME}/{path}` URI on success | MUST |
| REQ-GCS-003 | Wraps GCS errors (connection refused, auth failure, bucket not found) into `StorageUploadException` | MUST |
| REQ-GCS-004 | Bucket name read from `GCS_BUCKET_NAME` environment variable via ConfigService | MUST |

### Scenarios

- GIVEN valid buffer, path, and mimeType → WHEN uploadFile called → THEN file stored in GCS bucket at path, returns `gs://{bucket}/{path}`
- GIVEN GCS service unreachable → WHEN uploadFile called → THEN throws StorageUploadException with cause
- GIVEN invalid GCS_BUCKET_NAME (bucket not found) → WHEN uploadFile called → THEN throws StorageUploadException

## MODIFIED: data-model

Extend Document Prisma model with `mimeType String?` and `sizeBytes Int?` nullable columns. Migration is non-destructive: existing records keep null values, metadata-only creates (HU-06) remain unaffected.

### Requirements

| ID | Requirement | Strength |
|----|-----------|----------|
| REQ-DM-007 | Document model includes `mimeType String?` field — MIME type of uploaded file (e.g. application/pdf) | MUST |
| REQ-DM-008 | Document model includes `sizeBytes Int?` field — file size in bytes | MUST |
| REQ-DM-009 | Migration `add_mime_type_and_size_bytes_to_document` adds columns as nullable; existing records survive without data loss | MUST |

### Scenarios

- GIVEN existing Document records (fileUrl=null, storagePath=null) → AFTER migration → THEN mimeType is null, sizeBytes is null, all other fields unchanged
- GIVEN file uploaded via HU-07 endpoint → WHEN Document created → THEN mimeType and sizeBytes populated from multer's file.mimetype and file.size
- GIVEN metadata-only create via existing POST /mortgage-cases/:caseId/documents (JSON body) → WHEN Document created → THEN mimeType remains null, sizeBytes remains null

## NEW: frontend-upload

Next.js Route Handler at `apps/web/app/api/mortgage-cases/[id]/documents/upload/route.ts` proxies multipart FormData from browser to NestJS. Reads JWT from httpOnly cookie, forwards as Bearer token. Client component DocumentUpload renders file input + document type selector. DocumentList displays uploaded documents in case detail page.

### Requirements

| ID | Requirement | Strength |
|----|-----------|----------|
| REQ-FE-001 | Route Handler `POST apps/web/app/api/mortgage-cases/[id]/documents/upload/route.ts` receives multipart FormData from browser, forwards to NestJS `POST /mortgage-cases/:caseId/documents/upload` | MUST |
| REQ-FE-002 | Route Handler reads JWT from httpOnly cookie (`req.cookies.get('access_token')`), sets `Authorization: Bearer <token>` header on forwarded request | MUST |
| REQ-FE-003 | DocumentUpload client component renders `<input type="file" accept=".pdf,image/jpeg,image/png">` and `<select>` with document types fetched from API | MUST |
| REQ-FE-004 | DocumentUpload builds FormData with `file` and `documentTypeId`, POSTs to Route Handler, handles response (success/error) | MUST |
| REQ-FE-005 | DocumentList displays per document: document type name, original filename, upload date (formatted), status badge | MUST |
| REQ-FE-006 | Both components integrated in mortgage case detail page at `apps/web/app/dashboard/expedientes/[id]/page.tsx` | MUST |

### Scenarios

- GIVEN authenticated user selects file + document type → WHEN submits → THEN Route Handler proxies FormData to NestJS, returns NestJS response to browser, httpOnly JWT never exposed to client JS
- GIVEN upload in progress → THEN submit button disabled, loading indicator visible
- GIVEN NestJS returns error (400/401/404/413/502) → THEN error message displayed in DocumentUpload
- GIVEN case has uploaded documents → WHEN detail page renders → THEN DocumentList shows table with document type name, original filename, upload date, status badge per document
- GIVEN case has no documents → THEN DocumentList shows "No documents uploaded" empty state
- GIVEN file input rendered → THEN accept attribute restricts to .pdf, image/jpeg, image/png
