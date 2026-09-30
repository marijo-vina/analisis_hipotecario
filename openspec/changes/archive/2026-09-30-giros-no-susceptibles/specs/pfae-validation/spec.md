# Delta for PFAE Validation

## ADDED Requirements

### Requirement: Non-Susceptible Activity Alert

When the primary independent CSF activity matches the global catalog, `PfaeValidationRule` MUST emit an ERROR alert `ACTIVITY_NOT_SUSCEPTIBLE` on field `activity` that names the matched label, and the outcome MUST be FAIL. The HSBC sheet MUST NOT raise this alert. Phase C MUST remain authoritative, and Phase Isolation MUST still hold.

#### Scenario: Excluded activity alerts

- GIVEN PFAE CSF with primary activity "Partidos políticos"
- WHEN the rule runs
- THEN it returns FAIL with an ERROR `ACTIVITY_NOT_SUSCEPTIBLE` alert on `activity`

#### Scenario: HSBC-only subsector silent

- GIVEN a PFAE construction activity
- WHEN the rule runs
- THEN no `ACTIVITY_NOT_SUSCEPTIBLE` alert is emitted
