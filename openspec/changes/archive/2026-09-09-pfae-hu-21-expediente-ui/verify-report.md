## Verification Report

**Change**: pfae-hu-21-expediente-ui
**Version**: N/A (delta specs; OpenSpec change folder)
**Mode**: Strict TDD
**Date**: 2026-09-09
**Verifier**: sdd-verify executor (runtime tests + artifact review)
**Artifact store**: hybrid (OpenSpec file + Engram)

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 14 |
| Tasks complete | 14 (all `[x]` in local `tasks.md` and local `apply-progress.md`) |
| Tasks incomplete | 0 |
| Spec domains | 5 (`frontend`, `unified-analysis-flow`, `pfae-validation`, `income-calculation`, `case-analysis`) |
| Spec scenarios | 24 |

All implementation tasks (Units 1–4) and verification tasks (5.1–5.2) are checked. Web UI has no Jest runner; completeness for Units 2–4 is source inspection + advisor 5.1 QA (2026-09-09 “listo”), same convention as archived HU-20. Engram `apply-progress` #593 is stale (still shows 5.1–5.2 unchecked from Unit 4); local OpenSpec files are authoritative.

### Build & Tests Execution
**Build / typecheck**: ✅ Passed
```text
apps/api: npx tsc --noEmit -p tsconfig.build.json  (exit 0)
apps/web: npx tsc --noEmit                          (exit 0)
```

**Focused HU-21 tests**: ✅ 252 passed / 0 failed / 0 skipped (9 suites)
```text
cwd: apps/api
npx jest --testPathPatterns "format-activity-tenure.spec|pfae-validation.rule.spec|seed-data.spec|bank-viability.rule.spec|activity-factor-match.spec|income-calculation.service.spec|income-calculation.controller.spec|income-source-phase-c.integration.spec|pfae-income.helpers.spec" --verbose
Test Suites: 9 passed, 9 total
Tests:       252 passed, 252 total
Time:        21.079 s
```

**Full API suite**: ✅ 1187 passed / 0 failed / 0 skipped (64 suites)
```text
cwd: apps/api
npm test
Test Suites: 64 passed, 64 total
Tests:       1187 passed, 1187 total
Time:        14.151 s
```
No failures outside HU-21. Prisma seed was applied 2026-09-09 (50 activity factors) before advisor QA; not re-run in this verify session.

**Coverage** (focused HU-21 suites; Jest `rootDir=src`): 93.22% statements / 81.34% branches / 95.1% lines for collected modules. Threshold in `openspec/config.yaml` is none (no coverage gate). See Changed File Coverage below.

