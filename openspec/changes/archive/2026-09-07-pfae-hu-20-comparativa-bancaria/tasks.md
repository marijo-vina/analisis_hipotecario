# Tasks: PFAE HU-20 Bank Comparison

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~900–1200 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Unit 1 → Unit 2 → Unit 3 → Unit 4 (local tandas) |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Base branch | Notes |
|------|------|-------------|-------|
| 1 | Schema, seed, Banks API catalog | `feature/pfae-hu-20-comparativa-bancaria` ← `perfil-pfae` | Local commit; no GitHub PR |
| 2 | Banks UI editors | Same HU branch after Unit 1 | Not expediente Comparativa |
| 3 | Phase C PFAE branch + rules | Same HU branch after Unit 2 | All viability scenarios |
| 4 | PATCH source + `runPhaseC` | Same HU branch after Unit 3 | Phase-C-only re-run |

## Phase 1: Foundation — Unit 1

- [x] 1.1 RED: `apps/api/src/seed-data.spec.ts` — locked Banorte FLAT 0.6, HSBC NONE 1.0, Scotiabank REJECTED, Mifel CE 0.50 / health 1.5
- [x] 1.2 GREEN: `apps/api/prisma/schema.prisma` — enums, `BankActivityFactor`, PFAE fields on `Bank`/`BankPolicy`; run migration
- [x] 1.3 GREEN: `apps/api/prisma/seed-data.ts` — captura-first factors, tenure, nullable PFAE CMA cells, BX+ dual factors
- [x] 1.4 RED: `apps/api/src/banks/dto/*.spec.ts` — factor DTO `@Min(0)` no max; PATCH card FLAT 0.6
- [x] 1.5 GREEN: `apps/api/src/banks/*` — PATCH PFAE card + policy PFAE cells; CRUD `/banks/:code/activity-factors`

## Phase 2: Banks UI — Unit 2

- [x] 2.1 `apps/web/app/ui/banks/*`, `definitions.ts`, `actions/banks.ts` — factor mode card, flat factor, `taxReturnPolicy`
- [x] 2.2 Same — factors table CRUD allowing > 1 (Mifel health 1.5 scenario)
- [x] 2.3 Same — PFAE `minimumActivityTenureMonths` + nullable PFAE income-min / age-min on policy row

## Phase 3: Keywords & Matcher — Unit 3

- [x] 3.1 RED: `apps/api/src/income-calculation/pfae-income.helpers.spec.ts` — CSF "cultivo" → N=12; NFD strip ganadería
- [x] 3.2 GREEN: expand `TWELVE_MONTH_KEYWORDS` in `pfae-income.helpers.ts`
- [x] 3.3 RED: `apps/api/src/case-analysis/activity-factor-match.spec.ts` — FLAT/NONE skip; MATRIX hit/miss
- [x] 3.4 GREEN: create `apps/api/src/case-analysis/activity-factor-match.ts`

## Phase 4: Phase C & Validation — Unit 3

- [x] 4.1 RED: `pfae-validation.rule.spec.ts` — MATRIX unmapped → PARTIAL WARNING `ACTIVITY_UNMAPPED`
- [x] 4.2 GREEN: `pfae-validation.rule.ts` — inject Prisma; persist WARNING when any MATRIX bank misses alias
- [x] 4.3 RED: `bank-viability.rule.spec.ts` — Banorte ×0.6, HSBC ×1.0, unmapped REQUIRES_REVIEW, Scotiabank NOT_COMPATIBLE, Banorte NOT_PREFERRED CONDITIONED, filled vs empty PFAE CMA
- [x] 4.4 GREEN: `bank-viability.rule.ts` + types — PFAE branch, giro after base, tenure, CMA pick, `resolveProductStatus` order
- [x] 4.5 GREEN: keep SALARIED payroll fixtures in `bank-viability.rule.spec.ts` passing (regression)

## Phase 5: PATCH & runPhaseC — Unit 4

- [x] 5.1 RED: `case-analysis.service.spec.ts` — `runPhaseC` copies Phase A `ruleResults`, BankViability only
- [x] 5.2 GREEN: `runPhaseC` in `case-analysis.service.ts`
- [x] 5.3 RED: `income-calculation.service.spec.ts` — `switchSource` clones bases, projects tax averages; 400 invalid/tax-loss/SALARIED
- [x] 5.4 GREEN: `switchSource` + `PATCH /cases/:caseId/income/source` in income controller; `forwardRef`; call `runPhaseC`
- [x] 5.5 Integration: PATCH → new IncomeCalculation + AnalysisRun with copied Phase A; no second header Analyze
