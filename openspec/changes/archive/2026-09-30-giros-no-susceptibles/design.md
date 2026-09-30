# Design: Non-susceptible economic activities (giros no susceptibles)

## Technical Approach

One new pure module, `apps/api/src/case-analysis/non-susceptible-activities.ts`, owns the closed policy: 13 global exclusions plus one HSBC-scoped liquidity entry (construcción, casa de materiales, despacho contable, químicas y farmacéuticas). Phase C `BankViabilityRule` is authoritative: a global hit for `personType === 'PFAE'` short-circuits like the existing bureau knockouts, so no bank's factor is applied to an excluded giro. The HSBC entry is evaluated inside `evaluateBank` as a per-bank reason. Phase A `PfaeValidationRule` adds an advisory ERROR alert. No Prisma, seed, `banks.service.ts`, or admin-UI change; `resolvePfaeFactor` is untouched.

## Architecture Decisions

| Decision | Choice | Alternatives rejected | Rationale |
|---|---|---|---|
| Storage | Versioned TS constants in one module | `NonSusceptibleActivity` table + seed + CRUD; `BankActivityFactor` rows with `factor = 0` | Closed policy, not advisor-tunable; zero migration. `factor = 0` is never evaluated on `NONE`/`FLAT` banks (HSBC, Banorte) and surfaces as `NEGATIVE_CAPACITY`, not as an exclusion. |
| Matching | Word-boundary regex over `normalizeSatText` | Reuse `matchActivityFactor`'s raw `includes()` | Short aliases (`bares`, `armas`) substring-match unrelated SAT text. Construction aliases must not catch "arquitecto"/"ingeniero" descriptions, which stay a Mifel factor. |
| `normalizeSatText` | Import from `./activity-factor-match` (already exported) | Move it to `normalize.ts` | Zero diff; `normalize.ts` is identity-specific (uppercases). The proposal assumed an export change the code does not need. |
| Global placement | After bureau knockouts, before the policy query | Inside `evaluateBank` per bank | Bank-agnostic verdict; mirrors the universal-knockout pattern and avoids duplicating the 13 per bank. |
| HSBC scope | Catalog data (`bankCode`, `destinations`, `personTypes`) | `if (bank.code === 'HSBC')` in `evaluateBank` | Declarative scoping next to the aliases; `SCOTIABANK_PAGADORA_EXCLUSION` shows how hard-coded bank branches spread. |
| Compared activity | `pickPrimaryIndependentActivity(csf.activities)` | `incomeBases.activity.description`; every active activity | Drops salaried rows, deterministic tie-break, independent of whether income was calculated. Factor matching keeps its current `satDescription` input. |
| PM | Persisted in `personTypes`, never evaluated | Extend `PersonType` | `PersonType` has no PM; the runtime guard checks `PFAE` only. |

## Data Flow

```
CSF activities[] ──pickPrimaryIndependentActivity──► description
        │
Phase A  PfaeValidationRule ──matchGlobal──► ERROR alert (advisory, does not halt)
        │
Phase C  BankViabilityRule
   bureau knockouts ────────────────────────────────► FAIL, bankResults: []
   personType === 'PFAE' ──matchGlobal── hit ───────► FAIL, ['ACTIVITY_NOT_SUSCEPTIBLE'], bankResults: []
        │ miss
   policy query (isActive) ──► evaluateBank(policy)
        ├─ matchBankScoped(HSBC + LIQUIDITY + PFAE) ─► HSBC_LIQUIDITY_ACTIVITY_RESTRICTED ─► NOT_COMPATIBLE
        └─ resolvePfaeFactor ────────────────────────► unchanged (HSBC NONE / 1.0)
```

## File Changes

| File | Action | Description |
|---|---|---|
| `apps/api/src/case-analysis/non-susceptible-activities.ts` | Create | Catalog + word-boundary matchers |
| `apps/api/src/case-analysis/non-susceptible-activities.spec.ts` | Create | Pins the 13 codes and 4 subsectors; positive and negative fixtures |
| `apps/api/src/case-analysis/rules/bank-viability.rule.ts` | Modify | Independent description in `deriveCsfFields`; PFAE knockout; HSBC check in `evaluateBank`; `resolveProductStatus` precedence |
| `apps/api/src/case-analysis/rules/bank-viability.rule.spec.ts` | Modify | Knockout, eligibility, HSBC sheet, salaried and acquisition no-ops |
| `apps/api/src/case-analysis/rules/pfae-validation.rule.ts` | Modify | ERROR alert on `activity` |
| `apps/api/src/case-analysis/rules/pfae-validation.rule.spec.ts` | Modify | Alert fires / does not fire |
| `apps/api/src/case-analysis/types/bank-viability.types.ts` | Modify | Optional `nonSusceptibleActivity` on the snapshot; optional `matchedExclusionLabel` on `BankResult` |
| `apps/api/src/case-analysis/types/pfae-validation.types.ts` | Modify | Optional `nonSusceptible` on `activity` |
| `apps/web/app/lib/definitions.ts` | Modify | Two `REASON_LABELS` entries |
| `activity-factor-match.ts`, `schema.prisma`, `seed-data.ts` | Unchanged | No export, schema, or seed change needed |

