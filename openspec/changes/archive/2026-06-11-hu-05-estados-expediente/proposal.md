# Proposal: HU-05 — Implementar Estados del Expediente

## Intent

Allow an authenticated advisor to manually change the status of a mortgage case and visualize the operational progress in list and detail views. The case lifecycle is tracked through 8 statuses from "Pendiente de documentos" to "Cerrado", giving the advisor full visibility and control over case advancement.

## Scope

### In Scope
- Replace seed data with 8 new case statuses + migration
- `PATCH /mortgage-cases/:id` endpoint (accepts `statusCode`)
- `UpdateMortgageCaseStatusDto` with status validation (specific DTO for status changes, not general case editing)
- Service `update()` method with existence checks
- Shared `StatusBadge` component with explicit color mapping
- Inline status change UI on detail page
- Frontend `updateCaseStatus` server action
- Service tests for update scenarios

### Out of Scope
- Transition rules or state machine (any → any allowed)
- Document upload, OCR, report generation, financial calculations
- Status filter in list endpoint
- `isActive` flag on `CaseStatus`
- Multi-step wizard or modal for status change

## Capabilities

### New Capabilities
- `backend-case-status-update`: `PATCH /mortgage-cases/:id` endpoint, DTO, service update, and tests
- `frontend-status-change`: Inline status dropdown on detail page, shared `StatusBadge`, `updateCaseStatus` action

### Modified Capabilities
- `frontend-mortgage-cases`: Detail page gains status-change UI; list page replaces inline `StatusBadge` with shared component; both pages use explicit status-to-color mapping

## Approach

1. **Backend**: Add `UpdateMortgageCaseStatusDto` accepting `statusCode` (string, validated with `@IsIn([...8 codes])` for contract enforcement). Double validation: DTO validates the code is in the allowed set, service validates `statusCode` exists in `CaseStatus` table before updating. Add `update()` to service: lookup status by code, validate case exists, update `statusId`, return full included result. Add `PATCH /mortgage-cases/:id` to controller. Write tests for success, invalid code, missing case.

2. **Database**: Update `prisma/seed.ts` with 8 new statuses ordered 1-8. Run a data migration to remap any existing cases using old status IDs before seed cleanup.

   **Old → New status mapping for migration**:
   | Old Code | Old Name | → | New Code | New Name |
   |---|---|---|---|---|
   | PENDING_DOCUMENTS | Pendiente de documentos | → | PENDING_DOCUMENTS | Pendiente de documentos |
   | INTEGRATION | Integración | → | DOCUMENTS_UPLOADED | Documentos cargados |
   | ANALYSIS | Análisis | → | IN_REVIEW | En revisión |
   | COMPLETED | Completado | → | CLOSED | Cerrado |
   | REJECTED | Rechazado | → | OBSERVED | Observado |

   Migration strategy: (a) seed upserts all 8 new codes → (b) find `statusId` for old code → (c) find `statusId` for mapped new code → (d) `UPDATE "MortgageCase" SET "statusId" = <newId> WHERE "statusId" = <oldId>` → (e) seed deletes old codes not in the new set.

3. **Frontend**: Extract `StatusBadge` to `ui/status-badge.tsx` with explicit `Record<statusCode, color>` mapping. Add `updateCaseStatus(caseId, statusCode)` action. On detail page, add a client component with dropdown (populated from `GET /case-statuses`) + "Cambiar" button that calls the action and revalidates the page.

4. **Response**: `PATCH` returns full `MortgageCase` with all includes — `client`, `advisor`, `creditType`, and `status` — so the UI updates immediately without refetching.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/prisma/seed.ts` | Modified | Replace CASE_STATUSES with 8 new statuses |
| `apps/api/prisma/migrations/` | New | Data migration to remap old status IDs |
| `apps/api/src/mortgage-cases/dto/` | New | `UpdateMortgageCaseStatusDto` |
| `apps/api/src/mortgage-cases/mortgage-cases.service.ts` | Modified | Add `update()` method |
| `apps/api/src/mortgage-cases/mortgage-cases.controller.ts` | Modified | Add `PATCH :id` endpoint |
| `apps/api/src/mortgage-cases/mortgage-cases.service.spec.ts` | Modified | Add update tests |
| `apps/web/app/ui/status-badge.tsx` | New | Shared StatusBadge + explicit color map |
| `apps/web/app/dashboard/expedientes/page.tsx` | Modified | Use shared StatusBadge |
| `apps/web/app/dashboard/expedientes/[id]/page.tsx` | Modified | Use shared StatusBadge, add status change UI |
| `apps/web/app/actions/cases.ts` | Modified | Add `updateCaseStatus` action |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| FK constraint violation on old status cleanup | Low | Run data migration before seed deletes old codes |
| Color mapping breaks for new statuses | Low | Replace substring matching with explicit `Record` map |
| StatusBadge code diverges again | Low | Extract to single shared component |
| Concurrent status changes (last write wins) | Low | Acceptable for MVP; no versioning needed yet |

## Rollback Plan

1. Revert `seed.ts` to previous status list (restore old 5 statuses).
2. Run migration to restore original status IDs on any cases modified.
3. Revert controller, service, DTO to pre-PATCH state.
4. Revert frontend pages to read-only status display.
5. Delete `apps/web/app/ui/status-badge.tsx`.

## Dependencies

- HU-01 (Auth/JWT) — JWT guard already on controller
- HU-02 (Clients) — Client lookup pattern already established
- HU-03 (MortgageCase create) — Prisma model and includes exist
- HU-04 (Frontend list/detail) — Pages exist, catalog endpoint `GET /case-statuses` exists

## Success Criteria

- [ ] `PATCH /mortgage-cases/:id` with valid `statusCode` updates status and returns 200 with full case
- [ ] Invalid `statusCode` returns 400
- [ ] Missing case returns 404
- [ ] Missing token returns 401
- [ ] Frontend detail page shows status dropdown with all 8 statuses
- [ ] Frontend list and detail pages show correct color for every status
- [ ] All existing tests pass; new update tests pass
