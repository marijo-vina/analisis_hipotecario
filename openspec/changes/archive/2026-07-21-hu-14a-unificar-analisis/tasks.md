# Tasks: HU-14A — Unificar flujo de análisis

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 300–400 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No (single PR, mostly deletions) |
| Delivery strategy | force-chained |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: single-pr
400-line budget risk: Medium

---

## Phase 1: Backend Orchestrator

- [x] 1.1 Inject `IncomeCalculationService` and `LiabilityCalculationService` into `CaseAnalysisService` constructor in `case-analysis.service.ts`
- [x] 1.2 Restructure `run()` into 3 phases: Phase A (identity-match → bankarization-validation), Phase B (income.calculate() → liability.calculate()), Phase C (bankViabilityRule.execute()). Phase failure produces warning but continues
- [x] 1.3 Update `bank-viability.rule.ts` — add `averageGrossIncome`/`averageNetIncome` to Prisma select; fallback: `confirmedGrossIncome ?? averageGrossIncome`/`confirmedNetIncome ?? averageNetIncome`
- [x] 1.4 Update `case-analysis.service.spec.ts` — mock IncomeCalculationService + LiabilityCalculationService; add phased execution tests; verify bankViability receives fresh data
- [x] 1.5 Update `bank-viability.rule.spec.ts` — add tests for income fallback when confirmed is null

## Phase 2: Remove Confirmations (Backend)

- [x] 2.1 Remove `POST /cases/:caseId/income/confirm` endpoint from `income-calculation.controller.ts`
- [x] 2.2 Remove `confirm()` method from `income-calculation.service.ts`
- [x] 2.3 Remove `POST /mortgage-cases/:caseId/analysis/:runId/review-decision` endpoint from `mortgage-cases.controller.ts`
- [x] 2.4 Remove `recordReviewDecision()` and `transitionToRequiresReview` from `case-analysis.service.ts`
- [x] 2.5 Delete confirmation-related tests from `income-calculation.service.spec.ts`, `mortgage-cases.controller.spec.ts`, `case-analysis.service.spec.ts`

## Phase 3: Remove Confirmations (Frontend)

- [x] 3.1 In `analysis-section.tsx`: remove `ActionsGroup`, `OperationalStatusBadge`, `handleReviewDecision`. Replace "Validar expediente" with "Analizar expediente" button
- [x] 3.2 In `income-calculation-section.tsx`: remove "Confirmar ingresos" card (form inputs, KPI cards, CONFIRMADO badge)
- [x] 3.3 In `estados-conciliacion.tsx`: remove per-receipt "PENDIENTE / REVISADO" toggle and `reviewStates` persistence
- [x] 3.4 Delete `submitReviewDecision` from `apps/web/app/actions/analysis.ts`
- [x] 3.5 Delete `confirmIncome` from `apps/web/app/actions/income.ts`

## Phase 4: Verification

- [x] 4.1 Run `npm test` in `apps/api` — all affected suites pass, no regressions
- [ ] 4.2 Manual smoke test: create case → "Analizar expediente" → verify all tabs update
- [ ] 4.3 Verify bankViability snapshot contains product matches with calculated income/liability data
