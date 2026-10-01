# Delta for Case Analysis

## ADDED Requirements

### Requirement: PFAE Phase C Viability

PFAE Phase C MUST use `personType` only, then latest `source`/`bases`. Factor MUST apply after the chosen base on BOTH paths. Cálculo MUST stay unfactored. MATRIX unmapped MUST be REQUIRES_REVIEW/`ACTIVITY_UNMAPPED` (MUST NOT invent 1.0). Banorte FLAT 0.6; HSBC NONE 1.0. TAX_RETURN MAY use `factorTaxReturn`; BX+ MAY use `factorEstados` ≠ `factorDeclaracion`. TAX_RETURN+REJECTED MUST be NOT_COMPATIBLE; NOT_PREFERRED MUST be CONDITIONED and continue. PFAE tenure MUST use CSF `activityStartDate` vs `minimumActivityTenureMonths`; missing date + set policy MUST be REQUIRES_REVIEW. Filled PFAE CMA cells MUST win; empty MUST use salaried. SALARIED MUST keep hire-date tenure and unfactored CE (Mifel 0.50). Knockouts, CE, CMA, and Scotiabank pagadora MUST still run. Full `run()` Phase A MUST remain IdentityMatchRule plus PfaeValidationRule for PFAE.

#### Scenario: Locked factor and tax policies

- GIVEN PFAE with a chosen source
- WHEN Phase C runs
- THEN Banorte ×0.6, HSBC ×1.0, MATRIX unmapped REQUIRES_REVIEW, Scotiabank tax REJECTED NOT_COMPATIBLE, Banorte NOT_PREFERRED CONDITIONED

#### Scenario: Tenure, CMA, SALARIED

- GIVEN CSF start date and optional PFAE CMA cells
- WHEN Phase C checks
- THEN PFAE uses activity tenure and filled cells; SALARIED keeps hire-date tenure and unfactored CE

### Requirement: Phase-C-Only Re-run

`runPhaseC` MUST create a new AnalysisRun from latest income/liability, copy prior Phase A `ruleResults`, and run BankViabilityRule only.

#### Scenario: Copy Phase A

- GIVEN a prior full run
- WHEN `runPhaseC` executes
- THEN the new run copies Phase A and stores new bank-viability
