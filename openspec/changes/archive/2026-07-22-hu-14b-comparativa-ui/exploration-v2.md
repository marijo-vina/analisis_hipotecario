## Exploration: HU-14B — Comparativa Bancaria (Fresh Post-HU-14A)

### Current State

HU-14A (unificar análisis) was fully merged and several post-merge fixes applied. The analysis orchestrator now runs 3 deterministic phases:

1. **Phase A:** `IdentityMatchRule` + `BankarizationValidationRule`
2. **Phase B:** `IncomeCalculationService.calculate()` + `LiabilityCalculationService.calculate()`
3. **Phase C:** `BankViabilityRule` (reads fresh income/liability from DB)

The `BankViabilityRule` **is already registered** in both `CaseAnalysisModule` providers and `CaseAnalysisService`. It executes and persists a rich `BankViabilitySnapshot` (with `productMatches`, `checks`, `calculation`, `policySnapshot`) into `AnalysisRun.detail`. The GET `/mortgage-cases/:caseId/analysis/latest` endpoint returns the full persisted record, including `detail.bankViability`.

However, the frontend `AnalysisDetail` type does **not** declare `bankViability`, so the new data is invisible to TypeScript. The "Bancos / Viabilidad" tab still renders a placeholder. The immediate POST `/analyze` response does **not** include `bankViability` in its `detail` payload because `CaseAnalysisService.run()` constructs the return object manually without it — the UI compensates by calling `fetchLatestAnalysis` immediately after.

A **confirmed bug** remains: `BankViabilityRule.deriveScotiabankFlags()` reads the *latest persisted* `AnalysisRun` from the DB to extract `hasPagadoraIncome` / `scotiabankExcluded`. Because the current run has **not yet been persisted** when Phase C executes, the rule always reads the **previous** run (or none on first analysis). This produces stale or missing flags.

### Affected Areas

- `apps/api/src/case-analysis/case-analysis.module.ts` — Already provides `BankViabilityRule`.
- `apps/api/src/case-analysis/case-analysis.service.ts` — Already injects and executes `BankViabilityRule` in Phase C. Returns `detail` without `bankViability` in the POST payload.
- `apps/api/src/case-analysis/analysis-rule.interface.ts` — `RuleDetail` has `[key: string]: unknown`, so `bankViability` is allowed at runtime but not strongly typed.
- `apps/api/src/case-analysis/dto/analysis-result.dto.ts` — Inherits `RuleDetail` index signature; no explicit change needed.
- `apps/api/src/case-analysis/rules/bank-viability.rule.ts` — Intact, but `deriveScotiabankFlags` reads stale DB state.
- `apps/web/app/lib/definitions.ts` — `AnalysisDetail` still `{ sources, fields }`; missing `bankViability`.
- `apps/web/app/ui/expedientes/analysis-section.tsx` — "Bancos / Viabilidad" tab is still a placeholder (lines 175-179). Single "Analizar expediente" button and "Re-ejecutar análisis" link already exist.
- `apps/web/app/actions/analysis.ts` — No changes needed; `fetchLatestAnalysis` already serves full `AnalysisRun`.
- `apps/api/src/mortgage-cases/mortgage-cases.controller.ts` — Endpoints unchanged.

### Comparison with Original Exploration & Proposal

| # | Original Claim | Current Reality | Verdict |
|---|----------------|-----------------|---------|
| 1 | `BankViabilityRule` **not registered** in module/service. | Registered in both module and service; executed in Phase C. | ❌ Already done |
| 2 | `RuleDetail` only defines `{ sources, fields }`; `bankViability` not in contract. | `RuleDetail` now has `[key: string]: unknown` (runtime allowance), but still no explicit typed field. | ⚠️ Partially outdated |
| 3 | `AnalysisResultDto` needs update if `RuleDetail` changes. | `AnalysisResultDto` inherits index signature; no explicit change required. | ✅ Still accurate (no change needed) |
| 4 | Frontend `AnalysisDetail` must be extended with `bankViability`. | Still only `{ sources, fields }`. Extension is required. | ✅ Still accurate |
| 5 | Tab "Bancos / Viabilidad" exists as placeholder. | Still exists and is a placeholder. | ✅ Still accurate |
| 6 | Flow: user clicks "Validar expediente" → POST analyze. | Button renamed to "Analizar expediente"; 3-phase orchestrator runs all rules. | ❌ Outdated — unified flow already implemented |
| 7 | GET `/analysis/latest` exists and is consumed. | Still present; returns full `AnalysisRun`. | ✅ Still accurate |
| 8 | `BankViabilityRule` reads latest `AnalysisRun` for Scotiabank flags — stale flag risk. | **Confirmed**: rule reads DB before current run is persisted, so it reads previous run. | ✅ Risk confirmed |
| 9 | Backend work is trivial (~3 lines to register rule + interface). | Backend registration is already done. Work is now ~0 lines. | ❌ Already done |
| 10 | Scope included removing individual execute/confirm buttons. | Already done in HU-14A. | ❌ Already done |
| 11 | Phase progress indicator (3 steps) was in scope. | 3-phase orchestrator exists but there is **no UI progress indicator** during analysis. | ⚠️ Partially outdated (backend exists, UI missing) |
| 12 | Conciliation auto-run was planned. | Conciliation runs inside the unified analysis flow (HU-14A). | 🆕 Already done |

