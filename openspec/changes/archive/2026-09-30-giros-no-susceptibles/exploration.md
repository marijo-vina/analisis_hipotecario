## Exploration: Non-susceptible economic activities (giros no susceptibles) in bank viability

### Current State

**Where the client's activity comes from today**

- `apps/api/src/documents/csf-extraction.service.ts` extracts `activities[]` from the Constancia de Situación Fiscal with `order`, `description`, `percentage`, `startDate`, `endDate` (exactly the "Actividad Económica" column the product decision names). No new extraction work is required.
- There are **three independent "primary activity" selectors** that pick one row from `activities[]`:
  - `resolveActivity` in `apps/api/src/income-calculation/pfae-income.helpers.ts` (active rows, highest `percentage`, tie-break `order`) → persisted as `IncomeCalculation.bases.activity.description`.
  - `pickPrimaryIndependentActivity` in `apps/api/src/documents/csf-independent-activity.ts` (same, but also drops salaried rows) → used for activity start date.
  - `deriveCsfFields` in `bank-viability.rule.ts` and `selectActivity` in `pfae-validation.rule.ts` (active rows, highest `percentage`, no tie-break, no salaried filter).
- `BankViabilityRule` uses `satDescription = incomeBases.activity.description ?? csfFields.satDescription` — a **single** description string.

**How giro factors work today**

- `apps/api/src/case-analysis/activity-factor-match.ts` → `matchActivityFactor()` + `normalizeSatText()` (NFD, strip accents, lowercase, `-`→space). Matching is **plain substring** of each alias inside the normalized SAT description; first hit wins.
- `Bank.pfaeFactorMode` (`MATRIX | FLAT | NONE`). `FLAT`/`NONE` skip lookup entirely; `MATRIX` miss → `ACTIVITY_UNMAPPED` (REQUIRES_REVIEW), never an invented 1.0. HSBC is `NONE` / 1.0 (locked by `seed-data.spec.ts`).
- `BankActivityFactor` rows (per bank, `nativeLabel`, `satAliases` JSON, `factor`, `factorTaxReturn`) are editable via `banks.service.ts` CRUD and the web `activity-factors-editor.tsx`.
- Factors are haircuts on income. There is **no concept of "activity excluded"** anywhere in code, seed, schema, or web labels.

**How bank viability evaluates (Phase C)**

- `case-analysis.service.ts`: Phase A (`identity-match` + `pfae-validation` for PFAE) → Phase B (income, liabilities) → Phase C (`BankViabilityRule`). `runPhaseC` re-runs only Phase C.
- `BankViabilityRule.execute`: resolves `destination` from `CreditType.destination` (`ACQUISITION | LIQUIDITY | MORTGAGE_REPLACEMENT | …`), `personType` from `MortgageCase.personType` (`SALARIED | PFAE` only — **no persona moral in the schema**).
- Universal bureau knockouts short-circuit with `outcome: FAIL`, a global reason, and `bankResults: []`.
- Otherwise it queries `BankPolicy` where `isActive && destination == X && bank.isActive`, then `evaluateBank()` builds per-bank `reasons[]` and `resolveProductStatus()` maps them to `NOT_COMPATIBLE | REQUIRES_REVIEW | CONDITIONED | PRELIMINARY_VIABLE`. Bank-specific knockouts are hard-coded by `bank.code` (`SCOTIABANK_PAGADORA_EXCLUSION`, `SANTANDER_MOP_KNOCKOUT`).
- Phase A `PfaeValidationRule.classifyMatrixActivity` already emits an `ACTIVITY_UNMAPPED` alert per bank — a natural place for an early advisor-facing exclusion alert.

**HSBC liquidity today**

- Seed: `HSBC_LIQ` has `isActive: false` (test `should keep HSBC_LIQ inactive`). Because the policy query filters `isActive`, **HSBC never appears in LIQUIDITY results for anyone** — PFAE *and* salaried. `docs/bank-policies-matrix.md` says liquidity is open for salaried and knocked out for PFAE, but the seed implements it as fully inactive. Consequently the HSBC detail sheet (liquidity, non-salaried, four subsectors) has **no reachable evaluation path today**: the only population it restricts is already excluded at bank level.

**Docs**

- `docs/bank-policies-matrix.md` → HSBC → "Giros no susceptibles (captura asesora, sep-2026)" holds the 13-item list and the four-subsector rama/subrama sheet, and states "No va a código todavía".

**Overlap worth noting**

- Mifel `BankActivityFactor` aliases already include `mineria`, `gasolinero`, `bares` (factors 0.35 / 0.1). Once exclusions exist, those matches become unreachable for PFAE; the exclusion must be evaluated **before** factor lookup.

### Affected Areas

