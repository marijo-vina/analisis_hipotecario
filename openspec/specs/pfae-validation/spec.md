# PFAE Validation Specification

## Purpose

Phase A rule contract for PFAE cases: deterministic CSF and bank coherence gates on `AnalysisRun` without elevating document extraction noise.

## Requirements

### Requirement: Rule Identity and Scope

The system SHALL implement `PfaeValidationRule` with `ruleId: pfae-validation`. When invoked with `personType` other than PFAE, the rule SHALL return empty PASS. The orchestrator MUST NOT register this rule for SALARIED cases.

#### Scenario: PFAE context executes gates

- GIVEN a mortgage case with `personType: PFAE` and CSF extracted data
- WHEN `PfaeValidationRule` executes
- THEN it evaluates gates and returns a structured result with `ruleId: pfae-validation`

#### Scenario: Non-PFAE context no-ops

- GIVEN execution context with `personType: SALARIED`
- WHEN `PfaeValidationRule` executes defensively
- THEN outcome is PASS with empty gate snapshot

### Requirement: Detail Contract

`detail.fields` MUST remain empty. Gate data SHALL live in `detail.pfaeValidation` and `alerts[]`. `detail.sources` SHALL include `csf` and `bank-statement` when bank statements exist.

#### Scenario: Snapshot not flattened to fields

- GIVEN a completed pfae-validation run with gate outcomes
- WHEN the rule result is persisted
- THEN `detail.fields` is empty and `detail.pfaeValidation` contains regime, tenure, vigencia, activity, and coherence sections

### Requirement: Gate Outcome Matrix

Gates SHALL re-derive outcomes from persisted CSF and bank fields, not by copying document `alerts[]`. Tax-loss alerts MUST be ignored. Extraction `ARRAIGO_INSUFICIENTE` MUST NOT be copied into Phase A alerts or outcomes.

| Gate | Outcome | Severity |
|------|---------|----------|
| Solely salaried (`isSolelySalaried`) | FAIL | ERROR |
| Missing CSF extractedData | PARTIAL | — |
| Vigencia > 3 months | PARTIAL | WARNING |
| Tenure months + activityStartDate | no escalation | INFO |
| SAT activity text | persisted only | — |
| `RENT_WITHOUT_CSF_REGIME` count > 0 | PARTIAL | WARNING |
| Otherwise | PASS | — |

`ACTIVITY_UNMAPPED` MUST NOT be evaluated. Tenure MUST NOT FAIL against 24 months or bank CMA minimums. Coherence MUST be omitted (not FAIL) when no cleaned deposits or no bank statements exist.

#### Scenario: Solely salaried fails

- GIVEN CSF with `isSolelySalaried: true`
- WHEN pfae-validation runs
- THEN rule outcome is FAIL with ERROR alert and `detail.pfaeValidation.regime.outcome: FAIL`

#### Scenario: Missing CSF is partial

- GIVEN a PFAE case with no CSF extractedData
- WHEN pfae-validation runs
- THEN outcome is PARTIAL with empty snapshot and no régimen FAIL

#### Scenario: Stale CSF vigencia warns

- GIVEN CSF with `issuance.isOlderThan3Months: true`
- WHEN pfae-validation runs
- THEN outcome is PARTIAL with WARNING vigencia alert; aggregate MUST NOT become FAIL from vigencia alone

#### Scenario: Tenure is informational only

- GIVEN CSF with `tenureMonths: 12` and document alert `ARRAIGO_INSUFICIENTE`
- WHEN pfae-validation runs
- THEN tenure is INFO-only in snapshot and alerts; outcome MUST NOT escalate for low tenure

#### Scenario: Rent without régimen warns

- GIVEN bank statements with cleaned deposits where `trashCategory: RENT_WITHOUT_CSF_REGIME` count > 0
- WHEN pfae-validation runs
- THEN outcome is PARTIAL with WARNING coherence alert

#### Scenario: No statements omits coherence

- GIVEN a PFAE case with no bank statements or no cleaned deposits
- WHEN pfae-validation runs
- THEN coherence section is omitted and no coherence FAIL or WARNING is emitted

### Requirement: Phase Isolation

A FAIL outcome from pfae-validation MUST NOT prevent Phase B or Phase C from executing in the same `run()` invocation.

#### Scenario: Phase A fail does not block later phases

- GIVEN pfae-validation returns FAIL for solely salaried
- WHEN `CaseAnalysisService.run()` continues
- THEN Phase B and Phase C still execute

### Requirement: AnalysisAlert Mapping

Each gate alert SHALL map to an `AnalysisAlert` with `ruleCode`, `severity` (ERROR | WARNING | INFO), `field`, and `message`. Alert codes SHALL include at minimum: `REGIMEN_EXCLUSIVAMENTE_ASALARIADO` (ERROR), `VIGENCIA_MAYOR_3_MESES` (WARNING), tenure INFO alert, and `RENT_WITHOUT_CSF_REGIME` (WARNING) when applicable.

#### Scenario: Alerts persisted for downstream UI

- GIVEN pfae-validation emits gate alerts
- WHEN the analysis run is saved
- THEN corresponding `AnalysisAlert` rows exist with matching severity and ruleCode
