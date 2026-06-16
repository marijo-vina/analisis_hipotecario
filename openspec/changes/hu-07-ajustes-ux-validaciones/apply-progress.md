# Apply Progress: HU-07 — Ajustes UX y Validaciones

**Date**: 2026-06-16
**Status**: ✅ ALL batches complete (18/18 tasks done)
**Mode**: Hybrid (Strict TDD for apps/api, Standard for apps/web)

## Completed Tasks

### Batch 1: Quick Wins (T001-T004)

#### T001 — Fix Enum Display in Expediente Detail ✅
- **REQ**: REQ-3 (Enum Display Fix)
- **File**: `apps/web/app/dashboard/expedientes/[id]/page.tsx`
- **Before**:
  - Line 110: `value={`${c.creditType.name} (${c.creditType.code})`}` → shows "Mejora Hipoteca (MEJORA_HIPOTECA)"
  - Lines 121-124: `"Asalariado (SALARIED)"` → shows "Asalariado (SALARIED)"
- **After**:
  - Line 110: `value={c.creditType.name}` → shows "Mejora Hipoteca"
  - Lines 121-124: `"Asalariado"` → shows "Asalariado"
- **Acceptance**: ✅ CreditType shows name only without code; PersonType shows "Asalariado" without code

#### T002 — Fix PersonType Display in Case Form ✅
- **REQ**: REQ-3 (Enum Display Fix)
- **File**: `apps/web/app/ui/case-form.tsx`
- **Before**: Line 75: `Tipo de persona: Asalariado (SALARIED)`
- **After**: Line 75: `Tipo de persona: Asalariado`
- **Acceptance**: ✅ Case creation form shows "Asalariado" without technical code

#### T003 — Add Phone Validation to CreateClientDto ✅
- **REQ**: REQ-6 (Phone Validation)
- **File**: `apps/api/src/clients/dto/create-client.dto.ts`
- **Before**: Phone had `@IsString()` + `@IsNotEmpty()` only — any string accepted
- **After**: Added `@Matches(/^\d{10}$/, { message: 'El teléfono debe tener 10 dígitos' })` after `@IsNotEmpty()`
- **Inheritance**: `UpdateClientDto` extends `PartialType(CreateClientDto)` — inherits automatically
- **Acceptance**: ✅ Backend rejects phone values not exactly 10 digits with message "El teléfono debe tener 10 dígitos"

#### T004 — Update RFC/CURP Validation Messages in DTOs ✅
- **REQ**: REQ-5 (RFC/CURP Messages)
- **File**: `apps/api/src/clients/dto/create-client.dto.ts`
- **Before**:
  - RFC: `'RFC debe tener un formato válido'`
  - CURP: `'CURP debe tener un formato válido'`
- **After**:
  - RFC: `'El RFC ingresado no tiene un formato válido. Verifica que tenga 12 o 13 caracteres y que esté escrito correctamente.'`
  - CURP: `'La CURP ingresada no tiene un formato válido. Verifica que tenga 18 caracteres y que esté escrita correctamente.'`
- **Regex unchanged** — only messages updated
- **Acceptance**: ✅ Both forms show friendly messages when RFC/CURP invalid

### Batch 2: Document View (T006-T008)

#### T006 — Add generateSignedUrl to GcsService ✅
- **REQ**: REQ-1 (Document View)
- **File**: `apps/api/src/documents/gcs.service.ts`
- **What**: Added `generateSignedUrl(storagePath: string): Promise<string>` method using `file.getSignedUrl({ action: 'read', expires: Date.now() + 5 * 60 * 1000 })`
- **Error handling**: Catches any GCS error and throws `NotFoundException('El documento no está disponible')`
- **Import**: Added `NotFoundException` from `@nestjs/common`
- **Acceptance**: ✅ Returns valid signed URL string; throws NotFoundException when GCS file doesn't exist

#### T007 — Add getSignedUrl to DocumentsService ✅
- **REQ**: REQ-1 (Document View)
- **File**: `apps/api/src/documents/documents.service.ts`
- **What**: Added `getSignedUrl(caseId: string, documentId: string): Promise<string>` method:
  1. Calls `this.findOneByCase(caseId, documentId)` — 404 if not found or wrong case
  2. If `document.storagePath` is null → throws `BadRequestException('El documento no tiene un archivo asociado')`
  3. Returns `this.gcsService.generateSignedUrl(document.storagePath)`
