# Exploration: hu-07-ajustes-ux-validaciones

## Current State Summary

### 1. Document Module (`apps/api/src/documents/`, `apps/web/`)

**Document List (UI)**
- Rendered by `DocumentList` (`apps/web/app/ui/documents/document-list.tsx`), a server component inside `DocumentsClientSection` (`apps/web/app/ui/documents/documents-client-section.tsx`).
- Table shows: Tipo (documentType.name), Nombre original, Fecha de carga, Estado (documentStatus.name with color badge).
- **No "Ver" (View) button** — comment explicitly states: "NO download buttons, NO preview links, NO signed URLs (per HU-07 scope)."
- **No "Eliminar" (Delete) button** — no delete endpoint exists.

**Document Storage**
- GCS is fully configured: `GcsService` (`apps/api/src/documents/gcs.service.ts`) uses `@google-cloud/storage` with Application Default Credentials.
- Upload produces a `gs://` URI stored in `fileUrl`.
- **No signed URL generation** — `GcsService` only has `uploadFile()`. No method to generate temporary download/view URLs for secure document preview.
- `StoragePathService.buildPath()` returns `${caseId}/${documentTypeCode}/${filename}`.

**Document Model (Prisma)**
- Fields: `id`, `mortgageCaseId`, `documentTypeId`, `documentStatusId`, `fileUrl`, `storagePath`, `mimeType`, `sizeBytes`, `originalName`, `uploadedById`, `createdAt`, `updatedAt`.
- Status is a catalog: `DocumentStatus` table with codes (UPLOADED, PENDING_REVIEW, VALIDATED, REJECTED).
- **No `procesado` boolean field** — status is tracked via `documentStatusId` FK.

**Upload Flow (End-to-End)**
1. `DocumentUpload` client component → POST FormData to `/api/mortgage-cases/[id]/documents/upload`
2. Next.js Route Handler (`route.ts`) → reads JWT from cookie → forwards to NestJS
3. NestJS `DocumentsController.upload()` → `FileInterceptor` validates MIME types (PDF, JPEG, PNG) and max size
4. `DocumentsService.uploadAndCreate()` → validates case → validates doc type → validates file.size > 0 → builds storagePath → uploads to GCS → creates Document record

**API Endpoints (DocumentsController)**
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/mortgage-cases/:caseId/documents` | Create metadata-only |
| POST | `/mortgage-cases/:caseId/documents/upload` | Upload file + create record |
| GET | `/mortgage-cases/:caseId/documents` | List all documents for case |
| GET | `/mortgage-cases/:caseId/documents/:documentId` | Get single document detail |

**Tests**
- `documents.service.spec.ts` (462 lines): create, findAllByCase, findOneByCase, uploadAndCreate — comprehensive coverage including edge cases.
- `documents.controller.spec.ts` (185 lines): controller delegation, JWT guard verification.
- `gcs.service.spec.ts` (97 lines): upload success/failure, BadGatewayException propagation.

---

### 2. Expediente (MortgageCase) Module (`apps/api/src/mortgage-cases/`, `apps/web/`)

**Detail Page** (`apps/web/app/dashboard/expedientes/[id]/page.tsx`)
- Renders a detail card with: Cliente, Asesor, Tipo de crédito, Estado (StatusBadge), Tipo de persona, Ubicación, Monto solicitado, Valor propiedad, Plazo estimado, Notas, Creado.
- Includes `CaseStatusDropdown` for status changes.
- Includes `DocumentsClientSection` with upload + document list.

**Enum Display Issue** — two instances of technical codes shown:
1. **Line 110**: `` {`${c.creditType.name} (${c.creditType.code})`} `` — shows e.g., "Mejora Hipoteca (MEJORA_HIPOTECA)".
2. **Lines 121-124**: `c.personType === "SALARIED" ? "Asalariado (SALARIED)"` — hardcoded display.
3. **`case-form.tsx` line 75**: `Tipo de persona: Asalariado (SALARIED)` — hardcoded display in creation form.

**Edit Functionality**
- **No general "Edit" button** for expediente fields (propertyLocation, requestedAmount, etc.).
- `PATCH /mortgage-cases/:id` exists but ONLY updates `statusCode` (via `UpdateMortgageCaseStatusDto`).
- `MortgageCasesService` only has `updateStatus()` — no general update method.
- No PUT endpoint exists.

**API Endpoints (MortgageCasesController)**
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/mortgage-cases` | Create case |
| GET | `/mortgage-cases` | List cases (paginated) |
| GET | `/mortgage-cases/:id` | Get detail |
| PATCH | `/mortgage-cases/:id` | Update status only |