### Spec Compliance Matrix
| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| PFAE Visual Kit and Tab Shell | Salaried unchanged, three tabs | No web Jest. Source: `TABS` length 3 (`validaciones` / `motor` / `bancos`); single header `Analizar expediente` (idle/disabled variants of the same control). Task 5.1 advisor QA 2026-09-09 | ⚠️ PARTIAL |
| PFAE Visual Kit and Tab Shell | PFAE uses visual kit | No web Jest. Source: `Card`/`Button`/`FieldGrid`/`FormField`/`DataTable` + `gf-*` / Spanish sentence-case in PFAE islands. Task 5.1 QA | ⚠️ PARTIAL |
| PFAE Validaciones Gates Card | Happy path gates Card | No web Jest. Source: `pfae-validation-gates.tsx` reads `ruleResults` `pfae-validation` + alerts; fields régimen/vigencia/antigüedad/actividad/coherencia; tenure chip “Informativo”; no recompute. Engine snapshot covered by `pfae-validation.rule.spec.ts` | ⚠️ PARTIAL |
| PFAE Validaciones Gates Card | No CSF | `pfae-validation.rule.spec.ts` > PARTIAL empty snapshot (no CSF / null extractedData). UI Card shows `PFAE_CSF_MISSING` message (source + 5.1) | ⚠️ PARTIAL |
| PFAE Validaciones Gates Card | Unmapped giro (Card render) | UI renders `unmappedAlert.message`. Payload covered below | ⚠️ PARTIAL |
| PFAE Validaciones Gates Card | Tenure and calendar dates | API tenure copy COMPLIANT (see pfae-validation). UI `formatCalendarDate` / `formatTenureMonths` / `formatMonthKey` have no web Jest (regex, no `Date()`) | ⚠️ PARTIAL |
| PFAE Dual-Base Picker | PATCH refreshes Comparativa | `income-source-phase-c.integration.spec.ts` + controller PATCH + `switchIncomeSource` → `onSourceSwitched`/`quietLoadLatest`. No second header Analyze (source). Comparativa refresh is UI | ⚠️ PARTIAL |
| PFAE Dual-Base Picker | TAX_LOSS | `pfae-income.helpers.spec.ts` / `income-calculation.service.spec.ts` / controller 400 `TAX_LOSS`. UI disables tax option + Spanish copy (source + 5.1) | ⚠️ PARTIAL |
| Comparativa PFAE Detail Extras | Extras in detail only | No web Jest. Source: six columns Banco/Ingreso/CE/Máx. endeud./Capacidad/Estado; extras in expanded `PfaeProductDetailExtras`; `activityTenure` row. Audit persist COMPLIANT below | ⚠️ PARTIAL |
| Comparativa PFAE Detail Extras | Unmapped giro from audit (detail render) | UI `factorDisplay` → “—” when `appliedFactor` null / NONE → “Sin factor” (never invents 1.0). Persist COMPLIANT below | ⚠️ PARTIAL |
| Solely-Salaried FAIL Non-Viable Presentation | FAIL régimen | No web Jest. Source: copy “este camino PFAE no aplica — cambie a asalariado”; `suppressViablePresentation` mutes PRELIMINARY_VIABLE chips/green chrome; `onRowClick` unchanged; stored `status` not rewritten. Engine FAIL COMPLIANT in `pfae-validation.rule.spec.ts` | ⚠️ PARTIAL |
| Income-Source Switch Re-runs Phase C | PATCH is not a second Analyze | `income-source-phase-c.integration.spec.ts` > Phase C only + copied Phase A; controller `POST /income/analyze` 404. Header Analyze is one control (source + 5.1) | ⚠️ PARTIAL |
| Validaciones Gate Render | Gates from persisted snapshot | Same as frontend happy-path Card (no recompute) | ⚠️ PARTIAL |
| Validaciones Gate Render | No CSF | Same as frontend No CSF | ⚠️ PARTIAL |
| Validaciones Gate Render | Unmapped giro warning (message + lists) | `pfae-validation.rule.spec.ts` > `ACTIVITY_UNMAPPED` message lists unmapped (Mifel) and mixed matched/unmapped (Mifel vs Afirme); snapshot `matchedBanks`/`unmappedBanks`. Runtime passed | ✅ COMPLIANT |
| Validaciones Gate Render | FAIL régimen | Engine FAIL ERROR `REGIMEN_EXCLUSIVAMENTE_ASALARIADO` in `pfae-validation.rule.spec.ts`. Card/overlay presentation is UI PARTIAL above | ⚠️ PARTIAL |
| PFAE Cálculo Panel | Dual bases and picker | API unfactored `bases` in `income-calculation.service.spec.ts`. UI dual cards + “Base a enviar al banco” (source + 5.1) | ⚠️ PARTIAL |
| PFAE Cálculo Panel | PATCH refresh | Same as dual-base PATCH / unified-flow | ⚠️ PARTIAL |
| PFAE Cálculo Panel | TAX_LOSS disables tax base | API 400 + INVALID tax; UI not selectable / no deposit editor (source) | ⚠️ PARTIAL |
| PFAE Cálculo Panel | Peinado warn and link | No web Jest. Source: `peinadoWarn` from `integrityCheck` MINOR/CRITICAL; `#extraccion` link; no deposit editor | ⚠️ PARTIAL |
| PFAE Cálculo Panel | Bank vs tax labels | `pfae-income.helpers.spec.ts` > `taxMonthly` fiscalProfit/12 net, accumulableIncomeTotal/12 gross; bank drop-min/max average. Spanish labels + `MM/YYYY` month keys are UI (`pfae-income-panel.tsx` + `formatMonthKey`) | ⚠️ PARTIAL |
| BankResult Factor Audit | PFAE audit persisted | `bank-viability.rule.spec.ts` > FLAT persist (`appliedFactor` 0.60, `factorMode` FLAT, satDescription, taxReturnPolicy) + MATRIX hit (`0.35`, native label Comercio). Math unchanged 80000×0.6 / ×0.35 | ✅ COMPLIANT |
| BankResult Factor Audit | Unmapped giro audit | `bank-viability.rule.spec.ts` > unmapped MATRIX `appliedFactor` null, not `'1.00'`, `factorMode` MATRIX, `satDescription` persisted | ✅ COMPLIANT |
| BankResult Factor Audit | SALARIED unused | `bank-viability.rule.spec.ts` > five audit fields null; CE unfactored | ✅ COMPLIANT |
| QA follow-up (tenure INFO copy) | Years + leftover months | `format-activity-tenure.spec.ts` (12→`1 año`, 27→`2 años 3 meses`) + `pfae-validation.rule.spec.ts` INFO message `Antigüedad en la actividad independiente: 1 año.` | ✅ COMPLIANT |
| QA follow-up (medical seed) | Consultorio SAT hits every MATRIX bank | `seed-data.spec.ts` > `matches consultorio SAT wording on every MATRIX bank` | ✅ COMPLIANT |

