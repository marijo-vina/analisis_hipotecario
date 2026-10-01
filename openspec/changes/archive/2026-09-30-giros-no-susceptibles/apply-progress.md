# Apply Progress: giros-no-susceptibles

**Mode**: Strict TDD
**Delivery**: feature-branch-chain on `feature/giros-no-susceptibles`. Work Unit 1 (PR 1) and Work Unit 2 (PR 2) are both applied and uncommitted on the same branch. Split the commits and PRs by work unit (see "Work Unit 2 files" below).

## Completed Tasks

### Work Unit 1: Global PFAE exclusions

- [x] 1.1 RED: `non-susceptible-activities.spec.ts` (13 codes, positive/negative fixtures, `normalizeSatText` self-match)
- [x] 1.2 GREEN: `non-susceptible-activities.ts` (13 GLOBAL entries, `matchGlobalNonSusceptibleActivity`, word boundaries, longest alias wins)
- [x] 1.3 REFACTOR: dropped aliases not backed by the matrix (`estaciones de servicio`, `joyas`) and a dead scope check
- [x] 1.4 GREEN: optional `nonSusceptibleActivity?: string` on `BankViabilitySnapshot`
- [x] 1.5 RED: 10 Phase C cases in `bank-viability.rule.spec.ts` (6 failed before implementation, 4 regression guards passed)
- [x] 1.6 GREEN: `deriveCsfFields` returns `independentDescription` via `pickPrimaryIndependentActivity`; PFAE knockout after bureau knockouts, before policy query
- [x] 1.7 GREEN: `ACTIVITY_NOT_SUSCEPTIBLE` label in `apps/web/app/lib/definitions.ts`
  - Verify follow-up: runtime spec `apps/web/app/lib/reason-labels.spec.ts` asserts `REASON_LABELS` and `getReasonLabel` return "Giro no susceptible de financiamiento".
- [x] 1.8 Verify WU1

### Work Unit 2: HSBC sheet + Phase A alert

