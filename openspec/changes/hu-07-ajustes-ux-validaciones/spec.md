# Delta Spec: HU-07 — Ajustes UX y Validaciones

## ADDED

### REQ-1: Document Preview (document-view)
**User story:** As asesora, I want to preview uploaded documents so I can verify their contents without downloading.

`GET /documents/:id/view` behind JwtAuthGuard returns a GCS signed URL (5-min TTL). Frontend opens in new tab.

| # | GIVEN | WHEN | THEN |
|---|-------|------|------|
| S1 | Document in expediente | Clicks "Ver" (eye icon) | New tab with document (PDF/image in browser) |
| S2 | Document record exists, GCS file deleted | Clicks "Ver" | "El documento no está disponible" — no crash |
| S3 | No JWT | Requests view endpoint | 401 Unauthorized |
| S4 | Signed URL expired | Opens stale URL | User refreshes page to regenerate |

**AC:** [x] View endpoint behind JwtAuthGuard  [x] 5-min TTL  [x] No GCS bucket/path/credentials to frontend  [x] "Ver" button per document row
**Edge:** Corrupt/malformed file → browser native rendering handles; unexpected MIME type → Content-Type header guides browser.

### REQ-2: Document Delete (document-delete)
**User story:** As asesora, I want to delete mistakenly uploaded documents to keep the expediente clean.

`DELETE /documents/:id` removes DB record + GCS file. Confirmation modal required. Status gate: only `UPLOADED` documents are deletable.

| # | GIVEN | WHEN | THEN |
|---|-------|------|------|
| S1 | Doc status=UPLOADED | Clicks "Eliminar", confirms in modal | Doc removed from list; DB record deleted; GCS file deleted; success toast |
| S2 | Confirmation modal open | Clicks "Cancelar" | Modal closes, nothing happens |
| S3 | Doc status≠UPLOADED (VALIDATED, REJECTED, etc.) | Attempts delete | Button disabled OR warning: "Solo se pueden eliminar documentos no procesados" |
| S4 | GCS delete fails, DB record exists | Confirms delete | Abort: keep DB record; inform user "Error al eliminar el archivo" |
| S5 | Document ID not found | DELETE /documents/:id | 404 "Documento no encontrado" |

**AC:** [x] Confirmation modal  [x] Status gate (only UPLOADED)  [x] GCS + DB atomically (GCS first, abort on failure)  [x] JwtAuthGuard on DELETE
**Edge:** Double-click → already-deleted 404 is safe. Concurrent delete+view → view fails gracefully.

### REQ-4: Expediente Edit (mortgage-case-edit)
**User story:** As asesora, I want to edit basic expediente fields when information changes or was entered incorrectly.

`PUT /mortgage-cases/:id` with `UpdateMortgageCaseDto`. Editable: `creditTypeId`, `propertyLocation`, `requestedAmount`, `propertyValue`, `estimatedTermMonths`, `notes`. NOT: `statusCode` (separate dropdown), `clientId` (out of scope).

| # | GIVEN | WHEN | THEN |
|---|-------|------|------|
| S1 | Expediente detail page | Clicks "Editar expediente", changes fields, saves | PUT 200, redirect to detail with updated data, success toast |
| S2 | Opens edit | — | Form pre-populated with current values |
| S3 | creditTypeId empty | Saves | 400 "El tipo de crédito es obligatorio" |
| S4 | requestedAmount ≤ 0 or negative | Saves | 400 "El monto solicitado debe ser positivo" |
| S5 | propertyValue ≤ 0 | Saves | 400 "El valor de la propiedad debe ser positivo" |
| S6 | estimatedTermMonths ≤ 0 | Saves | 400 "El plazo estimado debe ser mayor a 0" |
| S7 | Expediente not found | PUT nonexistent ID | 404 "Expediente no encontrado" |
| S8 | Server error | PUT valid data | 500, error toast "Error al actualizar el expediente" |

**AC:** [x] `PUT /mortgage-cases/:id` with `UpdateMortgageCaseDto`  [x] Pre-populated form  [x] Required + numeric validation  [x] "Editar expediente" button on detail  [x] Response includes full includes (client, advisor, creditType, status)
**Edge:** Concurrent edits → last-write-wins (acceptable for Sprint 1). Notes can be empty string (nullable). Nullable optional fields (propertyLocation) → handle undefined.

### REQ-7: Client Edit (client-edit)
**User story:** As asesora, I want to edit client contact and identity information when it changes.

Reuses existing `PATCH /clients/:id`. Editable: `firstName`, `lastName`, `secondLastName`, `email`, `phone`, `rfc`, `curp`. Form pre-populated.

| # | GIVEN | WHEN | THEN |
|---|-------|------|------|
| S1 | Client detail page | Clicks "Editar cliente", updates fields, saves | PATCH 200, redirect to detail, success toast |
| S2 | Opens edit | — | All fields pre-filled with current data |
| S3 | Phone invalid (letters/≠10 digits) | Saves | 400 "El teléfono debe tener 10 dígitos" |
| S4 | RFC wrong format | Saves | 400 "El RFC ingresado no tiene un formato válido. Verifica que tenga 12 o 13 caracteres..." |
| S5 | CURP wrong format | Saves | 400 "La CURP ingresada no tiene un formato válido. Verifica que tenga 18 caracteres..." |
| S6 | Required field empty (firstName, lastName, email, phone) | Saves | 400 with field-specific message |
| S7 | Email invalid format | Saves | 400 "Debe ser un email válido" |
| S8 | RFC changed to duplicate | Saves | 409 "RFC ya registrado" |
| S9 | Server error | Saves | 500, error toast |