- `apps/api/src/case-analysis/activity-factor-match.ts` — reuse `normalizeSatText`; possibly host or sit next to a new exclusion matcher.
- `apps/api/src/case-analysis/` (new pure module, e.g. `non-susceptible-activities.ts` + spec) — shared list of 13 and HSBC-scoped detail sheet, plus a pure `matchNonSusceptibleActivity()`.
- `apps/api/src/case-analysis/rules/bank-viability.rule.ts` — evaluate exclusion for PFAE before factor resolution; new global reason (short-circuit like bureau knockouts) and HSBC-scoped per-bank reason; extend `resolveProductStatus` precedence.
- `apps/api/src/case-analysis/rules/bank-viability.rule.spec.ts` — Strict TDD cases (excluded giro → FAIL; eligible giro → factors unchanged; HSBC sheet only on HSBC + LIQUIDITY + PFAE; acquisition unaffected; salaried unaffected).
- `apps/api/src/case-analysis/rules/pfae-validation.rule.ts` (+ spec) — early ERROR alert when the CSF activity is non-susceptible.
- `apps/api/src/case-analysis/types/bank-viability.types.ts` / `pfae-validation` snapshot types — optional field for the matched exclusion label.
- `apps/web/app/lib/definitions.ts` — `REASON_LABELS` for the new reason codes (Spanish UI text).
- `openspec/specs/case-analysis/spec.md`, `openspec/specs/pfae-validation/spec.md`, possibly `openspec/specs/bank-catalog/spec.md` — delta specs.
- Not affected: `schema.prisma`, `seed-data.ts`, `banks.service.ts`, CSF extraction (under the recommended approach).

### Approaches

1. **Code-level policy catalog (versioned TS constant + pure matcher)** — One module holds `GLOBAL_NON_SUSCEPTIBLE_ACTIVITIES` (13 entries: `code`, Spanish `label`, SAT-text aliases) and `BANK_SCOPED_ACTIVITY_RESTRICTIONS` (HSBC only: `bankCode`, `destinations: ['LIQUIDITY']`, `personTypes: ['PFAE', 'PM']`, subsector → rama/subrama aliases). A pure function returns `{ kind: 'excluded', code, label, scope }` or `{ kind: 'eligible' }`. `BankViabilityRule` checks the global list once (short-circuit FAIL with global reason, like bureau knockouts) and the scoped list inside `evaluateBank`.
   - Pros: no migration, no seed or admin UI change; matches the "same for all banks" nature of the 13 (no per-bank duplication); HSBC scoping is explicit data, not scattered `if (bank.code === 'HSBC')`; trivially unit-testable (Strict TDD friendly); fits well under the 400-line review budget; reuses `normalizeSatText`.
   - Cons: advisors cannot edit the list from the Bancos UI; changes need a deploy; policy lives in two places (doc + code) — mitigated by a spec test pinning the 13 codes.
   - Effort: Low–Medium

2. **New DB table `NonSusceptibleActivity` (nullable `bankId` = global, optional `destination`, `personTypes`, `satAliases` JSON) + seed + admin CRUD** — Mirrors `BankActivityFactor`.
   - Pros: editable at runtime; consistent with how factors are managed; one store for global and bank-scoped rules.
   - Cons: Prisma migration, seed changes (explicitly out of scope for this explore and risky with the dirty tree), new service/controller/UI, nullable-FK "global" semantics are easy to misuse; likely exceeds the 400-line budget → chained PRs; the list is a closed product decision, not something advisors tune.
   - Effort: High

3. **Reuse `BankActivityFactor` with `factor = 0` rows per bank** — Treat exclusion as a zero haircut.
   - Pros: zero schema work; reuses matcher and editor.
   - Cons: contradicts the decision ("exclusions, not haircuts"); duplicates 13 rows × every bank; `NONE`/`FLAT` banks (HSBC, Banorte) skip alias lookup so exclusion would silently not apply there; zero income surfaces as `NEGATIVE_CAPACITY`/`INCOME_BELOW_MINIMUM` instead of a clear reason; cannot express destination/personType scope for the HSBC sheet.
   - Effort: Low (but wrong)

4. **Hybrid: global 13 in code, HSBC sheet in DB** — Split storage by scope.
   - Pros: HSBC sheet editable.
   - Cons: two mechanisms for one concept; still needs migration; the HSBC sheet has no reachable evaluation path today (`HSBC_LIQ` inactive), so editability buys nothing now.
   - Effort: Medium–High

### Recommendation

**Approach 1 — code-level policy catalog with a pure matcher**, evaluated in Phase C (authoritative) and surfaced in Phase A (advisor alert).

Suggested shape for the proposal/design phases (not decisions to reopen, just the recommended mechanics):

