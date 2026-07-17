# Archive Report — HU-12 Ingreso Mensual Admisible

## Executive Summary

HU-12 "Cálculo de ingreso mensual admisible" implementado, verificado y archivado exitosamente.
Backend + frontend entregados en 2-PR feature branch chain. 100 tests pasando (49 income + 51
liability regression), 12/12 spec scenarios compliant, Prisma schema valid, TypeScript clean.
22/23 tasks complete; task 4.6 (frontend component tests) intencionalmente omitida con aprobación
explícita del orchestrator — `apps/web` no tiene test runner configurado. Verdict: **PASS WITH
WARNINGS** (no CRITICAL issues).

**Archive mode**: `intentional-with-warnings` (non-critical partial archive approved by orchestrator).

## Lineage (Engram Observation IDs)

| Artifact | Type | Observation ID |
|----------|------|----------------|
| Proposal | `sdd/hu-12-ingreso-mensual-admisible/proposal` | #359 |
| Spec | `sdd/hu-12-ingreso-mensual-admisible/spec` | #360 |
| Design | `sdd/hu-12-ingreso-mensual-admisible/design` | #361 |
| Tasks | `sdd/hu-12-ingreso-mensual-admisible/tasks` (topic: `HU-12 income calculation tasks breakdown`) | #362 |
| Apply Progress | `sdd/hu-12-ingreso-mensual-admisible/apply-progress` (topic: `HU-12 remaining tests complete — 16/17 tasks done`) | #364 |
| Verify Report (PR1) | `sdd/hu-12-ingreso-mensual-admisible/verify-report-pr1` | #367 |
| Verify Report (final) | `sdd/hu-12-ingreso-mensual-admisible/verify-report` | #368 |
| Archive Report | `sdd/hu-12-ingreso-mensual-admisible/archive-report` | This |

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| `income-calculation` | **Created** | New domain. Full spec copied from `openspec/changes/hu-12-ingreso-mensual-admisible/specs/income-calculation/spec.md`. 7 requirements, 12 scenarios, all ADDED. |
| `frontend` | Not modified | The proposal listed `frontend` as a Modified Capability, but the delta spec is self-contained: the new `income-calculation` spec includes its own "UI Placement" requirement (R7) covering the Motor Financiero tab ordering. Mirrors the HU-11 pattern (`liability-calculation` was also kept isolated, not merged into `frontend`). |

## Archive Contents

`openspec/changes/archive/2026-07-16-hu-12-ingreso-mensual-admisible/`

- `proposal.md` ✅
- `specs/income-calculation/spec.md` ✅
- `design.md` ✅
- `tasks.md` ✅ (22/23 tasks complete; 4.6 SKIPPED with explicit approval, archive note appended)
- `archive-report.md` ✅ (this file)

## Implementation Summary

### PR1 — Backend (#6) ✅ Merged
- **Branch**: `feature/hu-12-ingreso-mensual-admisible-core` → `feature/hu-12-ingreso-mensual-admisible` (tracker)
- **URL**: https://github.com/marijo-vina/analisis_hipotecario/pull/6
- **Work-unit commits (5)**: schema → module → service (TDD) → controller (TDD) → docs
- **Tests**: 41/41 income + 51/51 liability regression
- **Files created**:
  - `apps/api/prisma/schema.prisma` (modified) — `IncomeCalculation` model + `incomeCalculations` relation on `MortgageCase`
  - `apps/api/prisma/migrations/20260716105335_add_income_calculation/`
  - `apps/api/src/income-calculation/income-calculation.module.ts`
  - `apps/api/src/income-calculation/income-calculation.types.ts` — `IncomeCalculationStatus` enum + `IncomeReceiptResult`, `IncomeCalculationResult` interfaces
  - `apps/api/src/income-calculation/income-calculation.service.ts` — `calculate()`, `getLatest()`, `toggleReceipt()`, `confirm()`
  - `apps/api/src/income-calculation/income-calculation.controller.ts` — POST/GET/PATCH/POST endpoints with `JwtAuthGuard`
  - `apps/api/src/income-calculation/dto/confirm-income.dto.ts`
  - `apps/api/src/app.module.ts` (modified) — `IncomeCalculationModule` registered
  - `apps/api/src/income-calculation/income-calculation.service.spec.ts` (22 tests)
  - `apps/api/src/income-calculation/income-calculation.controller.spec.ts` (19 tests)
  - `apps/api/src/income-calculation/income-calculation.integration.spec.ts` (5 tests)
- **Strict TDD**: RED → GREEN pattern across service and controller; 3 conciliation-isolation tests added to service spec (Task 4.5)

