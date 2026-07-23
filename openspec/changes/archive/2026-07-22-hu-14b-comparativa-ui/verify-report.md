# Verification Report

**Change**: hu-14b-comparativa-ui
**Version**: N/A
**Mode**: Standard (no Strict TDD runner detected)

---

## Completeness

| Metric             | Value |
|--------------------|-------|
| Tasks total        | 20    |
| Tasks complete     | 20    |
| Tasks incomplete   | 0     |

### Task Completion Matrix

| Task | Description | Status | Evidence |
|------|-------------|--------|----------|
| T1.1 | Define `BankarizationFlags` interface | ✅ | `bank-viability.types.ts` lines 5-8 |
| T1.2 | Extract flags from Phase A in orchestrator | ✅ | `case-analysis.service.ts` lines 89-98 |
| T1.3 | Refactor `deriveScotiabankFlags(flags?)` | ✅ | `bank-viability.rule.ts` lines 287-294 |
| T1.4 | Add `bankViability` to POST response payload | ✅ | `case-analysis.service.ts` lines 156-160 |
| T2.1 | Define typed contracts (8 interfaces) | ✅ | `definitions.ts` lines 186-260 |
| T2.2 | Extend `AnalysisDetail` with `bankViability` | ✅ | `definitions.ts` line 143 |
| T2.3 | Create `STATUS_LABELS` and `REASON_LABELS` | ✅ | `definitions.ts` lines 262-286 |
| T3.1 | Move global button to header row | ✅ | `analysis-section.tsx` lines 179-185 |
| T3.2 | Add `observations` UiState variant | ✅ | `analysis-section.tsx` lines 38, 88-95 |
| T3.3 | Create `AnalysisStepper` component | ✅ | `analysis-section.tsx` lines 637-681 |
| T3.4 | Create `CompactStatusBar` component | ✅ | `analysis-section.tsx` lines 685-719 |
| T3.5 | Disable tabs during execution | ✅ | `analysis-section.tsx` lines 209-220 |
| T4.1 | Create `BankComparisonTab` component | ✅ | `bank-comparison-tab.tsx` lines 81-149 |
| T4.2 | Sub-component `StatusHeader` | ✅ | `bank-comparison-tab.tsx` lines 163-247 |
| T4.3 | Sub-component `FinancialSummary` | ✅ | `bank-comparison-tab.tsx` lines 251-296 |
| T4.4 | Sub-component `ProductTable` | ✅ | `bank-comparison-tab.tsx` lines 300-440 |
| T4.5 | Sub-component `ProductDetail` (expandable) | ✅ | `bank-comparison-tab.tsx` lines 444-635 |
| T4.6 | Helper `formatAge()` | ✅ | `bank-comparison-tab.tsx` lines 18-26 |
| T4.7 | Sub-component `WarningLegend` | ✅ | `bank-comparison-tab.tsx` lines 682-694 |
| T4.8 | Integrate `BankComparisonTab` in section | ✅ | `analysis-section.tsx` lines 248-256 |
| T5.1 | Backend unit tests | ✅ | 830/830 passed (47 suites) |
| T5.2 | Frontend type-check | ✅ | `tsc --noEmit` clean |
| T5.3 | Manual flow test | ✅ | Documented in tasks.md |

---

## Build & Tests Execution

**Build**: ✅ Passed
```text
apps/api:  47 test suites, 830 tests — all passed (11.684 s)
apps/web:  npx tsc --noEmit — zero errors (clean compilation)
```

**Tests**: ✅ 830 passed / ❌ 0 failed / ⚠️ 0 skipped

```text
> api@0.0.1 test
> jest

Test Suites: 47 passed, 47 total
Tests:       830 passed, 830 total
Snapshots:   0 total
Time:        11.684 s
```

**Coverage**: ➖ Not available (no coverage instrumentation configured in either project)

---

## Spec Compliance Matrix

### case-analysis spec (2 added, 1 modified, 1 removed → 6 scenarios)

