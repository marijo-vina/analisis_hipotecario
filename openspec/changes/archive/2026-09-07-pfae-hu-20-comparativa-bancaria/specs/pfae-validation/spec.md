# Delta for PFAE Validation

## MODIFIED Requirements

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
