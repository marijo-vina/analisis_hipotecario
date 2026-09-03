# Tasks: PFAE Validation Gates (HU-19b)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~280–350 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single work unit on `feature/pfae-hu-19b-validation-gates` |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Notes |
|------|------|-------|
| 1 | Types + rule + tests + orchestrator wiring | Single tanda on HU branch; no stacked PRs |

## Phase 1: Foundation

- [x] 1.1 Create `apps/api/src/case-analysis/types/pfae-validation.types.ts` — `PfaeGateOutcome`, `PfaeValidationSnapshot` per design contract

## Phase 2: Rule (TDD)

- [x] 2.1 **RED** — Create `apps/api/src/case-analysis/rules/pfae-validation.rule.spec.ts`; copy `doc()` helper from identity spec; add failing tests: solely salaried FAIL; missing CSF PARTIAL; vigencia WARNING not FAIL; tenure 12mo INFO not FAIL (ignore `ARRAIGO_INSUFICIENTE`); `RENT_WITHOUT_CSF_REGIME` WARNING; omit coherence without cleaned deposits; SALARIED context empty PASS; tax-loss alerts ignored; `detail.fields` always empty
- [x] 2.2 **GREEN** — Create `apps/api/src/case-analysis/rules/pfae-validation.rule.ts` — `ruleId: pfae-validation`, CSF/bank field reads, gate escalation, alert codes, defensive non-PFAE PASS

## Phase 3: Orchestrator Wiring

- [x] 3.1 Register `PfaeValidationRule` provider in `apps/api/src/case-analysis/case-analysis.module.ts`
- [x] 3.2 Inject rule in `apps/api/src/case-analysis/case-analysis.service.ts`; PFAE `resolvePhaseARules` → `[identityMatch, pfaeValidation]`; SALARIED unchanged

## Phase 4: Integration Tests

- [x] 4.1 Extend `apps/api/src/case-analysis/case-analysis.service.spec.ts` — mock `PfaeValidationRule`; PFAE Phase A invokes pfae-validation not bankarization; SALARIED regression unchanged (identity + bankarization, no pfae-validation)

## Phase 5: Verification

- [x] 5.1 Run rule + service specs; confirm all spec scenarios pass and no UI/extraction/schema changes
