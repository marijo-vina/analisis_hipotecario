# Tasks: PFAE HU-21 Expediente UI

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 450–550 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Local tanda 1 → 2 → 3 → 4 (same branch) |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Types + audit persist + switchIncomeSource | Local tanda 1 | API TDD RED/GREEN; tests with code |
| 2 | Validaciones gates Card | Local tanda 2 | Wire `analysis-section.tsx` only |
| 3 | Cálculo panel + picker | Local tanda 3 | PATCH refresh; TAX_LOSS; peinado |
| 4 | Comparativa extras + overlay | Local tanda 4 | Six columns unchanged; REASON_LABELS |

## Phase 1: Foundation — Types + API Audit (Unit 1)

- [x] 1.1 RED: extend `apps/api/src/case-analysis/rules/bank-viability.rule.spec.ts` — PFAE audit persist, unmapped ≠ 1.0, salaried null
- [x] 1.2 GREEN: add five audit fields to `bank-viability.types.ts`; serialize in `bank-viability.rule.ts` (Phase C math unchanged)
- [x] 1.3 Extend `apps/web/app/lib/definitions.ts` — `ruleResults`, PFAE snapshot, audit fields, `personType`/`incomeSource`, PFAE `REASON_LABELS`
- [x] 1.4 Add `switchIncomeSource` + `source`/`bases` on result in `apps/web/app/actions/income.ts`; commit unit with API tests green

## Phase 2: Validaciones (Unit 2)

- [x] 2.1 Create `apps/web/app/ui/expedientes/pfae-validation-gates.tsx` — Card from persisted snapshot + alerts; tenure INFO; no recompute
- [x] 2.2 Wire in `apps/web/app/ui/expedientes/analysis-section.tsx` only — pass `ruleResults`/`alerts`; sole-salaried FAIL copy “este camino PFAE no aplica — cambie a asalariado”

## Phase 3: Cálculo (Unit 3)

- [x] 3.1 Create `apps/web/app/ui/expedientes/pfae-income-panel.tsx` — dual unfactored bases, “Base a enviar al banco” picker (`useTransition`); TAX_LOSS inline Spanish error/disable
- [x] 3.2 Branch `apps/web/app/ui/expedientes/income-calculation-section.tsx` on PFAE → panel; salaried payroll table untouched
- [x] 3.3 PATCH via `switchIncomeSource` then `onSourceSwitched`/`loadLatest`; peinado CRITICAL/MINOR warn + `#extraccion` link (no deposit editor)

## Phase 4: Comparativa + Integration (Unit 4)

- [x] 4.1 Create `apps/web/app/ui/expedientes/pfae-product-detail-extras.tsx` — origin, giro+SAT, factor+mode, tax policy from persisted audit only
- [x] 4.2 Modify `apps/web/app/ui/expedientes/bank-comparison-tab.tsx` — overlay suppress PRELIMINARY_VIABLE chips without mutating stored status; `activityTenure` row; six columns unchanged
- [x] 4.3 Wire `REASON_LABELS` for PFAE reasons; mute green viable badge under FAIL overlay; rows stay expandable

## Phase 5: Verification

- [x] 5.1 Manual QA — PFAE gates, picker refresh, FAIL overlay, detail extras; salaried regression (3 tabs unchanged)
- [x] 5.2 Confirm out-of-scope untouched — no Banks UI, Banorte 0.70, second Analyze, new endpoints, large in-file UI growth
