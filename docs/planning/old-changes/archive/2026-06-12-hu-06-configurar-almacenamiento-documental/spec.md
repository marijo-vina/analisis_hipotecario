# Delta Spec: HU-06 — Configurar almacenamiento documental

## NEW: document-catalogs

Read-only catalog endpoints for DocumentType and DocumentStatus, following CreditType/CaseStatus pattern.

| Req ID | Requirement | Strength |
|--------|------------|----------|
| REQ-DCT-001 | `GET /document-types` returns active document types only (`isActive: true`) | MUST |
| REQ-DCT-002 | `GET /document-statuses` returns all statuses ordered by `order ASC`, then `id ASC` | MUST |
| REQ-DCT-003 | Both endpoints require JWT authentication via `@UseGuards(JwtAuthGuard)` | MUST |
| REQ-DCT-004 | Response envelope is `{ data: [...] }` — consistent with credit-types/case-statuses | MUST |

### Scenarios

**List active document types**
- GIVEN DB has types [{ code: "PAYROLL_RECEIPT", isActive: true }, { code: "OLD_FORMAT", isActive: false }]
- WHEN `GET /document-types`
- THEN returns `{ data: [{ code: "PAYROLL_RECEIPT", ... }] }` — excludes inactive

**List document statuses in pipeline order**
- GIVEN statuses [{ code: "UPLOADED", order: 1 }, { code: "ERROR", order: 5 }]
- WHEN `GET /document-statuses`
- THEN returns `{ data: [...] }` sorted by order ascending

**Empty catalog returns empty array**
- GIVEN no document types seeded
- WHEN `GET /document-types`
- THEN returns `{ data: [] }` with 200 OK

### API Contracts

`GET /document-types` — Auth: JWT → `200 { data: [{ id: number, code: string, name: string, isActive: boolean }] }`

`GET /document-statuses` — Auth: JWT → `200 { data: [{ id: number, code: string, name: string, order: number }] }`

## NEW: document-metadata

CRUD for Document metadata records. **Metadata only** — no file upload, no multipart. `fileUrl` starts null; HU-07 sets it later. New records auto-assigned status `UPLOADED`.

| Req ID | Requirement | Strength |
|--------|------------|----------|
| REQ-DOC-001 | `POST /mortgage-cases/:caseId/documents` registers metadata with `{ documentTypeId, originalName }` | MUST |
| REQ-DOC-002 | `GET /mortgage-cases/:caseId/documents` lists all documents for a case | MUST |
| REQ-DOC-003 | `GET /mortgage-cases/:caseId/documents/:documentId` returns single document with relations | MUST |
| REQ-DOC-004 | POST body MUST contain only `documentTypeId: number` and `originalName: string` | MUST |
| REQ-DOC-005 | POST auto-sets `documentStatusId` to `UPLOADED` status, `uploadedById` from JWT user | MUST |
| REQ-DOC-006 | POST validates case exists (404 if not), documentTypeId is valid+active (400 if not) | MUST |
| REQ-DOC-007 | `fileUrl` field is null on creation — no file is accepted or stored | MUST |
| REQ-DOC-008 | All endpoints JWT-protected | MUST |

### Scenarios

**Register document metadata (happy path)**
- GIVEN case "c1" exists and documentTypeId 1 is active PAYROLL_RECEIPT
- WHEN `POST /mortgage-cases/c1/documents` body `{ documentTypeId: 1, originalName: "nomina_ene.pdf" }`
- THEN 201 with `{ data: { id: "uuid", status.code: "UPLOADED", fileUrl: null, uploadedBy: {...}, ... } }`

**Register with invalid documentTypeId**
- GIVEN documentTypeId 999 does not exist
- WHEN `POST /mortgage-cases/c1/documents` body `{ documentTypeId: 999, originalName: "x" }`
- THEN 400 — "Document type not found"

**Register with inactive document type**
- GIVEN documentTypeId 2 is inactive
- WHEN POST with `{ documentTypeId: 2, originalName: "x" }`
- THEN 400 — "Document type is not active"

**Register for non-existent case**
- GIVEN case "nonexistent" does not exist
- WHEN `POST /mortgage-cases/nonexistent/documents`
- THEN 404 — "Mortgage case not found"