- [x] 2.1 RED: matcher spec extended with the HSBC catalog (4 subsectors, shared scope `BANK / HSBC / [LIQUIDITY] / [PFAE, PM]`), scoped hits, arquitecto/ingeniero negatives, scope mismatches (other bank, ACQUISITION, MORTGAGE_REPLACEMENT, null destination, SALARIED, PM at runtime). 31 failed on the missing export.
- [x] 2.2 GREEN: 4 `BANK`-scoped entries (`CONSTRUCCION`, `CASA_DE_MATERIALES`, `DESPACHO_CONTABLE`, `QUIMICA_FARMACEUTICA`) + `matchBankScopedNonSusceptibleActivity`. The global matcher now only scans GLOBAL entries. Runtime is PFAE only; `PersonType` unchanged.
- [x] 2.3 GREEN: optional `matchedExclusionLabel?: string` on `BankResult`; optional `nonSusceptible?: string` on the Phase A `activity` snapshot.
- [x] 2.4 RED: 8 Phase C cases with a mocked active HSBC LIQUIDITY policy. The 2 restriction cases failed; the 6 guards (Banorte on the same run, HSBC ACQUISITION / MORTGAGE_REPLACEMENT, architecture giro, SALARIED, inactive seed path) passed.
- [x] 2.5 GREEN: `evaluateBank` calls the scoped matcher with the CSF primary independent activity and `policy.destination`; pushes `HSBC_LIQUIDITY_ACTIVITY_RESTRICTED` and sets `matchedExclusionLabel`. `resolveProductStatus` maps it to `NOT_COMPATIBLE` (ahead of REQUIRES_REVIEW, CONDITIONED, PRELIMINARY_VIABLE). `resolvePfaeFactor` untouched (HSBC still `NONE` / 1.00).
- [x] 2.6 RED: 4 Phase A cases. Excluded global giro and salaried-row skip failed; construction-only and eligible guards passed.
- [x] 2.7 GREEN: `PfaeValidationRule` matches `pickPrimaryIndependentActivity(csf.activities)` against the global list only; ERROR `ACTIVITY_NOT_SUSCEPTIBLE` on `activity` naming the description and label; outcome escalates to FAIL; `activity.nonSusceptible` holds the label.
- [x] 2.8 GREEN: `HSBC_LIQUIDITY_ACTIVITY_RESTRICTED: "Giro restringido para liquidez HSBC"` in `REASON_LABELS`, with a vitest assertion written first (failed, then passed).
- [x] 2.9 Verify WU2

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `non-susceptible-activities.spec.ts` | Unit | N/A (new) | ✅ Written, suite failed: module not found | — | — | — |
| 1.2 | `non-susceptible-activities.spec.ts` | Unit | N/A (new) | ✅ (1.1) | ✅ 31/31 | ✅ 15 hits, 7 eligible, 4 empty inputs | — |
| 1.3 | `non-susceptible-activities.spec.ts` | Unit | ✅ 31/31 | — | ✅ 31/31 | — | ✅ Aliases trimmed, still green |
| 1.4 | (type only) | — | — | — | ✅ Compiles in 1.5/1.6 | ➖ Skipped: optional type field | ➖ |
| 1.5 | `rules/bank-viability.rule.spec.ts` | Unit (Prisma mocks) | ✅ 83/83 baseline | ✅ 6 failed on missing reason / findMany called | — | — | — |
| 1.6 | `rules/bank-viability.rule.spec.ts` | Unit | ✅ | ✅ (1.5) | ✅ 124/124 in 3 suites | ✅ 3 destinations, salaried-row skip, eligible, SALARIED, bureau precedence | ➖ None needed |
| 1.7 | `apps/web/app/lib/reason-labels.spec.ts` | Unit | — | ➖ Label pre-existed; spec written first | ✅ 2/2 | ➖ | ➖ |
| 1.8 | `src/case-analysis` (13 suites) | Unit | — | — | ✅ 293/293 | — | — |
| 2.1 | `non-susceptible-activities.spec.ts` | Unit | ✅ 139/139 baseline (3 suites) | ✅ 31 failed: `matchBankScopedNonSusceptibleActivity is not a function` | — | — | — |
| 2.2 | `non-susceptible-activities.spec.ts` | Unit | ✅ | ✅ (2.1) | ✅ 64/64 | ✅ 11 scoped hits over 4 subsectors, 7 eligible, 6 scope mismatches, 4 empty inputs | ✅ Shared `matchAgainst` for both matchers |
| 2.3 | (types only) | — | — | — | ✅ Compiles in 2.4–2.7 | ➖ Optional fields | ➖ |
| 2.4 | `rules/bank-viability.rule.spec.ts` | Unit (Prisma mocks) | ✅ | ✅ 2 failed (status PRELIMINARY_VIABLE, reason missing) | — | — | — |
| 2.5 | `rules/bank-viability.rule.spec.ts` | Unit | ✅ | ✅ (2.4) | ✅ 159/159 (matcher + Phase C) | ✅ Precedence over UNCONFIRMED_INCOME, DESPACHO_CONTABLE hit | ➖ None needed |
| 2.6 | `rules/pfae-validation.rule.spec.ts` | Unit | ✅ 21/21 | ✅ 2 failed (no alert) | — | — | — |
| 2.7 | `rules/pfae-validation.rule.spec.ts` | Unit | ✅ | ✅ (2.6) | ✅ 25/25 | ✅ Salaried-row skip; construction-only and eligible stay silent | ➖ None needed |
| 2.8 | `apps/web/app/lib/reason-labels.spec.ts` | Unit (vitest) | ✅ 2/2 | ✅ 1 failed (`undefined`) | ✅ 3/3 | ➖ | ➖ |
| 2.9 | 3 assigned suites + `src/case-analysis` + web labels | Unit | — | — | ✅ 184/184; 338/338 (13 suites); 3/3 vitest | — | — |

## Test Summary

- `npx jest src/case-analysis/non-susceptible-activities.spec.ts src/case-analysis/rules/bank-viability.rule.spec.ts src/case-analysis/rules/pfae-validation.rule.spec.ts` (apps/api): 3 suites, 184 passed
- `npx jest src/case-analysis` (apps/api): 13 suites, 338 passed
- `npx vitest run app/lib/reason-labels.spec.ts` (apps/web): 3 passed
- WU2 tests written: 45 (33 matcher + 8 Phase C + 4 Phase A) + 1 web label test

## Files Changed

### Work Unit 1

