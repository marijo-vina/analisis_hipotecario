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

Gates SHALL re-derive from persisted CSF and bank fields, not document `alerts[]`. Tax-loss MUST be ignored. `ARRAIGO_INSUFICIENTE` MUST NOT be copied into Phase A. Solely salaried MUST FAIL ERROR. Missing CSF MUST be PARTIAL. Vigencia > 3 months MUST be PARTIAL WARNING. Tenure MUST stay INFO and MUST NOT FAIL vs 24 months or bank CMA. SAT activity text MUST persist. Unmapped MATRIX giro MUST be PARTIAL WARNING `ACTIVITY_UNMAPPED`. `RENT_WITHOUT_CSF_REGIME` > 0 MUST be PARTIAL WARNING. Else PASS. Coherence MUST be omitted when no cleaned deposits/statements. Render is HU-21.

(Previously: ACTIVITY_UNMAPPED MUST NOT be evaluated.)

#### Scenario: Solely salaried fails

- GIVEN `isSolelySalaried: true`
- WHEN the rule runs
- THEN FAIL ERROR

#### Scenario: Missing CSF is partial

- GIVEN no CSF extractedData
- WHEN the rule runs
- THEN PARTIAL with empty snapshot

#### Scenario: Stale CSF vigencia warns

- GIVEN vigencia older than 3 months
- WHEN the rule runs
- THEN PARTIAL WARNING; MUST NOT FAIL

#### Scenario: Tenure is informational only

- GIVEN `tenureMonths: 12` and `ARRAIGO_INSUFICIENTE`
- WHEN the rule runs
- THEN tenure is INFO-only; MUST NOT escalate

#### Scenario: Rent without régimen warns

- GIVEN `RENT_WITHOUT_CSF_REGIME` > 0
- WHEN the rule runs
- THEN PARTIAL WARNING coherence

#### Scenario: No statements omits coherence

- GIVEN no statements or cleaned deposits
- WHEN the rule runs
- THEN coherence is omitted

#### Scenario: Unmapped activity persists warning

- GIVEN CSF activity with no MATRIX alias
- WHEN the rule runs
- THEN `ACTIVITY_UNMAPPED` WARNING persists; render is out of scope

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

### Requirement: Validaciones Gate Render

For PFAE, Validaciones MUST show gates from the persisted `pfae-validation` snapshot and `alerts`. Tenure MUST remain informational. The UI MUST NOT recompute gate outcomes. Gate Outcome Matrix engine behavior is unchanged.

#### Scenario: Gates from persisted snapshot

- GIVEN a PFAE analysis with `ruleResults["pfae-validation"]` and alerts
- WHEN Validaciones renders
- THEN a gates Card shows regime, vigencia, tenure (INFO), activity, and coherence from that snapshot/alerts

#### Scenario: No CSF

- GIVEN persisted PARTIAL missing-CSF snapshot/alerts
- WHEN Validaciones renders
- THEN the gates Card shows that PARTIAL missing-CSF outcome

#### Scenario: Unmapped giro warning

- GIVEN persisted `ACTIVITY_UNMAPPED` WARNING
- WHEN Validaciones renders
- THEN the gates Card shows that warning, including which MATRIX banks matched and which remain unmapped

#### Scenario: FAIL régimen

- GIVEN persisted `REGIMEN_EXCLUSIVAMENTE_ASALARIADO` FAIL
- WHEN Validaciones renders
- THEN the Card shows FAIL and does not present the PFAE path as passing
