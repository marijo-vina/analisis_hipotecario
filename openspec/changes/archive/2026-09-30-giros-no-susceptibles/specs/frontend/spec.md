# Delta for Frontend

## ADDED Requirements

### Requirement: Non-Susceptible Reason Labels

`REASON_LABELS` MUST map `ACTIVITY_NOT_SUSCEPTIBLE` and `HSBC_LIQUIDITY_ACTIVITY_RESTRICTED` to Spanish labels. Raw codes MUST NOT render.

#### Scenario: Codes translated

- GIVEN a result with either code
- WHEN Comparativa renders the reasons
- THEN it shows the Spanish labels
