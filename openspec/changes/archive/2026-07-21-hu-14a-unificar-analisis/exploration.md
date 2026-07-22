## Exploration: HU-14A — Unificar flujo de análisis y eliminar confirmaciones

### Current Analysis Flow

**Tab "Validaciones" (`analysis-section.tsx`)**
1. Advisor clicks **"Validar expediente"** → calls `triggerAnalysis` → `POST /mortgage-cases/:caseId/analyze`.
2. Backend `CaseAnalysisService.run()` executes sequentially:
   - `identityMatchRule`
   - `bankarizationValidationRule`
   - `bankViabilityRule` (reads `incomeCalculation.confirmedGrossIncome` / `confirmedNetIncome` and `liabilitySnapshot.grossCurrentMonthlyDebt` from DB)
3. Result displayed: operational status badge (`REQUIRES_REVIEW` / `REVIEWED`), discrepancy table, collapsible comparison table.
4. Actions group appears with three buttons:
   - **"Revisar documentos"** (scrolls to documentos)
   - **"Reprocesar análisis"** (re-runs `triggerAnalysis`)
   - **"Confirmar revisión"** → calls `submitReviewDecision` with `CONFIRM_ISSUE` → `POST /mortgage-cases/:caseId/analysis/:runId/review-decision`
5. Conciliación section (`estados-conciliacion.tsx`) has its own **"Reconciliar nómina vs banco"** button and per-receipt **"PENDIENTE / REVISADO"** toggle that persists `reviewStatus` into `Document.processingResults`.

**Tab "Motor financiero" (`analysis-section.tsx`)**
6. `LiabilityCalculationSection` → **"Calcular"** → `POST /cases/:caseId/liability/calculate`.
7. `IncomeCalculationSection` → **"Calcular ingresos"** → `POST /cases/:caseId/income/calculate`.
8. Advisor can toggle receipt inclusion via `PATCH /cases/:caseId/income/receipts/:receiptIndex`.
9. Advisor fills **"Ingreso bruto mensual confirmado"**, **"Ingreso neto mensual confirmado"**, **"Observaciones"** and clicks **"Confirmar ingresos"** → `POST /cases/:caseId/income/confirm` → status becomes `CONFIRMED`.

**Key Issue:** `bankViabilityRule` runs inside `CaseAnalysisService.run()` but income/liability snapshots often do not exist yet when the user only clicked "Validar expediente". The rule reads `confirmedGrossIncome` / `confirmedNetIncome` (which are null until manually confirmed), so bank viability effectively requires the user to have already run income/liability AND confirmed income before "Validar expediente" — which is the opposite of the intended flow.

### Affected Areas

- `apps/web/app/ui/expedientes/analysis-section.tsx` — buttons, review state, actions group, operational status badge
- `apps/web/app/ui/expedientes/income-calculation-section.tsx` — confirmation panel, confirmed KPI cards, `CONFIRMED` badge logic
- `apps/web/app/ui/extraction/estados-conciliacion.tsx` — per-receipt `PENDIENTE / REVISADO` toggle and `reviewStates` persistence
- `apps/web/app/actions/analysis.ts` — `submitReviewDecision` action
- `apps/web/app/actions/income.ts` — `confirmIncome` action
- `apps/api/src/mortgage-cases/mortgage-cases.controller.ts` — `POST .../review-decision` endpoint
- `apps/api/src/case-analysis/case-analysis.service.ts` — `recordReviewDecision`, `transitionToRequiresReview`, rule execution order
- `apps/api/src/case-analysis/rules/bank-viability.rule.ts` — reads `confirmedGrossIncome` / `confirmedNetIncome` (must fall back to calculated averages)
- `apps/api/src/income-calculation/income-calculation.controller.ts` — `POST /confirm` endpoint
- `apps/api/src/income-calculation/income-calculation.service.ts` — `confirm` method
- `apps/api/src/liability/liability.controller.ts` — `extractCreditsFromCase` private helper (needs to be accessible to orchestrator)
- `apps/api/prisma/schema.prisma` — `ReviewDecision` model, `IncomeCalculation.confirmedGrossIncome`, `confirmedNetIncome`, `confirmedBy`, `confirmedAt`, `observations`

### What to Remove

**Frontend**
- `ActionsGroup` component and all its buttons ("Revisar documentos", "Reprocesar análisis", "Confirmar revisión") in `analysis-section.tsx`
- `OperationalStatusBadge` and `operationalStatus` state logic in `analysis-section.tsx`
- `handleReviewDecision` function in `analysis-section.tsx`
- `submitReviewDecision` server action in `apps/web/app/actions/analysis.ts`
- Entire "Confirmar ingresos" card (form inputs + button) in `income-calculation-section.tsx`
- Confirmed KPI cards ("Bruto confirmado", "Neto confirmado") and `CONFIRMADO` badge in `income-calculation-section.tsx`
- `confirmIncome` server action in `apps/web/app/actions/income.ts`
- Per-receipt `PENDIENTE / REVISADO` toggle button and `reviewStates` persistence in `estados-conciliacion.tsx`

**Backend**
- `POST /mortgage-cases/:caseId/analysis/:runId/review-decision` endpoint in `mortgage-cases.controller.ts`
- `recordReviewDecision` method in `case-analysis.service.ts`
- `POST /cases/:caseId/income/confirm` endpoint in `income-calculation.controller.ts`
- `confirm` method in `income-calculation.service.ts`
- `ReviewDecisionDto` and `ConfirmIncomeDto` DTO files
- `transitionToRequiresReview` gating in `case-analysis.service.ts` (or at least stop transitioning to `REQUIRES_REVIEW` on FAIL)
- Prisma schema cleanup (optional, can be deferred): drop `ReviewDecision` model, drop `confirmed*` fields from `IncomeCalculation`

