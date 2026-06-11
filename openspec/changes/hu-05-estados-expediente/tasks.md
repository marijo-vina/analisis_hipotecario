# Tasks: HU-05 — Estados del Expediente

## Phase 1: Database (Migration + Seed)

- [x] 1.1 Create migration SQL at `apps/api/prisma/migrations/{timestamp}_migrate_case_statuses/migration.sql` — upsert 8 new statuses, remap old→new FK (4 UPDATEs), delete old codes (INTEGRATION, ANALYSIS, COMPLETED, REJECTED) — FR-0501, FR-0502
- [x] 1.2 Update `apps/api/prisma/seed.ts` — replace `CASE_STATUSES` array with 8 new statuses ordered 1-8 — FR-0501
- [x] 1.3 Run `npx prisma migrate dev` and `npx prisma db seed` — verify migration applies cleanly and seed inserts 8 rows — FR-0501, FR-0502

## Phase 2: Backend TDD — RED (DTO + Tests first)

- [x] 2.1 Create `apps/api/src/mortgage-cases/dto/update-mortgage-case-status.dto.ts` — `UpdateMortgageCaseStatusDto` with `@IsString()` + `@IsIn([...8 codes])` — FR-0504, FR-0507
- [x] 2.2 Add service test (RED): valid status change → returns 200 with includes — mock status+case findUnique, verify update called — FR-0503, NFR-0504
- [x] 2.3 Add service test (RED): missing case → throws `NotFoundException("Mortgage case not found")` — mock case findUnique returns null — FR-0505, NFR-0504
- [x] 2.4 Add service test (RED): status code not in DB → throws `BadRequestException("Status code not found")` — mock status findUnique returns null — FR-0508, NFR-0504
- [x] 2.5 Add controller test (RED): `@Patch(':id')` delegates to `service.updateStatus` with correct args — FR-0503
- [x] 2.6 Add regression test (RED): `POST /mortgage-cases` creates with `status.code === "PENDING_DOCUMENTS"` — FR-0515, NFR-0503

## Phase 3: Backend TDD — GREEN (Implementation)

- [x] 3.1 Add `updateStatus(id: string, statusCode: string)` to `apps/api/src/mortgage-cases/mortgage-cases.service.ts` — validate in this order: (a) findUnique mortgage case by id → `NotFoundException("Mortgage case not found")`, (b) findUnique status by code → `BadRequestException("Status code not found")`, (c) update `statusId`, return with `MORTGAGE_CASE_INCLUDE` — FR-0503, FR-0505, FR-0508, FR-0509
- [x] 3.2 Add `@Patch(':id') updateStatus(@Param('id') id, @Body() dto)` to `apps/api/src/mortgage-cases/mortgage-cases.controller.ts` — delegate to `service.updateStatus`, import `Patch` — FR-0503, FR-0506
- [x] 3.3 Run service + controller tests → all GREEN (Phase 2 RED tests now pass) — NFR-0504
- [x] 3.4 Run full test suite — all 30+ existing mortgage-cases tests must pass — NFR-0503

## Phase 4: Frontend Foundation (Shared Components)

- [ ] 4.1 Create `apps/web/app/ui/status-badge.tsx` — `StatusBadge` component with explicit `Record<string, string>` color map (8 entries), grey fallback for unexpected codes only — FR-0511
- [ ] 4.2 Add `updateCaseStatus(caseId, statusCode)` to `apps/web/app/actions/cases.ts` — calls `PATCH /mortgage-cases/:id`, revalidates path on success, returns `{ errors: { _form } }` on failure — FR-0514

## Phase 5: Frontend Integration (Pages)

- [ ] 5.1 Update `apps/web/app/dashboard/expedientes/page.tsx` — remove inline StatusBadge/getStatusColor, import shared `StatusBadge` from `@/app/ui/status-badge` — FR-0512
- [ ] 5.2 Create `apps/web/app/ui/case-status-dropdown.tsx` — client component with `<select>` pre-selected to current status + "Cambiar" button calling `updateCaseStatus` — props: `{ caseId, currentCode, statuses[] }` — FR-0513
- [ ] 5.3 Update `apps/web/app/dashboard/expedientes/[id]/page.tsx` — remove inline helpers, import shared `StatusBadge`, fetch `GET /case-statuses`, add `<CaseStatusDropdown>` — FR-0513, FR-0514

## Phase 6: Verification

- [ ] 6.1 Manual: PATCH valid status → 200 with full includes, badge updates on detail page — FR-0503, FR-0509
- [ ] 6.2 Manual: PATCH unknown code → 400, PATCH missing case → 404, unauthenticated → 401 — FR-0504, FR-0505, FR-0506
- [ ] 6.3 Manual: dropdown on detail page shows all 8 statuses, "Cambiar" revalidates and shows new badge color — FR-0513, FR-0514
- [ ] 6.4 Verify `GET /case-statuses` returns exactly 8 statuses ordered 1-8 (PENDING_DOCUMENTS → CLOSED) — FR-0516
- [ ] 6.5 Run `npm test` (api) + `npm run build` (web) — zero regressions — NFR-0502, NFR-0503
