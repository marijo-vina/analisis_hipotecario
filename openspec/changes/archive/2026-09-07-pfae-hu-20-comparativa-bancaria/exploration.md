## Exploration: PFAE HU-20 bank comparison (giro factor + Phase C branch + Banks UI)

Source of truth: `PLAN-FASE-VALIDACION-PFAE.md` §1.4 / §1.5 / §2.3 / §2.4 / §3 / §4. Older HU-20 “no UI” notes in `PLAN-PERFIL-PFAE.md` are overridden: this HU includes **Banks module UI**, not expediente Comparativa/picker/Validaciones (HU-21).

CodeGraph: `.codegraph/` exists; `codegraph explore` used first, then targeted Read/Grep for truncated files.

### Current State

**Phase C is salaried-only.** `BankViabilityRule` never reads `personType`, `IncomeCalculation.source`, or `bases`. Income select is averages + `receiptResults` only. Tenure is always payroll `employment.hireDate` vs `BankPolicy.minimumEmploymentTenureMonths`. Capacity is `incomeUsed × Bank.debtCommitmentFactor − liabilities` with no giro factor. Bureau knockouts, destination CMA, CE, NET/GROSS, Scotiabank pagadora, and score checks are reusable as-is.

**PFAE comparativa is already wrong today.** HU-18 persists PFAE snapshots with `receiptResults: []`, so `deriveEmploymentStartDate` returns null. Every seeded policy has `minimumEmploymentTenureMonths` (6/12/24) → `MISSING_EMPLOYMENT_DATA` → **all banks `REQUIRES_REVIEW`**. Averages are treated as salaried payroll figures (no giro). That is the main functional gap this HU closes.

**`CONDITIONED` is dead.** `resolveProductStatus` returns only `NOT_COMPATIBLE` | `REQUIRES_REVIEW` | `PRELIMINARY_VIABLE`. Banorte `taxReturnPolicy = NOT_PREFERRED` cannot work until CONDITIONED is a real branch (UI already badges it).

**Orchestrator has no Phase-C-only path.** `CaseAnalysisService.run()` always does Phase A → B (`income.calculate` + `liability.calculate`) → C, then `analysisRun.create` (immutable). HTTP: `POST /mortgage-cases/:caseId/analyze`. `getLatest` is read-only. Income API has GET latest, POST calculate, PATCH receipts toggle, POST conciliation — **no PATCH income-source**. Toggle does not copy `source`/`bases` (PFAE-unsafe; keep SALARIED-only).

**Income snapshot (HU-18, do not break).** `IncomeCalculation.source` (`PAYROLL | BANK_STATEMENTS | TAX_RETURN`) + JSON `bases`. Implemented activity fields (design won over HU-18 explore names):

```
bases.activity: { description, percentage, order, matchedKeyword, windowMonths }
bases.bank / bases.taxReturn
```

Do **not** rename to `satDescription` / `requiresTwelveMonths` / `activityResolution`. 6 vs 12 is still the HU-18 keyword stub (`primaria | restaurantero | alimentos y bebidas`). `PfaeValidationSnapshot.activity.satDescription` is a different Phase A object.

**Bank catalog has no PFAE columns.** Prisma `Bank`: CE, NET/GROSS, score, `isActive`. `BankPolicy`: `minimumEmploymentTenureMonths` only. Missing: `minimumActivityTenureMonths`, `taxReturnPolicy`, `pfaeFactorMode` / flat factor, `ActivityType`, `BankActivityFactor`. Seed: 9 banks; **BXPLUS and AFIRME have no destination policies** in `BANK_POLICIES` (detail page auto-creates inactive rows). Mifel CE **0.50** already. `UpdateBankDto.debtCommitmentFactor` is `@Max(1)` — fine for CE; activity factors (Mifel health **1.5**) must be a separate field that allows `> 1`.

**Banks UI** (`/dashboard/bancos/[code]`): card (CE, criterion, score, active) + CMA grid with one “Antigüedad (meses)” column. No factor table. `updateBank` / `updatePolicy` already send `Record<string, unknown>` — additive DTO fields flow without rewriting the action layer.

**HU-19b leftovers this HU owns**

