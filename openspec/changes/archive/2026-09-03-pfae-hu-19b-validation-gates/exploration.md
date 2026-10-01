## Exploration: PFAE Validation Gates elevated into AnalysisRun (HU-19b)

Source of truth: `PLAN-FASE-VALIDACION-PFAE.md` §1.2 / §2.1 / §4 (overrides older HU-19 notes in `PLAN-PERFIL-PFAE.md`).

### Current State

**Phase A today.** `CaseAnalysisService.resolvePhaseARules(personType)` returns `[IdentityMatchRule]` for `PFAE` and `[IdentityMatchRule, BankarizationValidationRule]` otherwise. Results are persisted as one immutable `AnalysisRun.detail = { ruleResults, sources, fields, bankViability? }` plus flattened `AnalysisAlert` rows. Phase A FAIL does **not** block Phase B/C. Aggregate outcome is FAIL > PARTIAL > PASS across **all** rules including Phase C.

**Identity (HU-19a, done).** `IdentityMatchRule` already branches sources by `personType` (`csf` + `tax-return` for PFAE; payroll omitted). Context includes `personType`. Not in this HU.

**CSF extraction already computes the gate inputs** (`csf-extraction.service.ts` `postProcessCsf`). Persisted on the CSF document; no schema gap for 19b:

| Field / alert | Role |
|---------------|------|
| `isSolelySalaried`, `hasSalariedRegime`, `hasIndependentRegime`, `regimes[]` | Régimen gate |
| `tenureMonths`, `activityStartDate`, `activities[]` | Arraigo months + SAT text |
| `issuance.issuanceDate`, `issuance.isOlderThan3Months` | Vigencia |
| `VIGENCIA_MAYOR_3_MESES` (WARNING) | Document-level; matches PLAN |
| `REGIMEN_EXCLUSIVAMENTE_ASALARIADO` (ERROR) | Document-level; matches PLAN FAIL |
| `ARRAIGO_INSUFICIENTE` (WARNING, `tenureMonths < 24`, message cites Banorte 12) | **Conflicts with PLAN-FASE** — Validaciones must only show months; FAIL vs bank is HU-20 |
| `REGIMEN_SUELDOS_Y_SALARIOS_AVISO_MIXTO` (INFO) | Mixed-income note; not a 19b knockout |

Extraction UI (`csf-tab.tsx`) already dumps these document alerts. They are **not** on `AnalysisRun`.

**Bank-statement coherence (HU-17, done).** Cleaner classifies rental concepts without CSF régimen 606/arrendamiento as `TRASH` / `trashCategory: 'RENT_WITHOUT_CSF_REGIME'` on `extractedData.financialDepuration.cleanedDeposits[]`. There is **no** document-level `alerts[]` code for this — only per-deposit trash. Income path already excludes those deposits. Do not invent a second Gemini classifier.

**Tax-return alerts are not 19b gates.** `PERDIDA_FISCAL_KNOCKOUT_DECLARACION` lives on HU-18 income. Do not elevate.

**No HU-20 catalog.** Prisma has neither `ActivityType` nor `BankActivityFactor` nor `BankPolicy.minimumActivityTenureMonths`. `ACTIVITY_UNMAPPED` cannot be evaluated honestly in 19b.

**Age + term ≤ 80y6m.** Listed in old `PLAN-PERFIL` HU-19; **absent** from PLAN-FASE 19b table. Current CMA checks `currentAgeMonths` vs per-bank `maximumApplicationAgeMonths` (e.g. Santander 966 = 80y6m, Banorte 839). `ageAtMaturityMonths` is computed but not checked. `maximumMaturityAgeMonths` was removed from the schema. **Not a Phase A gap for this HU** — keep out.

**Validaciones UI.** `ValidacionesTab` is hardcoded: identity block + (SALARIED-only) bankarization. It never iterates `ruleId` / `detail.ruleResults`. `IdentitySummaryCard` counts **all** aggregated `detail.fields` (match/mismatch/unavailable). `ValidationTable` only renders `fullName` / `rfc` / `curp`. Unknown `ruleId`s do **not** auto-render. Frontend `AnalysisDetail` type does not even declare `ruleResults` (Prisma JSON still stores it).