| File | Action |
|------|--------|
| `apps/api/src/case-analysis/non-susceptible-activities.ts` | Created |
| `apps/api/src/case-analysis/non-susceptible-activities.spec.ts` | Created |
| `apps/api/src/case-analysis/rules/bank-viability.rule.ts` | Modified |
| `apps/api/src/case-analysis/rules/bank-viability.rule.spec.ts` | Modified |
| `apps/api/src/case-analysis/types/bank-viability.types.ts` | Modified |
| `apps/web/app/lib/definitions.ts` | Modified |
| `apps/web/app/lib/reason-labels.spec.ts` | Created |

### Work Unit 2 files

| File | Action |
|------|--------|
| `apps/api/src/case-analysis/non-susceptible-activities.ts` | Modified: `BANK` scope variant, 4 HSBC entries, `matchBankScopedNonSusceptibleActivity`, shared `matchAgainst` |
| `apps/api/src/case-analysis/non-susceptible-activities.spec.ts` | Modified: HSBC catalog + scoped matcher tests |
| `apps/api/src/case-analysis/rules/bank-viability.rule.ts` | Modified: `PfaeBranch.independentDescription`, scoped check in `evaluateBank`, `matchedExclusionLabel`, `resolveProductStatus` precedence |
| `apps/api/src/case-analysis/rules/bank-viability.rule.spec.ts` | Modified: `HSBC liquidity activity restriction` block (8 cases) |
| `apps/api/src/case-analysis/rules/pfae-validation.rule.ts` | Modified: global-exclusion ERROR alert |
| `apps/api/src/case-analysis/rules/pfae-validation.rule.spec.ts` | Modified: `ACTIVITY_NOT_SUSCEPTIBLE (global exclusion)` block (4 cases) |
| `apps/api/src/case-analysis/types/bank-viability.types.ts` | Modified: `matchedExclusionLabel?` |
| `apps/api/src/case-analysis/types/pfae-validation.types.ts` | Modified: `nonSusceptible?` |
| `apps/web/app/lib/definitions.ts` | Modified: `HSBC_LIQUIDITY_ACTIVITY_RESTRICTED` label |
| `apps/web/app/lib/reason-labels.spec.ts` | Modified: HSBC label assertion |

Unchanged as required: `activity-factor-match.ts`, `resolvePfaeFactor`, `schema.prisma`, `seed-data.ts` (`HSBC_LIQ` stays `isActive: false`), `banks.service.ts`, `PersonType`, and the unrelated dirty files (`apps/api/src/documents/*`, `.cursor/rules/sdd-phase-models.mdc`, `.agents/rules/sdd-model-assignments.md`, `docs/bank-policies-matrix.md`).

## Deviations / Notes

- The spec says "one HSBC entry with four subsectors". It is modeled as four catalog entries that share one `BANK` scope object (the design's `NonSusceptibleEntry` has no subsector field, and its example code `'CONSTRUCCION'` is per subsector). The catalog test pins the four codes and the shared scope.
- HSBC aliases are full SAT rama/subrama phrases (e.g. `construcción de obras`, `obras de ingeniería civil`, `trabajos de albañilería`), never bare `construcción`, `ingeniería`, or `arquitectura`. "Servicios de arquitectura y de ingeniería para la construcción" stays eligible.
- `Fabricación de explosivos` (listed under the pharma subrama in the doc) is not an HSBC alias; the global `ARMAS_FABRICACION` entry already knocks it out before the per-bank check.
- The reason code is the literal `HSBC_LIQUIDITY_ACTIVITY_RESTRICTED` for any bank-scoped hit. Only HSBC has bank-scoped entries today; a second bank sheet would need its own reason code.
- Phase A `activity.nonSusceptible` is only set when the CSF has at least one active activity row (the `activity` snapshot is null otherwise, and so is the independent activity).
- `tsc --noEmit` still reports the pre-existing `snapshot()` helper typing error (TS2345) in `pfae-validation.rule.spec.ts`; the 3 new Phase A tests use the same helper. Also pre-existing: `pfae-validation.types.spec.ts`, `pagadora-detection.service.spec.ts`, and two `documents/*` specs.
- WU1 and WU2 are both uncommitted on the same branch. For the chained PRs, commit WU1 first, then WU2 (file list above).
