## Exploration: PFAE HU-21 Expediente UI

Source of truth: `PLAN-FASE-VALIDACION-PFAE.md` §1 (user flow, Validaciones, Cálculo, Comparativa, borders) and §4 HU-21 row. `PLAN-PERFIL-PFAE.md` FASE F HU-21 is broader; **override**: no new tabs/wizard; peinado review already lives in extraction.

CodeGraph: `.codegraph/` exists but only `.gitignore` (no index). CodeGraph MCP is not available in this session. Exploration used targeted Read/Grep on the files listed below.

### Current State

**Shell is already the three analysis tabs.** `AnalysisSection` (`apps/web/app/ui/expedientes/analysis-section.tsx`, **1046 lines**) owns Validaciones / Cálculo financiero / Comparativa bancaria, a single header **Analizar expediente**, and a PFAE-aware pre-analysis checklist (INE, CSF, declaración, estados, buró). After `POST /analyze` it always `loadLatest()` — GET payload is what the tabs see.

**Validaciones (partially PFAE).** Identity already branches: `SOURCE_LABELS` includes `csf` / `tax-return`; `getIdentityColumns` swaps nómina for CSF + Declaración; bankarization (`EstadosConciliacion`) is hidden when `personType === "PFAE"`. There is **no gates section**. `ValidacionesTab` never reads `ruleId` / `detail.ruleResults`. Web `AnalysisDetail` only types `{ sources, fields, bankViability? }`.

**PFAE gates already persist (HU-19b/20).** `PfaeValidationRule` (`ruleId: pfae-validation`) writes `detail.pfaeValidation` plus flattened `AnalysisRun.alerts`:

| Gate | Outcome | Alert code |
|------|---------|------------|
| No CSF | PARTIAL | `PFAE_CSF_MISSING` |
| Solely salaried régimen | FAIL | `REGIMEN_EXCLUSIVAMENTE_ASALARIADO` |
| CSF vigencia > 3 months | PARTIAL WARNING | `VIGENCIA_MAYOR_3_MESES` |
| MATRIX giro unmapped | PARTIAL WARNING | `ACTIVITY_UNMAPPED` |
| Rent deposits without régimen | PARTIAL WARNING | `RENT_WITHOUT_CSF_REGIME` |
| Activity tenure months | INFO only | `PFAE_ACTIVITY_TENURE` |

Snapshot shape (`pfae-validation.types.ts`): `regime`, `vigencia`, `tenure`, `activity { satDescription, percentage }`, `coherence`. `detail.fields` stays empty (does not pollute the identity table). Phase A FAIL does **not** block Phase B/C.

**GET vs POST.** Prisma `AnalysisRun.detail` stores `{ ruleResults, sources, fields, bankViability? }`. `GET /analysis/latest` returns that JSON plus `alerts`. `POST /analyze` response omits `ruleResults`; the UI already follows with GET, so gates are available after analyze if types are extended. `apiFetch` does **not** strip extra JSON (`resBody as T`).

**Cálculo — salaried only on the web.** `IncomeCalculationSection` (~403 lines) fetches `GET /cases/:id/income/latest` and renders payroll KPI cards + inclusion table. Web action types in `apps/web/app/actions/income.ts` **omit** `source` and `bases`. The API already returns them (`snapshotToResult`: `source` default `PAYROLL`, `bases` or null). There is **no** `switchIncomeSource` server action. Backend `PATCH /cases/:caseId/income/source` `{ source: BANK_STATEMENTS \| TAX_RETURN }` clones bases, projects unfactored averages, then `runPhaseC` (copies Phase A). Rejects SALARIED, missing bases, and invalid chosen base (`TAX_LOSS`, `INSUFFICIENT_MONTHS`, `MISSING_DOCUMENT`) with 400.