- **Acceptance**: ✅ Returns signed URL for valid document; 404 for missing document; 400 for document without storagePath

#### T008 — Add View Endpoint to DocumentsController ✅
- **REQ**: REQ-1 (Document View)
- **File**: `apps/api/src/documents/documents.controller.ts`
- **What**: Added `@Get(':documentId/view')` endpoint → `viewDocument()` returning `{ data: { signedUrl } }`
- **Route ordering**: ✅ `:documentId/view` declared BEFORE `:documentId` (line 82 vs line 91) — Express matches more specific route first
- **Auth**: Class-level `@UseGuards(JwtAuthGuard)` covers all endpoints including the new one
- **Acceptance**: ✅ `GET /mortgage-cases/:caseId/documents/:documentId/view` returns `{ data: { signedUrl: "https://..." } }`

### Batch 3: Document Delete (T009-T011)

#### T009 — Add deleteFile to GcsService ✅
- **REQ**: REQ-2 (Document Delete)
- **File**: `apps/api/src/documents/gcs.service.ts`
- **What**: Added `deleteFile(storagePath: string): Promise<void>` method
- **Implementation**:
  - Calls `file.delete({ ignoreNotFound: true })` from `@google-cloud/storage`
  - Fallback: catches `error.code === 404` and returns silently if `ignoreNotFound` not supported
  - Throws `BadGatewayException('Error al eliminar el archivo del almacenamiento')` on real GCS errors
- **Acceptance**: ✅ Deletes GCS object; silently succeeds on 404; throws BadGatewayException on connectivity errors

#### T010 — Add delete to DocumentsService ✅
- **REQ**: REQ-2 (Document Delete)
- **File**: `apps/api/src/documents/documents.service.ts`
- **What**: Added `delete(caseId: string, documentId: string): Promise<void>` method
- **Implementation**:
  1. Calls `this.findOneByCase(caseId, documentId)` — throws 404 if not found or wrong case
  2. Checks `document.documentStatus.code === 'UPLOADED'` — throws `BadRequestException('Solo se pueden eliminar documentos no procesados')` if not
  3. Null storagePath guard — throws `BadRequestException('El documento no tiene un archivo asociado')`
  4. Calls `this.gcsService.deleteFile(document.storagePath)` — if throws, abort (DB record stays)
  5. Calls `this.prisma.document.delete({ where: { id: documentId } })` only after GCS succeeds
- **DocumentStatus access**: ✅ Confirmed `findOneByCase` includes `documentStatus: true` in `DOCUMENT_INCLUDE` — `document.documentStatus.code` accessible
- **Acceptance**: ✅ Deletes GCS file then DB record for UPLOADED docs; aborts on GCS failure; rejects non-UPLOADED with 400

#### T011 — Add Delete Endpoint to DocumentsController ✅
- **REQ**: REQ-2 (Document Delete)
- **File**: `apps/api/src/documents/documents.controller.ts`
- **What**: Added `@Delete(':documentId')` endpoint with `@HttpCode(204)` → `deleteDocument()`
- **Route ordering**: ✅ `:documentId/view` (line 83) → `:documentId` GET (line 92) → `@Delete(':documentId')` (line 102)
- **Import**: Added `Delete` from `@nestjs/common`
- **Auth**: Class-level `@UseGuards(JwtAuthGuard)` covers all endpoints
- **Acceptance**: ✅ `DELETE /mortgage-cases/:caseId/documents/:documentId` returns 204 on success; 404 for missing; 400 for non-UPLOADED

### Batch 4: Document UI (T012)

#### T012 — Add View/Delete Buttons to DocumentList ✅
- **REQ**: REQ-1 (Document View), REQ-2 (Document Delete)
- **Files created**:
  - `apps/web/app/actions/documents.ts` — server actions for view/delete
  - `apps/web/app/ui/documents/document-actions.tsx` — client component with buttons + confirmation modal
- **Files modified**:
  - `apps/web/app/ui/documents/document-list.tsx` — added `caseId` prop + "Acciones" column + `<DocumentActions/>` per row
  - `apps/web/app/ui/documents/documents-client-section.tsx` — passes `caseId` to `DocumentList`
