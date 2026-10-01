## Verification Report

**Change**: bureau-credit-utilization
**Version**: N/A (delta specs; no version field)
**Mode**: Strict TDD
**Date**: 2026-09-17
**Persistence**: hybrid (openspec file + Engram `sdd/bureau-credit-utilization/verify-report`)

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 14 |
| Tasks complete | 13 |
| Tasks incomplete | 1 (3.2 manual advisor QA) |

Implementation tasks 1.1–2.5 were already `[x]` from apply. Task **3.1** marked `[x]` in this verify pass after runtime evidence (API Jest 153/153, web vitest 36/36). Task **3.2** left `[ ]` — blocked: no live logged-in expediente with `CREDIT_BUREAU_REPORT` reachable in the IDE browser (no open tabs). 3.2 is cleanup/QA (HU-21 convention), not a core implementation task.

### Build & Tests Execution
**Build**: ✅ API production `tsc -p tsconfig.build.json --noEmit` passed. ⚠️ Full-project `tsc --noEmit` (including specs) has errors — see Quality Metrics.

```text
apps/api: npx tsc -p tsconfig.build.json --noEmit --pretty false
exit 0

apps/web: npx tsc --noEmit --pretty false
exit 2 — errors only in app/lib/bureau-utilization.spec.ts (CreditStub not Partial)
No errors in bureau-utilization.ts, extraction.ts, or buro-tab.tsx.
```

**Tests**: ✅ 189 passed / ❌ 0 failed / ⚠️ 0 skipped

```text
apps/api:
npx jest src/documents/layout-lines-extractor.spec.ts src/documents/coordinate-grid.extractor.spec.ts src/documents/credit-bureau-extraction.service.spec.ts --runInBand
Test Suites: 3 passed, 3 total
Tests:       153 passed, 153 total
Time:        15.709 s

apps/web:
npm test -- app/lib/bureau-utilization.spec.ts
✓ app/lib/bureau-utilization.spec.ts (36 tests) 11ms
Test Files  1 passed (1)
```

**Coverage**: API changed files (Jest `--coverage` on the three required spec files): aggregate **80.7% lines** / no project threshold configured → ⚠️ mixed (one file Low). Web vitest coverage skipped — `@vitest/coverage-v8` not installed.

### Spec Compliance Matrix
| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Persist Account Number on Extract | Layout and coordinate copy | `credit-bureau-extraction.service.spec.ts` > copies layout accountNumber onto the matched credit and does not persist utilization; copies coordinate accountNumber when the matched credit has none and does not persist utilization; layout overwrite / coordinate no-overwrite | ✅ COMPLIANT |
| Persist Account Number on Extract | Gemini schema unchanged | `credit-bureau-extraction.service.spec.ts` > LEAN and REDUCED schemas omit accountNumber and utilization; `openspec/specs/ai-extraction/schemas/credit-bureau.schema.md` has neither key | ✅ COMPLIANT |
| Persist Account Number on Extract | No silent re-extract | `bureau-utilization.spec.ts` > parseBuro copies stored accountNumber; static: `BuroTab` only `parseBuro(documents)` (no OCR/Gemini). No test that opening the tab does not call extract APIs. Task 3.2 blocked. | ⚠️ PARTIAL |
| Parse Account Number from Creditor Info | Digits in creditorInfo | `coordinate-grid.extractor.spec.ts` > parses a ≥6-digit run from creditorInfo into accountNumber and strips it from institution | ✅ COMPLIANT |
| Parse Account Number from Creditor Info | No digits | `coordinate-grid.extractor.spec.ts` > sets accountNumber null when creditorInfo has no usable digit run (plus 5-digit skip) | ✅ COMPLIANT |
| Shared Buro Utilization Display | In-scope rate | `bureau-utilization.spec.ts` > shows rounded rate and band for an open in-scope card (30% / Muy buena). No component/browser test that both tables and SALARIED/PFAE share the column. Static: shared `CreditRow` / `BuroTab` has no `personType`. | ⚠️ PARTIAL |
| Shared Buro Utilization Display | Dashes | `bureau-utilization.spec.ts` > dashes excluded, closed, and null-balance rows (null is not 0%) | ⚠️ PARTIAL |
| Shared Buro Utilization Display | Weighted KPI and stored bureau | `bureau-utilization.spec.ts` > weights by sum(balances)/sum(limits) → 14%; denom 0 → —. Static: fifth KPI after consultas; original four remain. No render test of KPI row or no-re-OCR on tab open. | ⚠️ PARTIAL |
| Masked Last-4 under Institution | Mask and fallback | `bureau-utilization.spec.ts` > masks accountNumber as ****3660; institution ≥4 digits; rawTextReference; dash when no source; prefers accountNumber and never returns full number. `parseBuro accountNumber` copies stored field. No Institución cell render test. | ⚠️ PARTIAL |

**Compliance summary**: 5/9 scenarios ✅ COMPLIANT, 4/9 ⚠️ PARTIAL, 0 ❌ FAILING, 0 ❌ UNTESTED