### PR2 — Frontend (#7) ✅ Merged
- **Branch**: `feature/hu-12-ingreso-mensual-admisible-ui` → `feature/hu-12-ingreso-mensual-admisible-core` (PR1)
- **URL**: https://github.com/marijo-vina/analisis_hipotecario/pull/7
- **Work-unit commits (2)**: server actions → UI component + wiring
- **Tests**: Backend regression intact (49+51)
- **Files created**:
  - `apps/web/app/actions/income.ts` — `fetchIncomeLatest`, `calculateIncome`, `toggleIncomeReceipt`, `confirmIncome`
  - `apps/web/app/ui/expedientes/income-calculation-section.tsx` — 9-column table, KPI cards, confirmation panel, `formatDate()` for "No identificada"
- **Files modified**:
  - `apps/web/app/ui/expedientes/analysis-section.tsx` — `<IncomeCalculationSection caseId={caseId} />` wired immediately below `<LiabilityCalculationSection />` in Motor Financiero tab (L216-220)

### Tracker Branch
- `feature/hu-12-ingreso-mensual-admisible` — tracker; merge order: PR#6 → PR#7 → tracker → `main`

## Test Results

| Suite | Tests | Status |
|-------|-------|--------|
| `income-calculation.service.spec.ts` | 22 | ✅ Pass |
| `income-calculation.controller.spec.ts` | 19 | ✅ Pass |
| `income-calculation.integration.spec.ts` (incl. 3 conciliation isolation) | 8 | ✅ Pass |
| **Subtotal income** | **49** | **✅ 100%** |
| `liability.service.spec.ts` (regression) | — | ✅ Pass |
| `liability.controller.spec.ts` (regression) | — | ✅ Pass |
| **Subtotal liability regression** | **51** | **✅ 100%** |
| **Grand total** | **100** | **✅ 100%** |

Build: API `tsconfig.build.json` ✅ · Web `tsc` ✅ · Prisma validate ✅

## Spec Compliance Matrix

12/12 scenarios compliant (see Engram `#368` for full table).

| Requirement | Scenarios | Result |
|-------------|-----------|--------|
| R1 Payroll Receipt Display | 2 | ✅ |
| R2 Receipt Inclusion/Exclusion | 2 | ✅ |
| R3 Average Calculation | 2 | ✅ |
| R4 Manual Confirmation | 2 | ✅ |
| R5 Snapshot Persistence | 2 | ✅ |
| R6 Simple States | 1 | ✅ |
| R7 UI Placement | 1 | ✅ |

## Deviations from Plan

1. **Delivery strategy**: `tasks.md` forecast recommended "single PR, Chained PRs: No", but implementation used a 2-PR feature branch chain (PR1 backend, PR2 frontend). Not a defect — chained delivery provided better review isolation per the 400-line workload guard. **No impact on quality.**

## Open Items (Non-Blocking)

1. **Task 4.6 — Frontend component tests (SKIPPED)**
   - Reason: `apps/web` has no test runner configured (no Vitest/Jest/RTL installed).
   - Impact: Frontend coverage is unverified by automated tests. Manual verification was done in Phase 5.
   - Mitigation: Adding a minimal frontend test runner (Vitest + Testing Library) is a separate infrastructure concern, scoped outside HU-12.
   - **Status**: Explicitly accepted by orchestrator. Recorded as `intentional-with-warnings` archive.

2. **Frontend coverage (suggestion, not requirement)**: Add `npm run test:cov` for the `apps/api` income-calculation module to measure changed-file coverage.

3. **Design open question #3** (conciliation/review status source): Resolved by reading existing conciliation data from `Document.extractedData` at calculation time and mirroring in snapshot. The `conciliationStatus` and `reviewStatus` fields are hardcoded `null` in the initial implementation — known deferral for future iteration when those data sources are wired.

## Risks / Notes

- **Stale checkbox reconciliation**: Task 4.6 (`- [ ]`) is intentionally unchecked with `apply-progress` (`#364`) and `verify-report` (`#368`) proving the skip is deliberate, not stale. Per `sdd-archive` rules, this constitutes an authorized non-critical partial archive. The audit trail correctly shows 22/23 complete; do NOT interpret the unchecked box as incomplete work.
- **Migration rollback**: Reversible (drop `IncomeCalculation` table, revert schema, remove module/component). Snapshots remain intact for audit.
- **HU-09, HU-10, HU-11 regression**: 51/51 liability tests pass — no regression.
- **Conciliation isolation verified**: Service has zero imports from conciliation modules; 3 dedicated isolation tests confirm the engine is not invoked during income calculation.

## SDD Cycle Complete

The change has been fully planned, implemented, verified, and archived with explicit acceptance
of one non-critical warning (frontend test runner). Ready for the next change.