**Rule-registration pattern (copy this).** Nest provider in `case-analysis.module.ts`; inject into `CaseAnalysisService`; add to `resolvePhaseARules`. Spec/tests: `identity-match.rule.spec.ts` (plain class, fixture `doc()` helper) + `case-analysis.service.spec.ts` personType describe. `BankarizationValidationRule` keeps `detail.fields: []` because fields are for the identity table; extra keys + `alerts[]` carry rule payload.

### Affected Areas

- `apps/api/src/case-analysis/rules/pfae-validation.rule.ts` (+ `.spec.ts`) — **new** `PfaeValidationRule`, `ruleId: 'pfae-validation'`
- `apps/api/src/case-analysis/case-analysis.module.ts` — register provider
- `apps/api/src/case-analysis/case-analysis.service.ts` — `resolvePhaseARules('PFAE')` → `[identity, pfaeValidation]`; SALARIED unchanged
- `apps/api/src/case-analysis/case-analysis.service.spec.ts` — assert PFAE invokes the new rule and does not invoke bankarization; SALARIED does not invoke it
- `apps/api/src/case-analysis/analysis-rule.interface.ts` — likely unchanged (`RuleDetail` already has `[key: string]: unknown`)
- `openspec/specs/case-analysis/spec.md` — MODIFY Phased Orchestration (PFAE Phase A set)
- Optional new spec domain `pfae-validation` (or ADDED requirements under case-analysis)
- `apps/web/app/ui/expedientes/analysis-section.tsx` — **no gates UI this HU**. Optional 1-line identity filter (`fullName\|rfc\|curp`) only if the rule puts non-identity rows in `detail.fields`
- **Do not change** CSF / tax-return / bank-statement extraction schemas (fields already exist)
- **Do not change** `identity-match.rule.ts`, income engine, bank-viability, bank catalog

### Approaches

1. **Blind elevation of document `alerts[]`** — copy CSF (and any bank) alerts onto `AnalysisRun`.
   - Pros: tiny mapper; reuses existing codes.
   - Cons: copies the hardcoded 24-month `ARRAIGO_INSUFICIENTE` into Phase A (violates PLAN-FASE); coherence has no document alert to copy; mixed-income INFO and missing-RFC identity alerts would leak; extraction noise becomes AnalysisRun outcome.
   - Effort: Low

2. **Dedicated deterministic `PfaeValidationRule` that re-derives gates from CSF/bank fields** (preferred) — read `isSolelySalaried`, `tenureMonths`, `issuance.isOlderThan3Months`, `activities[]`, and `cleanedDeposits[].trashCategory`; emit typed `detail.pfaeValidation` + `alerts[]` under PLAN-FASE outcomes. Ignore extraction's `ARRAIGO_INSUFICIENTE` for Phase A FAIL. Do not call Gemini.
   - Pros: PLAN-FASE outcomes independent of noisy extraction alerts; matches HU-19a orchestrator pattern; HU-21 can render a stable snapshot; extraction can stay as document-level noise.
   - Cons: slight duplication of boolean logic already in `postProcessCsf` (acceptable — rule is the AnalysisRun contract, extraction stays a document helper).
   - Effort: Low–Medium

### Recommendation

**Approach 2**, registered like HU-19a:

```
PFAE:     [IdentityMatchRule, PfaeValidationRule]
SALARIED: [IdentityMatchRule, BankarizationValidationRule]
```

Rule itself: if `personType !== 'PFAE'`, return empty PASS (defensive; orchestrator must still not register it for SALARIED).

**Payload** — follow bankarization, not identity `FieldComparison`:

- `detail.fields: []` (do **not** flatten gate rows into the identity table).
- `detail.sources`: `['csf']` and `'bank-statement'` when statements exist.
- `detail.pfaeValidation` extra key (typed snapshot for HU-21):
  - `regime`: `{ isSolelySalaried, outcome: FAIL|PASS }`
  - `tenure`: `{ months, activityStartDate }` — **informational only**, never FAIL/WARNING vs 24 or bank CMA
  - `vigencia`: `{ issuanceDate, isOlderThan3Months, outcome: WARNING|PASS }`
  - `activity`: `{ satDescription }` from highest-% active CSF activity — **no catalog match, no `ACTIVITY_UNMAPPED`**
  - `coherence`: `{ rentWithoutRegimeCount, outcome: WARNING|PASS }` from `RENT_WITHOUT_CSF_REGIME` deposits
- `alerts[]` mapped to `AnalysisAlert` (`ruleCode`, `severity` ERROR/WARNING/INFO, `field`, `message`).