PARTIAL rows are frontend/UI (and the no-re-extract negative path). Helper/API unit tests cover the behavioral contract; component/browser tests were never in v1 design (E2E: none). Per HU-21 / 3.2 convention these are WARNING, not CRITICAL.

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| Persist accountNumber from layout then coordinate fill-if-empty | ✅ Implemented | `credit-bureau-extraction.service.ts` `if (lc.accountNumber)` then `if (cc.accountNumber && !credit.accountNumber)`. Never writes utilization. |
| Gemini schema unchanged | ✅ Implemented | LEAN/REDUCED contract tests; `credit-bureau.schema.md` has no `accountNumber` / utilization. |
| No silent re-extract | ✅ Implemented (static) | `BuroTab` parses `documents` only; extract actions are payment-due / inquiries manual updates, not OCR replay. |
| Coordinate parse from creditorInfo | ✅ Implemented | `extractBlockValues` uses `parseInstitutionAndAccount(block.institution)` (institution filled from creditorInfo). `CoordinateCredit.accountNumber: string \| null`. |
| Shared Buro tab, no personType fork, no third table | ✅ Implemented | `BuroTabProps` is `{ documents, caseId }`. Two tables (bancarios / no bancarios) share `CreditRow`. |
| Utilización on all rows; in-scope % + chip | ✅ Implemented | Column on `CreditTableSection` header + every `CreditRow`. Dash when `percent`/`band` null. |
| Predicate / rate / closed / global / bands | ✅ Implemented | `bureau-utilization.ts` matches spec table (REVOLVING; DEPARTMENT_STORE iff limit > 0; `/tarjeta/i` only when UNKNOWN; excludes listed types; null balance is not 0; over-limit 91+). |
| Extra KPI; original four remain | ✅ Implemented | Score / activos / cerrados / consultas + Utilización. `sm:grid-cols-4 xl:grid-cols-5`. |
| Six-band legend beside MOP | ✅ Implemented | Sidebar: `BuroBehaviorLegend` then `BuroUtilizationLegend` (`UTILIZATION_BANDS`). |
| Masked last-4 under Institución | ✅ Implemented | `maskLastFour` under institution; chain accountNumber → institution → rawTextReference → —. |
| parseBuro reads stored accountNumber | ✅ Implemented | `accountNumber: (credit.accountNumber as string) ?? null` on `ParsedCreditBureauCredit`. |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| Pure helper in web; not persisted | ✅ Yes | `bureau-utilization.ts`; merge never writes utilization. |
| Persist full accountNumber; UI **** + last 4 | ✅ Yes | |
| Shared `BuroTab` only | ✅ Yes | |
| Shared string parser (layout MIN 6 digits) | ✅ Yes | `parseInstitutionAndAccount` exported; coordinate reuses it. |
| Copy layout always; coordinate fills if empty | ✅ Yes | Matches design snippet. |
| Extra KPI; six-band legend beside MOP | ✅ Yes | Fifth KPI after consultas; legend in MOP sidebar. |
| No silent re-extract | ✅ Yes | |
| vitest lib-only / node env | ✅ Yes with recorded deviation | Pinned **^3.2.7** not 5.x (`@types/node` peer). |
| Export `extractBlockValues` for unit tests | ⚠️ Deviation (recorded in apply-progress) | Enables coordinate RED tests; not a spec break. |
| KPI wrap `xl:grid-cols-5` | ⚠️ Deviation (design open question) | `sm:grid-cols-4 xl:grid-cols-5` as apply-progress noted. |
| E2E none in v1 | ✅ Yes | No Playwright; UI scenarios PARTIAL by design. |
| Unchanged Gemini schemas / extraction-section / liability-table | ✅ Yes | `extraction-section.tsx` still mounts one shared `BuroTab`. |

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | Found in Engram apply-progress #617 |
| All tasks have tests | ⚠️ | 11/12 implementation tasks have test files (2.1 infra N/A; **2.5** UI wiring has no component test) |
| RED confirmed (tests exist) | ✅ | `layout-lines-extractor.spec.ts`, `coordinate-grid.extractor.spec.ts`, `credit-bureau-extraction.service.spec.ts`, `bureau-utilization.spec.ts` exist on disk |
| GREEN confirmed (tests pass) | ✅ | 153/153 API + 36/36 web on this verify run (matches apply GREEN claims) |
| Triangulation adequate | ✅ | 1.1: 4 parse cases; 1.3: 3 extractBlockValues cases; 1.5: layout copy/overwrite + coord fill/no-overwrite + no utilization; 2.2: in-scope / dashes / weighted global / 12 band edges / last-4 chain. 2.1 and 2.5 triangulation skipped as reported. |
| Safety Net for modified files | ⚠️ | Unit 1: 140/140 then 153/153. 2.4 ran helper tests before parseBuro. **2.5** `buro-tab.tsx` modified with Safety Net N/A (no component runner). |

**TDD Compliance**: 4/6 checks passed (2 warnings: 2.5 missing UI tests; 2.5 N/A safety net on a modified file)