### What to Add/Modify

- **Single unified button**: Replace "Validar expediente" with **"Analizar expediente"** in the Validaciones tab. The Motor financiero tab can still show results but no longer needs its own primary trigger buttons (or they become secondary/manual refresh).
- **Backend orchestration**: Modify `CaseAnalysisService.run()` to execute in this order:
  1. `identityMatchRule`
  2. `bankarizationValidationRule`
  3. `incomeCalculationService.calculate(caseId, [])` — auto-calculate income with all receipts included
  4. `liabilityCalculationService.calculate(caseId, credits)` — auto-calculate liability from latest bureau report
  5. `bankViabilityRule` — now has income/liability snapshots available
- **BankViabilityRule fallback**: Change income resolution to use `averageGrossIncome` / `averageNetIncome` when `confirmedGrossIncome` / `confirmedNetIncome` are null (since confirmation is removed).
- **Liability service refactor**: Move `extractCreditsFromCase` logic from `LiabilityController` into `LiabilityCalculationService` (or make it a reusable helper) so the orchestrator can call it.
- **Income/liability injection**: Inject `IncomeCalculationService` and `LiabilityCalculationService` into `CaseAnalysisService` constructor.

### Backend Services to Orchestrate

| Service | Already Chained? | Needs Orchestration? |
|---|---|---|
| `IdentityMatchRule` | Yes (in `CaseAnalysisService.rules`) | No change |
| `BankarizationValidationRule` | Yes (in `CaseAnalysisService.rules`) | No change |
| `IncomeCalculationService.calculate()` | No (separate endpoint) | **Yes — must run before bank viability** |
| `LiabilityCalculationService.calculate()` | No (separate endpoint) | **Yes — must run before bank viability** |
| `BankViabilityRule` | Yes (in `CaseAnalysisService.rules`) | **Yes — must move to end of chain** |

### Test Impact

| File | What breaks |
|---|---|
| `apps/api/src/case-analysis/case-analysis.service.spec.ts` | `recordReviewDecision` tests (~50 lines), `transitionToRequiresReview` test (~20 lines) |
| `apps/api/src/mortgage-cases/mortgage-cases.controller.spec.ts` | `submitReviewDecision` tests (~70 lines) |
| `apps/api/src/mortgage-cases/mortgage-cases.analysis.integration.spec.ts` | Review-decision integration tests (~60 lines) |
| `apps/api/src/income-calculation/income-calculation.service.spec.ts` | `confirm()` tests (~100 lines) |
| `apps/api/src/income-calculation/income-calculation.integration.spec.ts` | `POST /confirm` integration tests (~80 lines) |
| `apps/api/src/case-analysis/rules/bank-viability.rule.spec.ts` | Income/liability resolution mocks may need adjustment if we change the Prisma select fields |

**Estimated test changes:** ~300–400 lines across 6 spec files (mostly deletions). The frontend has zero test files, so no test impact there.

### Recommendation

**Approach: Modify `CaseAnalysisService.run()` as the orchestrator.**

This is the most pragmatic choice because:
1. The service's own JSDoc already calls it an "orchestrator".
2. It keeps the single endpoint (`POST /mortgage-cases/:caseId/analyze`) that the frontend already calls.
3. It solves the root cause: bank viability will finally receive the income/liability data it needs.
4. Minimal new code — we reorder/restructure the existing `run()` method and inject two services.

**Steps:**
1. Inject `IncomeCalculationService` and `LiabilityCalculationService` into `CaseAnalysisService`.
2. In `run()`, execute rules in phases:
   - Phase A: document-level rules (`identityMatch`, `bankarization`).
   - Phase B: financial calculations (income, liability) — call services directly.
   - Phase C: `bankViabilityRule` (manually executed after Phase B, not via the `rules` array loop).
3. Update `BankViabilityRule` to read `averageGrossIncome` / `averageNetIncome` as fallback when confirmed values are null.
4. Remove `transitionToRequiresReview` gating.
5. Remove all confirmation UI and backend endpoints.

**Effort estimate:** Medium — roughly 2–3 days including tests.

### Risks

- `BankViabilityRule` currently expects `confirmed*` income. Changing the fallback to `average*` could shift viability results for existing cases that had confirmed values. This is acceptable because the goal is to eliminate the confirmation step entirely.
- Removing `REQUIRES_REVIEW` status transition may affect downstream case-status workflows (e.g., dashboard filters, case list status badges). Need to verify no other code depends on `REQUIRES_REVIEW` as a hard gate.
- Prisma schema cleanup (dropping `ReviewDecision` model and `confirmed*` columns) requires a migration and may break historical data if not handled carefully. Recommend deferring schema cleanup to a separate maintenance task; start by removing UI/backend logic while leaving DB columns nullable.
- The `estados-conciliacion.tsx` `reviewStatus` is stored inside `Document.processingResults` JSON (no schema change needed), but removing the toggle means `reviewStatus` will stop being updated. Old values will remain in JSON until documents are re-processed.

### Ready for Proposal

**Yes.**

The investigation is complete. The orchestrator should proceed to the **propose** phase. The orchestrator should tell the user that the current flow has three separate triggers (Validar, Calcular ingresos, Calcular pasivos) plus manual confirmations, and the refactor will collapse them into a single "Analizar expediente" button that runs identity, conciliation, income, liability, and bank viability in the correct backend sequence.
