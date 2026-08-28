# Tasks: PFAE Identity Match (HU-19a)

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~500–620 (add+del) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Unit 1 (backend) → Unit 2 (frontend) |
| Delivery strategy | exception-ok (`size:exception`, un solo apply) |
| Chain strategy | none (single branch `feature/pfae-hu-19a-identity-match`) |

Decision needed before apply: No (maintainer accepted `size:exception`)
Chained PRs recommended: Yes (forecast), overridden by user: un solo apply
Chain strategy: none
400-line budget risk: High — accepted as `size:exception`

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | Backend: rule + service personType resolution + tests | PR 1 | ~300–380 lines; tests included |
| 2 | Frontend: `AnalysisSection` personType wiring + checklist | PR 2 | ~150–220 lines; depends on Unit 1's `detail.sources` shape |

Git constraint: no new branches. Both units land as sequential commits on `feature/pfae-hu-19a-identity-match`. Ask user: review as `size:exception` (one PR) or two sequential reviewed commits before any future merge.

## Phase 1: Backend Tests — RED

- [x] 1.1 `identity-match.rule.spec.ts`: add PFAE fixtures — csf match, stray payroll ignored, tax-return RFC mismatch → FAIL, tax-return name-only → PARTIAL, missing tax-return → NOT_AVAILABLE; keep SALARIED assertions
- [x] 1.2 `case-analysis.service.spec.ts`: add fixtures — PFAE never calls `bankarizationValidationRule.execute`; SALARIED calls both; context includes `personType`

## Phase 2: Backend Implementation — GREEN

- [x] 2.1 `identity-match.rule.ts`: add `appliesTo: PersonTypeScope[]`, `optional?`, `reference?` to `SourceDefinition`; convert `client` into a definition (`optional: true, reference: true`)
- [x] 2.2 Add `csf` (PFAE, `taxpayer.fullName/rfc/curp`) + `tax-return` (PFAE, `optional: true`, `satReceipt.taxpayerName→fullName`, `satReceipt.rfc`, `curp: () => null`); tag `payroll: ['SALARIED']`
- [x] 2.3 Resolve `activeDefs` by `personType` once in `execute()`; thread through `indexDocsBySource`/`collectFieldValues`/`compareField`, replacing `sourceKey === 'client'` checks with `def.reference`
- [x] 2.4 `case-analysis.service.ts`: add `personType: mortgageCase.personType` to `run()`'s `context` object
- [x] 2.5 Replace constructor-fixed `phaseARules` with per-request `resolvePhaseARules(personType)` (PFAE → `[identityMatchRule]`; else → both)
- [x] 2.6 `bankarization-validation.rule.ts`: JSDoc note — never invoked for PFAE; keep existing empty-input PASS guard

## Phase 3: Backend Verification

- [x] 3.1 Run `apps/api` Jest for both spec files; all PFAE + SALARIED assertions green (43/43; full suite 1003/1003, no regressions)

## Phase 4: Frontend Wiring

- [x] 4.1 `case-detail-workspace.tsx` (~line 205): pass `personType={caseData.personType}` into `<AnalysisSection>`
- [x] 4.2 `analysis-section.tsx`: add `personType?: string` prop; add `csf`/`tax-return` to `SOURCE_LABELS`/`SOURCE_ICONS` (reuse existing chip pattern per root `design.md` — no new colors)
- [x] 4.3 Thread `personType` into `ValidacionesTab`; hide the "Conciliación nómina vs banco" section (heading + `EstadosConciliacion`/empty-state card) when `personType === "PFAE"`; reuse existing `gf-border` card
- [x] 4.4 Make `IdentitySummaryCard.COLUMNS` personType-aware: PFAE = `csf`, `tax-return`, `official-id`, `bank-statement`, `credit-bureau`, `client` (no `payroll`); SALARIED unchanged; table styling unchanged
- [x] 4.5 Extract one `REQUIRED_DOC_CHECKS(personType)` consumed by `hasMissingDocs` and `AnalysisConfirmModal`'s checklist — PFAE: INE/passport, CSF, tax return, bank statements, bureau (no nómina); SALARIED unchanged; missing docs stay soft/non-blocking

## Phase 5: Verification

- [x] 5.1 Manual QA vs spec scenarios: PFAE shows csf+tax-return, no payroll, no conciliación section, PFAE checklist; SALARIED unchanged — verified by code inspection (see apply-progress); no dev server/browser QA run in this batch
- [x] 5.2 `apps/web` typecheck clean (tsc --noEmit); `apps/api` build (tsc --build tsconfig.build.json) clean; no new errors introduced (pre-existing repo-wide CRLF/prettier lint mismatch and 3 unrelated pre-existing spec-file type errors confirmed via `git status` as untouched by this change)