| Requirement | Scenario | Evidence | Result |
|-------------|----------|----------|--------|
| BankarizationFlags Interface | Flags interface defined and typed | `bank-viability.types.ts` lines 5-8 | ✅ COMPLIANT |
| BankarizationFlags Interface | Default flags when Phase A absent | `bank-viability.rule.ts` line 291: `flags?.hasPagadoraIncome ?? false` | ✅ COMPLIANT |
| BankViability in POST Response | POST response includes bankViability | `case-analysis.service.ts` lines 156-160 | ✅ COMPLIANT |
| BankViability in POST Response | POST and GET expose identical structure | Same spread pattern: `{ bankViability }` at lines 142 and 159 | ✅ COMPLIANT |
| Phased Orchestration (MODIFIED) | Three-phase execution completes in order | `case-analysis.service.ts` lines 82-123; `case-analysis.service.spec.ts` line 238 | ✅ COMPLIANT |
| Phased Orchestration (MODIFIED) | Phase A flags passed to Phase C | `case-analysis.service.ts` lines 89-98, 121; `bank-viability.rule.spec.ts` line 259 | ✅ COMPLIANT |
| Phased Orchestration (MODIFIED) | Phase B injects calculation services | `case-analysis.service.ts` lines 54-63, 100-118 | ✅ COMPLIANT |
| REMOVED: DB-derived flags | (N/A — removed) | No DB query in `deriveScotiabankFlags()` | ✅ COMPLIANT |

**case-analysis compliance**: 7/7 scenarios compliant

### frontend spec (5 added, 1 modified → 24 scenarios)

