# Delta for Case Analysis

## ADDED Requirements

### Requirement: PFAE Non-Susceptible Activity Knockout

When `personType` is PFAE, Phase C MUST compare the primary independent CSF activity (highest percentage, excluding sueldos y salarios, per `pickPrimaryIndependentActivity`) against the global catalog. This MUST happen after the universal bureau knockouts and before the policy query and any factor lookup. On a match, the outcome MUST be `FAIL` with global reason `ACTIVITY_NOT_SUSCEPTIBLE`, the matched label in the snapshot, and `bankResults: []`, on every destination. The system MUST NOT apply a factor of 0. SALARIED cases MUST skip this check. Eligible activities MUST keep each bank's current factor, and HSBC MUST stay `NONE` / 1.0.

#### Scenario: Excluded giro knocks out

- GIVEN PFAE with primary activity "Minería de carbón"
- WHEN Phase C runs for any destination
- THEN outcome is `FAIL`, reasons include `ACTIVITY_NOT_SUSCEPTIBLE`, and `bankResults` is empty

#### Scenario: Evaluated before factor

- GIVEN a Mifel alias `mineria` with factor 0.35
- WHEN a PFAE mining giro runs
- THEN no Mifel factor is applied and no `BankResult` is produced

#### Scenario: Salaried secondary activity ignored

- GIVEN CSF with "Sueldos y salarios" at 60% and an eligible activity at 40%
- WHEN Phase C runs
- THEN the eligible 40% activity is compared

#### Scenario: Eligible giro unchanged

- GIVEN PFAE with an eligible activity
- WHEN Phase C runs
- THEN the factors match pre-change behavior and HSBC applies 1.0

#### Scenario: SALARIED unaffected

- GIVEN SALARIED with a CSF mining activity
- WHEN Phase C runs
- THEN no exclusion reason is emitted

### Requirement: HSBC Liquidity Activity Restriction

Inside per-bank evaluation, an active HSBC LIQUIDITY policy for PFAE whose primary activity matches the HSBC sheet MUST add `HSBC_LIQUIDITY_ACTIVITY_RESTRICTED`. `resolveProductStatus` MUST map it to `NOT_COMPATIBLE`, ahead of REQUIRES_REVIEW, CONDITIONED, and PRELIMINARY_VIABLE. Other banks and destinations MUST be unaffected. `PersonType` MUST NOT gain PM. `HSBC_LIQ` MUST stay inactive in seed.

#### Scenario: Active HSBC liquidity rejects

- GIVEN a mocked active HSBC LIQUIDITY policy and a PFAE construction activity
- WHEN Phase C runs
- THEN the HSBC result is `NOT_COMPATIBLE` with `HSBC_LIQUIDITY_ACTIVITY_RESTRICTED`

#### Scenario: Other bank or destination

- GIVEN a PFAE construction activity
- WHEN evaluating a non-HSBC bank, or HSBC ACQUISITION or MORTGAGE_REPLACEMENT
- THEN the restriction reason is absent

#### Scenario: Inactive HSBC liquidity

- GIVEN seeded `HSBC_LIQ` with `isActive: false`
- WHEN a PFAE LIQUIDITY case runs
- THEN no HSBC liquidity offer or HSBC result appears
