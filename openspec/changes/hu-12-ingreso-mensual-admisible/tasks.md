# Tasks: Cálculo de ingreso mensual admisible — HU-12

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 500–650 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR (feature/hu-12-ingreso-mensual-admisible) |
| Delivery strategy | single-pr |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Prisma schema + backend module (types, service, controller, DTOs, tests) | PR 1 | Self-contained; follows liability pattern |
| 2 | Frontend server actions + UI component + wiring into analysis-section | PR 2 | Depends on PR 1 for API contract |

## Phase 1: Foundation / Infrastructure

- [x] 1.1 Add `IncomeCalculation` model to `apps/api/prisma/schema.prisma` with fields: receiptResults (Json), averageGrossIncome (Decimal), averageNetIncome (Decimal), confirmedGrossIncome (Decimal?), confirmedNetIncome (Decimal?), status (String), confirmedBy (String?), confirmedAt (DateTime?), observations (String?), caseId (relation to MortgageCase), calculatedAt (DateTime)
- [x] 1.2 Run `npx prisma migrate dev --name add_income_calculation` to generate migration
- [x] 1.3 Create `apps/api/src/income-calculation/income-calculation.types.ts` with `IncomeCalculationStatus` enum and `IncomeReceiptResult`, `IncomeCalculationResult` interfaces matching design contracts
- [x] 1.4 Create `apps/api/src/income-calculation/dto/confirm-income.dto.ts` with validation decorators for confirmedGrossIncome, confirmedNetIncome, observations
- [x] 1.5 Create `apps/api/src/income-calculation/income-calculation.module.ts` importing PrismaModule, providing IncomeCalculationService
- [x] 1.6 Import `IncomeCalculationModule` in `apps/api/src/app.module.ts`

## Phase 2: Core Implementation — Backend

- [x] 2.1 Create `apps/api/src/income-calculation/income-calculation.service.ts` with `calculate()` method: reads PAYROLL_RECEIPT documents, builds receiptResults, computes Decimal averages for included receipts, persists IncomeCalculation snapshot with CALCULATED status
- [x] 2.2 Add `getLatest()` method to service: returns most recent IncomeCalculation for a caseId, throws 404 if none exists
- [x] 2.3 Add `toggleReceipt()` method: updates included flag on a receipt index, recalculates averages in memory, persists new snapshot
- [x] 2.4 Add `confirm()` method: saves confirmedGrossIncome, confirmedNetIncome, observations, confirmedBy, confirmedAt; transitions status to CONFIRMED without overwriting calculated averages
- [x] 2.5 Create `apps/api/src/income-calculation/income-calculation.controller.ts` with endpoints: POST /cases/:caseId/income/calculate, GET /cases/:caseId/income/latest, PATCH /cases/:caseId/income/receipts/:receiptIndex, POST /cases/:caseId/income/confirm — all with JwtAuthGuard
- [x] 2.6 Test: POST /calculate returns 400 when zero receipts selected, 404 when no PAYROLL_RECEIPT docs exist

## Phase 3: Frontend Implementation

- [x] 3.1 Create `apps/web/app/actions/income.ts` with server actions: `calculateIncome(caseId)`, `fetchIncomeLatest(caseId)`, `toggleReceipt(caseId, receiptIndex, included)`, `confirmIncome(caseId, confirmedGross, confirmedNet, observations)`
- [x] 3.2 Create `apps/web/app/ui/expedientes/income-calculation-section.tsx` with: 9-column receipt table (checkbox, period, payment date, employer, RFC, gross, net, conciliation, review), KPI cards for calculated averages, confirmation panel with inputs and observations textarea, "Confirmar" button
- [x] 3.3 Wire `<IncomeCalculationSection caseId={caseId} />` into `apps/web/app/ui/expedientes/analysis-section.tsx` motor tab, immediately below `<LiabilityCalculationSection />`
- [x] 3.4 Handle "No identificada" display for null paymentDate in table; keep receipt eligible for inclusion
- [x] 3.5 Implement client-side recalculation of averages when checkboxes toggle (before server round-trip for UX feedback)

## Phase 4: Testing

- [x] 4.1 Create `apps/api/src/income-calculation/income-calculation.service.spec.ts`: test `calculate()` with 0/1/N receipts, Decimal rounding (gross [15000.50, 14999.50] → 15000.00), exclusion recalculates averages, status transitions CALCULATED → CONFIRMED
- [x] 4.2 Create `apps/api/src/income-calculation/income-calculation.controller.spec.ts`: test 400 on empty selection, 404 on missing docs, correct HTTP codes for all endpoints
- [ ] 4.3 Write integration test: full POST→GET→PATCH→POST/confirm lifecycle with seeded PAYROLL_RECEIPT documents
- [x] 4.4 Test: confirmed values do not overwrite calculated averages in snapshot
- [ ] 4.5 Test: GET /latest returns snapshot intact after case reload; conciliation engine NOT called during income calculation
- [ ] 4.6 Frontend component tests — SKIPPED: apps/web has no test runner configured

## Phase 5: Cleanup / Verification

- [x] 5.1 Verify HU-09, HU-10, HU-11 not affected: run existing test suites for extraction, conciliation, liability modules
- [x] 5.2 Run `npx prisma validate` and verify migration is reversible (rollback: drop table, revert schema)
- [x] 5.3 Manual verification: open case with PAYROLL_RECEIPT docs, calculate income, toggle receipts, confirm values, reload page — snapshot persists
