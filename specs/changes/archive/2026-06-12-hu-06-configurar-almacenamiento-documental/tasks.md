# Task Breakdown: HU-06 — Configurar almacenamiento documental

### A. Prisma Schema & Migration
- [x] A1: Modify schema.prisma — remove enum DocumentType, add DocumentType/DocumentStatus models, modify Document (fileUrl→nullable, add storagePath?, add updatedAt, FK relations)
  - Files: apps/api/prisma/schema.prisma (M)
  - Depends on: none
  - Acceptance: Schema validates with `npx prisma validate`, no syntax errors
  - Estimated effort: M

- [x] A2: Run Prisma migration
  - Files: apps/api/prisma/migrations/ (C)
  - Depends on: A1
  - Acceptance: `npx prisma migrate dev --name hu06_document_storage` succeeds, migration file created
  - Estimated effort: S

- [x] A3: Verify Prisma Client regeneration
  - Files: apps/api/src/generated/prisma/ (auto-generated)
  - Depends on: A2
  - Acceptance: Generated client includes DocumentType, DocumentStatus models; Document model has documentTypeId, documentStatusId, storagePath, updatedAt
  - Estimated effort: S

### B. Seeds
- [x] B1: Add DocumentType seeds to seed.ts (5 types: PAYROLL_RECEIPT, BANK_STATEMENT, CREDIT_BUREAU_REPORT, INE, PROOF_OF_ADDRESS)
  - Files: apps/api/prisma/seed.ts (M)
  - Depends on: A3
  - Acceptance: Upsert loop follows existing pattern, seeds 5 document types with isActive flags
  - Estimated effort: S

- [x] B2: Add DocumentStatus seeds to seed.ts (5 statuses: UPLOADED, PENDING_REVIEW, PROCESSING, PROCESSED, ERROR with order)
  - Files: apps/api/prisma/seed.ts (M)
  - Depends on: A3
  - Acceptance: Upsert loop follows existing pattern, seeds 5 statuses with order values
  - Estimated effort: S

- [x] B3: Verify seeds run idempotently
  - Files: apps/api/prisma/seed.ts
  - Depends on: B1, B2
  - Acceptance: `npx prisma db seed` runs twice without errors, same data count
  - Estimated effort: S

### C. DTOs
- [x] C1: Create CreateDocumentDto with documentTypeId (IsInt, Min(1)) and originalName (IsString)
  - Files: apps/api/src/documents/dto/create-document.dto.ts (C)
  - Depends on: A3
  - Acceptance: DTO validates both fields, rejects missing/invalid values, uses class-validator decorators
  - Estimated effort: S

- [x] C2: Create QueryDocumentDto (optional pagination/filtering for future use, can be minimal)
  - Files: apps/api/src/documents/dto/query-document.dto.ts (C)
  - Depends on: A3
  - Acceptance: DTO file exists, follows QueryMortgageCaseDto pattern, exported from dto/index
  - Estimated effort: S

### D. Services
- [x] D1: Create StoragePathService — pure service with buildPath(caseId, documentTypeCode, filename)
  - Files: apps/api/src/documents/storage-path.service.ts (C), apps/api/src/documents/storage-path.service.spec.ts (C)
  - Depends on: A3
  - Acceptance: Returns "{caseId}/{documentTypeCode}/{filename}", no side effects, @Injectable(), unit tests pass
  - Estimated effort: S

- [x] D2: Create DocumentsService — CRUD metadata (create, findAllByCase, findOneByCase)
  - Files: apps/api/src/documents/documents.service.ts (C), apps/api/src/documents/documents.service.spec.ts (C)
  - Depends on: A3, C1
  - Acceptance: create() validates case exists (404), documentType active (400), auto-sets UPLOADED status; findAllByCase/findOneByCase return { data } envelope with relations
  - Estimated effort: M

- [x] D3: Extend CatalogsService — add getDocumentTypes() and getDocumentStatuses()
  - Files: apps/api/src/catalogs/catalogs.service.ts (M), apps/api/src/catalogs/catalogs.service.spec.ts (M)
  - Depends on: A3
  - Acceptance: getDocumentTypes filters isActive=true ordered by id; getDocumentStatuses ordered by order,id; tests added
  - Estimated effort: S

