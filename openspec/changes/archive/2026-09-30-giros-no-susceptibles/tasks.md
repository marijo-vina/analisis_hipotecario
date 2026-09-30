# Tasks: Non-susceptible economic activities (giros no susceptibles)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~650 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (global knockout) → PR 2 (HSBC sheet + Phase A) |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

```text
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High
```

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Global 13 + Phase C knockout + global label | PR 1 | Base `feature/giros-no-susceptibles`; no HSBC sheet or Phase A |
| 2 | HSBC LIQUIDITY sheet + Phase A ERROR + HSBC label | PR 2 | Mock active HSBC liquidity in tests; base per chain strategy |

---

## Work Unit 1: Global PFAE exclusions

### Phase 1: Catalog (TDD)

- [x] 1.1 **RED** — `non-susceptible-activities.spec.ts`: pin 13 codes; global match +/- fixtures (`bares`/`armas` substring, arquitectura/ingeniería eligible); use exported `normalizeSatText` from `./activity-factor-match`.
- [x] 1.2 **GREEN** — `non-susceptible-activities.ts`: 13 `GLOBAL` entries + `matchGlobalNonSusceptibleActivity` (word boundaries). No HSBC entry. Do not edit `activity-factor-match.ts`.
- [x] 1.3 **REFACTOR** — Align aliases with `docs/bank-policies-matrix.md`; keep spec green.

### Phase 2: Types + Phase C (TDD)

- [x] 1.4 **GREEN** — `bank-viability.types.ts`: optional snapshot `nonSusceptibleActivity` (label only).
- [x] 1.5 **RED** — `bank-viability.rule.spec.ts`: excluded PFAE → `FAIL`, `ACTIVITY_NOT_SUSCEPTIBLE`, empty `bankResults`; no Mifel factor on mining; salaried/eligible unchanged.
- [x] 1.6 **GREEN** — `bank-viability.rule.ts`: `pickPrimaryIndependentActivity`; global match after bureau knockouts, before policy query, PFAE only.

### Phase 3: Frontend + verify

- [x] 1.7 **GREEN** — `apps/web/app/lib/definitions.ts`: `ACTIVITY_NOT_SUSCEPTIBLE` label.
- [x] 1.8 **Verify WU1** — Run matcher + bank-viability specs; no schema/seed/admin/banks.service; no unrelated dirty files.

---

## Work Unit 2: HSBC sheet + Phase A alert

### Phase 1: Bank-scoped catalog (TDD)

- [x] 2.1 **RED** — Extend matcher spec: HSBC four subsectors (`LIQUIDITY`, `personTypes` PFAE+PM stored); scoped hit/miss; no arquitecto/ingeniero false positives.
- [x] 2.2 **GREEN** — Add HSBC entry + `matchBankScopedNonSusceptibleActivity`; runtime PFAE only; no `PersonType` PM.

### Phase 2: Rules + types (TDD)

- [x] 2.3 **GREEN** — Types: optional `matchedExclusionLabel` on `BankResult`; optional `nonSusceptible` on Phase A `activity`.
- [x] 2.4 **RED** — `bank-viability.rule.spec.ts`: mocked active HSBC LIQUIDITY → `NOT_COMPATIBLE` + `HSBC_LIQUIDITY_ACTIVITY_RESTRICTED`; other banks/destinations clean; inactive seed path unchanged.
- [x] 2.5 **GREEN** — `evaluateBank` scoped check; `resolveProductStatus` precedence; leave `resolvePfaeFactor` untouched.
- [x] 2.6 **RED** — `pfae-validation.rule.spec.ts`: global excluded → ERROR on `activity`; construction-only → no global alert.
- [x] 2.7 **GREEN** — `pfae-validation.rule.ts`: global match via `pickPrimaryIndependentActivity`.

### Phase 3: Frontend + verify

- [x] 2.8 **GREEN** — `definitions.ts`: `HSBC_LIQUIDITY_ACTIVITY_RESTRICTED` label.
- [x] 2.9 **Verify WU2** — Run all three case-analysis spec files; `HSBC_LIQ` stays inactive in seed.
