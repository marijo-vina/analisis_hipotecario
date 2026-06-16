# Archive: HU-07 — Ajustes UX y Validaciones

**Status:** ✅ COMPLETED  
**Date:** 2026-06-16  
**Type:** Sprint 1 Hardening

---

## Completion Summary

### Requirements Delivered (7/7)

| REQ | Description | Status |
|-----|-------------|--------|
| REQ-1 | Document Preview (Ver documento) — GCS signed URL | ✅ |
| REQ-2 | Document Delete (Eliminar documento) — atomic GCS+DB | ✅ |
| REQ-3 | Enum Display Fix — remove technical codes from UI | ✅ |
| REQ-4 | Expediente Edit — PUT endpoint + UI form | ✅ |
| REQ-5 | RFC/CURP Validation Messages — friendly Spanish | ✅ |
| REQ-6 | Phone Validation — 10 digits, backend + frontend | ✅ |
| REQ-7 | Client Edit — PATCH reuse + shared validation | ✅ |

### Tasks Completed (18/18 across 6 batches)

| Batch | Tasks | REQs |
|-------|-------|------|
| 1 | T001-T004 | Enum fix, RFC/CURP messages, phone DTO |
| 2 | T006-T008 | Document View: GCS → Service → Endpoint |
| 3 | T009-T011 | Document Delete: GCS → Service → Endpoint |
| 4 | T012 | Document UI: View/Delete buttons + server actions |
| 5 | T005, T013-T014 | Phone FE + shared validation + Client Edit |
| 6 | T015-T018 | Expediente Edit: DTO → Service → PUT → UI |

### Test Coverage
- **Total tests:** 166
- **Suites:** 20
- **Failures:** 0
- **New tests added:** 54 (DTO specs, service specs, controller specs)

---

## Files Created (8)

| File | Purpose |
|------|---------|
| `apps/api/src/mortgage-cases/dto/update-mortgage-case.dto.ts` | DTO for expediente general update |
| `apps/api/src/mortgage-cases/dto/update-mortgage-case.dto.spec.ts` | DTO validation tests (13) |
| `apps/web/app/actions/documents.ts` | Server actions: `getDocumentViewUrl`, `deleteDocument` |
| `apps/web/app/ui/documents/document-actions.tsx` | Client component: View/Delete buttons + confirmation modal |
| `apps/web/app/ui/client-edit-form.tsx` | Client component: pre-populated edit form |
| `apps/web/app/dashboard/clientes/[id]/editar/page.tsx` | Server component: client edit page |
| `apps/web/app/ui/case-edit-form.tsx` | Client component: pre-populated expediente edit form |
| `apps/web/app/dashboard/expedientes/[id]/editar/page.tsx` | Server component: expediente edit page |

## Files Modified (15)

| File | Batch | Change |
|------|-------|--------|
| `apps/web/app/dashboard/expedientes/[id]/page.tsx` | 1, 6 | Removed enum codes; added "Editar expediente" button |
| `apps/web/app/ui/case-form.tsx` | 1 | Removed "(SALARIED)" from person type display |
| `apps/api/src/clients/dto/create-client.dto.ts` | 1 | Phone `@Matches(/^\d{10}$/)`; friendly RFC/CURP messages |
| `apps/api/src/clients/dto/create-client.dto.spec.ts` | 1 | 11 new tests for phone, RFC, CURP validation |
| `apps/api/src/documents/gcs.service.ts` | 2, 3 | `generateSignedUrl()` + `deleteFile()` |
| `apps/api/src/documents/gcs.service.spec.ts` | 2, 3 | 7 new tests for signed URL + delete |
| `apps/api/src/documents/documents.service.ts` | 2, 3 | `getSignedUrl()` + `delete()` with status gate |
| `apps/api/src/documents/documents.service.spec.ts` | 2, 3 | 10 new tests for view + delete logic |
| `apps/api/src/documents/documents.controller.ts` | 2, 3 | `GET :documentId/view` + `DELETE :documentId` |
| `apps/api/src/documents/documents.controller.spec.ts` | 2, 3 | 6 new tests for view + delete endpoints |
| `apps/web/app/actions/clients.ts` | 5 | Shared `validateClientFields` + `updateClient` with `.bind` |
| `apps/web/app/ui/documents/document-list.tsx` | 4 | "Acciones" column with DocumentActions |
| `apps/web/app/ui/documents/documents-client-section.tsx` | 4 | Passes `caseId` to DocumentList |
| `apps/web/app/dashboard/clientes/[id]/page.tsx` | 5 | "Editar cliente" button |
| `apps/web/app/lib/definitions.ts` | post-verify | Added `id` to `MortgageCase.creditType` |

---

## Key Architectural Decisions

1. **GCS Signed URL (5-min TTL):** Instead of streaming files through NestJS, signed URLs let the browser fetch directly from GCS. Lower server load, but requires `storage.objects.get` IAM.
2. **GCS-first delete atomicity:** Delete GCS file → abort on failure → then delete DB record. Safe pattern that preserves DB integrity on GCS errors.
3. **Server actions for client-component API calls:** `apiFetch` is server-only. All client components call server actions (`"use server"`) which proxy to the backend. No GCS URLs or credentials ever reach the browser outside the signed URL.
4. **Shared validation:** `validateClientFields()` extracted from `createClient` and reused by `updateClient` — avoids duplication of phone, email, RFC, CURP rules.
5. **Route ordering:** `:documentId/view` declared before `:documentId` in DocumentsController so Express matches the more specific route first.

---

## Deployment Prerequisites

### GCP IAM Permissions Required

| Permission | Endpoint | Purpose |
|------------|----------|---------|
| `storage.objects.create` | POST upload | Upload files (existing — HU-07) |
| `storage.objects.get` | GET view | Generate signed URLs for document preview |
| `storage.objects.delete` | DELETE document | Delete files when document is removed |

Without these, the view and delete endpoints return graceful errors (not 500s).

---

## Spec Sync

### Main Specs Updated

| Spec File | Change |
|-----------|--------|
| `specs/04-api-contracts.md` | Added `PUT /mortgage-cases/:id` (expediente edit); replaced "Diferido a HU-04" note with actual PATCH + PUT specs; added Section 5: Documents View & Delete endpoints |
| `specs/07-expedientes.spec.md` | No update needed — this spec covers higher-level expediente behavior; the new PUT endpoint is additive |

---

## Next Steps

- **HU-08 (OCR/IA):** Now unblocked — documents can be uploaded, viewed, and deleted. The processing pipeline can begin.
- **GCP IAM:** Configure `storage.objects.get` and `storage.objects.delete` before deploying to production.
- **CreditType ID type:** The frontend `MortgageCase` type was fixed to include `creditType.id`. Future changes to the backend response format should keep this field.

---

## Artifacts

| Artifact | Location |
|----------|----------|
| Proposal | `openspec/changes/hu-07-ajustes-ux-validaciones/proposal.md` |
| Exploration | `openspec/changes/hu-07-ajustes-ux-validaciones/exploration.md` |
| Spec | `openspec/changes/hu-07-ajustes-ux-validaciones/spec.md` |
| Tasks | `openspec/changes/hu-07-ajustes-ux-validaciones/tasks.md` |
| Apply Progress | `openspec/changes/hu-07-ajustes-ux-validaciones/apply-progress.md` |
| Verify Report | `openspec/changes/hu-07-ajustes-ux-validaciones/verify-report.md` |
| Archive | `openspec/changes/hu-07-ajustes-ux-validaciones/archive.md` |