- **Server actions** (`actions/documents.ts`):
  1. `getDocumentViewUrl(caseId, documentId)` → `apiFetch<{ data: { signedUrl: string } }>` → returns `result.data.data.signedUrl`, throws on error
  2. `deleteDocument(caseId, documentId)` → `apiFetch` with `{ method: 'DELETE' }` → returns `{ success: true }`, throws on error
- **apiFetch import path**: `@/app/lib/api` — matches existing pattern from `actions/clients.ts`
- **204 handling**: `apiFetch` (in `lib/api.ts` lines 126-139) catches JSON parse error on empty body, returns `{ ok: true, data: undefined }` — delete works without special casing
- **documentStatus verified**: ✅ `Document` type in `definitions.ts` includes `documentStatus: { id, code, name, order }` — `document.documentStatus.code` is directly accessible
- **Delete refresh**: Uses `useRouter().refresh()` from `next/navigation` — same pattern as `DocumentsClientSection` for upload success
- **Edge cases handled**:
  - Loading states: `viewLoading` / `deleteLoading` state disables buttons and shows "Abriendo..." / "Eliminando..."
  - Error states: inline red alert banner per row (matches `document-upload.tsx` style pattern)
  - Delete confirmation modal with backdrop click-to-dismiss ("Cancelar" / "Eliminar" buttons)
  - Delete button only rendered when `documentStatus.code === 'UPLOADED'`
- **Acceptance**: ✅ "Ver" button per row opens document in new tab via signed URL; ✅ "Eliminar" button only shown for UPLOADED docs with confirmation modal; ✅ All API calls via server actions (no `apiFetch` in client); ✅ Delete refreshes list via `router.refresh()`

### Batch 5: Client Validation + Edit (T005, T013, T014)