**PFAE income contract (HU-18).** `PfaeIncomeBases`: `bank` (window 6/12, monthsUsed, dropped min/max, smoothed monthly), `taxReturn` (utilidad/12 NET, acumulables/12 GROSS, `TAX_LOSS` knockout of that base only), `activity`. Default source: bank if valid, else tax. Cálculo figures are **unfactored**; giro applies in Phase C.

**Pasivos.** Same `LiabilityCalculationSection` UI. Backend already uses 0.07 for PFAE revolving. No UI change required unless copy should mention the factor (not in PLAN-FASE §1.3).

**Comparativa — salaried table, PFAE math already in snapshot.** `bank-comparison-tab.tsx` (~607 lines) is presentational: table Banco / Ingreso / CE / Máx. endeud. / Capacidad / Estado + expandable `ProductDetail`. `calculation.incomeUsed` is already **admissible** (factored) for PFAE. API `BankViabilityInputs` has `personType?` and `incomeSource?`; web `definitions.ts` **omits both**. Reason codes `TAX_RETURN_REJECTED`, `TAX_RETURN_NOT_PREFERRED`, `ACTIVITY_UNMAPPED`, `INSUFFICIENT_ACTIVITY_TENURE`, `MISSING_ACTIVITY_START_DATE` exist on results but **not** in `REASON_LABELS`. Factor, matched giro label, SAT text, `taxReturnPolicy`, and `pfaeFactorMode` are computed inside `resolvePfaeFactor` / `evaluateBank` and **are not serialized** on `BankResult` or `policySnapshot`. PFAE tenure lives on `checks.activityTenure` (employmentTenure is `NOT_APPLICABLE`); the detail table still only lists `employmentTenure`.

**Banks UI (HU-20) is out of scope.** Labels/factors live in `bank-detail-card.tsx` / `activity-factors-editor.tsx` under `/dashboard/bancos`. Expediente tabs should feel like analysis-section / income-calculation-section / bank-comparison-tab, not a settings form.

**Extraction peinado** already sits above analysis in `case-detail-workspace.tsx`. PLAN-PERFIL “UI de revisión” is done; HU-21 only needs an auditable link/warning in Cálculo, not a new review surface.

**Tests.** No web Jest. UI contracts are TypeScript types + API suites (`pfae-validation.rule.spec.ts`, `income-calculation.service.spec.ts` `switchSource`, `income-source-phase-c.integration.spec.ts`, `bank-viability.rule.spec.ts`). HU-20 verify marked Expediente Comparativa/picker/Validaciones as PARTIAL — this HU closes that.

**Visual kit (mandatory).** Tokens only from `apps/web/app/globals.css` (`gf-*`, semantic success/warning/danger/info). Reuse `Card`, `Button`, `DataTable`, `StatusBadge`, `FieldGrid`, `FormField`, `Drawer`. Section chrome: `h3 text-sm font-semibold text-gf-text`, `space-y-6`, muted empty `text-sm text-gf-text-muted`. Copy Spanish, sentence case, advisor verbs (“Base a enviar al banco”). Hardcoded hex only where `bank-comparison-tab.tsx` already maps bank badges. Do **not** restyle salaried Validaciones/Cálculo/Comparativa. `frontend-design`: identity is already pinned — consistency, not a new aesthetic.

### Affected Areas

