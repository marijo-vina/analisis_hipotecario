## Verification Report

**Change**: pfae-hu-18-dual-income-engine
**Version**: N/A (delta specs; no main-spec version tag)
**Mode**: Strict TDD
**Branch**: `feature/pfae-hu-18-dual-income-engine`
**Date**: 2026-09-02
**Artifact store**: hybrid
**Engram artifacts read**: proposal #529, spec #530, design #531, tasks #532, apply-progress #535

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 9 |
| Tasks complete | 9 |
| Tasks incomplete | 0 |

Filesystem `tasks.md` and Engram `sdd/pfae-hu-18-dual-income-engine/tasks` (#532, 5 revisions) both show all items `[x]`. Apply-progress #535 reports 9/9 complete (Units 1–3).

### Build & Tests Execution
**Build**: ✅ Passed
```text
cwd: C:\GF\analisis_hipotecario\apps\api
npx tsc --noEmit -p tsconfig.build.json
exit 0
(no type errors)
```

**Tests**: ✅ 121 passed / ❌ 0 failed / ⚠️ 0 skipped
```text
cwd: C:\GF\analisis_hipotecario\apps\api
npx jest src/income-calculation src/liability/liability.service.spec.ts src/case-analysis/case-analysis.service.spec.ts --colors=false

Test Suites: 6 passed, 6 total
Tests:       121 passed, 121 total
Snapshots:   0 total
Time:        12.48 s
exit 0
```

Suites included: `pfae-income.helpers.spec.ts`, `income-calculation.service.spec.ts`, `income-calculation.controller.spec.ts`, `income-calculation.integration.spec.ts`, `liability.service.spec.ts`, `case-analysis.service.spec.ts`.

**Coverage**: ➖ Not available (no threshold configured; `collectCoverageFrom` exists, `coverageThreshold` absent). Not treated as FAIL.

### Spec Compliance Matrix

#### Domain: income-calculation
| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| PFAE Dual-Base Snapshot | GET latest returns source and bases | `income-calculation.service.spec.ts` > GET latest source/bases contract > exposes source and bases JSON from the persisted snapshot | ✅ COMPLIANT |
| PFAE Dual-Base Snapshot | PFAE analyze without payroll | `income-calculation.service.spec.ts` > PFAE calculate() > PFAE analyze without payroll MUST NOT 404 and both bases are computed | ✅ COMPLIANT |
| Bank-Statement Base | Six-month smoothing | `pfae-income.helpers.spec.ts` > smooth > six-month window drops max and min: [10,12,14,16,18,100] → 15, not 28.33 | ✅ COMPLIANT |
| Bank-Statement Base | Twelve-month smoothing | `pfae-income.helpers.spec.ts` > smooth > twelve-month window drops max and min: [1..11,100] → 6.5, not 13.83 (also service triangulate 12-month restaurantero) | ✅ COMPLIANT |
| Bank-Statement Base | Short window invalid | `pfae-income.helpers.spec.ts` > smooth > short window is INVALID with INSUFFICIENT_MONTHS when unique months < N | ✅ COMPLIANT |
| Bank-Statement Base | CSF activity selects N | `pfae-income.helpers.spec.ts` > resolveActivity > restaurantero N=12, generic N=6, primaria/alimentos-y-bebidas N=12, tie → lower order | ✅ COMPLIANT |
| Tax Base, Default Source, and Review | Tax monthly conversion | `pfae-income.helpers.spec.ts` > taxMonthly > converts fiscalProfit/12 to net and accumulableIncomeTotal/12 to gross (120000/240000 → 10000/20000) | ✅ COMPLIANT |
| Tax Base, Default Source, and Review | Fiscal loss knocks out tax only | `income-calculation.service.spec.ts` > PFAE calculate() > fiscal loss knocks out tax only: tax INVALID, source BANK_STATEMENTS | ✅ COMPLIANT |
| Tax Base, Default Source, and Review | Default source projection | `income-calculation.service.spec.ts` > PFAE calculate() > default source projection: both valid → BANK_STATEMENTS and averages equal bank figures | ✅ COMPLIANT |
| Tax Base, Default Source, and Review | Tax source when bank invalid | `income-calculation.service.spec.ts` > PFAE calculate() > tax source when bank invalid: TAX_RETURN and averages equal tax figures | ✅ COMPLIANT |
| Tax Base, Default Source, and Review | Both invalid requires review | `income-calculation.service.spec.ts` > PFAE calculate() > both invalid → REQUIRES_REVIEW, averages 0, no throw, GET latest succeeds | ✅ COMPLIANT |
| SALARIED Payroll Path Unchanged | SALARIED payroll regression | `income-calculation.service.spec.ts` > SALARIED regression (HU-18) > payroll [15000.50, 14999.50] → averageGrossIncome 15000.00 and source PAYROLL | ✅ COMPLIANT |

#### Domain: liability-calculation
| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Default Factor by Person Type | PFAE revolving at 7% | `liability.service.spec.ts` > personType revolving factor > PFAE revolving: MAX(100000 × 0.07, 2000) = 7000, factorUsed 0.07 | ✅ COMPLIANT |
| Default Factor by Person Type | SALARIED revolving at 6% (regression) | `liability.service.spec.ts` > personType revolving factor > SALARIED revolving: MAX(100000 × 0.06, 2000) = 6000, factorUsed 0.06 (regression) | ✅ COMPLIANT |
| Default Factor by Person Type | UNKNOWN uses personType factor | `liability.service.spec.ts` > personType revolving factor > PFAE UNKNOWN: MAX(100000 × 0.07, 0) = 7000, not 6000 | ✅ COMPLIANT |

#### Domain: case-analysis
| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Phased Orchestration | Three-phase execution completes in order | `case-analysis.service.spec.ts` > run > executes Phase A rules, Phase B calculations, then Phase C bankViability in order | ✅ COMPLIANT |
| Phased Orchestration | Phase A flags passed to Phase C | Orchestrator still spreads `bankarizationFlags` into Phase C (`case-analysis.service.ts` unchanged). No HU-18-suite test asserts `BankViabilityRule.execute` received `hasPagadoraIncome`/`scotiabankExcluded` from Phase A. Rule-level tests exist in `bank-viability.rule.spec.ts` (not in the mandated Jest command). | ⚠️ PARTIAL |
| Phased Orchestration | Phase B injects calculation services | Same three-phase order test: `income-calculation` then `liability-calculation` before `bank-viability` | ✅ COMPLIANT |
| Phased Orchestration | PFAE case skips BankarizationValidationRule | `case-analysis.service.spec.ts` > PFAE case: does not invoke BankarizationValidationRule.execute | ✅ COMPLIANT |
| Phased Orchestration | SALARIED case runs both Phase A rules (regression) | `case-analysis.service.spec.ts` > SALARIED case: invokes both IdentityMatchRule and BankarizationValidationRule (regression) | ✅ COMPLIANT |
| Phased Orchestration | Rule context includes personType | `case-analysis.service.spec.ts` > rule context includes personType sourced from mortgageCase.personType | ✅ COMPLIANT |
| Phased Orchestration | PFAE Phase B persists income snapshot without payroll | `case-analysis.service.spec.ts` > PFAE Phase B persists an income snapshot without payroll and does not fail (+ income service persist path). Orchestrator production file unchanged; `calculate(caseId, [])` already invoked; Unit 2 removed the payroll 404. | ✅ COMPLIANT |

**Compliance summary**: 21/22 scenarios COMPLIANT, 1/22 PARTIAL (preserved Phase A→C flag handoff)

### Known-item judgments (orchestrator checklist)

| Item | Finding |
|------|---------|
| 6-month smoothing 15 | Helper test asserts net/gross 15, not 28.33. Runtime pass. |
| 12-month smoothing 6.5 | Helper + service restaurantero triangulation assert 6.5, not 13.83. Runtime pass. |
| Short window invalid | 5 months, N=6 → `INSUFFICIENT_MONTHS`. Runtime pass. |
| CSF N 6 vs 12 | restaurantero/primaria/alimentos-y-bebidas → 12; generic + tie-on-% lower `order` → 6. Runtime pass. |
| Tax monthly conversion | 120000/240000 → 10000/20000; triangulated 60000/120000 → 5000/10000. Runtime pass. |
| Fiscal loss knocks out tax only | Service test: tax `TAX_LOSS`, source `BANK_STATEMENTS`, bank averages 15. Runtime pass. |
| Default source bank-if-valid | Both valid → `BANK_STATEMENTS`, averages equal bank. Runtime pass. |
| Both invalid REQUIRES_REVIEW; source may persist PAYROLL | Status `REQUIRES_REVIEW`, averages 0, no throw, `getLatest` succeeds. Spec GET-latest allows `PAYROLL \| BANK_STATEMENTS \| TAX_RETURN`. Implementation `projectChosenBase` uses `source: 'PAYROLL'` when `chooseSource` returns null (NOT NULL column). **Spec-compliant.** Semantic mismatch (PAYROLL with no payroll) is a documented design deviation, not a spec fail. The covering test does not pin `source`. |
| PFAE calculate no 404 | Service test: no `NotFoundException`; both bases computed. Runtime pass. |
| SALARIED payroll regression | 15000.00 and `source=PAYROLL`. Runtime pass. Existing salaried 404-on-missing-payroll tests still in suite. |
| GET latest source+bases | Service `getLatest` maps `source` and `bases` JSON. Runtime pass. HTTP controller test still only asserts `id`/`caseId`/`status`. |
| PFAE revolving 7000 / SALARIED 6000 / UNKNOWN 7000 | All three liability tests passed. `calculateUnknown` takes the resolved factor. |
| Phase B PFAE snapshot without payroll; no orchestrator code change | `case-analysis.service.ts` is **not** in git modified files. Phase B already calls `incomeCalcService.calculate(caseId, [])` inside try/catch. New tests assert calculate invoked, run `COMPLETED`, liability still runs. Claim matches the tree. |

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| Schema `source` + `bases` | ✅ Implemented | `IncomeCalculation.source String @default("PAYROLL")`, `bases Json?`; migration `20260902182600_add_income_source_bases` ADD COLUMN with DEFAULT `'PAYROLL'` |
| Types | ✅ Implemented | `IncomeSource`, `IncomeBase`, `BankIncomeBase`, `ActivityResolution`, `PfaeIncomeBases`; `IncomeCalculationResult.source`/`bases` remain optional (apply deviation) |
| Helpers | ✅ Implemented | `resolveActivity`, `assembleMonths`, `smooth`, `taxMonthly`, `chooseSource` in `pfae-income.helpers.ts` |
| PFAE `calculate()` | ✅ Implemented | `personType` lookup; PFAE skips payroll; persists `source` + JSON `bases`; `snapshotToResult` exposes both |
| SALARIED path | ✅ Implemented | Payroll `computeAverages` retained; persists `source: 'PAYROLL'` |
| Liability factor | ✅ Implemented | Private `resolveFactor`; PFAE 0.07 else 0.06; threaded into revolving and UNKNOWN |
| Phase B PFAE income | ✅ Implemented | No orchestrator edit required; income service no longer 404s |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| 1 Extend IncomeCalculation with source + JSON bases | ✅ Yes | Schema + migration match |
| 2 personType resolved inside both services | ✅ Yes | `mortgageCase.findUnique` in income and liability |
| 3 Pure helpers in pfae-income.helpers.ts | ✅ Yes | Exported Decimal helpers |
| 4 Deterministic drop max+min tie-break | ✅ Yes | Helper test: duplicate totals drop one min and one max by monthKey ASC |
| 5 Bank base one figure for gross and net | ✅ Yes | smooth sets both to the mean |
| 6 Tax loss invalidates only tax base | ✅ Yes | Service test |
| 7 Both invalid ⇒ REQUIRES_REVIEW, zero averages, no throw | ✅ Yes | PAYROLL source fallback extra vs design table (column NOT NULL) |
| 8 UNKNOWN uses resolved factor | ✅ Yes | PFAE UNKNOWN 7000 |
| File table: case-analysis.service.ts modify | ⚠️ No | Design file-changes row listed a modify; apply Unit 3 left orchestrator unchanged. Spec still met via income `calculate()`. |
| GET latest as Integration | ⚠️ Partial | Covered at service unit layer, not HTTP field assertion |

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | Found in apply-progress #535 (Units 1–3 tables + executed RED/GREEN logs) |
| All tasks have tests | ✅ | 9/9: 1.1 safety-net/structural; 1.2 types used by helper spec; 2.x helpers; 3.x income service; 4.x liability + case-analysis |
| RED confirmed (tests exist) | ⚠️ | Test files exist for 2.1, 3.1, 4.1, 4.3, helpers. Task 4.3 reported already-green (no RED failure) because Unit 2 removed the payroll 404. |
| GREEN confirmed (tests pass) | ✅ | 121/121 passed on this verify execution (mandated command) |
| Triangulation adequate | ✅ | Helpers 18 cases for 5 bank/tax/CSF scenarios; income 8 PFAE/SALARIED/GET cases; liability 3 factor cases; case-analysis 2 no-payroll cases |
| Safety Net for modified files | ✅ | Apply logged 20/20, 38/38, 55/55, then 106 combined before/after units. Modified files are not marked N/A except new helper/types. |

**TDD Compliance**: 5/6 checks passed (RED for 4.3 observed as already-green)

---

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | ~106 in HU-18-related service/helper specs (18 new helpers + 8 income + 3 liability + 2 case-analysis among them) | `pfae-income.helpers.spec.ts`, `income-calculation.service.spec.ts`, `liability.service.spec.ts`, `case-analysis.service.spec.ts` | Jest + ts-jest + Nest TestingModule + Prisma mocks |
| Integration | 3 (pre-existing salaried flow; not extended for PFAE source/bases) | `income-calculation.integration.spec.ts` | Jest + supertest |
| HTTP/controller | 12 (pre-existing; GET latest does not assert `source`/`bases`) | `income-calculation.controller.spec.ts` | Jest + supertest |
| E2E | 0 | — | Playwright/Cypress not used |
| **Total (command)** | **121** | **6 suites** | |

New HU-18 tests are unit-only. SUGGESTION only: no HTTP assertion of the new GET-latest fields.

---

### Changed File Coverage
Coverage analysis skipped — no coverage threshold configured (`openspec/config.yaml` has no `verify.coverage_threshold`; Jest has `collectCoverageFrom` but no `coverageThreshold`).

---

### Assertion Quality
| File | Line | Assertion | Issue | Severity |
|------|------|-----------|-------|----------|
| `apps/api/src/case-analysis/case-analysis.service.spec.ts` | 130–131 | `expect(service).toBeDefined()` | Smoke-test-only (pre-existing in a file this change modified) | WARNING |
| `apps/api/src/case-analysis/case-analysis.service.spec.ts` | 416–418 | `expect(mockIncomeCalcService.calculate.mock.results[0].value).resolves.toEqual(incomeSnapshot)` | Circular with `mockResolvedValue(incomeSnapshot)` — does not prove Prisma persist. Companion `toHaveBeenCalledWith` + `COMPLETED` still exercise `run()`. | WARNING |

No tautologies, ghost loops, or assertions that never call production code in the new helper/income/liability tests. Those tests assert numeric means, statuses, sources, and factors.

**Assertion quality**: 0 CRITICAL, 2 WARNING

---

### Quality Metrics
**Linter**: ➖ Not executed this pass (eslint available in `apps/api`; not required for verdict)
**Type Checker**: ✅ No errors (`npx tsc --noEmit -p tsconfig.build.json`, exit 0)

### Issues Found
**CRITICAL**: None

**WARNING**:
1. Both-invalid PFAE snapshots persist `source='PAYROLL'` (NOT NULL default) when `chooseSource` returns null. Spec allows PAYROLL as an enum value and does not prescribe source for the both-invalid scenario; GET latest still succeeds. Semantic mismatch (PAYROLL with no payroll) is documented in apply-progress. Covering test does not assert `source`.
2. Task 4.3 had no RED failure: new case-analysis tests were already green after Unit 2. Orchestrator production file unchanged — acceptable for the spec, but Strict TDD RED was not observed for that task.
3. Preserved scenario “Phase A flags passed to Phase C” is not asserted in `case-analysis.service.spec.ts`. Implementation still forwards `bankarizationFlags`; orchestrator file was not modified by this change.
4. Generated Prisma client files under `apps/api/src/generated/prisma/` are modified in the working tree (apply claimed gitignored; they are tracked). Not a spec fail; noisy diff.

**SUGGESTION**:
1. HTTP `GET /cases/:id/income/latest` controller test does not assert `source` or `bases`.
2. `taxMonthly` `MISSING_DOCUMENT` path has no dedicated test (design invalidReason; not a spec scenario).
3. Pin `source` on the both-invalid service test if PAYROLL fallback is the intended contract.
4. Critical PFAE math is unit-tested only (acceptable; no E2E tools in this slice).

### Verdict
PASS WITH WARNINGS

All 9 tasks complete; mandated Jest 121/121 green; typecheck clean; 21/22 spec scenarios have passing covering tests. Remaining items are documented deviations (PAYROLL fallback, no orchestrator edit, GET-latest HTTP fields, preserved flag-handoff test gap), not spec MUST failures for HU-18 dual-income behavior.