**Tests**
- `mortgage-cases.service.spec.ts` (259 lines): create, findAll, findOne, updateStatus.
- `mortgage-cases.controller.spec.ts` (102 lines): controller delegation, JWT guard.

---

### 3. Cliente Module (`apps/api/src/clients/`, `apps/web/`)

**Creation Form** (`apps/web/app/ui/client-form.tsx`)
- Uses `useActionState` with `createClient` server action (`apps/web/app/actions/clients.ts`).
- Fields: Nombre*, Apellido paterno*, Apellido materno, RFC, CURP, Email*, Teléfono*.

**Validation**
- **RFC** (backend): regex `/^[A-Z&Ñ]{3,4}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[A-Z0-9]{3}$/`, message: "RFC debe tener un formato válido".
- **CURP** (backend): regex `/^[A-Z]{4}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[HM][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[A-Z0-9][0-9]$/`, message: "CURP debe tener un formato válido".
- **Phone** (backend): only `@IsString()` + `@IsNotEmpty()` — **no format/length validation**.
- **Phone** (frontend): only checks for non-empty string — no format or length validation.
- **Email**: `@IsEmail()` in backend, only non-empty check in frontend (NestJS validation catches format errors).

**Edit Functionality**
- `PATCH /clients/:id` EXISTS in backend → calls `ClientsService.update()` with full `UpdateClientDto`.
- `ClientsService.update()` regenerates fullName when name fields change.
- **No "Editar" button in UI** — client detail page is read-only.
- **No edit page exists** in frontend (`apps/web/app/dashboard/clientes/[id]/page.tsx` only shows detail).

**Detail Page** (`apps/web/app/dashboard/clientes/[id]/page.tsx`)
- Read-only display: RFC, CURP, Email, Teléfono, Registrado, Actualizado.
- "Volver al listado" link, no action buttons.