- `apps/web/app/ui/expedientes/analysis-section.tsx` — wire PFAE gates under identity; pass `personType` + `onSourceSwitched`/`loadLatest`; keep 3 tabs; tiny PFAE onboarding copy (“nómina” in empty-docs card)
- `apps/web/app/ui/expedientes/income-calculation-section.tsx` — branch PFAE dual-base panel vs salaried payroll table (do not restyle salaried KPIs)
- `apps/web/app/actions/income.ts` — extend `IncomeCalculationResult` with `source`/`bases`; add `switchIncomeSource` PATCH action
- `apps/web/app/ui/expedientes/bank-comparison-tab.tsx` — PFAE-only detail (origin, giro+SAT, factor, admisible→CE→capacity, taxReturnPolicy reasons); keep same table columns; PFAE `activityTenure` row; Spanish `REASON_LABELS`
- `apps/web/app/lib/definitions.ts` — `AnalysisDetail.ruleResults`, `PfaeValidationSnapshot`, `BankViabilityInputs.personType/incomeSource`, PFAE reason labels, optional `BankResult` factor fields if API persists them
- `apps/web/app/actions/analysis.ts` — unchanged fetchers (JSON already complete); types only
- `apps/api/src/case-analysis/rules/bank-viability.rule.ts` + `bank-viability.types.ts` — **optional but recommended** persist `appliedFactor`, `factorMode`, `matchedNativeLabel`, `satDescription`, `taxReturnPolicy` on each `BankResult` (or `policySnapshot`) so Comparativa does not reconstruct
- `apps/api/src/income-calculation/income-calculation.controller.ts` — already `PATCH /source`; no new endpoint
- `openspec/specs/unified-analysis-flow/spec.md` — HU-20 froze “Comparativa/picker/Validaciones UI stay unchanged”; HU-21 must MODIFY that requirement
- `openspec/specs/frontend/` (or expediente-analysis) — ADDED render scenarios
- **Do not change:** `/dashboard/bancos/*`, extraction peinado UI, salaried payroll math, second Analyze button, Banorte 0.70 checkbox (`backlog/banorte-pfae-cliente-070`)

### Approaches

1. **Thin presentational branches inside current files** — `if (personType === "PFAE")` in `analysis-section.tsx`, `income-calculation-section.tsx`, `bank-comparison-tab.tsx`.
   - Pros: few files; matches HU-19a identity pattern; no extra imports
   - Cons: `analysis-section.tsx` is already 1046 lines; picker + PATCH + gates would blow the 400-line review budget and raise salaried-regression risk in the same hunks
   - Effort: Medium (implementation) / **High review risk**

2. **Extract PFAE section components next to current files** (recommended) — same 3 tabs; compose `PfaeValidationGates`, `PfaeIncomePanel` (dual bases + “Base a enviar al banco”), `PfaeProductDetailExtras`. Parent files only branch and pass props.
   - Pros: salaried hunks stay untouched; reviewable units; client island isolated to the picker (`useTransition` like HU-20 `activity-factors-editor.tsx`); PATCH loading/error live on the picker, not a global banner
   - Cons: more files; must keep visual tokens identical to existing sections
   - Effort: Medium

3. **Parallel PFAE analysis page or 4th tab** — reject.
   - Pros: zero salaried touch
   - Cons: violates PLAN-FASE “same 3 tabs, no wizard”; splits advisor muscle memory
   - Effort: High (wrong product)

### Recommendation

**Approach 2**, plus a **thin API persist** of Phase C factor/giro fields onto `BankResult` so Comparativa detail can tell the truth.

**UI map (PLAN-FASE §1)**

| Tab | PFAE addition | Salaried |
|-----|---------------|----------|
| Validaciones | New Card section under identity: gates from `detail.ruleResults["pfae-validation"].detail.pfaeValidation` + `run.alerts`; tenure months informational; hide bankarization (already) | Unchanged |
| Cálculo | Pasivos unchanged (7% already in snapshot). Replace payroll table with two unfactored bases + single picker. Link to existing extraction peinado. | Unchanged payroll table |
| Comparativa | **Same table.** New fields in **detalle** (PLAN-FASE §1.4): origen (`inputs.incomeSource`), giro canónico + texto SAT, factor applied (“sin factor” HSBC / plano Banorte / MATRIX match), `ingresoAdmisible` → máx × CE → capacidad, `taxReturnPolicy` reasons | Unchanged columns and salaried detail |

**PATCH / refresh.** Picker island in `PfaeIncomePanel` calls `switchIncomeSource` → on success refresh local income snapshot **and** `AnalysisSection.loadLatest()` so Comparativa is not stale. No second Analyze. Pending: disable picker + `Button loading`. Error: inline Spanish (`FormField` / `role="alert"`), including 400 “no se puede enviar declaración” on `TAX_LOSS`.

