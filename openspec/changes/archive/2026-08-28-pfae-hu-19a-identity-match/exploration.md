## Exploration: PFAE Identity Match + Bankarization Hiding + Pre-Analysis Modal (HU-19a)

### Current State

**Identity match (`identity-match.rule.ts`)**

`IdentityMatchRule.execute(client, documents)` implements `AnalysisRule` (`analysis-rule.interface.ts`). It has no `personType` awareness today:

- A single flat `SOURCE_DEFINITIONS` array hard-codes 4 sources: `official-id` (INE, `identity.*`), `payroll` (PAYROLL_RECEIPT, `employee.*`), `bank-statement` (BANK_STATEMENT, `accountHolder.*`, no curp), `credit-bureau` (CREDIT_BUREAU_REPORT, `borrower.*`, no curp).
- `Client` (the canonical record) is always added as a 5th comparison source, gated only by whether the field has a value (RFC/CURP optional, fullName always required).
- Documents are indexed by `DocumentType.code` via `indexDocsBySource()`; a document type with no matching `SourceDefinition` is silently ignored — a CSF document present today produces **no identity source at all**.
- For a PFAE case (no `PAYROLL_RECEIPT`), the `payroll` source is simply absent from `docsBySource`, so it never enters `collectFieldValues`. This means identity does **not currently FAIL** for missing payroll — but it also gets **zero identity coverage** from CSF, since there's no `csf` source definition. The spec's "PFAE identity FAIL/empty" symptom described in the business intent comes from having only INE + bank + bureau + client to compare (thin coverage), not from an explicit payroll-FAIL branch.
- `client` param type is `Record<string, unknown>` (loosely typed `PrismaClientLike`). The orchestrator builds it as `{ ...mortgageCase.client, caseId }` in `case-analysis.service.ts` — **`personType` is NOT currently included** in this context object, even though it lives on `MortgageCase.personType`, one level up from `client`.

**Orchestrator (`case-analysis.service.ts`)**

- `phaseARules` is a fixed array built once in the constructor: `[identityMatchRule, bankarizationValidationRule]`. Both always run, unconditionally, for every case regardless of `personType`.
- `mortgageCase.personType` IS loaded (via `prisma.mortgageCase.findUnique`) but is never read or forwarded — `context` (passed as `client` to every Phase A rule) omits it entirely.
- `CaseAnalysisModule` registers `IdentityMatchRule` and `BankarizationValidationRule` as static Nest providers (both always active); there is no per-request rule-set decision point yet.

**Bankarization (`bankarization-validation.rule.ts`)**

- `BankarizationValidationRule.execute()` extracts `PAYROLL_RECEIPT` + `BANK_STATEMENT` docs, runs deterministic payroll↔deposit matching (`PayrollBankMatchingService`, `PagadoraDetectionService`). For a PFAE case with zero payroll receipts, `receipts = []`, `matchResults = []` (from `PayrollBankMatchingService.match([], deposits, ...)` — not inspected here but presumably returns `[]` for empty receipts), so `computeOutcome([])` returns `'PASS'` by the `results.length === 0` early-return. **So bankarization already silently PASSes (empty) for PFAE today** — the "must not run / early-return empty PASS" decision is functionally already satisfied at the rule level. What's NOT satisfied: the UI unconditionally renders the "Conciliación nómina vs banco" card regardless of outcome or personType (see below), and the rule still executes real work (RFC matching, pagadora detection) needlessly for PFAE.

**CSF extraction (`csf-extraction.service.ts`)**