**API Endpoints (ClientsController)**
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/clients` | Create client |
| GET | `/clients` | List clients (paginated) |
| GET | `/clients/:id` | Get detail |
| PATCH | `/clients/:id` | Update client |

**Tests**
- `clients.service.spec.ts` (235 lines): create, update, findAll, error handling (ConflictException, NotFoundException).

---

### 4. Enum Display Pattern — Root Cause

**No shared enum-to-label utility exists.** The backend returns catalog entities with both `code` and `name` fields (CreditType, CaseStatus, DocumentType, DocumentStatus), but the frontend explicitly concatenates code in parentheses.

**Affected files:**
- `apps/web/app/dashboard/expedientes/[id]/page.tsx` lines 109-111 (creditType) and 121-124 (personType)
- `apps/web/app/ui/case-form.tsx` line 75 (personType)

**The data already has `name`:** The Prisma include returns `creditType: { code, name }` and `status: { code, name }`. The fix is simply removing the `(code)` concatenation and using only `name`.

---

### 5. Complete API Endpoint Inventory

| Module | Method | Path | Purpose |
|--------|--------|------|---------|
| Auth | POST | `/auth/login` | Login |
| Clients | POST | `/clients` | Create client |
| Clients | GET | `/clients` | List clients (paginated) |
| Clients | GET | `/clients/:id` | Get client detail |
| Clients | PATCH | `/clients/:id` | Update client |
| Catalogs | GET | `/credit-types` | Active credit types |
| Catalogs | GET | `/case-statuses` | All case statuses |
| Catalogs | GET | `/document-types` | Active document types |
| Catalogs | GET | `/document-statuses` | All document statuses |
| MortgageCases | POST | `/mortgage-cases` | Create case |
| MortgageCases | GET | `/mortgage-cases` | List cases (paginated) |
| MortgageCases | GET | `/mortgage-cases/:id` | Get case detail |
| MortgageCases | PATCH | `/mortgage-cases/:id` | Update case status |
| Documents | POST | `/mortgage-cases/:caseId/documents` | Create metadata-only |
| Documents | POST | `/mortgage-cases/:caseId/documents/upload` | Upload file + create |
| Documents | GET | `/mortgage-cases/:caseId/documents` | List documents |
| Documents | GET | `/mortgage-cases/:caseId/documents/:documentId` | Get document detail |

---

## Gaps Identified

### Documents
| Gap | Severity | Detail |
|-----|----------|--------|
| No document preview/view | High | Users cannot open uploaded documents. Need signed URL generation in GcsService + GET endpoint + "Ver" button in UI. |
| No document delete | Medium | No DELETE endpoint or "Eliminar" button. Risk of accumulating bad uploads with no cleanup path. |
| No signed URL in GcsService | High | `GcsService` only uploads. Must add `generateSignedUrl(storagePath)` using `file.getSignedUrl()`. |

### Expedientes
| Gap | Severity | Detail |
|-----|----------|--------|
| Enum codes shown in UI | Medium | CreditType code and PersonType code displayed with technical names. Remove parenthetical codes. |
| No general edit endpoint | Medium | Only status can be changed via PATCH. Cannot edit propertyLocation, requestedAmount, etc. |
| No "Editar" button | Low | No UI for editing expediente fields. |

### Clientes
| Gap | Severity | Detail |
|-----|----------|--------|
| No phone validation | Medium | Phone accepts any string. Add regex for MX phone (10 digits) or minimum length. |
| RFC/CURP only validated in backend | Low | Frontend shows backend errors but no client-side pre-validation. Regex in DTO is sufficient for now. |
| No "Editar" button | Medium | PATCH endpoint exists but UI has no edit form. Need edit page or modal. |
| No delete endpoint | Low | No DELETE for clients. |

---

## Files to Modify

### Backend (`apps/api/src/`)
| File | Change |
|------|--------|
| `documents/gcs.service.ts` | Add `generateSignedUrl(storagePath)` method using `@google-cloud/storage`'s `file.getSignedUrl()` |
| `documents/documents.service.ts` | Add `getSignedUrl(caseId, documentId)` and `delete(caseId, documentId)` methods |
| `documents/documents.controller.ts` | Add `GET .../documents/:documentId/view` and `DELETE .../documents/:documentId` endpoints |
| `clients/dto/create-client.dto.ts` | Add phone regex validation (`@Matches()`) |
| `clients/dto/update-client.dto.ts` | Inherits from CreateClientDto — will get phone validation automatically |
| `mortgage-cases/dto/update-mortgage-case.dto.ts` | **NEW** — general update DTO for expediente fields |
| `mortgage-cases/mortgage-cases.service.ts` | Add `update(caseId, dto)` method for general field updates |
| `mortgage-cases/mortgage-cases.controller.ts` | Add `PUT .../mortgage-cases/:id` or expand PATCH for general updates |

### Frontend (`apps/web/app/`)
| File | Change |
|------|--------|
| `dashboard/expedientes/[id]/page.tsx` | Remove technical codes from enum display (lines 109-111, 121-124); add "Ver" button to document rows |
| `ui/case-form.tsx` | Remove hardcoded "Asalariado (SALARIED)" → show "Asalariado" only |
| `ui/documents/document-list.tsx` | Add "Ver" (view) and "Eliminar" (delete) action buttons per row |
| `ui/documents/document-upload.tsx` | Consider adding client-side file type validation message before upload |
| `dashboard/clientes/[id]/page.tsx` | Add "Editar" button → link to edit page |
| `dashboard/clientes/nuevo/page.tsx` | N/A already exists; may want to reuse form for edit mode |
| `actions/clients.ts` | Add phone client-side validation; add `updateClient` server action |

---

## Files to Create

### Backend
| File | Purpose |
|------|---------|
| `apps/api/src/mortgage-cases/dto/update-mortgage-case.dto.ts` | DTO for updating expediente fields (propertyLocation, requestedAmount, propertyValue, estimatedTermMonths, notes, creditTypeId) |
| `apps/api/src/documents/dto/update-document.dto.ts` | **(optional)** DTO for updating document metadata (e.g., documentTypeId) |

### Frontend
| File | Purpose |
|------|---------|
| `apps/web/app/dashboard/clientes/[id]/editar/page.tsx` | Client edit page (reuses ClientForm or new edit form) |
| `apps/web/app/dashboard/expedientes/[id]/editar/page.tsx` | **(optional)** Expediente edit page |
| `apps/web/app/ui/client-edit-form.tsx` | **(optional)** Edit-specific form component if reuse of ClientForm is impractical |

---

## Risks & Considerations

### GCS Signed URL Security
- **Authentication**: The document view endpoint MUST be behind `JwtAuthGuard`. The signed URL approach means the NestJS backend generates a time-limited GCS URL, so the actual GCS request comes from the browser (not the backend).
- **URL Expiration**: Set signed URL expiration to 5-15 minutes. Shorter = more secure, longer = better UX.
- **GCS Service Account**: Ensure the service account has `storage.objects.get` permission on the bucket. Currently only `storage.objects.create` is used for upload. May need IAM update.
- **Alternative**: Instead of signed URLs, stream the file through NestJS (download from GCS → pipe to response). More secure (GCS never exposed to browser) but higher server load and latency. **Recommend signed URLs for this sprint.**

### Document Delete
- **Cascade considerations**: When deleting a document, should the GCS file also be deleted? Recommend: yes, delete both DB record and GCS file atomically (or GCS first, then DB).
- **Soft delete**: Consider soft delete (add `deletedAt` field) for audit trail instead of hard delete. For Sprint 1 hardening, a simple hard delete is acceptable.

### Phone Validation
- Mexican phone numbers: 10 digits (e.g., 5512345678). Recommend regex: `/^\d{10}$/`.
- Should accept optional country code? For MVP, 10 digits is standard.
- Ensure UX shows friendly message: "El teléfono debe tener 10 dígitos".

### Expediente Edit Scope
- The change description says "Edit button for expedientes" — but WHAT fields should be editable?
- Minimum viable: use existing form fields from creation form (creditTypeId, propertyLocation, requestedAmount, propertyValue, estimatedTermMonths, notes).
- Status change already exists via CaseStatusDropdown.
- Client change would be complex (re-parenting) — out of scope.

### Testing Impact
- New endpoints need controller tests for delegation and service tests for logic.
- GcsService signed URL test needs `file.getSignedUrl` mock.
- Document delete test needs `file.delete` mock for GCS cleanup.
- Client phone validation tests in DTO spec.

---

## Enum Display Fix — Root Cause and Proposed Fix

### Root Cause
The frontend explicitly concatenates `(code)` after the display name in two places:
1. **CreditType**: `{`${c.creditType.name} (${c.creditType.code})`}` in `expedientes/[id]/page.tsx:110`
2. **PersonType**: `"Asalariado (SALARIED)"` hardcoded strings in `expedientes/[id]/page.tsx:122` and `case-form.tsx:75`

### Proposed Fix
**Simply remove the `(code)` concatenation.** The backend already returns `name` (human-readable) alongside `code` (technical). The UI should display only `name`:

```tsx
// BEFORE:
value={`${c.creditType.name} (${c.creditType.code})`}

// AFTER:
value={c.creditType.name}
```

```tsx
// BEFORE:
c.personType === "SALARIED" ? "Asalariado (SALARIED)" : c.personType

// AFTER:
c.personType === "SALARIED" ? "Asalariado" : c.personType
```

No new utility needed — the catalog tables already provide the human-readable label via `name`. The Prisma enums (PersonType) need a manual mapping only because there's no catalog table for them (Prisma native enum). If PersonType expands in the future, convert it to a catalog table like CreditType/CaseStatus.

---

## Recommendation

This change is a **Sprint 1 hardening** — no architectural changes, no OCR. Tasks are well-scoped and independent per module.

**Priority order:**
1. **Enum display fix** (quick win, 2-line changes)
2. **Document view/delete** (most impactful UX gap — users can't see what they uploaded)
3. **Client phone validation** (data quality)
4. **Client "Editar" button + page** (backend endpoint already exists, just need UI)
5. **Expediente "Editar" (general fields)** (requires new DTO + service method + UI)

**Risk**: LOW — all changes are additive or minor modifications. No schema changes needed. No OCR introduced. GCS signed URL is the only new external API concern.

## Ready for Proposal
**Yes** — all modules explored, gaps identified, files mapped.