Apply-progress TDD table is present — protocol was followed. GREEN claims cross-checked against this run.

---

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | 189 | 4 | Jest 30 (API), vitest 3.2.7 (web) |
| Integration | 0 | 0 | not installed (no RTL/component runner) |
| E2E | 0 | 0 | not in v1 design (no Playwright for this change) |
| **Total** | **189** | **4** | |

Scenario coverage layer: API persist/parse = unit; frontend display/mask = unit helpers only.

---

### Changed File Coverage
| File | Line % | Branch % | Uncovered Lines | Rating |
|------|--------|----------|-----------------|--------|
| `apps/api/src/documents/coordinate-grid.extractor.ts` | 91.8% | 69.8% | 249-250, 327-328, 344, 455, 464-466, 507-509, 556-557, 574, 593-598, 602-603, 618 | ✅ Excellent |
| `apps/api/src/documents/credit-bureau-extraction.service.ts` | 81.5% | 66.8% | many pre-existing merge/Gemini paths (e.g. 706-724, 834-890, 2620-2714) | ⚠️ Acceptable |
| `apps/api/src/documents/layout-lines-extractor.ts` | 56.3% | 51.1% | 92, 161, 189-199, 220-228, 232-260, 264-292 (mostly pre-existing block extraction; new `parseInstitutionAndAccount` is exercised) | ⚠️ Low |
| `apps/web/app/lib/bureau-utilization.ts` | — | — | Coverage analysis skipped — no vitest coverage plugin | ➖ |
| `apps/web/app/lib/extraction.ts` | — | — | skipped (web coverage tool not detected) | ➖ |
| `apps/web/app/ui/extraction/buro-tab.tsx` | — | — | skipped | ➖ |

**Average changed API file coverage**: 76.5% line (pulled down by layout-lines whole-file). New parser paths are covered by dedicated tests.

---

### Assertion Quality
| File | Line | Assertion | Issue | Severity |
|------|------|-----------|-------|----------|
| — | — | — | — | — |

New/changed tests assert production values (`accountNumber` `'82953660'`, display `"30%"` / `"14%"`, band labels, `****3660`, `not.toHaveProperty('utilization')`, schema JSON omit). `isInScope(...).toBe(true)` is a production-boolean check, not a tautology. No ghost loops, no smoke-only renders, no mocks in the web spec.

**Assertion quality**: ✅ All assertions verify real behavior (0 CRITICAL, 0 WARNING in new tests)

---

### Quality Metrics
**Linter**: ⚠️ errors present; mostly pre-existing
- API: 464 eslint problems on the six files, almost all `prettier/prettier` on historically dense extractors — not treated as a new functional regression.
- Web: 3 errors / 4 warnings on changed files. `react-hooks/set-state-in-effect` at `buro-tab.tsx:1150` (`setParsed(parseBuro(documents))` in `useEffect`) is pre-existing tab sync, not introduced as new behavior. `extraction.ts` `no-explicit-any` is pre-existing.

**Type Checker**: ⚠️ spec-file errors; production clean
- API production (`tsconfig.build.json`): ✅ no errors
- API including specs: `credit-bureau-extraction.service.spec.ts:2781` `makeCoordinateResult` missing `sectionType` on `CoordinateCredit` (WARNING in a changed test helper)
- Web: `bureau-utilization.spec.ts` `credit(overrides: CreditStub = {})` should be `Partial<CreditStub>` (WARNING; vitest still passes)

### Issues Found
**CRITICAL**: None

**WARNING**:
1. Four frontend/UI scenarios (and no-silent-re-extract) are ⚠️ PARTIAL — helper/API unit tests only; no component or browser coverage. Task **3.2** blocked: no live bureau session in the IDE browser.
2. Task **2.5** has no component test; `buro-tab.tsx` was modified with Safety Net N/A.
3. Design deviations (recorded in apply-progress, do not break spec): vitest **^3.2.7** not 5.x; `extractBlockValues` exported for tests; fifth KPI uses `sm:grid-cols-4 xl:grid-cols-5`.
4. `layout-lines-extractor.ts` whole-file line coverage 56% (Low). New `parseInstitutionAndAccount` is tested; uncovered lines are mostly pre-existing block extraction.
5. Typecheck of spec files: web `CreditStub` not `Partial`; API coordinate stub missing `sectionType`. Production API tsc is clean.

**SUGGESTION**:
1. Add RTL/component tests for `BuroTab` (column on both tables, fifth KPI, legend, last-4 under Institución) when a component runner exists.
2. Make `credit()` accept `Partial<CreditStub>`; add `sectionType` to `makeCoordinateResult`.
3. Add vitest coverage provider if changed-file web coverage is desired.

### Verdict
**PASS WITH WARNINGS**

Core extract/persist/helper contracts are ✅ COMPLIANT with passing runtime tests (189/189). Remaining gaps are UI visual QA (3.2 blocked) and PARTIAL helper-only coverage of render scenarios — WARNING, not archive-blocking CRITICAL.
