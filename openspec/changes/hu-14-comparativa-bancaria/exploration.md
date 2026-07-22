## Exploration: HU-14 — Visualizar Comparativa Bancaria Preliminar

### Current State

The bank viability rule (`BankViabilityRule`) is fully implemented in `apps/api/src/case-analysis/rules/bank-viability.rule.ts` and produces a rich `BankViabilitySnapshot` with `productMatches[]`, each containing `status`, `reasons`, `checks` (capacity, LTV, maturityAge, etc.), `calculation`, and `policySnapshot`. However, **the rule is not wired into the analysis orchestrator**, so it never executes. The frontend already has a dedicated "Bancos / Viabilidad" tab, but it only renders a placeholder message.

The GET endpoint to retrieve the latest analysis run already exists (`GET /mortgage-cases/:caseId/analysis/latest`) and is actively used by the frontend's `AnalysisSection` to restore state on page reload.

### Affected Areas

- `apps/api/src/case-analysis/case-analysis.module.ts` — must provide `BankViabilityRule` in the module's providers array.
- `apps/api/src/case-analysis/case-analysis.service.ts` — must inject and register `BankViabilityRule` in the `this.rules` array (currently only `[identityMatchRule, bankarizationValidationRule]`).
- `apps/api/src/case-analysis/analysis-rule.interface.ts` — `RuleDetail` only defines `{ sources, fields }`; `bankViability` is present at runtime (the rule pushes it as `never`) but is not in the contract.
- `apps/api/src/case-analysis/dto/analysis-result.dto.ts` — references `RuleDetail`; if the interface changes, the DTO implicitly changes.
- `apps/web/app/lib/definitions.ts` — `AnalysisDetail` must be extended to include `bankViability?: BankViabilitySnapshot`.
- `apps/web/app/ui/expedientes/analysis-section.tsx` — lines 224-230 contain the placeholder tab content that must be replaced with real UI.
- `apps/web/app/actions/analysis.ts` — no changes needed; `fetchLatestAnalysis` already returns the full `AnalysisRun` including `detail`.

### Critical Answers

**Q1 — GET endpoint for latest AnalysisRun?**
> **YES.** `GET /mortgage-cases/:caseId/analysis/latest` exists in `mortgage-cases.controller.ts` (line 78) and is consumed by `fetchLatestAnalysis()` in the frontend. It returns the full `AnalysisRun` with `alerts` and `reviewDecisions` included.

**Q2 — Does POST /analyze return bankViability?**
> **NO (formally).** The `BankViabilityRule` puts `bankViability: snapshot` inside `detail` at runtime, but:
> 1. The rule is **not registered** in `CaseAnalysisService.rules` or `CaseAnalysisModule.providers`, so it **never executes**.
> 2. The `RuleDetail` interface and `AnalysisDetail` frontend type do **not** declare a `bankViability` field, so TypeScript will reject it.
> 3. The `AnalysisResultDto` uses `RuleDetail`, so the contract is incomplete.
>
> If the rule were registered, the raw JSON response **would** contain `detail.bankViability`, but the types are out of sync.

**Q3 — Does the "Bancos / Viabilidad" tab exist?**
> **YES.** It exists in `analysis-section.tsx` (line 46: `{ id: "bancos", label: "Bancos / Viabilidad" }`). At lines 224-230 it renders a placeholder `<Card>` saying "disponible en una fase posterior del Sprint 3." The rename to "Comparativa bancaria" is a one-line change.

### Data Flow Today

1. User clicks "Validar expediente" in the `validaciones` tab.
2. `handleAnalyze()` calls `triggerAnalysis(caseId)` → `POST /mortgage-cases/:caseId/analyze`.
3. `CaseAnalysisService.run()` executes only `IdentityMatchRule` + `BankarizationValidationRule`.
4. Result is persisted as `AnalysisRun` with `detail: { sources, fields, ruleResults }`.
5. `loadLatest()` calls `GET /mortgage-cases/:caseId/analysis/latest` and restores state.
6. `detail.fields` drives the identity-validation UI; `detail` has no `bankViability`.

### Existing UI Patterns

- **Tabs:** Simple manual tab bar with `border-b` active state in `analysis-section.tsx`.
- **Tables:** `DataTable<T>` generic component in `app/ui/common/data-table.tsx` supports custom cell rendering. Also, inline raw `<table>` elements are used in the identity-validation section.
- **Expandable panels:** `ValidationTable` uses `useState(expanded)` + a toggle button with rotation animation. Same pattern can be reused for bank product rows.
- **Cards:** `Card` component wraps every content block.
- **Status badges:** Inline colored badges (e.g., `bg-green-50 text-green-700`) are used extensively.
- **Empty states:** `EmptyState` component exists, but inline `<p>` inside `Card` is more common.

### Approaches

1. **Register rule + minimal type extension + new tab UI**
   - Add `BankViabilityRule` to module providers and service registry.
   - Extend `RuleDetail` with optional `bankViability?: BankViabilitySnapshot`.
   - Extend frontend `AnalysisDetail` with the same optional field.
   - Build the "Comparativa bancaria" tab UI: table of product matches with expandable detail rows showing checks/calculations.
   - **Pros:** Uses existing architecture; leverages already-built `DataTable` and `Card` patterns; data is already produced by the rule.
   - **Cons:** Requires a small backend PR to wire the rule; types must stay in sync.
   - **Effort:** Medium

2. **Frontend-only: Display bankViability from a separate endpoint**
   - Create a dedicated `GET /mortgage-cases/:caseId/bank-viability` endpoint that runs the rule independently.
   - Frontend calls this endpoint only when the tab is active.
   - **Pros:** Decouples bank viability from the analysis run lifecycle; can be refreshed independently.
   - **Cons:** Violates the existing "analysis run as immutable snapshot" model; introduces a second data fetch path; more backend work; overkill for Sprint 3.
   - **Effort:** High

### Recommendation

**Approach 1 (Register rule + minimal type extension + new tab UI).**

The backend work is trivial (~3 lines to register the rule + interface extension). The frontend work is the bulk: building the tab UI. Since the rule is already implemented and the GET endpoint already serves the full `AnalysisRun`, this is the path of least resistance and aligns with the existing analysis-run snapshot model.

### Risks

- **Rule execution order:** `BankViabilityRule` internally reads the *latest* `AnalysisRun` to derive Scotiabank flags (`hasPagadoraIncome`, `scotiabankExcluded`) from the `bankarization-validation` rule result. If `BankViabilityRule` is appended *after* `BankarizationValidationRule` in the registry, it will read the **previous** run's detail (the one from before the current execution), not the current run. This may produce stale flags. **Mitigation:** Either run it in the same transaction or refactor the rule to accept `bankarization` results as an injected dependency rather than reading the DB.
- **Income/Liability prerequisites:** The rule depends on `IncomeCalculation` and `LiabilitySnapshot` records. If these haven't been created yet, the rule will produce `UNCONFIRMED_INCOME` and many `REQUIRES_REVIEW` statuses. The UI must gracefully handle empty/missing inputs.
- **Type drift:** `RuleDetail` is currently a strict interface. Changing it to an intersection or union requires updating both API and frontend types simultaneously to avoid build failures.

### Ready for Proposal

**YES.** The exploration confirms this HU requires:
1. A minimal backend change (register `BankViabilityRule`, extend `RuleDetail`).
2. A frontend type extension (`AnalysisDetail.bankViability`).
3. A new tab UI component for "Comparativa bancaria" replacing the placeholder.

The orchestrator should tell the user that the heavy lifting (the rule logic) is already done — this HU is primarily about **wiring and visualization**.