### E. Controllers
- [x] E1: Create DocumentsController — POST/GET/GET for case documents
  - Files: apps/api/src/documents/documents.controller.ts (C), apps/api/src/documents/documents.controller.spec.ts (C)
  - Depends on: D2, C1
  - Acceptance: POST /mortgage-cases/:caseId/documents, GET /mortgage-cases/:caseId/documents, GET /mortgage-cases/:caseId/documents/:documentId; @UseGuards(JwtAuthGuard) at class level; { data } envelope
  - Estimated effort: M

- [x] E2: Extend CatalogsController — add GET /document-types and GET /document-statuses
  - Files: apps/api/src/catalogs/catalogs.controller.ts (M), apps/api/src/catalogs/catalogs.controller.spec.ts (M)
  - Depends on: D3
  - Acceptance: Both endpoints return { data: [...] }, follow existing pattern, tests added
  - Estimated effort: S

### F. Module Wiring
- [x] F1: Create DocumentsModule — imports PrismaModule, provides DocumentsService + StoragePathService, exports both
  - Files: apps/api/src/documents/documents.module.ts (C)
  - Depends on: D1, D2, E1
  - Acceptance: Module declares controllers, providers, imports PrismaModule, exports DocumentsService and StoragePathService
  - Estimated effort: S

- [x] F2: Register DocumentsModule in AppModule
  - Files: apps/api/src/app.module.ts (M)
  - Depends on: F1
  - Acceptance: DocumentsModule imported in AppModule, app compiles without errors
  - Estimated effort: S

### G. Tests
- [x] G1: storage-path.service.spec.ts — test buildPath with standard paths, spaces, determinism
  - Files: apps/api/src/documents/storage-path.service.spec.ts (C)
  - Depends on: D1
  - Acceptance: All 3 scenarios from spec pass, pure function verified
  - Estimated effort: S

- [x] G2: create-document.dto.spec.ts — test validation (required fields, types, min values)
  - Files: apps/api/src/documents/dto/create-document.dto.spec.ts (C)
  - Depends on: C1
  - Acceptance: Validates documentTypeId is int >= 1, originalName is string, rejects empty/invalid
  - Estimated effort: S

- [x] G3: documents.service.spec.ts — test create with validations, findAllByCase, findOneByCase
  - Files: apps/api/src/documents/documents.service.spec.ts (C)
  - Depends on: D2
  - Acceptance: Mocked PrismaService tests cover 404 case not found, 400 inactive type, happy path creation with UPLOADED status, list and get with relations
  - Estimated effort: M

- [x] G4: documents.controller.spec.ts — test all endpoints, JwtAuthGuard, { data } envelope
  - Files: apps/api/src/documents/documents.controller.spec.ts (C)
  - Depends on: E1
  - Acceptance: Controller defined, JwtAuthGuard at class level, all endpoints return { data }, mocked service calls verified
  - Estimated effort: M

- [x] G5: Extend catalogs.service.spec.ts — add tests for getDocumentTypes, getDocumentStatuses
  - Files: apps/api/src/catalogs/catalogs.service.spec.ts (M)
  - Depends on: D3
  - Acceptance: New describe blocks for both methods, mock calls verified with correct query params
  - Estimated effort: S

- [x] G6: Extend catalogs.controller.spec.ts — add tests for document-types, document-statuses endpoints
  - Files: apps/api/src/catalogs/catalogs.controller.spec.ts (M)
  - Depends on: E2
  - Acceptance: New describe blocks, { data } envelope verified, service calls verified
  - Estimated effort: S

### H. Environment
- [x] H1: Add GCS env vars to .env (commented out, ready for HU-07)
  - Files: apps/api/.env (M)
  - Depends on: none (can run in parallel with everything)
  - Acceptance: GCS_PROJECT_ID, GCS_BUCKET_NAME, GCS_KEY_FILE variables present but commented
  - Estimated effort: S

### Parallelism Summary
- **Wave 1 (parallel)**: A1, H1
- **Wave 2**: A2 (after A1)
- **Wave 3**: A3 (after A2)
- **Wave 4 (parallel)**: B1, B2, C1, C2, D1, D3
- **Wave 5 (parallel)**: B3 (after B1,B2), D2 (after C1,A3)
- **Wave 6 (parallel)**: E1 (after D2,C1), E2 (after D3)
- **Wave 7**: F1 (after D1,D2,E1)
- **Wave 8**: F2 (after F1)
- **Wave 9 (parallel)**: G1 (after D1), G2 (after C1), G3 (after D2), G4 (after E1), G5 (after D3), G6 (after E2)

### Total Effort
- Small (S): 14 tasks
- Medium (M): 5 tasks
- Large (L): 0 tasks
- Status: ALL 21/21 COMPLETE