**Missing required fields**
- GIVEN body `{ }` (no documentTypeId, no originalName)
- WHEN POST is called
- THEN 400 — validation errors for both fields

**List documents for case (empty)**
- GIVEN case "c1" has no documents
- WHEN `GET /mortgage-cases/c1/documents`
- THEN `{ data: [] }` with 200

**List documents for case (with records)**
- GIVEN case "c1" has 2 documents
- WHEN `GET /mortgage-cases/c1/documents`
- THEN `{ data: [{ id, documentType, documentStatus, originalName, fileUrl, createdAt }, ...] }`

**Get single document**
- GIVEN doc "d1" exists under case "c1"
- WHEN `GET /mortgage-cases/c1/documents/d1`
- THEN returns document with documentType, documentStatus, uploadedBy includes

**Get document not found**
- GIVEN doc "d999" does not exist
- WHEN `GET /mortgage-cases/c1/documents/d999`
- THEN 404 — "Document not found"

**Get document belonging to different case**
- GIVEN doc "d1" belongs to case "c2"
- WHEN `GET /mortgage-cases/c1/documents/d1`
- THEN 404 — scoped lookup by caseId + documentId

### API Contracts

`POST /mortgage-cases/:caseId/documents` — Auth: JWT — Body: `{ documentTypeId: number, originalName: string }` — 201 `{ data: Document }` — 400 | 404

`GET /mortgage-cases/:caseId/documents` — Auth: JWT — 200 `{ data: Document[] }`

`GET /mortgage-cases/:caseId/documents/:documentId` — Auth: JWT — 200 `{ data: Document }` — 404

## NEW: storage-path-builder

Pure injectable service — zero side effects. Generates GCS-compatible object paths. No HTTP endpoints; internal service consumed by HU-07.

| Req ID | Requirement | Strength |
|--------|------------|----------|
| REQ-STP-001 | `buildPath(caseId, documentTypeCode, filename): string` returns `{caseId}/{documentTypeCode}/{filename}` | MUST |
| REQ-STP-002 | Pure function — no DB calls, no HTTP, no filesystem, no side effects | MUST |
| REQ-STP-003 | `@Injectable()` so it can be injected into other NestJS services | MUST |

### Scenarios

**Build standard path**
- GIVEN caseId "abc-123", code "PAYROLL_RECEIPT", filename "nomina.pdf"
- WHEN `buildPath("abc-123", "PAYROLL_RECEIPT", "nomina.pdf")`
- THEN returns `"abc-123/PAYROLL_RECEIPT/nomina.pdf"`

**Filename with spaces**
- GIVEN filename "foto frente.jpg"
- WHEN `buildPath("abc-123", "INE", "foto frente.jpg")`
- THEN returns `"abc-123/INE/foto frente.jpg"` — spaces preserved (GCS handles them)

**Deterministic output**
- GIVEN same inputs called 3 times
- WHEN `buildPath` is called each time
- THEN returns identical string every time (no randomness, no timestamps)

## MODIFIED: data-model

| Req ID | Requirement | Strength |
|--------|------------|----------|
| REQ-DM-001 | Document uses `documentTypeId Int` (FK → DocumentType) — replaces native `documentType` enum | MUST |
| REQ-DM-002 | Document adds `documentStatusId Int` (FK → DocumentStatus) | MUST |
| REQ-DM-003 | Document adds `updatedAt DateTime @updatedAt` | MUST |
| REQ-DM-004 | New `DocumentType` table: `id Int @id @default(autoincrement())`, `code String @unique`, `name String`, `isActive Boolean @default(true)` | MUST |
| REQ-DM-005 | New `DocumentStatus` table: `id Int @id @default(autoincrement())`, `code String @unique`, `name String`, `order Int @default(0)` | MUST |
| REQ-DM-006 | Native `enum DocumentType` removed from Prisma schema | MUST |

## MODIFIED: api-contracts

| Req ID | Requirement | Strength |
|--------|------------|----------|
| REQ-API-001 | `DocumentsModule` registered in `AppModule.imports` | MUST |
| REQ-API-002 | Module exports `DocumentsService` and `StoragePathService` for HU-07 consumption | MUST |
| REQ-API-003 | Document responses include `documentType` and `documentStatus` relations when returning Document records | SHOULD |