**Compliance summary**: 6/26 rows COMPLIANT (4 spec + 2 QA follow-up locks), 20/26 PARTIAL, 0 FAILING, 0 UNTESTED

PARTIAL rows are UI-only clauses (no web Jest). Covering evidence is source inspection + advisor 5.1 QA, same as HU-20 Banks UI. Spec does not require an automated web runner. API behavioral contracts that had passing tests are COMPLIANT.

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| Same 3 tabs; `personType` only discriminator | ✅ Implemented | `TABS` has 3 ids; PFAE islands gated on `personType === "PFAE"` |
| No wizard / 4th tab / second Analyze | ✅ Implemented | One header Analyze (disabled + idle/loading variants). Task 5.2 git: `income-calculation.controller.ts` unmodified |
| No Banks UI / Banorte 0.70 / new income endpoints | ✅ Out of scope confirmed | `git diff --stat` empty for `apps/web/app/ui/banks`, `apps/web/app/dashboard/bancos`, income controller, `actions/analysis.ts`. No `0.70` / `banorte-pfae-cliente` in apps |
| Gates from persisted snapshot only | ✅ Implemented | `findPfaeValidationRule` + alerts; no catalog recompute |
| Tenure INFO years+months | ✅ Implemented | API `formatActivityTenure`; web `formatTenureMonths` (parallel helper) |
| Dates `DD/MM/YYYY` without timezone shift | ✅ Implemented (source) | `formatCalendarDate` parses `YYYY-MM-DD` with regex; does not use `Date()` |
| ACTIVITY_UNMAPPED lists matched/unmapped | ✅ Implemented | Snapshot fields + Spanish `activityUnmappedMessage`; UI prints alert message |
| Dual unfactored bases + picker PATCH | ✅ Implemented | `switchIncomeSource` → existing `PATCH /income/source`; then `onSnapshotChange` + `onSourceSwitched` |
| TAX_LOSS Spanish disable | ✅ Implemented | Option disabled; inline `TAX_LOSS_SEND_COPY` |
| Peinado warn + `#extraccion`; no deposit editor | ✅ Implemented | `pfae-income-panel.tsx` has no deposit editing |
| Six Comparativa columns unchanged | ✅ Implemented | Banco, Ingreso, CE, Máx. endeud., Capacidad de pago, Estado |
| Audit persist; UI never reconstructs factor | ✅ Implemented | Five `BankResult` fields serialized at `evaluateBank`; extras read `appliedFactor`/`factorMode`/`matchedNativeLabel`/`satDescription`/`taxReturnPolicy` |
| FAIL overlay presentational | ✅ Implemented | `deriveSuppressViablePresentation`; stored `status` untouched |
| PFAE `REASON_LABELS` | ✅ Implemented | TAX_RETURN_REJECTED/NOT_PREFERRED, ACTIVITY_UNMAPPED, INSUFFICIENT_ACTIVITY_TENURE, MISSING_ACTIVITY_START_DATE |
| Medical SAT aliases on MATRIX health/servicios | ✅ Implemented | `withMedicalAliases` in `prisma/seed-data.ts`; seed spec lock passed |
| Cálculo bank single deposit average; tax bruto/neto | ✅ Implemented | Labels in panel; math locked by `taxMonthly` + bank window tests |
| Salaried payroll table untouched | ✅ Implemented | `income-calculation-section.tsx` PFAE early-return; salaried KPIs remain below the branch |
| Pasivos UI unchanged | ✅ Implemented | `liability-calculation-section.tsx` not in HU-21 git diff; still composed in Cálculo tab |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| Extract PFAE islands; parents branch on `personType` | ✅ Yes | Created `pfae-validation-gates.tsx`, `pfae-income-panel.tsx`, `pfae-product-detail-extras.tsx` |
| FAIL overlay vs rewrite stored status | ✅ Yes | Presentational mute only |
| Persist five audit fields; UI reads only | ✅ Yes | Types + serialize + extras helpers |
| Picker `useTransition`; not Banks chrome | ✅ Yes | `startTransition` + inline error |
| PATCH then parent `loadLatest()` | ✅ Yes | `quietLoadLatest` skips noisy loading (documented apply deviation) |
| Visual kit `gf-*` + common components | ✅ Yes | Spanish sentence-case advisor verbs |
| Do not grow `analysis-section.tsx` (1046) | ⚠️ Deviated | File is 1103 lines (+57 vs design baseline; git +96/− in that file). Growth is wiring (gates, overlay flag, quiet load, peinado), not inlined islands |
| `resolvePfaeFactor` twice on PFAE path | ⚠️ Documented | Apply deviation: keep Phase C math path untouched |
| NONE copy “Sin factor” not “Sin factor (1.0)” | ⚠️ Documented | Avoids reading unmapped/NONE as inventing 1.0 |
| PFAE tenure row replaces employmentTenure control | ⚠️ Documented | Stored employmentTenure stays NOT_APPLICABLE |

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | Found in local `apply-progress.md` “TDD Cycle Evidence” (12 implementation task rows). Engram #593 is Unit-4 snapshot |
| All tasks have tests | ⚠️ | 2/12 implementation tasks have API Jest (1.1–1.2). 1.3–4.3 web: N/A (no web Jest), triangulated skipped per orchestrator. 5.1–5.2 are QA/out-of-scope checks, not RED/GREEN units. QA follow-up added `format-activity-tenure.spec.ts`, unmapped-list tests, seed medical test |
| RED confirmed (tests exist) | ✅ | `bank-viability.rule.spec.ts` exists with 4 audit cases; `format-activity-tenure.spec.ts`, `pfae-validation.rule.spec.ts`, `seed-data.spec.ts` exist |
| GREEN confirmed (tests pass) | ✅ | Focused 252/252 + full 1187/1187 on this verify run (includes Unit 1 audit tests + QA follow-up suites) |
| Triangulation adequate | ✅ | FLAT vs MATRIX hit vs unmapped ≠ 1.0 vs salaried null; tenure 0/1/12/27 months; unmapped-all vs mixed matched/unmapped; taxMonthly two fiscal years; PATCH TAX_RETURN vs BANK_STATEMENTS vs 400 |
| Safety Net for modified files | ✅ | Unit 1: 72/72 before edits, 76/76 after. Units 2–4: no API edits. QA follow-up: apply-progress records 98 passed on tenure/validation/seed before advisor QA |

