# Apply Progress: pfae-hu-21-expediente-ui

**Batch**: Unit 4 (tasks 4.1–4.3)
**Mode**: Strict TDD (API) / web UI no Jest
**Branch**: `feature/pfae-hu-21-expediente-ui`
**Chain strategy**: feature-branch-chain (local tandas; no GitHub PR this batch)
**Prior apply-progress**: Units 1–3 complete (tasks 1.1–1.4, 2.1–2.2, 3.1–3.3) — merged below, not overwritten

## Completed

- [x] 1.1 RED: extend `bank-viability.rule.spec.ts` — PFAE audit persist, unmapped ≠ invent 1.0, salaried null
- [x] 1.2 GREEN: five additive `BankResult` audit fields; serialize from `resolvePfaeFactor` / match; Phase C math unchanged
- [x] 1.3 Web `definitions.ts` — `ruleResults`, PFAE snapshot, audit fields, `personType`/`incomeSource`, PFAE `REASON_LABELS`
- [x] 1.4 `switchIncomeSource` + `source`/`bases` on `IncomeCalculationResult`; existing PATCH `/income/source` only
- [x] 2.1 Create `pfae-validation-gates.tsx` — Card from persisted snapshot + flattened alerts; tenure INFO; no recompute
- [x] 2.2 Wire in `analysis-section.tsx` only — PFAE section after identity; solely-salaried FAIL copy
- [x] 3.1 Create `pfae-income-panel.tsx` — two unfactored bases + “Base a enviar al banco” picker (`useTransition`); TAX_LOSS disable + inline Spanish
- [x] 3.2 Branch `income-calculation-section.tsx` — `personType === "PFAE"` → panel; salaried payroll table/KPIs untouched
- [x] 3.3 PATCH `switchIncomeSource` then `onSourceSwitched`/`quietLoadLatest`; peinado CRITICAL/MINOR warn + `#extraccion` link (no deposit editor)
- [x] 4.1 Create `pfae-product-detail-extras.tsx` — origin, giro+SAT, factor+mode, tax policy from persisted `BankResult` audit only (never reconstruct from catalog / incomeUsed÷average)
- [x] 4.2 Modify `bank-comparison-tab.tsx` — presentational overlay suppress PRELIMINARY_VIABLE chips without mutating stored `status`; PFAE `activityTenure` row; six table columns unchanged
- [x] 4.3 PFAE `REASON_LABELS` via `getReasonLabel`; mute green viable chrome under overlay; rows stay expandable

## Remaining

- [x] 5.1 Manual QA — PFAE gates, picker refresh, FAIL overlay, detail extras; salaried regression (3 tabs unchanged). Advisor confirmed 2026-09-09 after QA follow-up (dates, tenure, giro copy, medical seed, Cálculo labels).
- [x] 5.2 Confirm out-of-scope untouched — no Banks UI, Banorte 0.70, second Analyze, new endpoints, large in-file UI growth

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `apps/api/src/case-analysis/rules/bank-viability.rule.spec.ts` | Unit | ✅ 72/72 | ✅ Written (4 failing: FLAT persist, MATRIX hit, unmapped, salaried) | N/A (RED-only task) | ✅ 4 cases written first | ➖ None needed |
| 1.2 | `apps/api/src/case-analysis/rules/bank-viability.rule.spec.ts` | Unit | ✅ 72/72 | ✅ Confirmed fail (`undefined` vs expected) | ✅ 76/76 after serialize | ✅ FLAT persist + MATRIX hit + unmapped ≠ 1.0 + salaried null | ➖ None needed (double `resolvePfaeFactor` kept so income math path is untouched) |
| 1.3 | n/a (no web Jest) | Structural types | N/A | ➖ Triangulation skipped: structural types + labels only | ➖ No web Jest | ➖ Triangulation skipped: purely structural (`ruleResults`, snapshot, audit fields, `REASON_LABELS`) | ➖ None needed |
| 1.4 | n/a (no web Jest) | Thin server action | N/A | ➖ Triangulation skipped: thin wrapper around existing PATCH | ➖ No web Jest | ➖ Triangulation skipped: one possible call shape (`PATCH { source }`) | ➖ None needed |
| 2.1 | n/a (no web Jest) | Presentational UI | N/A | ➖ Triangulation skipped: web UI with no Jest; do not add a web test runner | ➖ No web Jest | ➖ Triangulation skipped: Unit 2 is web UI; contracts locked by `PfaeValidationSnapshot` / `ruleResults` array + persisted alerts | ➖ None needed |
| 2.2 | n/a (no web Jest) | Parent wiring | N/A | ➖ Triangulation skipped: web UI with no Jest; do not add a web test runner | ➖ No web Jest | ➖ Triangulation skipped: `personType === "PFAE"` branch only; SALARIED does not render the Card | ➖ None needed |
| 3.1 | n/a (no web Jest) | Presentational UI | N/A | ➖ Triangulation skipped: web UI with no Jest; do not add a web test runner | ➖ No web Jest | ➖ Triangulation skipped: Unit 3 is web UI; contracts locked by `source`/`bases` + TAX_LOSS disable | ➖ None needed |
| 3.2 | n/a (no web Jest) | Parent branch | N/A | ➖ Triangulation skipped: web UI with no Jest; do not add a web test runner | ➖ No web Jest | ➖ Triangulation skipped: `personType === "PFAE"` branch only; salaried payroll table/KPIs untouched | ➖ None needed |
| 3.3 | n/a (no web Jest) | Parent wiring | N/A | ➖ Triangulation skipped: web UI with no Jest; do not add a web test runner | ➖ No web Jest | ➖ Triangulation skipped: quiet `loadLatest` + peinado boolean from existing `integrityCheck`; no deposit editor | ➖ None needed |
| 4.1 | n/a (no web Jest) | Presentational UI | N/A | ➖ Triangulation skipped: web UI with no Jest; do not add a web test runner | ➖ No web Jest | ➖ Triangulation skipped: Unit 4 is web UI; extras read persisted audit only | ➖ None needed |
| 4.2 | n/a (no web Jest) | Presentational overlay | N/A | ➖ Triangulation skipped: web UI with no Jest; do not add a web test runner | ➖ No web Jest | ➖ Triangulation skipped: overlay is presentational; stored `status` untouched | ➖ None needed |
| 4.3 | n/a (no web Jest) | Presentational overlay | N/A | ➖ Triangulation skipped: web UI with no Jest; do not add a web test runner | ➖ No web Jest | ➖ Triangulation skipped: `getReasonLabel` already wired; mute is CSS-only | ➖ None needed |