**Fetchers do not strip JSON.** Gap is **types**, not `apiFetch`. Extend web income + analysis types so `source`/`bases`/`pfaeValidation`/`incomeSource` are first-class.

**Empty / edge (PLAN-FASE §1.6)** — copy in Spanish, muted Card, no AlertBanner spam:

| Situation | Advisor sees |
|-----------|----------------|
| No CSF | Identity without fiscal source; gates PARTIAL (`PFAE_CSF_MISSING`); MATRIX banks `REQUIRES_REVIEW` |
| Several CSF activities | Snapshot already selected highest %; show SAT text + % in gates / Cálculo activity line |
| Only tax-return | One enabled base; default declaración; Scotiabank `TAX_RETURN_REJECTED` → No compatible |
| Tax loss | Declaración disabled; “cambie a estados de cuenta”; PATCH 400 if forced |
| Short bank window | Bank base invalid `INSUFFICIENT_MONTHS`; picker forced to declaración if valid |
| Peinado discrepancies | Warning in Cálculo + link to extraction (already on the page); analysis not blocked |
| Solely salaried | FAIL gate + existing API message to switch to asalariado; Comparativa still computed (see product question) |
| Unmapped giro | Validaciones WARNING; MATRIX `ACTIVITY_UNMAPPED` / `REQUIRES_REVIEW`; Banorte/HSBC still factor |
| Salaried | Zero flow/visual change |

**File-size / review budget.** Do not grow `analysis-section.tsx`. Forecast: types+action (~80), gates component (~150–250), income panel+action (~200–350), Comparativa detail + labels (~150–250), optional API persist + Jest (~150–250). **400-line budget risk: High** → chained units (types → Validaciones → Cálculo PATCH → Comparativa [+ API fields]).

**Leftover (not MVP):** Banorte PFAE cliente 0.70 checkbox. UI works without it.

### Risks

- **Comparativa cannot honestly show factor/giro today** — values are computed then discarded. Reconstructing `incomeUsed / Cálculo average` fails for NET vs GROSS, BX+ `factorTaxReturn`, and unmapped nulls. Mitigate: persist a small audit object on `BankResult` in this HU (API additive, salaried fields unused/null).
- **`analysis-section.tsx` size** — in-file branches risk salaried visual regression and unreviewable diffs.
- **Stale Comparativa after PATCH** — income and analysis are separate fetches; parent `loadLatest` is mandatory.
- **Web types lag the API** — easy to ship UI that never reads `bases` / `pfaeValidation` even though JSON is present.
- **Regime FAIL still runs Phase C** — advisors may see PRELIMINARY_VIABLE rows unless the UI states the PFAE path failed (product question).
- **No web Jest** — same as HU-20 Banks; lock with types + API tests + manual QA on PFAE expediente.
- **Onboarding copy** still mentions nómina when there are no documents.
- **Unified-flow spec** still says expediente UI stays unchanged; must be updated in spec phase.

### Ready for Proposal

**Yes.** Scope, files, contracts, and visual rules are known. Orchestrator should ask the user these **product** questions before propose (interactive):

1. **Régimen solo sueldos (FAIL):** Comparativa still calculates today. Should the advisor see a clear “este camino PFAE no aplica — cambie a asalariado” message **and** still inspect bank rows, or should viable chips/rows be suppressed so it is not presented as a PFAE-viable result?
2. **Factor and giro in detalle:** Is it acceptable to persist those audit fields on the bank result in this HU (recommended), or must the UI stay strictly render-only even if factor/giro cannot be shown accurately?
3. **Peinado:** Cálculo should warn and point to the existing extraction block on the same page. Confirm no in-Cálculo deposit editor.
4. **Tabla vs detalle:** Confirm PLAN-FASE — keep the six Comparativa columns; PFAE origin/giro/factor/tax policy only in the expanded bank detail (not extra table columns).
