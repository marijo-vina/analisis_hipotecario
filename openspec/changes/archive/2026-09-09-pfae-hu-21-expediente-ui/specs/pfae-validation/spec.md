# Delta for PFAE Validation

## ADDED Requirements

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
