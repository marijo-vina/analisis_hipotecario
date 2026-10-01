# Proposal: PFAE Validation Gates (HU-19b)

## Intent

PFAE Phase A today runs identity match only. PLAN-FASE requires CSF régimen, vigencia, arraigo, activity text, and bank coherence gates on `AnalysisRun` so downstream phases and HU-21 can consume a stable contract. This HU adds a deterministic rule without copying noisy document alerts or building Validaciones UI.

## Scope

### In Scope
- New `PfaeValidationRule` (`ruleId: pfae-validation`) re-deriving gates from CSF/bank fields
- Orchestrator registration: PFAE → `[IdentityMatchRule, PfaeValidationRule]`; SALARIED unchanged
- `detail.pfaeValidation` snapshot + `alerts[]`; `detail.fields: []`
- Unit tests for rule and orchestrator wiring
- Spec updates for `pfae-validation` and `case-analysis` Phased Orchestration

### Out of Scope
- Validaciones UI (HU-21), `ACTIVITY_UNMAPPED` / bank catalog (HU-20)
- CSF extraction changes; tax-loss alerts (HU-18); age+term (Phase C CMA)
- Changes to identity-match, income-calculation, bank-viability

## Capabilities

### New Capabilities
- `pfae-validation`: Phase A rule contract — gate inputs, outcomes, `detail.pfaeValidation` shape, alert codes

### Modified Capabilities
- `case-analysis`: Phased Orchestration — PFAE Phase A SHALL include `PfaeValidationRule` alongside identity match

## Approach

**Approach 2** — dedicated rule, not blind alert elevation. Read persisted CSF fields (`isSolelySalaried`, `tenureMonths`, `activityStartDate`, `issuance.isOlderThan3Months`, `activities[]`) and bank `cleanedDeposits[].trashCategory`. Ignore extraction `ARRAIGO_INSUFICIENTE` and tax-loss alerts. Rule no-ops PASS if `personType !== PFAE` (defensive).

| Gate | Outcome |
|------|---------|
| Solely salaried | FAIL / ERROR (escalates aggregate; does not block B/C) |
| Missing CSF | PARTIAL |
| Vigencia > 3 months | WARNING → PARTIAL |
| Tenure + activityStartDate | INFO only |
| SAT activity text | Persisted; no catalog match |
| `RENT_WITHOUT_CSF_REGIME` count > 0 | WARNING; omit if no statements |
| Otherwise | PASS |

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/src/case-analysis/rules/pfae-validation.rule.ts` | New | Rule + spec |
| `case-analysis.service.ts` | Modified | Register for PFAE Phase A |
| `case-analysis.module.ts` | Modified | Provider registration |
| `openspec/specs/case-analysis/spec.md` | Modified | Phased Orchestration delta |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Solely-salaried FAIL confuses until HU-21 UI | Med | Document in spec; backend-only this HU |
| `ARRAIGO_INSUFICIENTE` visible on CSF tab vs PLAN | Med | Do not copy into AnalysisRun |
| Coherence needs HU-17 depuration | Low | Omit coherence when no cleaned deposits |

## Rollback Plan

Remove `PfaeValidationRule` provider and PFAE registration in `resolvePhaseARules`. Revert spec deltas. No schema migration; existing runs unaffected.

## Dependencies

- HU-19a (identity branching), HU-17 (bank depuration), CSF extraction fields already persisted

## Success Criteria

- [ ] PFAE runs identity + pfae-validation; SALARIED unchanged
- [ ] Gates match locked outcome matrix; `detail.fields` stays empty
- [ ] Specs and tests cover all gate paths including missing CSF PARTIAL