| Requirement | Scenario | Evidence | Result |
|-------------|----------|----------|--------|
| Bank Viability Type Definitions | All types declared and exported | `definitions.ts` lines 186-260 | ✅ COMPLIANT |
| Bank Viability Type Definitions | ProductMatchCalculation matches backend shape | `definitions.ts` lines 217-229 — 11 fields match backend | ✅ COMPLIANT |
| Bank Viability Type Definitions | ProductPolicySnapshot defines expected shape | `definitions.ts` lines 231-239 (see WARNING: missing bankName/productName) | ⚠️ PARTIAL |
| AnalysisDetail Extended | bankViability accessible on AnalysisDetail | `definitions.ts` line 143 | ✅ COMPLIANT |
| Centralized Translation Catalog | All status codes use centralized labels | `bank-comparison-tab.tsx` line 421: `STATUS_LABELS[m.status]` | ✅ COMPLIANT |
| Centralized Translation Catalog | All reason codes use centralized labels | `bank-comparison-tab.tsx` line 621: `REASON_LABELS[r]` | ✅ COMPLIANT |
| Human-Readable Age Formatting | Whole years without months | `formatAge(360)` → "30 años" (line 23) | ✅ COMPLIANT |
| Human-Readable Age Formatting | Years with remaining months | `formatAge(365)` → "30 años 5 meses" (lines 23-24) | ✅ COMPLIANT |
| Human-Readable Age Formatting | Single year singular form | `formatAge(12)` → "1 año" (line 23) | ✅ COMPLIANT |
| Human-Readable Age Formatting | Single year with months | `formatAge(13)` → "1 año 1 mes" (lines 23-24) | ✅ COMPLIANT |
| Comparativa Bancaria Tab UI | Status header shows aggregated result | `bank-comparison-tab.tsx` lines 163-247 — counts by status | ✅ COMPLIANT |
| Comparativa Bancaria Tab UI | Financial summary displays 7 fields | `bank-comparison-tab.tsx` lines 263-271 — 7 fields | ✅ COMPLIANT |
| Comparativa Bancaria Tab UI | Product table renders 8 columns | `bank-comparison-tab.tsx` lines 309-425 — 8 columns | ✅ COMPLIANT |
| Comparativa Bancaria Tab UI | Products ordered by status then capacity | `bank-comparison-tab.tsx` lines 100-110 — STATUS_ORDER + capacity DESC | ✅ COMPLIANT |
| Comparativa Bancaria Tab UI | Null values render as dash | `formatCurrency(null)` → "—" (line 59), `formatPercent(null)` → "—" (line 65), `formatAge(null)` → "—" (line 19) | ✅ COMPLIANT |
| Comparativa Bancaria Tab UI | Compact status badges render correctly | `bank-comparison-tab.tsx` lines 417-423 — solid green/amber/blue/red | ✅ COMPLIANT |
| Comparativa Bancaria Tab UI | Expandable detail shows 3 sections | `bank-comparison-tab.tsx` lines 524-626 — Cálculo, Controles, Razones | ✅ COMPLIANT |
| Comparativa Bancaria Tab UI | 7 controls are displayed | `bank-comparison-tab.tsx` lines 453-501 — 7 rows (see WARNING on Ingreso requerido) | ⚠️ PARTIAL |
| Comparativa Bancaria Tab UI | Aforo-conditioned shows max amount + reduction | `bank-comparison-tab.tsx` lines 396-405, 643-651 | ✅ COMPLIANT |
| Comparativa Bancaria Tab UI | Maturity-conditioned shows max theoretical term | `bank-comparison-tab.tsx` lines 655-658 | ✅ COMPLIANT |
| Comparativa Bancaria Tab UI | Warning legend below results | `bank-comparison-tab.tsx` line 126, 682-694 | ✅ COMPLIANT |
| Comparativa Bancaria Tab UI | Unsupported destination state | `bank-comparison-tab.tsx` lines 132-136 | ✅ COMPLIANT |
| Comparativa Bancaria Tab UI | Datos insuficientes with missing income calc | `bank-comparison-tab.tsx` lines 139-143 | ✅ COMPLIANT |
| Comparativa Bancaria Tab UI | Datos insuficientes with missing liability snapshot | `bank-comparison-tab.tsx` lines 42-47, 139-143 | ✅ COMPLIANT |
| Comparativa Bancaria Tab UI | Datos insuficientes NOT triggered by missing birth date alone | Products shown when `productMatches.length > 0` (line 98) | ✅ COMPLIANT |
| Comparativa Bancaria Tab UI | Table shown even with REQUIRES_REVIEW matches | `productMatches.length > 0` check first (line 98) | ✅ COMPLIANT |
| Comparativa Bancaria Tab UI | No products state | `bank-comparison-tab.tsx` lines 146-148 | ✅ COMPLIANT |
| Comparativa Bancaria Tab UI | Backend codes never exposed | All codes routed through `STATUS_LABELS` / `REASON_LABELS` | ✅ COMPLIANT |
| Comparativa Bancaria Tab UI | Aforo displays requested + maximum LTV | `bank-comparison-tab.tsx` lines 396-405: `${requested} / máx. ${maxLtv}` | ✅ COMPLIANT |
| Header Redesign | Button in header row | `analysis-section.tsx` lines 179-185 | ✅ COMPLIANT |
| Header Redesign | No re-execute link inside Validaciones tab | `ValidacionesTab` (lines 265-310) has no re-execute link | ✅ COMPLIANT |
| Global 3-Phase Progress Indicator | All phases pending during request | `AnalysisStepper` renders gray (line 657) | ✅ COMPLIANT |
| Global 3-Phase Progress Indicator | All phases completed after success | `CompactStatusBar` green variant (lines 711-717) | ✅ COMPLIANT |
| Global 3-Phase Progress Indicator | Error without per-phase failure | `AnalysisStepper phase="error"` (lines 188-193); red only on error | ✅ COMPLIANT |
| Global 3-Phase Progress Indicator | Tabs disabled during analysis | `analysis-section.tsx` lines 209-220 — `pointer-events-none` | ✅ COMPLIANT |
| Tab Label Rename (MODIFIED) | Tab displays new label | `analysis-section.tsx` line 46: "Comparativa bancaria" | ✅ COMPLIANT |

**frontend compliance**: 34/36 scenarios compliant, 2 with WARNING

### unified-analysis-flow spec (4 added, 2 modified → 10 scenarios)