### Test Summary

- **Total tests written**: 4 (API unit, Unit 1) + 0 (Units 2–4 web)
- **Total tests passing**: 76 (Unit 1 API) — Units 2–4 did not re-run API Jest
- **Layers used**: Unit (4), Integration (0), E2E (0)
- **Approval tests** (refactoring): None — no refactoring tasks
- **Pure functions created**: display helpers in `pfae-validation-gates.tsx` (Unit 2) + `pfae-income-panel.tsx` (Unit 3) + `pfae-product-detail-extras.tsx` (`originDisplay`, `giroDisplay`, `factorDisplay`, `taxPolicyDisplay`) and `bank-comparison-tab.tsx` (`statusBadgeColor`, `checkMonths`) — presentational / mapping only; factor never reconstructed
- **Typecheck**: `npx tsc --noEmit` in `apps/web` — exit 0 (Unit 4)

### Safety net

Unit 1: ran Jest on `bank-viability.rule.spec.ts` before production edits (**72 passed**); GREEN **76 passed**.

Unit 2: no web test runner. Did not add Jest/Vitest. Did not modify API tests. Typecheck of `apps/web` passed.

Unit 3: no web test runner. Did not add Jest/Vitest. Did not modify API tests. Typecheck of `apps/web` passed (exit 0). Triangulation skipped per orchestrator: web UI with no Jest.

Unit 4: no web test runner. Did not add Jest/Vitest. Did not modify API tests. Typecheck of `apps/web` passed (exit 0). Triangulation skipped per orchestrator: web UI with no Jest.

## Deviations

- Task 1.4 text says “commit unit with API tests green”. Work-unit git commit **deferred** — orchestrator/user asked to leave the working tree; no commit this batch (Units 1–4).
- `resolvePfaeFactor` is invoked twice on the PFAE path (once in `resolveIncomeUsed` for math, once at `evaluateBank` return for audit). Intentional so Phase C `chosen.mul(factor)` stays on the original path. (Unit 1, carried forward.)
- Units 2–4 TDD triangulation skipped per orchestrator: web UI with no Jest; do not add a web test runner.
- Quiet analysis refresh: `loadLatest({ quiet: true })` skips `phase: "loading"` so Comparativa/Validaciones keep the current run until GET arrives. Mount and Analyze still use noisy loading. (Unit 3, carried forward.)
- NONE factor copy uses “Sin factor” (unit-4 prompt) rather than `PFAE_FACTOR_MODE_LABELS.NONE` (“Sin factor (1.0)”) so unmapped/NONE cannot be read as inventing 1.0. MATRIX/FLAT still use `PFAE_FACTOR_MODE_LABELS`.
- PFAE tenure **replaces** the employmentTenure control row with `activityTenure` (employmentTenure check remains persisted `NOT_APPLICABLE`; not shown as the tenure control). Policy min from `checks.activityTenure.requiredMonths`, not `policySnapshot`.

## Issues

None.

## Files changed

### Unit 1 (prior batch)

| File | Action | What |
|------|--------|------|
| `apps/api/src/case-analysis/rules/bank-viability.rule.spec.ts` | Modified | 4 audit persist tests |
| `apps/api/src/case-analysis/types/bank-viability.types.ts` | Modified | `PfaeFactorMode`, `TaxReturnPolicy`, five `BankResult` fields |
| `apps/api/src/case-analysis/rules/bank-viability.rule.ts` | Modified | Extend `resolvePfaeFactor`; serialize audit on `evaluateBank` return |
| `apps/web/app/lib/definitions.ts` | Modified | `ruleResults`, PFAE snapshot, audit, inputs, `REASON_LABELS` |
| `apps/web/app/actions/income.ts` | Modified | `source`/`bases` types; `switchIncomeSource` |

