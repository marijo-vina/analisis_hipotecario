# Tasks: HU-07 — Ajustes UX y Validaciones

## Micro Technical Note

### Note 1: GCS Signed URL Generation

- Use `@google-cloud/storage`'s `file.getSignedUrl()` method on an existing bucket/file reference.
- Configuration: `action: 'read'`, `expires: Date.now() + 5 * 60 * 1000` (5 minutes).
- The `GcsService` already has `this.storage` and `this.bucketName` — create a `bucket.file(storagePath)` reference, then call `getSignedUrl()` on it.
- Endpoint: `GET /mortgage-cases/:caseId/documents/:documentId/view` behind `@UseGuards(JwtAuthGuard)` (the entire controller is already guarded).
- Frontend: `window.open(signedUrl, '_blank')` — no iframe, no embed.
- Error handling: if `file.getSignedUrl()` throws (file doesn't exist in GCS), catch and return user-friendly error `"El documento no está disponible"` — NOT a 500.
- **Deployment prerequisite**: The GCS service account needs `storage.objects.get` IAM permission. Currently only `storage.objects.create` is used for upload. This must be added before the view endpoint works in production.

### Note 2: GCS + DB Delete Atomicity

- **Strategy**: Delete GCS file FIRST, then DB record.
- If GCS delete fails → ABORT entirely, keep DB record, return error to user.
- If GCS delete succeeds but DB delete fails → GCS file is already gone; inform user to retry. The orphaned DB record is harmless — next delete attempt will succeed since `file.delete({ ignoreNotFound: true })` handles non-existent files gracefully. If the GCS client version doesn't support `ignoreNotFound`, catch `error.code === 404` and treat as success.
- Use `file.delete({ ignoreNotFound: true })` from `@google-cloud/storage`. Fallback: catch 404 error code manually if the option is not available.
- `DocumentsService.delete(caseId, documentId)` flow:
  1. Find document via `findOneByCase` (404 if not found or wrong case)
  2. Check `documentStatus.code === 'UPLOADED'` (400 if not)
  3. Call `gcsService.deleteFile(document.storagePath)`
  4. If GCS delete fails → throw, DB record stays
  5. If GCS delete succeeds → `this.prisma.document.delete({ where: { id } })`
  6. Return success
- Frontend: confirmation modal with "¿Estás segura de que deseas eliminar este documento?" + "Eliminar" / "Cancelar" buttons.
- Only show/enable delete button when `document.status.code === 'UPLOADED'`.

---

## Task Dependency Graph

```
T001 (REQ-3 Enum Fix) ──────────────────┐
T002 (REQ-3 Enum Fix) ──────────────────┤
                                         │
T003 (REQ-6 Phone DTO) ───────┐          │
T004 (REQ-5 RFC/CURP Msgs) ───┤          │
                              ├──→ T005 (REQ-6 Phone FE)
                              │      ↓
                              │    T013 (REQ-7 updateClient Action)
                              │      ↓
                              │    T014 (REQ-7 Client Edit Page)
                              │
T006 (REQ-1 GcsService) ──┐   │
T007 (REQ-1 Service) ─────┤   │
T008 (REQ-1 Endpoint) ────┤   │
                          │   │
T009 (REQ-2 GcsService) ──┤   │
T010 (REQ-2 Service) ─────┤   │
T011 (REQ-2 Endpoint) ────┤   │
                          └──→ T012 (REQ-1,2 Doc UI)

T015 (REQ-4 DTO) ──┐
T016 (REQ-4 Service) ──┤
T017 (REQ-4 Endpoint) ──┤
T018 (REQ-4 UI) ────────┘
```

**Execution order**: T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012 → T013 → T014 → T015 → T016 → T017 → T018

---

## Task Breakdown

### T001 — Fix Enum Display in Expediente Detail ✅

- **REQ**: REQ-3 (Enum Display Fix)
- **File(s)**: `apps/web/app/dashboard/expedientes/[id]/page.tsx`
- **Description**:
  - Line 110: Change `` value={`${c.creditType.name} (${c.creditType.code})`} `` → `value={c.creditType.name}`
  - Lines 121-124: Change `c.personType === "SALARIED" ? "Asalariado (SALARIED)" : c.personType` → `c.personType === "SALARIED" ? "Asalariado" : c.personType`
- **Acceptance**: CreditType shows "Mejora Hipoteca" (no code), PersonType shows "Asalariado" (no code)
- **Depends on**: none

### T002 — Fix PersonType Display in Case Form ✅

- **REQ**: REQ-3 (Enum Display Fix)
- **File(s)**: `apps/web/app/ui/case-form.tsx`
- **Description**:
  - Line 75: Change `Tipo de persona: Asalariado (SALARIED)` → `Tipo de persona: Asalariado`
- **Acceptance**: Case creation form shows "Asalariado" without technical code
- **Depends on**: none

### T003 — Add Phone Validation to CreateClientDto ✅

- **REQ**: REQ-6 (Phone Validation)
- **File(s)**: `apps/api/src/clients/dto/create-client.dto.ts`
- **Description**:
  - Add `@Matches(/^\d{10}$/, { message: 'El teléfono debe tener 10 dígitos' })` decorator to the `phone` field, after `@IsNotEmpty()`
  - `UpdateClientDto` already extends via `PartialType(CreateClientDto)`, so it inherits the validation automatically
- **Acceptance**: Backend rejects phone values that are not exactly 10 digits with message "El teléfono debe tener 10 dígitos"
- **Depends on**: none

### T004 — Update RFC/CURP Validation Messages in DTOs ✅

- **REQ**: REQ-5 (RFC/CURP Messages)
- **File(s)**: `apps/api/src/clients/dto/create-client.dto.ts`
- **Description**:
  - RFC `@Matches` message: change `'RFC debe tener un formato válido'` → `'El RFC ingresado no tiene un formato válido. Verifica que tenga 12 o 13 caracteres y que esté escrito correctamente.'`
  - CURP `@Matches` message: change `'CURP debe tener un formato válido'` → `'La CURP ingresada no tiene un formato válido. Verifica que tenga 18 caracteres y que esté escrita correctamente.'`
- **Acceptance**: Both creation and edit forms show the new friendly messages when RFC/CURP is invalid
- **Depends on**: none

### T005 — Add Phone Validation to Frontend Client Form ✅

- **REQ**: REQ-6 (Phone Validation)
- **File(s)**: `apps/web/app/actions/clients.ts`
- **Description**:
  - In `createClient()`, after the existing `phone` empty check (line 42-44), add a regex check:
    ```ts
    const phoneStr = (phone as string).trim();
    if (!/^\d{10}$/.test(phoneStr)) {
      errors.phone = 'El teléfono debe tener 10 dígitos';
    }
    ```
  - This runs BEFORE the backend call, providing instant feedback
- **Acceptance**: Submitting a phone with letters, <10 digits, or >10 digits shows "El teléfono debe tener 10 dígitos" before any API call
- **Depends on**: T003

### T006 — Add generateSignedUrl to GcsService ✅

- **REQ**: REQ-1 (Document View)
- **File(s)**: `apps/api/src/documents/gcs.service.ts`
- **Description**:
  - Add method `async generateSignedUrl(storagePath: string): Promise<string>`:
    ```ts
    async generateSignedUrl(storagePath: string): Promise<string> {
      try {
        const bucket = this.storage.bucket(this.bucketName);
        const file = bucket.file(storagePath);
        const [url] = await file.getSignedUrl({
          action: 'read',
          expires: Date.now() + 5 * 60 * 1000,
        });
        return url;
      } catch (error) {
        throw new NotFoundException('El documento no está disponible');
      }
    }
    ```
  - Import `NotFoundException` from `@nestjs/common`
- **Acceptance**: `generateSignedUrl('path/to/file.pdf')` returns a valid signed URL string; throws `NotFoundException` if GCS file doesn't exist
- **Depends on**: none

### T007 — Add getSignedUrl to DocumentsService ✅

- **REQ**: REQ-1 (Document View)
- **File(s)**: `apps/api/src/documents/documents.service.ts`
- **Description**:
  - Add method `async getSignedUrl(caseId: string, documentId: string): Promise<string>`:
    1. Call `this.findOneByCase(caseId, documentId)` — throws 404 if not found or wrong case
    2. If `document.storagePath` is null → throw `BadRequestException('El documento no tiene un archivo asociado')`
    3. Return `this.gcsService.generateSignedUrl(document.storagePath)`
- **Acceptance**: Returns signed URL for valid document; 404 for missing document; 400 for document without storagePath
- **Depends on**: T006

### T008 — Add View Endpoint to DocumentsController ✅

- **REQ**: REQ-1 (Document View)
- **File(s)**: `apps/api/src/documents/documents.controller.ts`
- **Description**:
  - Add import for `Res` from `@nestjs/common`
  - Add new endpoint:
    ```ts
    @Get(':documentId/view')
    async viewDocument(
      @Param('caseId') caseId: string,
      @Param('documentId') documentId: string,
    ) {
      const signedUrl = await this.documentsService.getSignedUrl(caseId, documentId);
      return { data: { signedUrl } };
    }
    ```
  - The controller already has `@UseGuards(JwtAuthGuard)` at class level
  - Route ordering: `:documentId/view` must be declared BEFORE `:documentId` so Express matches the more specific route first
- **Acceptance**: `GET /mortgage-cases/:caseId/documents/:documentId/view` returns `{ data: { signedUrl: "https://..." } }` with valid JWT; returns 401 without JWT
- **Depends on**: T007

### T009 — Add deleteFile to GcsService ✅

- **REQ**: REQ-2 (Document Delete)
- **File(s)**: `apps/api/src/documents/gcs.service.ts`
- **Description**:
  - Add method `async deleteFile(storagePath: string): Promise<void>`:
     ```ts
     async deleteFile(storagePath: string): Promise<void> {
       try {
         const bucket = this.storage.bucket(this.bucketName);
         const file = bucket.file(storagePath);
         await file.delete({ ignoreNotFound: true });
       } catch (error) {
         // If ignoreNotFound is not supported by the GCS client version,
         // catch the 404 error code manually and treat as success
         if (error?.code === 404) return;
         throw new BadGatewayException('Error al eliminar el archivo del almacenamiento');
       }
     }
     ```
   - `file.delete({ ignoreNotFound: true })` ensures non-existent files don't throw. Fallback: catch `error.code === 404` and return silently.
- **Acceptance**: `deleteFile('path/to/file.pdf')` deletes the GCS object; throws `BadGatewayException` on GCS connectivity errors
- **Depends on**: none

### T010 — Add delete to DocumentsService ✅

- **REQ**: REQ-2 (Document Delete)
- **File(s)**: `apps/api/src/documents/documents.service.ts`
- **Description**:
  - Add method `async delete(caseId: string, documentId: string): Promise<void>`:
    1. Call `this.findOneByCase(caseId, documentId)` — throws 404 if not found
    2. Check `document.documentStatus.code === 'UPLOADED'` — if not, throw `BadRequestException('Solo se pueden eliminar documentos no procesados')`
    3. If `document.storagePath` is null → throw `BadRequestException('El documento no tiene un archivo asociado')`
    4. Call `this.gcsService.deleteFile(document.storagePath)` — if throws, abort (DB record stays)
    5. Call `this.prisma.document.delete({ where: { id: documentId } })`
  - Import `ForbiddenException` if needed for status gate (or use `BadRequestException`)
- **Acceptance**: Deletes GCS file then DB record for UPLOADED documents; aborts on GCS failure; rejects non-UPLOADED with 400
- **Depends on**: T009

### T011 — Add Delete Endpoint to DocumentsController ✅

- **REQ**: REQ-2 (Document Delete)
- **File(s)**: `apps/api/src/documents/documents.controller.ts`
- **Description**:
  - Add imports: `Delete`, `HttpCode` (already imported)
  - Add new endpoint:
    ```ts
    @Delete(':documentId')
    @HttpCode(204)
    async deleteDocument(
      @Param('caseId') caseId: string,
      @Param('documentId') documentId: string,
    ) {
      await this.documentsService.delete(caseId, documentId);
    }
    ```
  - Route ordering: `:documentId/view` must come before `:documentId` (already handled by T008)
  - The controller already has `@UseGuards(JwtAuthGuard)` at class level
- **Acceptance**: `DELETE /mortgage-cases/:caseId/documents/:documentId` returns 204 on success; 404 for missing document; 400 for non-UPLOADED status
- **Depends on**: T010

### T012 — Add View/Delete Buttons to DocumentList ✅

- **REQ**: REQ-1 (Document View), REQ-2 (Document Delete)
- **File(s)**: `apps/web/app/ui/documents/document-list.tsx`, `apps/web/app/actions/documents.ts` (NEW)
- **Description**:
  - Create server actions in `apps/web/app/actions/documents.ts`:
    1. `getDocumentViewUrl(caseId: string, documentId: string)`:
       - Calls `GET /mortgage-cases/${caseId}/documents/${documentId}/view` via `apiFetch` (server-side)
       - Returns `{ signedUrl }` or throws error
    2. `deleteDocument(caseId: string, documentId: string)`:
       - Calls `DELETE /mortgage-cases/${caseId}/documents/${documentId}` via `apiFetch` (server-side)
       - Returns success or throws error
  - Convert `DocumentList` from server component to client component (add `"use client"`) OR create a new `DocumentListClient` wrapper
  - Add a new column "Acciones" to the table header
  - Per row, add:
    - "Ver" button (eye icon or text "Ver"): calls `getDocumentViewUrl(caseId, doc.id)` → `window.open(signedUrl, '_blank')` on success
    - "Eliminar" button (trash icon or text "Eliminar"): only enabled/visible when `doc.documentStatus.code === 'UPLOADED'`; opens confirmation modal with "¿Estás segura de que deseas eliminar este documento?" + "Eliminar" / "Cancelar" buttons; on confirm, calls `deleteDocument(caseId, doc.id)` and refreshes/revalidates the list
  - `apiFetch` is server-only — must NOT be called from client components. All API calls go through server actions defined in `actions/documents.ts`.
  - Since `DocumentList` is currently a server component, the cleanest approach is to:
    1. Keep `DocumentList` as server component for the table structure
    2. Create `DocumentActions` client component that calls server actions for view/delete per row
    3. Pass `caseId` as a prop to `DocumentList` and then to `DocumentActions`
  - Update `DocumentsClientSection` to pass `caseId` to `DocumentList`
  - For list refresh after delete: call `router.refresh()` or `revalidatePath()` from the delete action
- **Acceptance**: Each document row has "Ver" button that opens document in new tab; "Eliminar" button only shown for UPLOADED documents; delete triggers confirmation modal; all API calls go through server actions, not direct client-side `apiFetch`
- **Depends on**: T008, T011

### T013 — Add updateClient Server Action + Shared Validation ✅

- **REQ**: REQ-7 (Client Edit), REQ-5 (RFC/CURP), REQ-6 (Phone)
- **File(s)**: `apps/web/app/actions/clients.ts`
- **Description**:
  - **Step A — Extract shared validation helper**: Before adding the new action, extract a `validateClientFields(formData: FormData)` function to avoid duplication between `createClient` and `updateClient`:
    ```ts
    function validateClientFields(formData: FormData): Partial<Record<string, string>> {
      const errors: Partial<Record<string, string>> = {};
      const firstName = (formData.get('firstName') as string)?.trim();
      const paternalLastName = (formData.get('paternalLastName') as string)?.trim();
      const email = (formData.get('email') as string)?.trim();
      const phone = (formData.get('phone') as string)?.trim();
      const rfc = (formData.get('rfc') as string)?.trim().toUpperCase();
      const curp = (formData.get('curp') as string)?.trim().toUpperCase();

      if (!firstName) errors.firstName = 'El nombre es obligatorio';
      if (!paternalLastName) errors.paternalLastName = 'El apellido paterno es obligatorio';
      if (!email) errors.email = 'El correo electrónico es obligatorio';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'El correo electrónico no es válido';
      if (!phone) errors.phone = 'El teléfono es obligatorio';
      else if (!/^\d{10}$/.test(phone)) errors.phone = 'El teléfono debe tener 10 dígitos';
      if (rfc && !/^[A-Z&Ñ]{3,4}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[A-Z0-9]{3}$/.test(rfc))
        errors.rfc = 'El RFC ingresado no tiene un formato válido. Verifica que tenga 12 o 13 caracteres y que esté escrito correctamente.';
      if (curp && !/^[A-Z]{4}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[HM][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[A-Z0-9][0-9]$/.test(curp))
        errors.curp = 'La CURP ingresada no tiene un formato válido. Verifica que tenga 18 caracteres y que esté escrita correctamente.';

      return errors;
    }
    ```
  - **Step B — Refactor `createClient`**: Replace its inline validation block with a call to `validateClientFields(formData)`.
  - **Step C — Add `updateClient` server action** with the `.bind` pattern for `useActionState`:
    ```ts
    export async function updateClient(
      clientId: string,
      prevState: ActionState,
      formData: FormData,
    ): Promise<ActionState> {
      const errors = validateClientFields(formData);
      if (Object.keys(errors).length > 0) return { errors };

      const data: Record<string, unknown> = {};
      // ... extract all fields from formData ...

      const result = await apiFetch<Client>(`/clients/${clientId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });

      if (result.errors) return { errors: result.errors };
      redirect(`/dashboard/clientes/${clientId}`);
    }
    ```
  - **Usage in component**: `const [state, action] = useActionState(updateClient.bind(null, clientId), initialState);`
- **Acceptance**: Both `createClient` and `updateClient` share the same phone/RFC/CURP/email/required validation; `updateClient` uses `.bind(null, clientId)` pattern compatible with `useActionState`; refactored `createClient` still works identically
- **Depends on**: T003, T004, T005

### T014 — Create Client Edit Page ✅

- **REQ**: REQ-7 (Client Edit)
- **File(s)**: `apps/web/app/dashboard/clientes/[id]/editar/page.tsx` (NEW)
- **Description**:
  - Server component that:
    1. Fetches client data via `apiFetch<Client>(`/clients/${id}`)`
    2. Handles 404 and error states (similar to detail page)
    3. Renders a pre-populated form using `ClientForm` component in edit mode OR a new `ClientEditForm` component
  - Since `ClientForm` is hardcoded to `createClient` action, create a new `ClientEditForm` component that:
    - Accepts `client` prop with default values
    - Uses `useActionState` with `updateClient` action
    - Pre-fills all input fields with `defaultValue={client.firstName}` etc.
    - Has "Actualizar cliente" submit button instead of "Guardar cliente"
  - Add "Editar cliente" button to the detail page (`apps/web/app/dashboard/clientes/[id]/page.tsx`) linking to `/dashboard/clientes/${id}/editar`
- **Acceptance**: Edit page pre-populated with current client data; form validates phone/RFC/CURP; saves via PATCH; redirects to detail on success
- **Depends on**: T013

### T015 — Create UpdateMortgageCaseDto ✅

- **REQ**: REQ-4 (Expediente Edit)
- **File(s)**: `apps/api/src/mortgage-cases/dto/update-mortgage-case.dto.ts` (NEW)
- **Description**:
  - Create new DTO with these fields (all optional except creditTypeId):
     ```ts
     import { IsString, IsOptional, IsNumber, IsInt, IsPositive, Min } from 'class-validator';
     import { Type } from 'class-transformer';

     export class UpdateMortgageCaseDto {
       @Type(() => Number)
       @IsInt({ message: 'El tipo de crédito debe ser un número válido' })
       @IsPositive({ message: 'El tipo de crédito es obligatorio' })
       creditTypeId!: number;

      @IsString()
      @IsOptional()
      propertyLocation?: string;

      @IsNumber()
      @IsPositive({ message: 'El monto solicitado debe ser positivo' })
      @Type(() => Number)
      @IsOptional()
      requestedAmount?: number;

      @IsNumber()
      @IsPositive({ message: 'El valor de la propiedad debe ser positivo' })
      @Type(() => Number)
      @IsOptional()
      propertyValue?: number;

      @IsNumber()
      @Min(1, { message: 'El plazo estimado debe ser mayor a 0' })
      @Type(() => Number)
      @IsOptional()
      estimatedTermMonths?: number;

      @IsString()
      @IsOptional()
      notes?: string;
    }
     ```
   - Note: `creditTypeId` is a FK to `credit_types.id` (integer). `@Type(() => Number)` transforms the HTTP string param to a number, then `@IsInt()` and `@IsPositive()` validate it.
- **Acceptance**: DTO validates creditTypeId as a positive integer, numeric fields positive, notes optional string
- **Depends on**: none

### T016 — Add update Method to MortgageCasesService ✅

- **REQ**: REQ-4 (Expediente Edit)
- **File(s)**: `apps/api/src/mortgage-cases/mortgage-cases.service.ts`
- **Description**:
  - Add method `async update(id: string, dto: UpdateMortgageCaseDto)`:
    1. Find case: `this.prisma.mortgageCase.findUnique({ where: { id } })` — throw 404 if not found
    2. Validate creditType exists if provided: `this.prisma.creditType.findUnique({ where: { id: dto.creditTypeId } })` — throw 404 if not found
    3. Update: `this.prisma.mortgageCase.update({ where: { id }, data: { ...dto }, include: MORTGAGE_CASE_INCLUDE })`
    4. Return with full includes (client, advisor, creditType, status)
  - Import `UpdateMortgageCaseDto`
- **Acceptance**: Updates expediente fields; returns full includes; 404 for missing case or invalid creditTypeId
- **Depends on**: T015

### T017 — Add PUT Endpoint to MortgageCasesController ✅

- **REQ**: REQ-4 (Expediente Edit)
- **File(s)**: `apps/api/src/mortgage-cases/mortgage-cases.controller.ts`
- **Description**:
  - Add imports: `Put` from `@nestjs/common`, `UpdateMortgageCaseDto`
  - Add new endpoint:
    ```ts
    @Put(':id')
    update(
      @Param('id') id: string,
      @Body() dto: UpdateMortgageCaseDto,
    ) {
      return this.mortgageCasesService.update(id, dto);
    }
    ```
  - The controller already has `@UseGuards(JwtAuthGuard)` at class level
- **Acceptance**: `PUT /mortgage-cases/:id` updates fields and returns full includes; 400 for validation errors; 404 for missing case
- **Depends on**: T016

### T018 — Create Expediente Edit Page ✅

- **REQ**: REQ-4 (Expediente Edit)
- **File(s)**: `apps/web/app/dashboard/expedientes/[id]/editar/page.tsx` (NEW)
- **Description**:
  - Server component that:
    1. Fetches case data via `apiFetch<MortgageCase>(`/mortgage-cases/${id}`)`
    2. Fetches credit types via `apiFetch<{ data: CreditType[] }>('/credit-types')`
    3. Handles 404 and error states
    4. Renders a pre-populated form (similar to `CaseForm` but in edit mode)
  - Create `CaseEditForm` client component that:
    - Accepts `mortgageCase` and `creditTypes` props
    - Uses `useActionState` with a new `updateCase` server action
    - Pre-fills all fields with current values
    - Has "Actualizar expediente" submit button
  - Create `updateCase` server action in `apps/web/app/actions/cases.ts`:
    - Extracts fields from FormData
    - Validates creditTypeId required, numeric fields > 0
    - Calls `apiFetch(`/mortgage-cases/${id}`, { method: 'PUT', body: { ... } })`
    - On success: `redirect(`/dashboard/expedientes/${id}`)`
    - On error: returns errors
  - Add "Editar expediente" button to the detail page (`apps/web/app/dashboard/expedientes/[id]/page.tsx`) linking to `/dashboard/expedientes/${id}/editar`
- **Acceptance**: Edit page pre-populated; form validates required fields and positive numbers; saves via PUT; redirects to detail on success
- **Depends on**: T017

---

## Batch Groupings for Apply Phase

### Batch 1: Quick Wins (REQ-3, REQ-5, REQ-6 Backend)
**Tasks**: T001, T002, T003, T004
**Rationale**: All are simple text/decorator changes in existing files. No new files, no dependencies between them. Can be applied and verified together.

### Batch 2: Document View (REQ-1)
**Tasks**: T006, T007, T008
**Rationale**: Sequential dependency chain within the document module. GcsService → DocumentsService → Controller. Each builds on the previous.

### Batch 3: Document Delete (REQ-2)
**Tasks**: T009, T010, T011
**Rationale**: Sequential dependency chain within the document module. GcsService → DocumentsService → Controller. Same pattern as Batch 2.

### Batch 4: Document UI (REQ-1 + REQ-2 Frontend)
**Tasks**: T012
**Rationale**: Frontend work that depends on both view and delete endpoints being ready. Can be applied after Batches 2 and 3.

### Batch 5: Client Edit (REQ-6 Frontend + REQ-5 Frontend + REQ-7)
**Tasks**: T005, T013, T014
**Rationale**: Phone frontend validation (T005) is needed before the edit form (T014) can validate properly. Server action (T013) is needed before the page (T014).

### Batch 6: Expediente Edit (REQ-4)
**Tasks**: T015, T016, T017, T018
**Rationale**: Full vertical slice: DTO → Service → Controller → UI. Each depends on the previous.

---

## Summary

| Batch | Tasks | REQ | Description |
|-------|-------|-----|-------------|
| 1 | T001, T002, T003, T004 | REQ-3, REQ-5, REQ-6 | Enum fix, RFC/CURP messages, phone DTO |
| 2 | T006, T007, T008 | REQ-1 | Document view: GCS → Service → Endpoint |
| 3 | T009, T010, T011 | REQ-2 | Document delete: GCS → Service → Endpoint |
| 4 | T012 | REQ-1, REQ-2 | Document UI: View/Delete buttons |
| 5 | T005, T013, T014 | REQ-6, REQ-7 | Phone frontend + Client edit |
| 6 | T015, T016, T017, T018 | REQ-4 | Expediente edit: DTO → Service → Endpoint → UI |