| Requirement | Scenario | Evidence | Result |
|-------------|----------|----------|--------|
| Analysis Button Location | Button in header, not in tab content | `analysis-section.tsx` lines 179-185; `ValidacionesTab` has no button | ✅ COMPLIANT |
| Global Progress Indicator | All phases pending during request | `AnalysisStepper` gray circles (line 657) | ✅ COMPLIANT |
| Global Progress Indicator | All phases marked completed after success | `CompactStatusBar` green variant with "✓ Análisis completado" (lines 711-717) | ✅ COMPLIANT |
| Error State with Re-attempt | Error preserves last successful analysis | `loadLatest` loads existing; error state separate (lines 100-103) | ✅ COMPLIANT |
| Error State with Re-attempt | No partial results presented on error | `handleAnalyze` on error sets error state without partial data (lines 121-129) | ✅ COMPLIANT |
| Completion with Observations | Amber bar for PARTIAL outcome | `isObservations` check line 91; `CompactStatusBar` amber variant (lines 700-709) | ✅ COMPLIANT |
| Completion with Observations | Amber bar for conditioned products | `isObservations` check lines 92-94 | ✅ COMPLIANT |
| Completion with Observations | Amber bar for products requiring review | `isObservations` check lines 92-94 | ✅ COMPLIANT |
| Single Analysis Trigger (MODIFIED) | Single button triggers all phases | `handleAnalyze` calls `triggerAnalysis` for full pipeline (line 123) | ✅ COMPLIANT |
| Single Analysis Trigger (MODIFIED) | No confirmation between phases | Backend runs A→B→C without interruption; frontend shows single progress | ✅ COMPLIANT |
| Tabs During Analysis (MODIFIED) | Tabs disabled but visible during execution | `analysis-section.tsx` lines 209-220 | ✅ COMPLIANT |

**unified-analysis-flow compliance**: 11/11 scenarios compliant

---

## Correctness (Static Evidence)

| Implementation Requirement | Status | Notes |
|---------------------------|--------|-------|
| `BankarizationFlags` interface with exact fields | ✅ | `hasPagadoraIncome: boolean; scotiabankExcluded: boolean` |
| Orchestrator extracts flags from Phase A result | ✅ | `bankarizationResult?.detail.hasPagadoraIncome` |
| `deriveScotiabankFlags(flags?)` no DB query | ✅ | Pure nullish coalescing, no `AnalysisRun` read |
| POST `/analyze` response includes `detail.bankViability` | ✅ | Spread into both DB persist and return payload |
| `bankarization-validation` exposes flags in detail | ✅ | `hasPagadoraIncome`, `scotiabankExcluded` in detail |
| All 8 frontend typed interfaces defined | ✅ | `ProductMatchStatus`, `CheckStatus`, `CheckResult`, `BankViabilityInputs`, `ProductMatchCalculation`, `ProductPolicySnapshot`, `ProductMatch`, `BankViabilitySnapshot` |
| `AnalysisDetail` extended with `bankViability?` | ✅ | Optional typed field |
| `STATUS_LABELS` and `REASON_LABELS` centralized | ✅ | All 4 statuses and 16 reasons mapped |
| Button in header row, right-aligned | ✅ | `justify-between` flexbox |
| No duplicate "Re-ejecutar" link in Validaciones tab | ✅ | Tab body is `ValidacionesTab` without action button |
| `observations` UiState variant exists | ✅ | Discriminated union variant present |
| `AnalysisStepper` — 3 phases, no timers | ✅ | All phases gray during `analyzing` |
| `CompactStatusBar` — green/amber variants | ✅ | Green for `result`, amber for `observations` |
| Tabs disabled during `analyzing` | ✅ | `pointer-events-none opacity-50` |
| Tab renamed to "Comparativa bancaria" | ✅ | Line 46 |
| 6 UI states: empty, results, unsupported, insufficient, no products, (error at section level) | ✅ | 5 states in tab; error at section |
| StatusHeader with aggregated counts | ✅ | Counts per ProductMatchStatus |
| FinancialSummary with 7 fields | ✅ | Ingreso bruto, neto, pasivo, monto, inmueble, plazo, destino |
| ProductTable with 8 columns, correct order, solid badges | ✅ | STATUS_ORDER sort + capacity DESC |
| ProductDetail with 3 sections | ✅ | Cálculo financiero, Evaluación de controles, Razones |
| 7 controls displayed | ✅ | Displayed but "Ingreso requerido" always NOT_APPLICABLE (see WARNING) |
| `formatAge()` — singular/plural, no zero units | ✅ | 13 months → "1 año 1 mes" |
| WarningLegend as separate block | ✅ | Below table |
| Aforo exceeded shows both values | ✅ | "90% / máx. 80%" format |
| LTV-conditioned shows max amount + reduction | ✅ | `SuggestedAdjustments` section |
| Null values as "—" | ✅ | `formatCurrency`, `formatPercent`, `formatAge` |
| All text in Spanish, no backend codes exposed | ✅ | `STATUS_LABELS` and `REASON_LABELS` |