New snapshot fields are optional so existing test fixtures and stored analyses stay valid.

## Interfaces / Contracts

```ts
export type NonSusceptibleScope =
  | { kind: 'GLOBAL' }
  | { kind: 'BANK'; bankCode: string; destinations: string[]; personTypes: string[] };

export interface NonSusceptibleEntry {
  code: string;       // e.g. 'GOBIERNO', 'CONSTRUCCION'
  label: string;      // Spanish, shown to the advisor
  aliases: string[];  // SAT phrasing, matched on word boundaries
  scope: NonSusceptibleScope;
}

export type NonSusceptibleMatch =
  | { kind: 'eligible' }
  | { kind: 'excluded'; code: string; label: string; scope: NonSusceptibleScope };

export function matchGlobalNonSusceptibleActivity(
  description: string | null | undefined,
): NonSusceptibleMatch;

export function matchBankScopedNonSusceptibleActivity(input: {
  description: string | null | undefined;
  bankCode: string;
  destination: string | null;
  personType: string | null;
}): NonSusceptibleMatch;
```

Reason codes: `ACTIVITY_NOT_SUSCEPTIBLE` (global) and `HSBC_LIQUIDITY_ACTIVITY_RESTRICTED` (bank-scoped, added to the `NOT_COMPATIBLE` branch of `resolveProductStatus`).

Matching normalizes with `normalizeSatText`, then tests each alias with `(?<![a-z0-9])alias(?![a-z0-9])` and whitespace-tolerant separators. Exclusion is a verdict, never a factor.

## Testing Strategy

Strict TDD (RED → GREEN → REFACTOR) at apply.

| Layer | What to test | Approach |
|---|---|---|
| Unit — catalog | The 13 codes and 4 HSBC subsectors are present and stable | Table-driven assertion over exported constants |
| Unit — matcher | Positive and negative SAT fixture per code; `arquitecto`/`ingeniero` stay eligible; `bares`/`armas` do not fire on unrelated text | Pure function, no mocks |
| Unit — Phase C | Excluded PFAE giro → `FAIL`, `bankResults: []`, every destination; eligible giro keeps each bank's factor and HSBC `NONE`/1.0; salaried, acquisition and substitution unaffected | Existing `bank-viability.rule.spec.ts` Prisma mocks |
| Unit — HSBC sheet | Fires only for HSBC + LIQUIDITY + PFAE → `NOT_COMPATIBLE` | Mock an **active** HSBC liquidity policy (seed keeps `HSBC_LIQ` inactive) |
| Unit — Phase A | ERROR alert on `activity` names the match; eligible giro emits none | Existing `pfae-validation.rule.spec.ts` |

## Migration / Rollout

No migration, no feature flag. `HSBC_LIQ` stays `isActive: false`, so the HSBC sheet is a documented no-op in production; only the global 13 change live behavior. Rollback is a plain revert — nothing new is persisted as required data.

## Review Workload

Estimated ~650 changed lines, over the 400-line budget. Recommended split into two chained PRs, each independently shippable:

1. **Global exclusions** — catalog module (13 entries) + spec, Phase C knockout + spec, snapshot field, `ACTIVITY_NOT_SUSCEPTIBLE` label (~390 lines).
2. **HSBC sheet + advisor alert** — bank-scoped entry + fixtures, `evaluateBank` hook, `resolveProductStatus`, Phase A alert, second label (~260 lines).

A single PR is acceptable only if the real diff lands under 400 lines.

## Open Questions

- [ ] A global knockout renders as "Sin bancos activos para el destino y perfil" in `bank-comparison-tab.tsx`, because the empty-`bankResults` branch never reads `reasons`. This already affects every bureau knockout; adding `REASON_LABELS` keeps parity but does not fix it. Surfacing global reasons in that empty state is a separate change.
- [ ] `runPhaseC` copies prior Phase A results, so a case re-run through that path keeps a Phase A snapshot without the new alert. Phase C stays authoritative, so viability is still correct.
- [ ] Three primary-activity selectors remain (`resolveActivity`, `pickPrimaryIndependentActivity`, the two inline ones). This change adds no fourth, but consolidation stays deferred.