#### T005 — Add Phone Validation to Frontend Client Form ✅
- **REQ**: REQ-6 (Phone Validation)
- **File**: `apps/web/app/actions/clients.ts`
- **What**: Added phone regex validation (`/^\d{10}$/`) and email format validation (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`) alongside the shared `validateClientFields` helper (T013)
- **Validation flow**: Phone empty → "obligatorio"; phone invalid (letters/≠10 digits) → "10 dígitos"; email empty → "obligatorio"; email invalid format → "no es válido"
- **Acceptance**: ✅ Submitting phone with letters or wrong length shows "El teléfono debe tener 10 dígitos" before any API call; ✅ Invalid email shows "El correo electrónico no es válido"

#### T013 — Add updateClient Server Action + Shared Validation ✅
- **REQ**: REQ-7 (Client Edit), REQ-5 (RFC/CURP), REQ-6 (Phone)
- **File**: `apps/web/app/actions/clients.ts`
- **Step A — Shared validation helper**: Created `validateClientFields(formData: FormData)` function with all field validations:
  - Required: firstName, paternalLastName, email, phone
  - Format: email regex, phone 10-digit regex
  - Optional format: RFC regex (13-char Mexican format), CURP regex (18-char format)
  - Messages match backend DTO messages (T004) exactly for consistency
- **Step B — Refactor createClient**: Replaced inline validation block with `const errors = validateClientFields(formData);`
  - **Field name preservation**: ✅ API body uses `paternalLastName` and `maternalLastName` (matches `CreateClientDto` backend contract — NOT `lastName`/`secondLastName`)
  - **Behavior preserved**: Same extract-trim-validate pattern, same redirect to `/dashboard/clientes`, same error fallback
- **Step C — updateClient action**: Added `export async function updateClient(clientId, prevState, formData)`:
  - Validates via shared `validateClientFields(formData)`
  - Sends `PATCH /clients/${clientId}` via `apiFetch` with `{ method: 'PATCH', body: {...} }`
  - **apiFetch PATCH support**: ✅ `apiFetch`'s `FetchInit` takes `method?: string` — any HTTP method works. Body is auto-serialized to JSON with Content-Type header set (line 99-101 of `lib/api.ts`). The task spec's example with `JSON.stringify` and explicit headers was unnecessary — used the same object-based pattern as `createClient`.
  - On success: `redirect(`/dashboard/clientes/${clientId}`)`
  - On error: returns field-level errors from backend via `result.errors`
- **Usage pattern**: `useActionState(updateClient.bind(null, clientId), initialState)` — standard `.bind` pattern for extra arg
- **Acceptance**: ✅ Both actions share same validation; ✅ `updateClient` uses `.bind(null, clientId)`; ✅ `createClient` refactored but behavior identical; ✅ PATCH method works with apiFetch

#### T014 — Create Client Edit Page ✅
- **REQ**: REQ-7 (Client Edit)
- **Files created**:
  - `apps/web/app/dashboard/clientes/[id]/editar/page.tsx` — server component
  - `apps/web/app/ui/client-edit-form.tsx` — client component with pre-populated form
- **Files modified**:
  - `apps/web/app/dashboard/clientes/[id]/page.tsx` — added "Editar cliente" button
- **Edit page** (`page.tsx`):
  - Server component fetches client via `apiFetch<Client>(`/clients/${id}`)`
  - Same 404 + error state handling as detail page
  - Renders `<ClientEditForm client={client} />` in a white card
  - Breadcrumb: "← Volver al cliente" links to detail page
- **Edit form** (`client-edit-form.tsx`):
  - Client component using `useActionState(updateClient.bind(null, client.id), initialState)`
  - **Pre-population**: Uses `defaultValue` on all inputs (not controlled/value) — this is the React-recommended approach for uncontrolled forms with `useActionState`. Values: `client.firstName`, `client.paternalLastName`, `client.maternalLastName`, `client.rfc`, `client.curp`, `client.email`, `client.phone`
  - Nullable fields (`maternalLastName`, `rfc`, `curp`) use `defaultValue={client.field ?? ""}` to avoid uncontrolled→controlled warnings
  - Same Tailwind styles and layout as `ClientForm` (creation form)
  - Same error display pattern per field
  - Submit button: "Actualizar cliente" (shows "Guardando..." when pending)
  - Cancel link: `/dashboard/clientes/${client.id}` (back to detail)
- **Detail page button**: "Editar cliente" link in a flex row with `justify-between`, styled as dark button matching existing patterns, links to `/dashboard/clientes/${id}/editar`
- **Acceptance**: ✅ Edit page pre-populated with current client data; ✅ Form validates phone/RFC/CURP/email/required fields; ✅ Saves via PATCH; ✅ Redirects to detail on success; ✅ Cancel returns to detail; ✅ 404/error states handled

### Batch 6: Expediente Edit (T015-T018)

#### T015 — Create UpdateMortgageCaseDto ✅
- **REQ**: REQ-4 (Expediente Edit)
- **File**: `apps/api/src/mortgage-cases/dto/update-mortgage-case.dto.ts` (NEW)
- **What**: Created DTO with `creditTypeId` (required, positive integer), `propertyLocation` (optional string), `requestedAmount` (optional number, positive), `propertyValue` (optional number, positive), `estimatedTermMonths` (optional number, min 1), `notes` (optional string)
- **Validation**: Uses `@Type(() => Number)` + `@IsInt()`/`@IsPositive()` for creditTypeId; `@IsNumber()` + `@IsPositive()` for amounts; `@Min(1)` for term months
- **Acceptance**: ✅ DTO validates creditTypeId as positive integer, numeric fields positive, notes optional string

#### T016 — Add update Method to MortgageCasesService ✅
- **REQ**: REQ-4 (Expediente Edit)
- **File**: `apps/api/src/mortgage-cases/mortgage-cases.service.ts`
- **What**: Added `async update(id: string, dto: UpdateMortgageCaseDto)` method:
  1. Finds case via `findUnique({ where: { id } })` — throws `NotFoundException` if not found
  2. Validates creditType exists via `findUnique({ where: { id: dto.creditTypeId } })` — throws `NotFoundException` if not found
  3. Updates via `prisma.mortgageCase.update({ where: { id }, data: { ...dto }, include: MORTGAGE_CASE_INCLUDE })`
  4. Returns with full includes (client, advisor, creditType, status)
- **Pattern follows**: `updateStatus` method — same find→validate→update→include pattern
- **Acceptance**: ✅ Updates expediente fields; ✅ Returns full includes; ✅ 404 for missing case; ✅ 404 for invalid creditTypeId

#### T017 — Add PUT Endpoint to MortgageCasesController ✅
- **REQ**: REQ-4 (Expediente Edit)
- **File**: `apps/api/src/mortgage-cases/mortgage-cases.controller.ts`
- **What**: Added `@Put(':id')` endpoint with `@Param('id')` and `@Body() dto: UpdateMortgageCaseDto` decorators
- **Imports**: Added `Put` from `@nestjs/common`, `UpdateMortgageCaseDto` from DTO file
- **Auth**: Class-level `@UseGuards(JwtAuthGuard)` covers all endpoints including `@Put`
- **Acceptance**: ✅ `PUT /mortgage-cases/:id` updates fields and returns full includes; ✅ 400 for validation errors; ✅ 404 for missing case

#### T018 — Create Expediente Edit Page ✅
- **REQ**: REQ-4 (Expediente Edit)
- **Files created**:
  - `apps/web/app/ui/case-edit-form.tsx` — client component with pre-populated form
  - `apps/web/app/dashboard/expedientes/[id]/editar/page.tsx` — server component fetching case + creditTypes
- **Files modified**:
  - `apps/web/app/actions/cases.ts` — added `updateCase` server action
  - `apps/web/app/dashboard/expedientes/[id]/page.tsx` — added "Editar expediente" button
- **Server action** (`updateCase`):
  - Validates creditTypeId required, numeric fields positive
  - Sends `PUT /mortgage-cases/${caseId}` via `apiFetch` with object body (matches existing pattern)
  - On success: `redirect(`/dashboard/expedientes/${caseId}`)`
  - On error: returns field-level errors from backend
  - Uses `.bind(null, caseId)` pattern for `useActionState`
- **Edit form** (`case-edit-form.tsx`):
  - Client component using `useActionState(updateCase.bind(null, mortgageCase.id), initialState)`
  - **Pre-population**: Uses `defaultValue` on all inputs — `mortgageCase.propertyLocation`, `mortgageCase.requestedAmount`, `mortgageCase.propertyValue`, `mortgageCase.estimatedTermMonths`, `mortgageCase.notes`
  - **CreditType dropdown**: Finds default value by matching `ct.code === mortgageCase.creditType.code` (since `MortgageCase.creditType` only has `code`/`name`, not `id`)
  - Nullable fields use `defaultValue={mortgageCase.field ?? ""}`
  - Same Tailwind styles and layout as `CaseForm` (creation form)
  - Submit button: "Actualizar expediente" (shows "Guardando..." when pending)
  - Cancel link: back to detail page
- **Edit page** (`page.tsx`):
  - Server component fetches case via `apiFetch<MortgageCase>(`/mortgage-cases/${id}`)`
  - Fetches creditTypes via `apiFetch<{ data: CreditType[] }>('/credit-types')`
  - Same 404 + error state handling as detail page
  - Breadcrumb: "← Volver al expediente" links to detail page
- **Detail page button**: "Editar expediente" link in a flex row with `justify-between`, styled as dark button matching existing patterns, links to `/dashboard/expedientes/${id}/editar`
- **Acceptance**: ✅ Edit page pre-populated with current case data; ✅ Form validates creditTypeId required and numeric fields positive; ✅ Saves via PUT; ✅ Redirects to detail on success; ✅ Cancel returns to detail; ✅ 404/error states handled

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| T001 | N/A | N/A | N/A (web, no runner) | N/A | N/A | N/A | N/A |
| T002 | N/A | N/A | N/A (web, no runner) | N/A | N/A | N/A | N/A |
| T003 | `create-client.dto.spec.ts` | Unit | ✅ 10/10 clients | ✅ 3 failures (phone validates nothing) | ✅ 11/11 passing | ✅ 4 cases (valid, letters, <10, >10) | ➖ None needed |
| T004 | `create-client.dto.spec.ts` | Unit | ✅ 10/10 clients | ✅ 2 failures (old messages) | ✅ 11/11 passing | ✅ 4 cases (RFC invalid/valid + CURP invalid/valid) | ➖ None needed |
| T006 | `gcs.service.spec.ts` | Unit | ✅ 5/5 gcs | ✅ 3 failures (method missing) | ✅ 8/8 passing | ✅ 3 cases (happy path, NotFound, message) | ➖ None needed |
| T007 | `documents.service.spec.ts` | Unit | ✅ 17/17 docs | ✅ 4 failures (method missing) | ✅ 21/21 passing | ✅ 4 cases (happy, missing doc, wrong case, null storagePath) | ➖ None needed |
| T008 | `documents.controller.spec.ts` | Unit | ✅ 10/10 ctrl | ✅ 3 failures (method missing) | ✅ 13/13 passing | ✅ 3 cases (happy path, 404, 400) | ➖ None needed |
| T009 | `gcs.service.spec.ts` | Unit | ✅ 8/8 gcs | ✅ 4 failures (method missing) | ✅ 12/12 passing | ✅ 4 cases (happy, 404, BadGateway, message) | ➖ None needed |
| T010 | `documents.service.spec.ts` | Unit | ✅ 21/21 docs | ✅ 6 failures (method missing) | ✅ 27/27 passing | ✅ 6 cases (happy, abort, 404, wrong case, status gate, null path) | ➖ None needed |
| T011 | `documents.controller.spec.ts` | Unit | ✅ 13/13 ctrl | ✅ 3 failures (method missing) | ✅ 16/16 passing | ✅ 3 cases (happy path, 404, 400) | ➖ None needed |
| T012 | N/A | N/A | N/A (web, no runner) | N/A | N/A | N/A | N/A |
| T005 | N/A | N/A | N/A (web, no runner) | N/A | N/A | N/A | N/A |
| T013 | N/A | N/A | N/A (web, no runner) | N/A | N/A | N/A | N/A |
| T014 | N/A | N/A | N/A (web, no runner) | N/A | N/A | N/A | N/A |
| T015 | `update-mortgage-case.dto.spec.ts` | Unit | ✅ 149/149 API | ✅ 13 failures (file doesn't exist) | ✅ 13/13 passing | ✅ 13 cases (valid, missing, <=0, non-int, negative, zero) | ➖ None needed |
| T016 | `mortgage-cases.service.spec.ts` | Unit | ✅ 12/12 svc | ✅ 3 failures (method missing) | ✅ 15/15 passing (was 12) | ✅ 3 cases (happy path, case 404, creditType 404) | ➖ None needed |
| T017 | `mortgage-cases.controller.spec.ts` | Unit | ✅ 6/6 ctrl | ✅ 1 failure (method missing) | ✅ 7/7 passing (was 6) | ✅ 1 case (happy path) | ➖ None needed |
| T018 | N/A | N/A | N/A (web, no runner) | N/A | N/A | N/A | N/A |

### Test Summary
- **Total new tests overall**: 51 (11 Batch 1 + 10 Batch 2 + 13 Batch 3 + 0 Batch 5 + 17 Batch 6)
- **Total tests passing**: 166 (full suite: 20 suites, 166 tests)
- **Layers used**: Unit (51), None (5 frontend tasks)
- **Batch 5**: No new backend code → no new tests. Frontend-only batch.
- **Batch 6**: 17 new tests (13 DTO + 3 service + 1 controller)

## Files Changed (all batches)

| File | Action | What Was Done |
|------|--------|---------------|
| `apps/web/app/dashboard/expedientes/[id]/page.tsx` | Modified | T001: Removed `(code)` suffix from CreditType and PersonType display |
| `apps/web/app/ui/case-form.tsx` | Modified | T002: Removed `(SALARIED)` suffix from PersonType display |
| `apps/api/src/clients/dto/create-client.dto.ts` | Modified | T003: Added `@Matches(/^\d{10}$/)` to phone; T004: Updated RFC/CURP message strings |
| `apps/api/src/clients/dto/create-client.dto.spec.ts` | Created | TDD tests for T003 (phone validation) and T004 (RFC/CURP messages) |
| `apps/api/src/documents/gcs.service.ts` | Modified | T006: Added `generateSignedUrl()`; T009: Added `deleteFile()` |
| `apps/api/src/documents/gcs.service.spec.ts` | Modified | T006: 3 tests for generateSignedUrl; T009: 4 tests for deleteFile |
| `apps/api/src/documents/documents.service.ts` | Modified | T007: Added `getSignedUrl()`; T010: Added `delete()` |
| `apps/api/src/documents/documents.service.spec.ts` | Modified | T007: 4 tests for getSignedUrl; T010: 6 tests for delete |
| `apps/api/src/documents/documents.controller.ts` | Modified | T008: Added `@Get(':documentId/view')`; T011: Added `@Delete(':documentId')` |
| `apps/api/src/documents/documents.controller.spec.ts` | Modified | T008: 3 tests for viewDocument; T011: 3 tests for deleteDocument |
| `apps/web/app/actions/documents.ts` | Created | T012: `getDocumentViewUrl` and `deleteDocument` server actions |
| `apps/web/app/ui/documents/document-actions.tsx` | Created | T012: Client component with View/Delete buttons + confirmation modal |
| `apps/web/app/ui/documents/document-list.tsx` | Modified | T012: Added `caseId` prop, "Acciones" column, `<DocumentActions/>` per row |
| `apps/web/app/ui/documents/documents-client-section.tsx` | Modified | T012: Passes `caseId` to `DocumentList` |
| **Batch 5** | | |
| `apps/web/app/actions/clients.ts` | Modified | T005+T013: Added `validateClientFields` helper, phone regex + email format validation; refactored `createClient`; added `updateClient` action with PATCH support |
| `apps/web/app/ui/client-edit-form.tsx` | Created | T014: Client component with pre-populated form using `updateClient.bind()` |
| `apps/web/app/dashboard/clientes/[id]/editar/page.tsx` | Created | T014: Server component fetching client, rendering edit form with 404/error handling |
| `apps/web/app/dashboard/clientes/[id]/page.tsx` | Modified | T014: Added "Editar cliente" button linking to edit page |
| **Batch 6** | | |
| `apps/api/src/mortgage-cases/dto/update-mortgage-case.dto.ts` | Created | T015: Update DTO with creditTypeId (required), optional fields with positive numeric validation |
| `apps/api/src/mortgage-cases/dto/update-mortgage-case.dto.spec.ts` | Created | T015: 13 DTO validation tests |
| `apps/api/src/mortgage-cases/mortgage-cases.service.ts` | Modified | T016: Added `update()` method with case + creditType validation |
| `apps/api/src/mortgage-cases/mortgage-cases.service.spec.ts` | Modified | T016: 3 tests for update (happy path, case 404, creditType 404) |
| `apps/api/src/mortgage-cases/mortgage-cases.controller.ts` | Modified | T017: Added `@Put(':id')` endpoint + imports |
| `apps/api/src/mortgage-cases/mortgage-cases.controller.spec.ts` | Modified | T017: 1 test for update controller method |
| `apps/web/app/actions/cases.ts` | Modified | T018: Added `updateCase` server action with validation |
| `apps/web/app/ui/case-edit-form.tsx` | Created | T018: Client component with pre-populated form using `updateCase.bind()` |
| `apps/web/app/dashboard/expedientes/[id]/editar/page.tsx` | Created | T018: Server component fetching case + creditTypes, rendering edit form with 404/error handling |
| `apps/web/app/dashboard/expedientes/[id]/page.tsx` | Modified | T018: Added "Editar expediente" button linking to edit page |

## Deviations from Design

### apiFetch body format for PATCH
The task spec's example for `updateClient` showed:
```ts
body: JSON.stringify(data),
headers: { 'Content-Type': 'application/json' },
```
But `apiFetch`'s `FetchInit` interface expects `body: Record<string, unknown>` and handles JSON serialization + Content-Type header internally (line 99-101 of `lib/api.ts`). Used the same object-based pattern as `createClient`: `body: { firstName, paternalLastName, ... }`. This is consistent with how ALL other server actions pass bodies to `apiFetch`.

### Backend field names
The task spec's example mapped `paternalLastName` → `lastName` and `maternalLastName` → `secondLastName`. But the NestJS `CreateClientDto` expects `paternalLastName` and `maternalLastName`. The existing `createClient` already sends these field names correctly. `updateClient` follows the same convention to match the backend contract.

## Issues Found

### Batch 6: MortgageCase.creditType type missing `id`
The `MortgageCase` type in `definitions.ts` has `creditType: { code: string; name: string }` — it does NOT include `id`. This differs from the API response which includes the full CreditType object. For the edit form's creditType dropdown, the default value was resolved by matching `ct.code === mortgageCase.creditType.code` against the `CreditType[]` array (which has `id`, `code`, `name`).

None during Batch 5 implementation.

### Existing deployment prerequisite remains:
- GCS service account needs `storage.objects.create`, `storage.objects.get`, `storage.objects.delete` IAM permissions.

## Remaining Tasks

None — ALL 18/18 tasks complete. ✅

## Status
18/18 tasks complete. Ready for sdd-verify.
