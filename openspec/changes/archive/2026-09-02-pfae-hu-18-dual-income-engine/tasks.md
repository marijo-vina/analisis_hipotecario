# Tasks: PFAE HU-18 Dual Income Engine

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 900–1200 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Unit 1 → Unit 2 → Unit 3 (local commits on HU branch) |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain (local sequential units on HU branch) |

Decision needed before apply: No (user chose tandas A)
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Base | Notes |
|------|------|------|-------|
| 1 | Schema, types, helpers + unit tests | `feature/pfae-hu-18-dual-income-engine` | ~450 lines; local only, no push |
| 2 | PFAE `calculate()` + service tests | after Unit 1 | ~450 lines |
| 3 | Liability factor + case-analysis integration | after Unit 2 | ~200 lines |

Git: work stays local on HU branch; no push; no merge to `feature/perfil-pfae` until user QA; no `main`.

## Phase 1: Foundation

- [x] 1.1 Add `source` + `bases` to `apps/api/prisma/schema.prisma`; create migration with `DEFAULT 'PAYROLL'` backfill
- [x] 1.2 Extend `apps/api/src/income-calculation/income-calculation.types.ts` with `IncomeSource`, `IncomeBase`, `BankIncomeBase`, `ActivityResolution`, `PfaeIncomeBases`

## Phase 2: PFAE Helpers (TDD)

- [x] 2.1 RED: `pfae-income.helpers.spec.ts` — six-month 15, twelve-month 6.5, short window invalid, CSF selects N, tax monthly conversion
- [x] 2.2 GREEN: `pfae-income.helpers.ts` — `resolveActivity`, `assembleMonths`, `smooth`, `taxMonthly`, `chooseSource`

## Phase 3: Income Service (TDD)

- [x] 3.1 RED: `income-calculation.service.spec.ts` — default source projection, tax when bank invalid, fiscal loss knocks out tax only, both invalid REQUIRES_REVIEW, PFAE analyze without payroll, SALARIED regression, GET latest `source`/`bases`
- [x] 3.2 GREEN: PFAE branch in `income-calculation.service.ts`; `snapshotToResult` exposes `source` + `bases`

## Phase 4: Liability + Integration (TDD)

- [x] 4.1 RED: `liability.service.spec.ts` — PFAE revolving 7000/0.07, SALARIED 6000 regression, PFAE UNKNOWN 7000
- [x] 4.2 GREEN: `resolveFactor()` in `liability.service.ts`; thread factor into `calculateUnknown`
- [x] 4.3 RED+GREEN: `case-analysis.service.spec.ts` — PFAE Phase B persists income snapshot without payroll