**AC:** [x] Edit page at `/dashboard/clientes/[id]/editar`  [x] Pre-populated form  [x] ALL validations from REQ-5 and REQ-6 apply on edit  [x] "Editar cliente" button on detail
**Edge:** FullName regenerated by backend on name change. RFC changed to already-existing → 409.

## MODIFIED

### REQ-3: Enum Display Fix (frontend-mortgage-cases)
**Previously:** CreditType displayed as `"Mejora Hipoteca (MEJORA_HIPOTECA)"`, PersonType as `"Asalariado (SALARIED)"`.
**Now:** All catalog entities MUST display ONLY the human-readable `name` field. No technical codes.

| # | GIVEN | WHEN | THEN |
|---|-------|------|------|
| S1 | Expediente detail → creditType | Renders field | "Mejora Hipoteca" (not "Mejora Hipoteca (MEJORA_HIPOTECA)") |
| S2 | Expediente detail → personType | Renders field | "Asalariado" (not "Asalariado (SALARIED)") |
| S3 | Case creation form → personType option | Renders dropdown | "Asalariado" |
| S4 | Any catalog entity (CreditType, CaseStatus, DocumentType, DocumentStatus) | Displayed | `name` field only — never `(code)` |

**Affected files:** `expedientes/[id]/page.tsx:110` (creditType), `expedientes/[id]/page.tsx:121-124` (personType), `case-form.tsx:75` (personType).
**AC:** [x] 3 locations fixed  [x] No new utility needed — catalog tables already provide `name`

### REQ-5: RFC/CURP Validation Messages (frontend-clients)
**Previously:** "RFC debe tener un formato válido" / "CURP debe tener un formato válido".
**Now:** Friendly, actionable messages explaining expected format. Regex unchanged — only message text updated in DTOs.

| # | GIVEN | WHEN | THEN |
|---|-------|------|------|
| S1 | RFC too short or wrong pattern | Submits form | "El RFC ingresado no tiene un formato válido. Verifica que tenga 12 o 13 caracteres y que esté escrito correctamente." |
| S2 | CURP wrong pattern | Submits form | "La CURP ingresada no tiene un formato válido. Verifica que tenga 18 caracteres y que esté escrita correctamente." |
| S3 | Valid RFC/CURP | Submits | No error message, form proceeds normally |
| S4 | Applies to edit form | Invalid RFC/CURP on edit | Same friendly messages as creation form |

**AC:** [x] DTO `@Matches` message updated for both RFC and CURP  [x] Messages appear on both client creation and edit forms

### REQ-6: Phone Validation (frontend-clients)
**Previously:** Phone only validated as non-empty string (`@IsString()`, `@IsNotEmpty()`). Any content accepted.
**Now:** Phone MUST be exactly 10 digits. Backend: `@Matches(/^\d{10}$/)`. Frontend: matching pre-validation.

| # | GIVEN | WHEN | THEN |
|---|-------|------|------|
| S1 | 10 digits "5512345678" | Saves client | Accepted, stored normally |
| S2 | Contains letters "55abc" | Saves | 400 "El teléfono debe tener 10 dígitos" |
| S3 | < 10 digits "55123" | Saves | 400 "El teléfono debe tener 10 dígitos" |
| S4 | > 10 digits "55123456789" | Saves | 400 "El teléfono debe tener 10 dígitos" |
| S5 | Empty | Saves | 400 "El teléfono es obligatorio" (existing `@IsNotEmpty`) |
| S6 | Applies to edit form | Invalid phone on edit | Same validation as creation |

**AC:** [x] `CreateClientDto.phone` adds `@Matches(/^\d{10}$/, { message: "El teléfono debe tener 10 dígitos" })`  [x] `UpdateClientDto` inherits via `PartialType`/`PickType`  [x] Frontend pre-validates same rule before submit  [x] Both creation and edit forms

## Security

| ID | Requirement | Strength |
|----|-------------|----------|
| SEC-01 | `GET /documents/:id/view` MUST be behind JwtAuthGuard | MUST |
| SEC-02 | Signed URL TTL MUST be ≤5 minutes | MUST |
| SEC-03 | GCS bucket path or credentials MUST NOT be exposed to frontend | MUST NOT |
| SEC-04 | Document delete MUST require confirmation + status=UPLOADED gate | MUST |
| SEC-05 | Backend validation MUST mirror frontend (never trust client) | MUST |

## Non-Functional

| ID | Requirement |
|----|-------------|
| NFR-01 | Existing HU-07 tests MUST pass (no contract changes) |
| NFR-02 | New tests: signed URL generation, document delete flow, phone DTO validation, PUT mortgage-cases, PATCH clients edit |
| NFR-03 | UI MUST be responsive on advisor screen sizes (≥1024px) |
| NFR-04 | All user-facing messages MUST be in Spanish |