| Leftover | Today | HU-20 |
|----------|--------|--------|
| `ACTIVITY_UNMAPPED` | Not evaluated (no catalog) | MATRIX banks: `REQUIRES_REVIEW`, do not invent 1.0. Banorte FLAT / HSBC NONE skip match. PLAN-FASE §1.2 also wants a Validaciones WARNING — persist on AnalysisRun; **render is HU-21**. |
| Arraigo vs bank | Phase A INFO months only | Phase C: CSF `activityStartDate` vs `minimumActivityTenureMonths`. Salaried keeps employment tenure. |
| CSF `ARRAIGO_INSUFICIENTE` | Extraction WARNING if `< 24`, message cites Banorte 12 | Document-level noise. Do not copy into Phase A. Optionally retarget message in this HU (extraction) so it does not contradict per-bank CMA; not required for the engine. |

**Comparativa UI coupling (read-only).** `bank-comparison-tab.tsx` columns: bank, income, CE, max debt, capacity, status. Extra JSON on `checks` / `calculation` / `policySnapshot` is ignored. Unknown reason codes fall through `getReasonLabel` as raw strings. `CONDITIONED` already has a badge + suggested-adjustments panel. Growing the API payload does **not** break the tab; new columns stay HU-21.

**Factor data.** `docs/bank-policies-matrix.md` (9 banks; capturas/PDFs win over Excel) + Engram `#462` (heterogeneous labels, Banorte/HSBC absent). Captura wins: Mifel comercio **0.35** not Excel 0.20; Mifel health **1.5** intentional; CE Mifel **0.50** (`#461`). Giro factor on both bases locked 2026-09-04. Remaining divergences: Banorte cliente 0.70 vs flat 0.60 (backlog); Santander/Banamex CMA PFAE vs salaried (open #4); HSBC liquidez salaried-only.

---

### Affected Areas

- `apps/api/prisma/schema.prisma` — `Bank` factor mode + flat factor + `taxReturnPolicy`; `BankPolicy.minimumActivityTenureMonths`; new `BankActivityFactor` (no global `ActivityType` in MVP).
- `apps/api/prisma/seed-data.ts` — PFAE tenure (24m across banks per matrix), Banorte FLAT 0.6, HSBC NONE, Scotiabank REJECTED, Banorte NOT_PREFERRED, factor rows from matrix (captura-first).
- `apps/api/src/banks/*` — DTOs, service, controller: PATCH card fields + policy PFAE tenure + CRUD factors. Allow factor `> 1`.
- `apps/web/app/ui/banks/bank-detail-card.tsx` + `policy-editor.tsx` + `definitions.ts` — tenure split, card extras, factors table. **Not** expediente UI.
- `apps/api/src/case-analysis/rules/bank-viability.rule.ts` + `types/bank-viability.types.ts` + `.spec.ts` — `personType` branch: source, giro, taxReturnPolicy, CSF tenure. Reuse knockouts/CE/CMA.
- `apps/api/src/case-analysis/case-analysis.service.ts` — `runPhaseC(caseId)` creating a new `AnalysisRun` from latest income/liability snapshots (no Phase B recompute).
- `apps/api/src/income-calculation/income-calculation.controller.ts` + service — `PATCH .../income/source` (or `/mortgage-cases/:id/income-source`): new immutable snapshot with same `bases`, new `source`, projected averages; then Phase C only. Reject invalid bases (tax loss).
- `apps/api/src/income-calculation/pfae-income.helpers.ts` — **do not rename** activity fields. Factor match is a new helper (normalize SAT text → per-bank aliases). Keep keyword 6/12 for income window.
- `apps/api/src/case-analysis/rules/pfae-validation.rule.ts` — optional `ACTIVITY_UNMAPPED` WARNING on full analyze; tenure stays INFO.
- `apps/web/app/ui/expedientes/bank-comparison-tab.tsx` — **do not edit** (HU-21).
- Tests: `bank-viability.rule.spec.ts` (all SALARIED payroll fixtures); new PFAE cases; seed/DTO specs; Banks UI is manual/QA.

**Out of scope:** picker / dual-base Cálculo UI / Validaciones gates section / comparativa columns (HU-21); second orchestrator; changing SALARIED payroll math; dropping Mifel CE to 0.42.

---

### Approaches

1. **Per-bank factor rows + Phase C branch + Banks UI + Phase-C-only re-run (recommended)** — No global `ActivityType`. `Bank.pfaeFactorMode = MATRIX | FLAT | NONE` (+ `pfaeFlatFactor` for Banorte). `BankActivityFactor`: native label, SAT aliases[], `factor` plus `factorTaxReturn` (same as `factor` except BX+). `BankPolicy.minimumActivityTenureMonths`. PATCH source → new `IncomeCalculation` + new `AnalysisRun` that only executes `BankViabilityRule`. Giro applies **after** base choice to both paths.
   - Pros: Matches PLAN-FASE §3.1; labels stay heterogeneous (#462); HU-18 `bases.activity.*` untouched; 6/12 stays case-level in the income engine; Banks UI matches the three-layer model; immutability preserved.
   - Cons: Alias quality is the match risk; two resolvers (keyword 6/12 vs per-bank factor); seed is large.
   - Effort: High (forecast chained PRs)

2. **Canonical `ActivityType` + `BankActivityFactor` (PLAN-PERFIL §7.1)** — Normalize 96 Excel labels into one SAT catalog; factors reference `activityTypeId`; `requiresTwelveMonths` on the catalog.
   - Pros: One giro for Validaciones + 6/12 + factors; matches the closed-decisions table at the top of PLAN-FASE (later overridden by §3.1).
   - Cons: Labels are not a shared taxonomy (Banamex 44 vs Banregio 4); mapping workshop blocks the HU; fights current schema (nothing to extend); 6/12 is case-level and already works without it.
   - Effort: High (data) + Medium (code) — wrong default

3. **Backend-only Phase C (skip Banks UI)** — Hardcode factors/tenure in code or JSON. PLAN-PERFIL “no UI”.
   - Pros: Smaller PR.
   - Cons: PLAN-FASE §4 HU-20 explicitly includes Banks UI; asesora cannot edit factors/tenure; contradicts the override.
   - Effort: Medium — reject

**Phase-C re-run (nested, lock in propose)**

| Option | Verdict |
|--------|---------|
| New `AnalysisRun` reusing latest income + liability snapshots | **Recommend** (PLAN-FASE §2.4) |
| Mutate `detail.bankViability` in place | Breaks immutability |
| Full `POST /analyze` | Re-runs A+B; wrong contract |

**PATCH home:** prefer `PATCH /cases/:caseId/income/source` on the existing income controller (same JWT nest as GET latest), then call `CaseAnalysisService.runPhaseC`. PLAN-FASE’s `/mortgage-cases/:id/income-source` is equivalent; do not add both.

---

### Recommendation

Implement **Approach 1**.

**Catalog:** Do **not** introduce a global `ActivityType` in MVP. Current schema can support either, but per-bank `BankActivityFactor` (label + SAT aliases + factor) is what the seed data actually is. Keep HU-18 `resolveActivity` keyword stub for the **income window** (6/12). Phase C matches `bases.activity.description` (fallback CSF text) against **that bank’s** aliases. Unmapped + MATRIX → `REQUIRES_REVIEW` (reason `ACTIVITY_UNMAPPED`). FLAT Banorte `× 0.6`. NONE HSBC `× 1.0`.

**Phase C branch (`personType` only):**

1. Read latest snapshot `source` + `bases` + averages.
2. `TAX_RETURN` + `REJECTED` (Scotiabank) → `NOT_COMPATIBLE` (no invent). `NOT_PREFERRED` (Banorte) → `CONDITIONED` and continue.
3. Admissible income: **both** paths apply giro **after** the advisor picks a base (`ingresoAdmisible = chosenBase × factor`). BX+ may look up `factorEstados` vs `factorDeclaracion`; other banks use one number. Then existing `incomeCriterion` (NET vs GROSS) and CE.
4. PFAE tenure: CSF `activityStartDate` vs `minimumActivityTenureMonths`. Missing CSF date + policy set → `REQUIRES_REVIEW`. Salaried path unchanged.
5. Reuse bureau knockouts, destination CMA, CE, Scotiabank pagadora.

**PATCH + re-run:** New income row (same `bases`, new `source`, projected averages) + `runPhaseC` → new `AnalysisRun`. Copy prior Phase A `ruleResults` into the new run (or persist Phase C-only `ruleResults` with a flag) so `getLatest` still has identity/gates. Prefer **copying last run’s Phase A results** + replacing bank-viability so HU-21 Validaciones does not go blank after a source switch.

**Banks UI (this HU):** PFAE tenure column; card `pfaeFactorMode` / flat factor / `taxReturnPolicy`; factors table (factor `> 1` allowed). Not expediente Comparativa.

**Seed defaults (matrix, captura-first, closed rules):** PFAE tenure **24** where documented; Scotiabank `taxReturnPolicy=REJECTED`; Banorte `NOT_PREFERRED` + FLAT **0.6** (ignore 0.70 cliente until product reopens); HSBC NONE 1.0; Mifel CE 0.50; Mifel health 1.5; Mifel comercio **0.35**.

**Tests that will change:** `bank-viability.rule.spec.ts` fixtures assume payroll hire dates and unfactored income. Add PFAE describes: giro MATRIX unmapped; Banorte flat; HSBC none; tax REJECTED/NOT_PREFERRED; CSF tenure vs employment; SALARIED regression (same CE math).

---

### Risks

- **Delivery size:** schema + seed (~96 factor rows) + Banks UI + Phase C + PATCH/re-run will exceed a 400-line review budget. Chain: (1) schema/seed/API, (2) Banks UI, (3) Phase C branch + tests, (4) PATCH + `runPhaseC`.
- **Giro factor (locked 2026-09-04):** applies to **both** bases after the advisor chooses. Old PLAN-PERFIL §3.2 / PLAN-FASE §2.3 “declaración limpia” is superseded. BX+ still needs `factorEstados` vs `factorDeclaracion` on some rows (PFAE Servicios 0.50 vs 0.60).
- **Banorte 0.70 cliente** is an expediente fact (matrix), not a card field. Closed HU-20 = FLAT 0.6. Cliente checkbox is HU-21-ish; storing optional `pfaeFlatFactorCliente=0.70` on the card without wiring it is optional seed-only.
- **Santander PFAE min income / Banamex age** differ by profile. PLAN-FASE §1.5 says tenure is the only extra column; §3.0 allows extra CMA columns. Without `minimumIncomePfae`, Santander PFAE is checked at $7.5k (too lenient). Product question.
- **HSBC liquidez:** matrix = active salaried, knockout PFAE. Seed `HSBC_LIQ` is **inactive** (both profiles). Activating without `isActiveForPfae` would offer liquidez to PFAE. Leave inactive unless product wants the dual-active flag.
- **BX+/Afirme** have no active destination policies → they never appear in Phase C until policies are seeded/activated.
- **Afirme** PDF formula `(ingreso × factor − deuda) × 0.60` ≠ `ingresoAdmisible × CE − deuda`. Follow the shared CE path unless product reopens.
- **Phase-C-only run vs Validaciones:** if the new `AnalysisRun` omits Phase A results, HU-21 gates vanish after a source switch. Copy Phase A from previous run.
- **Keyword 6/12 vs factor aliases:** restaurantero can get a 12-month window and still `ACTIVITY_UNMAPPED` on a MATRIX bank — correct (window ≠ factor match).
- **CSF extraction `ARRAIGO_INSUFICIENTE`** still shows 24m / Banorte 12 on the CSF tab; asesoras may confuse it with Phase C. Optional copy fix.
- **`toggleReceipt` on PFAE** drops `source`/`bases`. Guard 400 for PFAE if cheap; otherwise document.
- **Engram cwd:** `mem_current_project` resolves `mvina` from `%USERPROFILE%`. All `mem_*` calls must pass `project: "analisis_hipotecario"`.

---

### Ready for Proposal

**Yes**, with non-blocking product confirmations (recommend proceeding with the defaults below unless the user objects):

1. **No global `ActivityType` in MVP** — per-bank labels + SAT aliases (`BankActivityFactor`). HU-18 keyword stub stays for 6/12.
2. **Giro factor after base choice** (locked): both bank-statements and tax-return. BX+ dual factors (`factorEstados` / `factorDeclaracion`) in seed; other banks one number.
3. **Banorte FLAT 0.6** — no cliente 0.70 checkbox in this HU.
4. **Banks UI extras this HU:** PFAE tenure + factor mode/flat + `taxReturnPolicy` + factors table. Defer `minimumIncomePfae` / PFAE age columns unless the user wants Santander/Banamex CMA accuracy now.
5. **HSBC liquidez** stays inactive (both profiles) unless the user wants salaried-on / PFAE-off.
6. **PATCH** creates a new income snapshot + Phase-C-only `AnalysisRun` (copy Phase A). No expediente Comparativa UI.
7. **CE Mifel 0.50** and health **1.5** unchanged.

Orchestrator should tell the user: HU-20 is the Banks module + Phase C engine, not the expediente picker. Today every PFAE comparativa is `REQUIRES_REVIEW` because tenure still looks for payroll. The catalog will be per-bank (not a canonical SAT list). Ask them to confirm the seven defaults above, especially (2) Santander tax-path factor and (4) extra CMA columns.
