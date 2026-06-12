# Proposal: HU-06 — Configurar almacenamiento documental

## Intent
The Document model exists but uses a native PostgreSQL enum for document types and lacks processing status tracking. This change converts types to a catalog table (consistent with CreditType/CaseStatus), adds a DocumentStatus pipeline, creates the NestJS documents module, and prepares GCS infrastructure so HU-07 can implement real file uploads.

## Scope

### In Scope
- Convert DocumentType from enum to catalog table (5 seeds)
- Create DocumentStatus catalog table (5 seeds: UPLOADED → ERROR)
- Add `updatedAt`, `documentTypeId`, `documentStatusId` to Document model
- Create `documents` NestJS module (controller, service, DTOs, tests)
- Create `StoragePathService` for GCS path generation
- Add GCS environment variables
- Expose catalog endpoints: GET /document-types, GET /document-statuses
- Update seeds and Prisma schema

### Out of Scope
- File upload implementation (HU-07)
- OCR, Document AI, Gemini integration
- Data extraction or automatic case status changes
- Frontend upload UI

## Capabilities

### New Capabilities
- `document-management`: NestJS module with CRUD metadata endpoints, DTOs, and tests
- `document-catalogs`: DocumentType and DocumentStatus tables with seeded data
- `storage-path-builder`: Pure service generating `{caseId}/{documentTypeCode}/{filename}` paths

### Modified Capabilities
- `data-model`: Document entity gains `updatedAt`, FKs to DocumentType and DocumentStatus
- `api-contracts`: Document endpoints updated to use catalog relations instead of enum

## Approach

**Catalog tables over enums**: Consistent with CreditType/CaseStatus pattern. Extensible without migrations, supports frontend dropdowns, and allows metadata like `isActive` and `order`.

**Module structure**: Independent `DocumentsModule` (following Auth/Clients/Catalogs pattern) under `apps/api/src/documents/`. Reuses `PrismaModule`. Exports `DocumentsService` and `StoragePathService` for HU-07.

**Storage path strategy**: Pure `StoragePathService` with zero side effects. Generates GCS-compatible paths. Real GCS integration is HU-07.

**API design**: RESTful endpoints under `DocumentsController`. Catalog endpoints aggregated in existing `CatalogsController` for consistency.

## Data Model Changes

| Model | Change |
|-------|--------|
| `DocumentType` | **New catalog table** — replaces enum. `id`, `code` (unique), `name`, `isActive` |
| `DocumentStatus` | **New catalog table** — `id`, `code` (unique), `name`, `order` |
| `Document` | Add `updatedAt` (DateTime @updatedAt), `documentTypeId` (Int FK), `documentStatusId` (Int FK) |
| `DocumentType` (enum) | **Removed** |

## API Contracts Preview

- `GET /document-types` — List all document types
- `GET /document-statuses` — List all document statuses
- `POST /mortgage-cases/:id/documents` — Register document metadata
- `GET /mortgage-cases/:id/documents` — List documents for a case
- `GET /documents/:id` — Get single document detail
- `DELETE /documents/:id` — Remove document metadata

## Dependencies

- **Depends on**: HU-03 (MortgageCase exists), HU-02 (Auth/JWT), existing catalog pattern (CreditType/CaseStatus)
- **Blocks**: HU-07 (File Upload) — HU-07 will consume `DocumentsService` and `StoragePathService`

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Enum-to-FK migration is destructive | Low | Zero documents in production; single migration with rollback SQL |
| Prisma Client regeneration breaks enum imports | Low | Update all `DocumentType` enum references to table model |
| Circular TypeScript references from inverse relations | Low | Use `Omit`/`Pick` in exported types if needed |

## Rollback Plan

1. Revert schema.prisma to previous state
2. Drop migration and recreate enum `DocumentType`
3. Remove `documents` module from `app.module.ts`
4. Revert seed.ts to remove document catalogs
5. Regenerate Prisma Client

## Success Criteria

- [x] Prisma migration succeeds with zero data loss
- [x] `DocumentType` and `DocumentStatus` tables seeded with 5 rows each
- [x] `GET /document-types` and `GET /document-statuses` return `{ data }` with 200 OK
- [x] `DocumentsModule` registered in `AppModule`
- [x] `StoragePathService` generates correct paths: `{caseId}/{code}/{filename}`
- [x] All new code has unit tests (TDD, spec.ts)
- [x] `npx prisma generate` succeeds without errors