**TDD Compliance**: 5/6 checks passed (UI tasks lack RED/GREEN by design; recorded as WARNING, not protocol failure)

---

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | 250 | 8 | Jest 30 + ts-jest + Nest TestingModule |
| Integration | 2 | 1 (`income-source-phase-c.integration.spec.ts`) | Nest TestingModule + supertest (mocked Prisma) |
| E2E | 0 | 0 | Playwright/Cypress not used; expediente UI QA is manual (task 5.1) |
| **Total (focused HU-21)** | **252** | **9** | |
| **Full API** | **1187** | **64** | Jest |

SUGGESTION: PFAE expediente UI has no component/E2E runner (same as HU-20 Banks). Critical audit/PATCH/gate-message contracts are unit + Nest-http integration. Acceptable for this HU.

---

### Changed File Coverage
Coverage from focused HU-21 Jest run (line %). Web files and Prisma `seed-data.ts` (outside Jest `rootDir`) excluded from the rating average.

| File | Line % | Branch % | Uncovered Lines | Rating |
|------|--------|----------|-----------------|--------|
| `case-analysis/rules/bank-viability.rule.ts` | 93.63% | 86.79% | 236,238,391,397,403,411,419,468-471,504,515-519,524,593,881,907 | ✅ Excellent |
| `case-analysis/rules/pfae-validation.rule.ts` | 100% | 80.19% | (branches) 46,96-97,116-137,228-248,265 | ✅ Excellent |
| `case-analysis/format-activity-tenure.ts` | 92.85% | 90% | 4 (non-finite / negative months) | ✅ Excellent |
| `case-analysis/types/pfae-validation.types.ts` | 0% stmts | — | Type-only module (Istanbul no runtime) | ➖ N/A |
| `prisma/seed-data.ts` | — | — | Locked by `seed-data.spec.ts`, not Istanbul | ➖ N/A |
| Web PFAE islands / `display-format.ts` | — | — | No web coverage tool | ➖ N/A |

Related (not all git-touched this HU, collected with the required focused command): `activity-factor-match.ts` 100% lines; `income-calculation.controller.ts` 95.45%; `income-calculation.service.ts` 93.2%; `pfae-income.helpers.ts` 97.22%; `switch-income-source.dto.ts` 100% lines.