**Closed conflict resolutions**

1. **Arraigo.** Elevate `tenureMonths` + `activityStartDate` as INFO fields. Do **not** copy `ARRAIGO_INSUFICIENTE` into Phase A alerts/outcome. Leave the extraction alert on the CSF document (csf-tab already shows it). Do not change extraction this HU.
2. **ACTIVITY_UNMAPPED.** Defer to HU-20 (no catalog). 19b persists SAT activity text + tenure months only.
3. **Registration.** Orchestrator `resolvePhaseARules`; rule no-ops for SALARIED.
4. **UI.** Backend `AnalysisRun` only. Unknown `ruleId`s do not auto-render. HU-21 owns Validaciones gates section. No identity-counter filter needed if `fields` stays empty.
5. **Coherence.** Scan `financialDepuration.cleanedDeposits` for `RENT_WITHOUT_CSF_REGIME`. Recommend **WARNING** (cleaner already discarded the deposits from income; solely salaried is the only FAIL). Count > 0 → WARNING; else PASS. Missing bank statements → omit coherence (not FAIL).
6. **Missing CSF.** PLAN §1.6: gates **PARTIAL**. No CSF extractedData → PARTIAL, empty snapshot, no régimen FAIL.
7. **Age + term.** Out of scope. Already a per-bank Phase C application-age CMA check, not a Phase A gate.

**Outcome matrix (Phase A rule only; does not block B/C)**

| Gate | Rule outcome contribution |
|------|---------------------------|
| Solely salaried | FAIL / ERROR |
| Missing CSF | PARTIAL |
| Vigencia > 3 months | WARNING → PARTIAL (does not FAIL) |
| Tenure months | INFO, no escalation |
| Unmapped activity | not evaluated |
| Rent without arrendamiento | WARNING → PARTIAL |
| Otherwise | PASS |

Solely salaried FAIL **does** escalate the aggregate `AnalysisRun.outcome` to FAIL (same as identity FAIL). That is the product “FAIL camino PFAE” signal; comparativa still runs (Phase C). Presenting it as non-viable PFAE in the comparativa UI is HU-20/21.

**Tests.** New `pfae-validation.rule.spec.ts`: solely salaried FAIL; vigencia WARNING; tenure 12 months is INFO not FAIL; no CSF → PARTIAL; `RENT_WITHOUT_CSF_REGIME` → WARNING; SALARIED context → empty PASS; tax-loss alerts ignored. Extend `case-analysis.service.spec.ts` PFAE describe to expect `pfae-validation.execute` called and bankarization not called.

**Extraction schemas.** No change — `isSolelySalaried`, `tenureMonths`, `activityStartDate`, `issuance.isOlderThan3Months`, `activities[]`, `cleanedDeposits[].trashCategory` already exist.

### Risks

- Aggregate FAIL from solely salaried may confuse asesoras until HU-21 renders the gates section (identity tab still works; overall run badge becomes FAIL).
- `ARRAIGO_INSUFICIENTE` remains visible on the CSF extraction tab with a 24-month message — document-level noise vs PLAN-FASE. Changing extraction is out of scope; call out in propose so HU-21/docs do not treat it as AnalysisRun FAIL.
- Flattening non-empty `detail.fields` would inflate identity match/mismatch counters — mitigated by keeping `fields: []`.
- Coherence depends on HU-17 depuration having run; uncleaned statements yield no `cleanedDeposits` (treat as coherence omitted, not FAIL).
- `hasIndependentRegime` heuristic also treats any non-sueldos **activity** as independent — mixed/edge CSF rows could miss solely-salaried FAIL or false-PASS. Reuse the persisted boolean; do not re-tune regex this HU.
- Phased Orchestration spec still says PFAE Phase A is identity-only — must be MODIFIED.

### Ready for Proposal

**Yes.** Scope is bounded: one new AnalysisRule, orchestrator registration, specs/tests. No extraction or Validaciones UI work.

Non-blocking product confirmations (recommend proceeding with the defaults above unless the user objects):

1. Coherence = WARNING (not FAIL) when `RENT_WITHOUT_CSF_REGIME` deposits exist.
2. Leave CSF extraction `ARRAIGO_INSUFICIENTE` untouched (document-level only).
3. Missing CSF = PARTIAL, not FAIL.
4. No Validaciones UI in this HU.
