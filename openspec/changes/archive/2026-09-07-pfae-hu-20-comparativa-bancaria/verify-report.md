## Verification Report

**Change**: pfae-hu-20-comparativa-bancaria
**Version**: N/A (delta specs; OpenSpec change folder)
**Mode**: Strict TDD
**Date**: 2026-09-04
**Verifier**: sdd-verify executor (runtime tests + artifact review)
**Artifact store**: hybrid (OpenSpec file + Engram)

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 22 |
| Tasks complete | 22 (all `[x]` in `tasks.md` and apply-progress #570) |
| Tasks incomplete | 0 |
| Spec domains | 6 (`case-analysis`, `income-calculation`, `bank-catalog`, `bank-policy-management`, `pfae-validation`, `unified-analysis-flow`) |
| Spec scenarios | 18 |

All implementation tasks (Units 1–4) are checked. Unit 2 Banks UI has no Jest runner; completeness is by source + API coverage, not UI runtime tests.

### Build & Tests Execution
**Build / typecheck**: ✅ Passed
```text
apps/api: npx tsc --noEmit -p tsconfig.build.json  (exit 0)
apps/web: npx tsc --noEmit                          (exit 0)
```

**Focused HU-20 tests**: ✅ 357 passed / 0 failed / 0 skipped (14 suites)
```text
cwd: apps/api
npx jest --testPathPatterns "seed-data.spec|banks.service.spec|banks.controller.spec|activity-factor.dto.spec|update-bank.dto.spec|update-policy.dto.spec|pfae-income.helpers.spec|activity-factor-match.spec|pfae-validation.rule.spec|bank-viability.rule.spec|case-analysis.service.spec|income-calculation.service.spec|income-calculation.controller.spec|income-source-phase-c.integration.spec" --verbose
Test Suites: 14 passed, 14 total
Tests:       357 passed, 357 total
Time:        18.427 s
```

**Full API suite**: ✅ 1175 passed / 0 failed / 0 skipped (63 suites)
```text
cwd: apps/api
npm test
Test Suites: 63 passed, 63 total
Tests:       1175 passed, 1175 total
Time:        17.302 s
```
No failures outside HU-20. Prisma seed was **not** run (orchestrator seeds after verify). Local Postgres catalog drift is therefore unproven at DB runtime and is recorded as WARNING, not CRITICAL.

**Coverage** (focused HU-20 suites, `collectCoverageFrom` on changed API modules; Jest `rootDir=src`): 92.34% statements / 80.28% branches / 94% lines for collected files. Threshold in `openspec/config.yaml` is 0. See Changed File Coverage below.

### Spec Compliance Matrix
| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| PFAE Phase C Viability | Locked factor and tax policies | `bank-viability.rule.spec.ts` > PFAE Phase C: Banorte FLAT 0.6, HSBC NONE 1.0, MATRIX unmapped REQUIRES_REVIEW, Scotiabank TAX_RETURN+REJECTED NOT_COMPATIBLE, Banorte NOT_PREFERRED CONDITIONED | ✅ COMPLIANT |
| PFAE Phase C Viability | Tenure, CMA, SALARIED | `bank-viability.rule.spec.ts` > PFAE tenure / filled vs empty CMA + default SALARIED hire-date tenure / unfactored `incomeUsed` (payroll fixtures, 72 tests in file) | ✅ COMPLIANT |
| Phase-C-Only Re-run | Copy Phase A | `case-analysis.service.spec.ts` > `runPhaseC` copies identity-match + pfae-validation, BankViability only | ✅ COMPLIANT |
| SAT Synonyms for Window N | Synonym selects twelve months | `pfae-income.helpers.spec.ts` > `resolveActivity` cultivo → N=12; NFD ganadería; pecuario/pesca/agrícola/restaurante | ✅ COMPLIANT |
| PATCH Income Source | Switch source | `income-calculation.service.spec.ts` > `switchSource` clones bases + projects tax averages; controller PATCH; integration PATCH 200 | ✅ COMPLIANT |
| PFAE Factor and Tenure Catalog | Catalog exposes PFAE fields | `banks.service.spec.ts` > `findByCode` includes `activityFactors`; PATCH card + policy PFAE cells; seed locks | ✅ COMPLIANT |
| PFAE Seed Defaults | Locked seed values | `seed-data.spec.ts` > PFAE factor catalog + CMA cells (Banorte 0.6, HSBC NONE 1.0, Scotiabank REJECTED, Mifel CE 0.50 / health 1.5, Banamex 336m / 35k, Santander 15k/67k, HSBC_LIQ inactive, BX+ dual) | ✅ COMPLIANT |
| Banks PFAE Editors | Save factor above one | `activity-factor.dto.spec.ts` + `banks.service.spec.ts` > create factor 1.5; Banks UI has no Jest (manual QA) | ✅ COMPLIANT |
| Banks PFAE Editors | PATCH bank factor card | `banks.service.spec.ts` / `banks.controller.spec.ts` / `update-bank.dto.spec.ts` > PATCH Banorte FLAT 0.6 | ✅ COMPLIANT |
| Banks PFAE Editors | Edit PFAE tenure and CMA | `banks.service.spec.ts` > same policy row updates tenure + `minimumIncomePfae`; DTO accepts 24 / 67000 / 336. Banks UI editor exists, no Jest | ✅ COMPLIANT |
| Gate Outcome Matrix | Solely salaried fails | `pfae-validation.rule.spec.ts` > FAIL ERROR `REGIMEN_EXCLUSIVAMENTE_ASALARIADO` | ✅ COMPLIANT |
| Gate Outcome Matrix | Missing CSF is partial | `pfae-validation.rule.spec.ts` > PARTIAL empty snapshot (no CSF / null extractedData) | ✅ COMPLIANT |
| Gate Outcome Matrix | Stale CSF vigencia warns | `pfae-validation.rule.spec.ts` > PARTIAL WARNING, not FAIL | ✅ COMPLIANT |
| Gate Outcome Matrix | Tenure is informational only | `pfae-validation.rule.spec.ts` > INFO only; ignores `ARRAIGO_INSUFICIENTE` | ✅ COMPLIANT |
| Gate Outcome Matrix | Rent without régimen warns | `pfae-validation.rule.spec.ts` > PARTIAL WARNING coherence | ✅ COMPLIANT |
| Gate Outcome Matrix | No statements omits coherence | `pfae-validation.rule.spec.ts` > omits when no statements / no cleanedDeposits / empty array | ✅ COMPLIANT |
| Gate Outcome Matrix | Unmapped activity persists warning | `pfae-validation.rule.spec.ts` > PARTIAL WARNING `ACTIVITY_UNMAPPED`; FLAT/NONE skip | ✅ COMPLIANT |
| Income-Source Switch Re-runs Phase C | PATCH is not a second Analyze | `income-source-phase-c.integration.spec.ts` + controller PATCH: Phase C only, copied Phase A, POST `/income/analyze` 404. Header Analyze / Comparativa UI have no automated test (git: `bank-comparison-tab.tsx` unmodified) | ⚠️ PARTIAL |

**Compliance summary**: 17/18 scenarios COMPLIANT, 1/18 PARTIAL, 0 FAILING, 0 UNTESTED

PARTIAL is the unified-flow UI clauses only (no second header Analyze button; Expediente Comparativa/picker/Validaciones unchanged). API behavior of that scenario passed. Spec does not require automated UI tests.

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| PFAE Phase C uses `personType` only | ✅ Implemented | `bank-viability.rule.ts` branches on `mortgageCase.personType`; factor after chosen base on both paths |
| Cálculo unfactored | ✅ Implemented | `switchSource` clones `bases`; averages = chosen base (tests assert 20000/10000 tax, not ×factor) |
| MATRIX unmapped never invents 1.0 | ✅ Implemented | Phase A WARNING + Phase C `incomeUsed` null / REQUIRES_REVIEW |
| Banorte FLAT 0.6 / HSBC NONE 1.0 | ✅ Implemented | Seed locks + viability tests (80000×0.6=48000; HSBC 80000) |
| `CONDITIONED` for NOT_PREFERRED | ✅ Implemented | Banorte TAX_RETURN test |
| CSF activity tenure | ✅ Implemented | `activityStartDate` vs `minimumActivityTenureMonths`; missing date → REQUIRES_REVIEW |
| Nullable PFAE CMA cells | ✅ Implemented | Filled cell wins; empty uses salaried |
| SALARIED hire-date + unfactored CE | ✅ Implemented | Default fixtures `personType: SALARIED`; Mifel CE 0.50 seed lock |
| `runPhaseC` copy Phase A | ✅ Implemented | Drops prior `bank-viability`; BankViabilityRule only |
| SAT synonyms N=12 | ✅ Implemented | `TWELVE_MONTH_KEYWORDS` + NFD normalize |
| PATCH `/cases/:caseId/income/source` | ✅ Implemented | `SwitchIncomeSourceDto`; `forwardRef`; then `runPhaseC` |
| `BankActivityFactor` catalog | ✅ Implemented | Schema + CRUD `/banks/:code/activity-factors`; factor `@Min(0)` no max |
| Banks UI editors | ✅ Implemented (source) | `bank-detail-card.tsx`, `activity-factors-editor.tsx`, `policy-editor.tsx`; no Jest |
| Expediente Comparativa | ✅ Unchanged | `apps/web/app/ui/expedientes/bank-comparison-tab.tsx` not in git status for this change |
| Banorte 0.70 checkbox | ✅ Out of scope | Not in `seed-data.ts` (backlog) |
| BX+/Afirme destination policies | ✅ Unchanged lock | Seed spec: no policies for BXPLUS and AFIRME (bank-level only) |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| Per-bank `BankActivityFactor` (no global ActivityType) | ✅ Yes | Schema + matcher + CRUD |
| Santander $67k on `SANTANDER_CNS` | ✅ Yes | Seed spec `minimumIncomePfae=67000` |
| Nullable CMA `PFAE && cell!=null ? cell : salaried` | ✅ Yes | Viability tests filled vs empty |
| `CONDITIONED` via `resolveProductStatus` | ✅ Yes | Banorte NOT_PREFERRED test |
| `runPhaseC` copy Phase A except bank-viability | ✅ Yes | Service spec + integration |
| PATCH only on income controller | ✅ Yes | No `/mortgage-cases/.../income-source` |
| Separate factor DTO `@Min(0)` no max | ✅ Yes | Accepts 1.5; rejects negative |
| `factor` + `factorTaxReturn` (BX+ diffs) | ✅ Yes | Seed BX+ 0.50≠0.60; viability `factorTaxReturn` path |
| Shared `activity-factor-match` | ✅ Yes | Used by validation + viability |
| Income controller calls `runPhaseC`; `forwardRef` | ✅ Yes | Controller spec + integration |
| Do not edit `bank-comparison-tab.tsx` | ✅ Yes | File unmodified |
| Migration via `migrate dev` | ⚠️ Deviated | Apply used `db execute` + `migrate resolve --applied` because local drift refused reset |
| HSBC NONE stores `pfaeFlatFactor` 1.0 | ⚠️ Documented | Engine treats NONE as 1.0; seed lock is explicit 1.0 |

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | Found in apply-progress #570 “TDD Cycle Evidence” table (22 task rows) |
| All tasks have tests | ⚠️ | 19/22 API/schema tasks have test files. 2.1–2.3 Banks UI: N/A (no web Jest). 1.2 schema driven by 1.1 seed assertions |
| RED confirmed (tests exist) | ✅ | All listed API test files exist under `apps/api/src` |
| GREEN confirmed (tests pass) | ✅ | Focused 357/357 + full 1175/1175 on this verify run |
| Triangulation adequate | ✅ | FLAT vs NONE vs MATRIX; 1.5 vs negative; cultivo/ganadería/synonyms; copy-A vs 404; TAX_RETURN vs BANK_STATEMENTS vs 400 |
| Safety Net for modified files | ✅ | Apply-progress records existing banks/seed/viability/income suites green before edits. New files (matcher, integration, activity-factors-editor) marked N/A (new) — confirmed new/untracked |

**TDD Compliance**: 5/6 checks passed (UI tasks lack RED/GREEN by design; recorded as WARNING, not protocol failure)

---

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | 355 | 13 | Jest 30 + ts-jest + Nest TestingModule |
| Integration | 2 | 1 (`income-source-phase-c.integration.spec.ts`) | Nest TestingModule + supertest (mocked Prisma) |
| E2E | 0 | 0 | Playwright/Cypress not used; Banks UI QA is manual |
| **Total (focused HU-20)** | **357** | **14** | |
| **Full API** | **1175** | **63** | Jest |

SUGGESTION: critical Phase C / PATCH behavior is covered at unit + Nest-http integration with Prisma mocks. No live-Postgres or browser E2E. Acceptable for this HU; Banks UI remains manual.

---

### Changed File Coverage
Coverage from focused HU-20 Jest run (line %). Modules and pre-existing unused DTOs excluded from the rating average.

| File | Line % | Branch % | Uncovered Lines | Rating |
|------|--------|----------|-----------------|--------|
| `banks/banks.controller.ts` | 100% | 75% | 24-74 (branches) | ✅ Excellent |
| `banks/banks.service.ts` | 95.74% | 77.77% | 101, 203 | ✅ Excellent |
| `banks/dto/activity-factor.dto.ts` | 100% | 100% | — | ✅ Excellent |
| `banks/dto/update-bank.dto.ts` | 100% | 75% | 24-52 (branches) | ✅ Excellent |
| `banks/dto/update-policy.dto.ts` | 100% | 100% | — | ✅ Excellent |
| `case-analysis/activity-factor-match.ts` | 100% | 75% | 35,42,56-57,66 (branches) | ✅ Excellent |
| `case-analysis/case-analysis.service.ts` | 97.77% | 79.68% | 134, 308 | ✅ Excellent |
| `case-analysis/rules/bank-viability.rule.ts` | 93.87% | 86.39% | 234,236,389,395,401,409,417,466-469,502,513-517,522,853,879 | ✅ Excellent |
| `case-analysis/rules/pfae-validation.rule.ts` | 100% | 78.65% | 45,95-96,115-131,192-212,229 (branches) | ✅ Excellent |
| `income-calculation/income-calculation.controller.ts` | 95.45% | 77.77% | 153 | ✅ Excellent |
| `income-calculation/income-calculation.service.ts` | 93.2% | 70.96% | 344,362,402-419 | ✅ Excellent |
| `income-calculation/pfae-income.helpers.ts` | 97.22% | 70% | 103, 217 | ✅ Excellent |
| `income-calculation/dto/switch-income-source.dto.ts` | 100% | 50% | 6 | ✅ Excellent |

**Average changed file coverage (lines, 13 files above)**: ~98%
`prisma/seed-data.ts` lives outside Jest `rootDir` (`src`); locked by `seed-data.spec.ts` (70 tests) rather than Istanbul. Web Banks UI has no coverage tool.

No changed production file is below 80% line coverage.

---

### Assertion Quality
HU-20 scenario tests assert outcomes, factors, statuses, cloned `bases`, copied `ruleResults`, and HTTP status — not tautologies.

`toBeDefined()` in `seed-data.spec.ts` is always followed by value locks (`pfaeFactorMode`, `factor`, `minimumIncomePfae`, etc.). Pre-existing Nest `should be defined` smokes on controllers/services do not cover spec scenarios.

No ghost loops over possibly-empty collections without a length/non-empty companion. No `expect(true).toBe(true)`.

**Assertion quality**: 0 CRITICAL, 0 WARNING — ✅ All scenario assertions verify real behavior

---

### Quality Metrics
**Linter**: ➖ Not executed — `apps/api` `lint` script uses `--fix`; verify is read-only
**Type Checker**: ✅ No errors (`apps/api` `tsconfig.build.json` and `apps/web` `tsc --noEmit`)

### Issues Found
**CRITICAL**: None

**WARNING**:
1. **Banks UI has no Jest** — tasks 2.1–2.3 and spec “Banks PFAE Editors” UI path (`/dashboard/bancos/:code`) are source-implemented (`bank-detail-card.tsx`, `activity-factors-editor.tsx`, `policy-editor.tsx`) and typecheck clean, but persist/edit flows were not exercised in a browser. Manual QA required. Spec does not require automated UI tests.
2. **Unified-flow scenario PARTIAL** — PATCH Phase C + no second income Analyze endpoint are tested; “no second header Analyze” and “Comparativa/picker/Validaciones stay unchanged” are source-inspected only (`analysis-section.tsx` still has a single header control; `bank-comparison-tab.tsx` unmodified). HU-21 owns Expediente Comparativa.
3. **Local Prisma seed not applied** — apply-progress: `prisma seed` was not re-run this batch. Orchestrator will seed after verify. Catalog locks are unit-tested against `seed-data.ts` constants, not live Postgres.
4. **Local `_prisma_migrations` drift** — apply used `prisma db execute` + `migrate resolve --applied` instead of `migrate dev` because VerificationToken drift demanded a destructive reset (not performed). Future `migrate dev` on this machine may still complain.
5. **Banorte 0.70 PFAE cliente checkbox** — correctly not implemented (`backlog/banorte-pfae-cliente-070`). Do not treat absence as a HU-20 defect.
6. **BX+ / Afirme inactive destination policies** — seed still has no per-destination policies for BXPLUS/AFIRME (bank-level only). Unchanged; not a HU-20 regression.

**SUGGESTION**:
1. Add a live-Postgres or AppModule e2e later if circular `forwardRef` + real Prisma is a concern (apply-progress already notes full AppModule e2e was not run in the apply batch). Full Jest (1175) still passed with TestingModules.
2. Optional web component tests once a runner exists; not blocking archive.

### Known non-blockers (do not escalate)
- Expediente Comparativa/picker/Validaciones render is HU-21 out of scope
- Banorte 0.70 backlog
- BX+/Afirme inactive destination policies
- Seed against Postgres deferred to orchestrator

### Verdict
**PASS WITH WARNINGS**

22/22 tasks complete; 17/18 spec scenarios COMPLIANT with passing runtime tests; 1 PARTIAL (UI clauses of PATCH flow); focused 357 and full 1175 green; API and web typecheck clean. Warnings are manual Banks UI QA, unseeded local Postgres, and documented Prisma migrate drift — not spec failures.