### Approaches

1. **Frontend-only: Types + Tab UI + Stale-flag fix**
   - Extend frontend `AnalysisDetail` with `bankViability?: BankViabilitySnapshot`.
   - Replace placeholder in `analysis-section.tsx` with real comparativa tab component.
   - Pass Phase A `bankarization-validation` result directly into `BankViabilityRule.execute()` (or refactor `deriveScotiabankFlags` to accept it as parameter) so flags are fresh.
   - Optionally add `bankViability` to the POST response payload in `CaseAnalysisService.run()` to avoid the extra fetch hop.
   - **Pros:** Minimal backend work; leverages already-persisted rich data; fixes a real bug.
   - **Cons:** Requires touching the rule's internal flag derivation.
   - **Effort:** Low-Medium

2. **Frontend-only without flag fix**
   - Same as above but leave the stale-flag bug for a separate bugfix HU.
   - **Pros:** Even smaller scope; pure wiring + UI.
   - **Cons:** Scotiabank product evaluation will be incorrect on first run and lag by one run thereafter. Bad UX for a bank-comparison feature.
   - **Effort:** Low

### Recommendation

**Approach 1 with the stale-flag fix included.**

The heavy backend lifting is already complete. The only meaningful backend change is refactoring `BankViabilityRule` to receive the `bankarization-validation` result from Phase A directly (e.g., via constructor injection of the rule result, or by changing the orchestrator to pass it in context). This is a small but critical correctness fix.

The bulk of the remaining work is frontend:
- Extend `AnalysisDetail` type.
- Build the "Comparativa bancaria" tab UI (product table, expandable detail, status badges, warning legend).
- Optionally add a simple 3-step progress indicator during the "analyzing" phase (since the backend already runs 3 phases deterministically).

### Risks

- **Stale Scotiabank flags (CONFIRMED BUG):** `deriveScotiabankFlags` reads the previous `AnalysisRun` from the DB because the current run hasn't been persisted yet. On first analysis, flags are always `false`. This directly affects product eligibility for Scotiabank. **Mitigation:** Refactor the rule to accept the Phase A `bankarization-validation` result as an input instead of querying the DB.
- **Type drift between POST and GET responses:** The POST `/analyze` response omits `bankViability` from `detail`, while GET `/analysis/latest` includes it. The UI currently bridges this with a second fetch, but this is fragile. **Mitigation:** Include `bankViability` in the `AnalysisResultPayload` returned by `run()`.
- **Missing Income/Liability → many REQUIRES_REVIEW statuses:** Still true. The UI must handle empty capacity, missing birth date, and unsupported destination gracefully.
- **UI state management:** `AnalysisSection` currently uses a single `UiState` for all tabs. Adding a comparativa tab that depends on `AnalysisRun.detail.bankViability` will require careful handling of the "idle" vs "result" states.

### Ready for Proposal

**YES — with significant scope adjustments.**

The original proposal should be updated to:
1. Remove backend registration tasks (already done).
2. Remove "remove individual buttons" and "3-phase progress" from backend scope (already done or partially done).
3. Add a backend task to fix the stale Scotiabank flag bug.
4. Add a backend task to include `bankViability` in the POST response payload.
5. Keep frontend type extension and tab UI as the primary deliverables.
6. The effort drops from Medium to **Low-Medium**.

The orchestrator should tell the user: "The backend is already wired. HU-14B is now almost entirely a frontend visualization task, plus one small but important backend bugfix to ensure Scotiabank flags are evaluated correctly."