- `CsfExtractionPayload.taxpayer` carries `rfc`, `curp`, `fullName` (computed from firstName/firstLastName/secondLastName if not directly extracted), all uppercased/normalized at the extraction layer (not at identity-match's `normalizeText`).
- Also computes `isSolelySalaried`, `tenureMonths`, `activityStartDate`, and CSF-specific alerts (`REGIMEN_EXCLUSIVAMENTE_ASALARIADO`, `ARRAIGO_INSUFICIENTE`, `VIGENCIA_MAYOR_3_MESES`) — these are **HU-19b gates**, explicitly out of scope here, but the extraction service already exists and its shape (`taxpayer.rfc/curp/fullName`) is exactly what HU-19a's new `csf` identity source needs to read.

**Tax return extraction (`tax-return-extraction.service.ts`)**

- Shape differs from other sources: `satReceipt.rfc` + `satReceipt.taxpayerName` (not `fullName`), no `curp` field at all. Per the closed decision, tax-return only contributes an **optional RFC** comparison (WARNING on mismatch, `NOT_AVAILABLE` when absent) — it does not need a `fullName`/`curp` extractor.

**Frontend (`analysis-section.tsx`)**

- `AnalysisSection` does **not** receive `personType` as a prop today, even though sibling components in the same tree (`case-detail-workspace.tsx`) already thread `personType={caseData.personType}` into `DocumentUpload`, `DocumentBrowser`, `ExtractionSection`. This is a genuine gap that must be closed for any PFAE-aware UI branching in this file.
- `SOURCE_LABELS` / `SOURCE_ICONS` hard-code `official-id`, `payroll`, `bank-statement`, `credit-bureau`, `client` — no `csf` or `tax-return` entry, so if the API starts emitting a `csf` source key, the current `ValidationTable` (`sources.filter(s => s in SOURCE_LABELS)`) would silently drop it from the UI.
- `IdentitySummaryCard`'s `COLUMNS` constant hard-codes `payroll`, `official-id`, `bank-statement`, `credit-bureau`, `client` for the discrepancy table — same gap.
- `ValidacionesTab` unconditionally renders "Conciliación nómina vs banco" (`EstadosConciliacion`) whenever `allDeposits.length > 0 && payrollDocs.length > 0` — for PFAE this naturally evaluates false (no payroll docs), so the section already falls back to the "Sin datos suficientes..." card today. To literally satisfy "Validaciones tab still shows Conciliación nómina vs banco" as a symptom in PFAE, this must mean the *section header* ("Conciliación nómina vs banco") plus the empty-state card are still visually presented for PFAE cases — which reads as noise/confusion even though it's not blocking. HU-19a requires this section to disappear entirely for PFAE, not just show its empty state.
- `hasMissingDocs` (drives the pre-analysis confirm modal) and `AnalysisConfirmModal`'s checklist both hard-code `Identificación`, `Recibo de nómina`, `Estado de cuenta`, `Buró` — payroll-centric, no personType branching, no CSF/TAX_RETURN checks.

**Person type plumbing already established elsewhere (patterns to reuse)**

- `case-status-calculator.service.ts`: `evaluateSync(personType: string, documents)` — explicit `if (isPFAE) {...} else {...}` branch, PFAE required docs = `['CSF', 'TAX_RETURN', 'BANK_STATEMENT', 'CREDIT_BUREAU_REPORT']` + identity (INE/PASSPORT). This is the canonical backend "branch by personType" pattern already in the codebase.
- `document-upload.tsx` / `document-browser.tsx` / `extraction-section.tsx`: canonical frontend pattern — `personType?: string` prop threaded down from `case-detail-workspace.tsx`, `if (personType === "PFAE") {...} else {...}` filtering.
- `bank-statement-extraction.service.ts` line ~634: reads `document?.mortgageCase?.personType === 'PFAE'` directly off the loaded document relation to decide alert behavior (`BANK_NO_PAYROLL_DEPOSITS` suppressed for PFAE) — proof that `personType` is already accessible at the point documents are loaded with their `mortgageCase` relation, useful precedent if a rule needed to look it up independently rather than via the `client` context object.
- `DocumentType` codes `CSF` and `TAX_RETURN` already exist and are wired through upload/browse/extraction flows (HU-15/16 delivered).

### Affected Areas

- `apps/api/src/case-analysis/rules/identity-match.rule.ts` — add PFAE-aware source set (new `csf` source reading `taxpayer.fullName/rfc/curp`; new optional `tax-return` source reading `satReceipt.rfc` only; exclude `payroll` for PFAE); needs `personType` input.
- `apps/api/src/case-analysis/rules/identity-match.rule.spec.ts` — new PFAE fixtures/tests (CSF present, payroll absent, tax-return present/absent, mismatch → WARNING not FAIL for tax-return RFC).
- `apps/api/src/case-analysis/case-analysis.service.ts` — `context` object must include `personType` (from `mortgageCase.personType`) so `IdentityMatchRule` can branch; `phaseARules` construction/execution must become personType-aware to skip/short-circuit `BankarizationValidationRule` for PFAE (constructor-level fixed array won't work — needs per-request filtering in `run()`).
- `apps/api/src/case-analysis/case-analysis.service.spec.ts` — update mocks/tests for the new context shape and the PFAE rule-skip behavior.
- `apps/api/src/case-analysis/rules/bankarization-validation.rule.ts` — confirm/harden the already-working empty-array short-circuit (currently implicit via `results.length === 0`); decide whether to keep it always-registered-but-no-op vs. skipped by the orchestrator (see Approaches).
- `apps/api/src/case-analysis/case-analysis.module.ts` — no structural change expected if orchestrator-level filtering is chosen (rule stays a static provider, just conditionally invoked).
- `openspec/specs/identity-match-validation/spec.md` — needs a delta (not written by this phase) adding the PFAE source matrix, `csf`/`tax-return` sources, and the tax-return-optional-RFC scenario. Currently the spec only documents Official ID/Payroll/Bank Statement/Credit Bureau/Client.
- `apps/web/app/ui/expedientes/analysis-section.tsx` — add `personType` prop (threaded from `case-detail-workspace.tsx`, matching the existing pattern used by `DocumentUpload`/`DocumentBrowser`); extend `SOURCE_LABELS`/`SOURCE_ICONS` with `csf` (and optionally `tax-return`); make `ValidacionesTab` hide "Conciliación nómina vs banco" entirely for PFAE; make `IdentitySummaryCard.COLUMNS` and `AnalysisConfirmModal` checklist personType-aware (PFAE: INE/passport, CSF, TAX_RETURN, BANK_STATEMENT, bureau — no payroll row); `hasMissingDocs` memo needs a PFAE branch mirroring `evaluateSync`'s PFAE required-doc set.
- `apps/web/app/ui/expedientes/case-detail-workspace.tsx` — must pass `personType={caseData.personType}` into `<AnalysisSection>` (currently omitted at line ~205), the one missing wire in an otherwise-consistent pattern.
- `apps/api/src/documents/csf-extraction.service.ts` — read-only dependency (no change needed); confirms `taxpayer.rfc/curp/fullName` shape for the new `csf` source extractor.
- `apps/api/src/documents/tax-return-extraction.service.ts` — read-only dependency (no change needed); confirms `satReceipt.rfc`/`satReceipt.taxpayerName` shape (no curp) for the optional tax-return source.
- `apps/api/src/case-analysis/normalize.ts` — no change expected; reused as-is (deterministic normalization requirement is closed/unchanged).

### Approaches

1. **Branch `SOURCE_DEFINITIONS` by `personType` inside `IdentityMatchRule`** — tag each `SourceDefinition` with the `personType`(s) it applies to (or split into `SALARIED_SOURCES`/`PFAE_SOURCES` arrays sharing common entries), thread `personType` into the rule via the existing `client` context object (`case-analysis.service.ts` adds `personType: mortgageCase.personType` to the spread), and filter the active source list once at the top of `execute()`.
   - Pros: Single source of truth per source definition; shared sources (`official-id`, `bank-statement`, `credit-bureau`) aren't duplicated; matches the codebase's established `if (isPFAE) {...} else {...}` convention (`case-status-calculator.service.ts`); `personType` travels through the *existing* `client: Record<string, unknown>` parameter with zero interface changes (non-breaking); easy to unit test by constructing a `client` fixture with `personType: 'PFAE'`.
   - Cons: `IdentityMatchRule` takes on a `personType` responsibility it didn't have before (mild scope creep on one file); the `client` object shape becomes slightly overloaded (client PII fields + orchestration metadata `caseId`/`personType` mixed together) — acceptable since `caseId` is already injected the same way.
   - Effort: Low.

2. **Filter identity sources at runtime purely by document presence** (no explicit `personType` check) — e.g., include `csf` source only if a `CSF` document is present, include `payroll` only if a `PAYROLL_RECEIPT` document is present, regardless of `personType`.
   - Pros: No new parameter needed; "self-configuring" based on whatever documents exist.
   - Cons: **Directly violates the closed decision** "Payroll omitted even if a stray payroll doc exists" — a PFAE case with an accidentally-uploaded payroll receipt would still generate a `payroll` identity source and could produce spurious mismatches/FAILs against CSF-derived identity. This approach cannot satisfy that constraint without adding a personType check anyway (which collapses it back into Approach 1). It also doesn't cleanly solve "hide bankarization for PFAE" (bankarization's emptiness today is a side effect of `receipts.length === 0`, not an explicit personType decision — fragile if `PayrollBankMatchingService` behavior changes).
   - Effort: Low to implement naively, but Medium-High to make it actually correct once the stray-document edge case is handled (ends up re-implementing Approach 1 with extra steps).

### Recommendation

**Approach 1 — branch by `personType`.** The closed product decision "PFAE identity sources: official-id, csf, bank-statement, credit-bureau, client. Payroll omitted even if a stray payroll doc exists" is an explicit `personType`-driven rule, not a document-presence rule — Approach 2 cannot satisfy it without becoming Approach 1. `personType` is cheap to thread (it's already loaded on `mortgageCase` in the orchestrator and merely needs to be added to the `context` spread that already flows into every Phase A rule's `client` parameter), and the pattern is already proven in three other places in this codebase (`case-status-calculator.service.ts`, `document-upload.tsx`, `bank-statement-extraction.service.ts`). Concretely:

- Add `personType` to `CaseAnalysisService`'s `context` object (one line).
- In `identity-match.rule.ts`, tag each `SourceDefinition` with which `personType`(s) it's valid for (`payroll` → SALARIED only; `csf` → PFAE only, new; `tax-return` → PFAE only, new, RFC-only extractor + special "optional" handling — likely needs a small variant of `collectFieldValues`'s existing "omit if absent, don't fail" logic already used for Client RFC/CURP, reused for tax-return RFC); `official-id`/`bank-statement`/`credit-bureau`/`client` stay shared.
- For bankarization: since it already empty-PASSes for `receipts.length === 0`, the pragmatic, lowest-risk move is to have `CaseAnalysisService.run()` build `phaseARules` per-request (`personType === 'PFAE' ? [identityMatchRule] : [identityMatchRule, bankarizationValidationRule]`) rather than relying on the implicit empty-array behavior — this makes "must not run" an explicit, testable orchestrator decision instead of an accidental side effect, and avoids wasted work (deposit/receipt extraction) for PFAE cases. This is a design-phase decision point to confirm, not implemented here.
- Frontend: thread `personType` the same one-line way into `<AnalysisSection>`, then branch the 4 identified UI spots (`SOURCE_LABELS`, `ValidacionesTab`'s bankarization section, `IdentitySummaryCard.COLUMNS`, `AnalysisConfirmModal` checklist + `hasMissingDocs`) exactly like `document-upload.tsx` already does.

### Risks

- `AnalysisRule.execute(client, documents)` interface is shared by `IdentityMatchRule` and `BankarizationValidationRule`; adding `personType` to `client` is safe (loose `Record<string, unknown>` / `PrismaClientLike`) but any future rule reading `client` should be aware `personType` is now a first-class field there, not just Client PII — worth a one-line JSDoc note when implemented.
- The "hide bankarization" decision touches `CaseAnalysisService.run()`'s `phaseARules` handling, which is currently a fixed constructor-time array; moving to per-request filtering is a small structural change to a file with existing tests (`case-analysis.service.spec.ts`) mocking both rules — tests must be updated to cover both the SALARIED (both rules run) and PFAE (bankarization skipped) paths without breaking existing SALARIED assertions.
- Frontend gap: `AnalysisSection` currently has zero personType awareness and is one of the last components in the tree not yet wired — missing this wire (`case-detail-workspace.tsx` → `<AnalysisSection>`) would silently leave the PFAE UI unable to branch at all, so it must not be dropped from tasks.
- The tax-return source's shape genuinely differs from every other source (`satReceipt.rfc`/`satReceipt.taxpayerName`, no CURP) — the "optional field, WARNING on mismatch, NOT_AVAILABLE on absence" behavior partially overlaps with the existing Client RFC/CURP-optional logic in `collectFieldValues`/`compareField`, but that logic currently special-cases `sourceKey === 'client'` in a few branches (e.g. `clientValue` lookups); generalizing it to a second "optional" source needs care to avoid accidentally special-casing on `sourceKey` string matches scattered through `compareField`.
- CSF's `taxpayer.fullName` is already uppercased/trimmed at extraction time (`csf-extraction.service.ts` post-processing) — double-normalization by `identity-match`'s `normalizeText` is harmless (idempotent) but worth confirming during spec/design so no discrepancy sneaks in between extraction-time and comparison-time normalization.
- Régimen/arraigo/vigencia/coherence gates (HU-19b) already exist as CSF `alerts[]` computed at extraction time (`REGIMEN_EXCLUSIVAMENTE_ASALARIADO`, `ARRAIGO_INSUFICIENTE`, `VIGENCIA_MAYOR_3_MESES`) but are not yet surfaced anywhere in Phase A/AnalysisRun — care must be taken during HU-19a's implementation not to accidentally start consuming/elevating these (that's explicitly HU-19b's job per the phase plan).

### Ready for Proposal

**Yes.** Scope is clear and bounded: identity-match source branching, bankarization no-op/skip for PFAE, and the 4 concrete UI touchpoints in `analysis-section.tsx` (+ the one missing prop wire in `case-detail-workspace.tsx`). All referenced extraction shapes (CSF, tax-return) already exist and are stable. The only open design-phase question to carry forward is the exact mechanism for "bankarization must not run" (orchestrator-level `phaseARules` filtering vs. rule-internal personType early-return) — recommend the orchestrator-level filtering in the proposal, but flag it explicitly for `sdd-design` to confirm against `case-analysis.service.spec.ts`'s existing test structure.