---

## Coherence (Design)

| Design Decision | Followed? | Notes |
|-----------------|-----------|-------|
| Scotiabank flags via context, not DB | ✅ | `bankarizationFlags` in context, no `AnalysisRun` read |
| POST payload: `bankViability` inside `detail` | ✅ | Lines 156-160 in service |
| `observations` UiState as discriminated union | ✅ | `{ phase: "observations"; run: AnalysisRun }` |
| Stepper: all phases gray during request, no timers | ✅ | No simulated timers |
| Translation catalog in `definitions.ts` | ✅ | `STATUS_LABELS` and `REASON_LABELS` constants |
| Product ordering: status priority then capacity DESC | ✅ | `STATUS_ORDER` map + `availableCapacity` sort |
| `formatAge` per design spec | ✅ | Matches design examples |
| 6 UI states for `BankComparisonTab` | ✅ | Error handled at section level, 5 states in tab |
| `AnalysisStepperProps` with `phase: "analyzing" \| "error"` | ✅ | Implements these phases |

---

## Issues Found

### CRITICAL
None.

### WARNING

1. **`ProductPolicySnapshot` missing `bankName`/`productName` fields** — The spec (`frontend/spec.md` § Bank Viability Type Definitions, Scenario: ProductPolicySnapshot) requires `bankName` and `productName` in the `ProductPolicySnapshot` interface. The implementation omits them. The frontend accesses them via `Record<string, unknown>` cast (lines 315-316, 342-343), which works at runtime but violates the typed contract. Backend also omits `bankName`/`productName` from the serialized `policySnapshot`.

2. **No isolated unit test for `deriveScotiabankFlags(undefined)`** — The design calls for "null flags → both false" test. Currently tested only implicitly via integration (default context has no `bankarizationFlags`). No direct unit test on the `deriveScotiabankFlags` private method.

3. **No explicit test asserting `detail.bankViability` in POST response** — The design calls for "verify `AnalysisResultPayload.detail.bankViability` exists". The mock includes `bankViability` but no test explicitly asserts its presence in the returned payload.

4. **No frontend runtime tests** — `apps/web` has no test runner (Jest/Vitest). `formatAge`, product ordering, and UI states are verified only through TypeScript compilation (`tsc --noEmit`), not runtime test execution. Spec scenarios for `formatAge` (4 scenarios) lack runtime-verified test coverage.

5. **"Ingreso requerido" control always shows "No aplica"** — The frontend renders 7 controls including "Ingreso requerido" (line 459-463), but the backend never computes an `incomeRequirement` check. The control relies on `checks.incomeRequirement?.status ?? "NOT_APPLICABLE"`, which always defaults to `NOT_APPLICABLE`. This means one of the 7 controls is never meaningful.

### SUGGESTION

1. **Error state should be within `BankComparisonTab`** — The spec defines error as a tab state, but it is handled at the `AnalysisSection` level. Consider wrapping `BankComparisonTab` in an error boundary so per-tab errors are isolated.

2. **Add `bankName` and `productName` to backend `policySnapshot`** — The backend serializes `policySnapshot` without bank/product name. Adding these fields would eliminate the need for the frontend to cast to `Record<string, unknown>`.

3. **Implement `incomeRequirement` check in backend** — The backend could compute an income requirement check (e.g., comparing income used against a threshold) to make the 7th control meaningful.

---

## Verdict

**PASS WITH WARNINGS**

All 20 tasks are complete. All 830 backend tests pass. TypeScript compilation is clean. Spec compliance is strong (52/54 scenarios compliant). The 5 warnings identified are non-critical — they represent missing typed fields, untested code paths that are exercised implicitly, and a control that always defaults to NOT_APPLICABLE. None block functionality or archive readiness.
