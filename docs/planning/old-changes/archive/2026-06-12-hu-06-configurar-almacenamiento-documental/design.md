# Technical Design: HU-06 — Configurar almacenamiento documental

## Overview
Complete technical design for HU-06 — converting DocumentType from PostgreSQL enum to catalog table, adding DocumentStatus pipeline, creating DocumentsModule NestJS module with metadata-only CRUD, and preparing StoragePathService for HU-07.

## Why
The Document model in Prisma uses a native PostgreSQL enum for types (inconsistent with CreditType/CaseStatus catalog pattern) and lacks a processing status pipeline. HU-06 prepares the infrastructure (schema, module, tests, paths) so HU-07 can implement real file uploads.

## Where
- `apps/api/prisma/schema.prisma` — Remove enum DocumentType, add DocumentType/DocumentStatus catalog models, modify Document model (fileUrl→nullable, storagePath, updatedAt, FK relations)
- `apps/api/src/documents/` — New module: module, controller, service, DTOs, storage-path.service, 4 spec files
- `apps/api/src/catalogs/catalogs.service.ts` — Add getDocumentTypes(), getDocumentStatuses()
- `apps/api/src/catalogs/catalogs.controller.ts` — Add GET /document-types, GET /document-statuses
- `apps/api/src/app.module.ts` — Add DocumentsModule to imports
- `apps/api/prisma/seed.ts` — Add DOCUMENT_TYPES (5) and DOCUMENT_STATUSES (5) with upsert loops
- `apps/api/.env` — Add commented GCS variables
- `apps/api/src/catalogs/catalogs.service.spec.ts` — Add tests for new catalog methods
- `apps/api/src/catalogs/catalogs.controller.spec.ts` — Add tests for new catalog endpoints

## Key Decisions

1. **Migration is safe (zero documents in DB)** — can be destructive single migration
2. **No code imports DocumentType enum** — only generated files reference it, so zero code breaks after migration
3. **Document catalog endpoints go in existing CatalogsController** — matches CreditType/CaseStatus pattern
4. **Controller response for findAllByCase wraps in `{ data }` envelope** — findOneByCase returns the document directly (consistent with MortgageCasesService.findOne)
5. **DocumentsModule exports both DocumentsService and StoragePathService** — for HU-07 consumption
6. **fileUrl starts null on creation** — metadata-first flow; HU-07 sets it later
7. **Initial document status auto-assigned to UPLOADED** — resolved by code lookup
8. **Tests follow existing mock pattern** — Test.createTestingModule with useValue for PrismaService

## Module Structure

```
apps/api/src/documents/
├── documents.module.ts
├── documents.controller.ts
├── documents.controller.spec.ts
├── documents.service.ts
├── documents.service.spec.ts
├── storage-path.service.ts
├── storage-path.service.spec.ts
├── dto/
│   ├── create-document.dto.ts
│   ├── create-document.dto.spec.ts
│   └── query-document.dto.ts
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /document-types | JWT | List active document types |
| GET | /document-statuses | JWT | List document statuses ordered |
| POST | /mortgage-cases/:caseId/documents | JWT | Register document metadata |
| GET | /mortgage-cases/:caseId/documents | JWT | List documents for case |
| GET | /mortgage-cases/:caseId/documents/:documentId | JWT | Get single document detail |

## Data Flow

### Create Document Metadata
1. Controller receives `POST /mortgage-cases/:caseId/documents` with `{ documentTypeId, originalName }`
2. Service validates case exists (404 if not)
3. Service validates documentType exists and is active (400 if not)
4. Service resolves `UPLOADED` status by code lookup
5. Service sets `uploadedById` from JWT user id
6. Service creates Document record with `fileUrl: null`
7. Returns `{ data: Document }` with relations

### List Documents
1. Controller receives `GET /mortgage-cases/:caseId/documents`
2. Service queries Prisma with `where: { mortgageCaseId: caseId }`
3. Includes `documentType`, `documentStatus`, `uploadedBy`
4. Returns `{ data: Document[] }`

### Get Single Document
1. Controller receives `GET /mortgage-cases/:caseId/documents/:documentId`
2. Service queries with `where: { id: documentId, mortgageCaseId: caseId }` — scoped lookup
3. Returns `{ data: Document }` or 404

## Dependencies

- **PrismaModule** — provides PrismaService
- **JwtAuthGuard** — from Auth module
- **CatalogsModule** — already has CreditType/CaseStatus pattern

## Test Strategy

| Layer | Files | Count | Pattern |
|-------|-------|-------|---------|
| Unit — DTO | create-document.dto.spec.ts | 7 cases | class-validator decorators |
| Unit — DTO | query-document.dto.spec.ts | 4 cases | optional pagination |
| Unit — Service | storage-path.service.spec.ts | 6 cases | pure function |
| Unit — Service | documents.service.spec.ts | 10 cases | mocked PrismaService |
| Unit — Controller | documents.controller.spec.ts | 6 cases | mocked service |
| Unit — Service | catalogs.service.spec.ts (ext) | 4 new cases | mocked PrismaService |
| Unit — Controller | catalogs.controller.spec.ts (ext) | 4 new cases | mocked service |

Total: 41 new tests

## Rollback

1. Revert schema.prisma
2. Drop migration and recreate enum
3. Remove documents module from app.module.ts
4. Revert seed.ts
5. Regenerate Prisma Client