**Average changed API production file coverage (lines, 3 rated files)**: ~95.5%

No rated changed production file is below 80% line coverage.

---

### Assertion Quality
HU-21 scenario tests assert audit field values, unmapped null ≠ `'1.00'`, INFO copy `1 año`, ACTIVITY_UNMAPPED Spanish lists, taxMonthly 10000/20000 and 5000/10000, PATCH Phase C copy, and medical MATRIX `kind: 'hit'` — not tautologies.

`toBeDefined()` in `seed-data.spec.ts` is always followed by value locks (same HU-20 pattern). Pre-existing Nest `should be defined` on the income controller is not a HU-21 scenario test.

`seed-data.spec.ts` medical test loops `BANKS.filter(pfaeFactorMode === 'MATRIX')`. Companion tests in the same file lock MATRIX banks (Mifel, etc.), so the collection is not empty in this catalog; still a loop-over-filter pattern.

No `expect(true).toBe(true)`. No orphan empty-array assertions without a non-empty companion.

| File | Line | Assertion | Issue | Severity |
|------|------|-----------|-------|----------|
| `apps/api/src/seed-data.spec.ts` | 473–486 | `for (const bank of BANKS.filter(...MATRIX)) { expect(kind).toEqual('hit') }` | Ghost-loop risk if filter were empty; companions in the same file lock MATRIX banks | WARNING |

**Assertion quality**: 0 CRITICAL, 1 WARNING

---

### Quality Metrics
**Linter**: ➖ Not executed — `apps/api` `lint` script uses `--fix`; verify is read-only
**Type Checker**: ✅ No errors (`apps/api` `tsconfig.build.json` and `apps/web` `tsc --noEmit`)

### Task 5.2 Out-of-scope confirmation
| Forbidden item | Evidence |
|----------------|----------|
| Banks UI added/changed | `git diff --stat` empty for `apps/web/app/ui/banks` and `apps/web/app/dashboard/bancos` |
| Banorte 0.70 checkbox | No matches for `0.70` / `banorte-pfae-cliente` under `apps/` |
| Second Analyze | Single header control; income controller unmodified; integration asserts no second income Analyze endpoint |
| New income endpoints | `switchIncomeSource` calls existing `PATCH /cases/:id/income/source` only |
| 4th tab / wizard | `TABS` has exactly three entries; no wizard component added |

### Issues Found
**CRITICAL**: None

**WARNING**:
1. **Expediente UI has no Jest** — tasks 1.3–4.3 and frontend/Cálculo/Comparativa render scenarios are source-implemented and typecheck clean; advisor completed 5.1 manual QA on 2026-09-09 after seed. Verifier did not re-run a browser session. Spec does not require automated UI tests. Same class of warning as HU-20 Banks UI.
2. **20 UI-facing spec scenarios are PARTIAL** — covering API tests passed for persist/PATCH/messages/math; Card/picker/overlay/date-format rendering is not exercised by a web runner.
3. **`analysis-section.tsx` grew to 1103 lines** (design baseline 1046). Islands were extracted; leftover growth is parent wiring.
4. **Medical seed test uses a filter loop** without an in-test `length > 0` guard (`seed-data.spec.ts`). Companion MATRIX locks exist in the same file.
5. **Engram `apply-progress` #593 is stale** vs local file (5.1–5.2 now checked; QA follow-up documented locally).

**SUGGESTION**:
1. Optional web component tests once a runner exists; not blocking archive.
2. Add an explicit `expect(matrixBanks.length).toBeGreaterThan(0)` in the consultorio seed test.
3. Cover `formatActivityTenure` non-finite/negative branch (line 4) if that input can appear.

### Known non-blockers (do not escalate)
- No web Jest (project convention; HU-20 archive)
- Banorte 0.70 backlog (`backlog/banorte-pfae-cliente-070`)
- Double `resolvePfaeFactor` (documented; Phase C math unchanged)
- Quiet `loadLatest` (documented)
- Verifier did not re-seed Postgres; seed was already applied 2026-09-09 and locked by `seed-data.spec.ts`

### Verdict
**PASS WITH WARNINGS**

14/14 tasks complete; 6 API/QA-lock scenarios COMPLIANT with passing runtime tests; remaining UI scenarios PARTIAL by HU-20 convention after advisor QA; focused 252 and full 1187 green; API and web typecheck clean. Warnings are missing web Jest, parent file growth, and a filter-loop seed assertion — not spec failures and not archive blockers.
