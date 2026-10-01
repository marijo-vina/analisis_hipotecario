# Proposal: Non-susceptible economic activities (giros no susceptibles)

## Intent

13 activities are excluded from any financing destination on all banks, plus one HSBC-only liquidity sheet. Code has no notion of an excluded activity — every giro is a factor haircut or `ACTIVITY_UNMAPPED`. Mifel aliases (`mineria`, `gasolinero`, `bares`) still produce a viable product for giros no bank will finance.

## Scope

### In Scope

- Code-level catalog: 13 global exclusions (`code`, Spanish `label`, SAT aliases) plus one bank-scoped entry (`bankCode: HSBC`, `destinations: [LIQUIDITY]`, `personTypes: [PFAE, PM]`) for construcción, casa de materiales, despacho contable, químicas y farmacéuticas (rama/subrama).
- Pure `matchNonSusceptibleActivity()` over `normalizeSatText`, word-boundary aliases. Exclusion is a verdict, never a factor of 0.
- Phase C `BankViabilityRule`, `personType === 'PFAE'`: global list after bureau knockouts, before the policy query and any factor. Hit → `FAIL`, global reason, `bankResults: []`. HSBC sheet inside `evaluateBank` → per-bank `NOT_COMPATIBLE`.
- Phase A `PfaeValidationRule`: ERROR alert on `activity` naming the match.
- Activity compared: primary independent CSF activity (highest %, excluding sueldos y salarios) via existing `pickPrimaryIndependentActivity`.
- Spanish `REASON_LABELS` for the new codes.

### Out of Scope

- Schema, migration, seed, `banks.service.ts`, admin UI.
- Adding PM to `PersonType`. The catalog stores `personTypes` with PM as data; PM evaluation is a later slice.
- Activating `HSBC_LIQ` (seed `isActive: false`), so the sheet cannot fire in production; tests mock an active HSBC liquidity policy.
- Acquisition and substitution of the four subsectors.
- The truncated Ingenieros/Arquitectos footnote.
- Copying the 13 per bank; consolidating the three primary-activity selectors.

## Capabilities

### New Capabilities

- `non-susceptible-activities`: catalog contract and matcher verdict semantics.

### Modified Capabilities

- `case-analysis`: PFAE exclusion knockout before factor resolution; HSBC + LIQUIDITY + PFAE reason; `resolveProductStatus` precedence.
- `pfae-validation`: ERROR alert for a non-susceptible primary activity.
- `frontend`: `REASON_LABELS` covers the new codes.

## Approach

Exploration Approach 1: a closed bank-agnostic policy lives once in versioned TypeScript; HSBC scoping is catalog data, not `bank.code` conditionals. Eligible giros keep each bank's factor; HSBC stays `NONE` / 1.0. Strict TDD at apply.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `case-analysis/non-susceptible-activities.ts` (+spec) | New | Catalog + matcher |
| `case-analysis/activity-factor-match.ts` | Modified | Export `normalizeSatText` |
| `rules/bank-viability.rule.ts` (+spec) | Modified | Knockout + HSBC reason |
| `rules/pfae-validation.rule.ts` (+spec) | Modified | Phase A alert |
| `types/bank-viability.types.ts` | Modified | Matched-exclusion label |
| `apps/web/app/lib/definitions.ts` | Modified | Spanish labels |
| `schema.prisma`, `seed-data.ts` | Untouched | No persistence change |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Short aliases (`bares`, `armas`) false-positive | High | Word boundaries, SAT phrasing, positive and negative fixtures |
| Construcción subramas catch arquitectos/ingenieros | Med | Negative fixtures; Mifel PI grupo B stays a factor |
| Catalog drifts from `docs/bank-policies-matrix.md` | Med | Test pins the 13 codes and four subsectors |
| "No HSBC liquidity" read as a regression | Med | Documented no-op while `HSBC_LIQ` is inactive |
| Stale Phase A on `runPhaseC` | Low | Phase C stays authoritative |
| Dirty unrelated files staged | Med | Apply touches only listed paths |

## Rollback Plan

Revert the commit. No migration and no seed edit, so prior behavior returns exactly and stored analyses need no backfill.

## Dependencies

None; `activities[]` and `pickPrimaryIndependentActivity` already exist.

## Assumptions and Open Questions

- HSBC's list is authoritative for all banks; no bank supplies its own.
- PM applicability is data now, enforced when `PersonType` gains PM.
- Non-blocking: consolidating the three primary-activity selectors is deferred.

## Success Criteria

- [ ] Matched PFAE giro → `FAIL`, `bankResults: []`, on every destination, before any factor.
- [ ] Eligible giro keeps each bank's factor; HSBC `NONE` / 1.0.
- [ ] HSBC sheet fires only for HSBC + LIQUIDITY + PFAE (mocked active policy).
- [ ] Salaried and acquisition/substitution paths unchanged.
- [ ] Every new reason code has a Spanish label.
- [ ] Diff carries no schema, seed, or admin-UI change.