- **Order of evaluation in `BankViabilityRule`**: after bureau knockouts, before the policy query / factor resolution, only when `personType === 'PFAE'` (PM is not modeled; keep the catalog `personTypes`-aware so PM can reuse it later). Global hit → `outcome: FAIL`, global reason (e.g. `ACTIVITY_NOT_SUSCEPTIBLE`), `bankResults: []`, matched label in the snapshot. This mirrors the existing universal-knockout pattern and means no bank's factor is ever applied to an excluded giro (fixes the Mifel `mineria`/`gasolinero`/`bares` overlap without touching seed).
- **HSBC detail sheet**: stored as a bank-scoped entry (`bankCode: 'HSBC'`, `destinations: ['LIQUIDITY']`, `personTypes: ['PFAE', 'PM']` — user correction: the sheet covers PFAE *and* persona moral, so PM is persisted as catalog data even though PM cannot be evaluated until `PersonType` includes it) and checked inside `evaluateBank`, adding a per-bank reason (e.g. `HSBC_LIQUIDITY_ACTIVITY_RESTRICTED`) mapped to `NOT_COMPATIBLE`. It never runs for ACQUISITION or MORTGAGE_REPLACEMENT, never runs for other banks, and is a no-op today because `HSBC_LIQ` is inactive — which is the correct behavior per the closed decision ("the detail sheet is the activity breakdown of that same HSBC liquidity rule"). Tests exercise it with a mocked active HSBC LIQUIDITY policy.
- **Eligible activity**: no change to `resolvePfaeFactor`; HSBC stays `NONE` / 1.0.
- **Matching**: reuse `normalizeSatText`, but match aliases on **word boundaries**, not raw substring, and write aliases in SAT catalog phrasing (e.g. "comercio al por menor de gasolina", "asociaciones y organizaciones religiosas", "extraccion de …", "centros nocturnos, bares, cantinas"). Pin each of the 13 codes and the four HSBC subsectors with positive and negative fixture descriptions.
- **Phase A**: `PfaeValidationRule` emits an ERROR alert (field `activity`) naming the matched non-susceptible activity so the advisor sees it before Phase C.
- **Web**: add Spanish labels for the new reason codes in `REASON_LABELS`.

Why: the 13 are a closed, bank-agnostic policy; storing them per bank (Approach 3) or behind admin CRUD (Approach 2) adds duplication, migration, and review load for no product benefit. Approach 1 is the smallest change that makes the rule explicit, testable under Strict TDD, and keeps each bank's factor untouched.

### Risks

- **Which CSF activity is compared** is not pinned by the decision. Today three selectors pick a single "primary" row (and differ on salaried filtering and tie-break). Options: (a) primary independent activity only (consistent with factors and HSBC's "actividad comprobatoria"), or (b) any active (no `endDate`) non-salaried activity. The proposal must state one; recommend (a) using `pickPrimaryIndependentActivity`, and consider consolidating the selectors as a follow-up.
- **Matching precision**: current factor matching is raw substring; reusing it for exclusions risks false positives/negatives (e.g. short aliases like `bares`, SAT wording for government, NGOs, churches, forestry). Needs word-boundary matching and real SAT catalog phrasing in fixtures. No official SAT-code catalog is stored in the repo; matching stays text-based.
- **HSBC liquidity drift**: docs say liquidity is open for salaried; seed has `HSBC_LIQ` fully inactive. The detail sheet is therefore unreachable in production today. Not in scope to change the seed, but the proposal should note it so nobody reads "no HSBC liquidity results" as a bug in this change.
- **Persona moral** is not in `PersonType`. The decision covers PM, but only PFAE can be enforced now; the catalog should carry `personTypes` so PM can adopt it without redesign.
- **Truncated Ingenieros/Arquitectos footnote** must not be modeled. Mifel's "PI otras — grupo B" (`arquitectos`, `ingenieros`) stays a normal factor; construction-subsector aliases must not accidentally capture "arquitectos"/"ingenieros" professional-services descriptions.
- **Phase-C-only re-run** (`runPhaseC`) copies prior Phase A results; a stale Phase A run would lack the new alert. Phase C remains authoritative, so viability is still correct.
- **Dirty working tree** (document-ai, layout-table-to-ocr, SDD rules, `bank-policies-matrix.md`) is unrelated; apply must not stage or modify those files.

### Ready for Proposal

Yes. Tell the user: exploration recommends a code-level catalog (13 global exclusions + one HSBC-scoped liquidity restriction) with a pure word-boundary matcher, enforced in bank viability as a PFAE knockout before any factor is applied, plus an early Phase A alert. One scoping question should be settled in the proposal: compare only the primary independent CSF activity (recommended) or every active activity. Note that the HSBC sheet is currently a no-op because `HSBC_LIQ` is inactive in seed.