### Unit 2 (prior batch)

| File | Action | What |
|------|--------|------|
| `apps/web/app/ui/expedientes/pfae-validation-gates.tsx` | Created | Gates Card: régimen, vigencia, tenure INFO, activity (SAT + %), coherence from `ruleResults.find(ruleId === "pfae-validation")` + flattened alerts; FAIL copy; PARTIAL CSF; ACTIVITY_UNMAPPED warning |
| `apps/web/app/ui/expedientes/analysis-section.tsx` | Modified | Import + PFAE-only section after identity, before salaried bankarization; pass `state.run` when phase is result/observations |
| `openspec/changes/pfae-hu-21-expediente-ui/tasks.md` | Modified | Units 1–2 `[x]`; 3.x–5.x remain unchecked |
| `openspec/changes/pfae-hu-21-expediente-ui/apply-progress.md` | Modified | Merged Unit 1 + Unit 2 |

### Unit 3 (prior batch)

| File | Action | What |
|------|--------|------|
| `apps/web/app/ui/expedientes/pfae-income-panel.tsx` | Created | Dual unfactored bases + “Base a enviar al banco” picker (`useTransition`); TAX_LOSS disable + inline Spanish; PATCH then local snapshot + `onSourceSwitched`; peinado warn + `#extraccion`; muted empty Card; no deposit editor |
| `apps/web/app/ui/expedientes/income-calculation-section.tsx` | Modified | PFAE branch → panel; salaried payroll table/KPIs untouched |
| `apps/web/app/ui/expedientes/analysis-section.tsx` | Modified | Quiet `loadLatest`; pass `personType`, `onSourceSwitched={quietLoadLatest}`, `peinadoWarn` from bank-statement `integrityCheck` MINOR/CRITICAL |
| `openspec/changes/pfae-hu-21-expediente-ui/tasks.md` | Modified | Units 1–3 `[x]`; 4.x–5.x remain unchecked |
| `openspec/changes/pfae-hu-21-expediente-ui/apply-progress.md` | Modified | Merged Units 1–3 |

### Unit 4 (this batch)

| File | Action | What |
|------|--------|------|
| `apps/web/app/ui/expedientes/pfae-product-detail-extras.tsx` | Created | Origin / giro+SAT / factor+mode / tax policy from persisted audit; NONE → “Sin factor”; unmapped `appliedFactor` null → “—” (never invent 1.0); FieldGrid + `gf-*` |
| `apps/web/app/ui/expedientes/bank-comparison-tab.tsx` | Modified | Overlay flag mutes PRELIMINARY_VIABLE chips/badges without rewriting `status`; PFAE `activityTenure` row via `formatAge`; six columns unchanged; `getReasonLabel` for PFAE reasons; expand/`onRowClick` unchanged |
| `apps/web/app/ui/expedientes/analysis-section.tsx` | Modified | Derive `suppressViablePresentation` from alerts / `pfae-validation` regime FAIL; pass FAIL copy into Comparativa |
| `openspec/changes/pfae-hu-21-expediente-ui/tasks.md` | Modified | Units 1–4 `[x]`; 5.1–5.2 remain unchecked |
| `openspec/changes/pfae-hu-21-expediente-ui/apply-progress.md` | Modified | Merged Units 1–4 |

## Workload boundary

Unit 4 only. Verify / Unit 5 not started (no browser QA).

- Mode: chained PR slice (feature-branch-chain, local tanda 4)
- Current work unit: Unit 4 — Comparativa extras + overlay
- Boundary: starts after Unit 3 Cálculo panel; ends with PFAE detail extras + presentational FAIL overlay; does not include 5.1–5.2 manual QA
- Estimated review budget impact: extras island + overlay hunks in Comparativa; within local tanda 4

## QA follow-up (2026-09-09, not Unit 5)

Advisor feedback after first expediente pass. Implementation only; 5.1 still needs a re-analyze after seed.

- Tenure INFO copy: years + leftover months (`formatActivityTenure`)
- `ACTIVITY_UNMAPPED` lists matched vs unmapped MATRIX bank names; snapshot stores `matchedBanks` / `unmappedBanks`
- Seed: medical SAT aliases (`consultorio`, `medico`, `doctores`, …) on MATRIX health/servicios rows
- Expediente dates: `DD/MM/YYYY` (no timezone shift); Cálculo month keys `MM/YYYY`
- Cálculo bank: single “Promedio mensual (depósitos)”; tax return keeps bruto (acumulables/12) and neto (utilidad/12)

API Jest: 98 passed (`format-activity-tenure`, `pfae-validation.rule`, `seed-data`). Web `tsc --noEmit` clean.

