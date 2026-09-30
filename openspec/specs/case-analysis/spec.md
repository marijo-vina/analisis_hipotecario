# Case Analysis Specification

## Purpose

Module-level spec for the `case-analysis` domain: `AnalysisRun` lifecycle, `AnalysisRule` interface, `AnalysisResult` contract, and the orchestration service that executes rules against a mortgage case.

## Requirements

### Requirement: AnalysisRun Lifecycle

The system SHALL maintain an `AnalysisRun` record per execution with split status fields: `executionStatus` (PENDING | RUNNING | COMPLETED | ERROR) and `outcome` (PASS | PARTIAL | FAIL). Each invocation of the analysis endpoint SHALL create a new immutable `AnalysisRun` record. The raw result SHALL NOT be mutated after creation. The `run()` method SHALL orchestrate income and liability calculation services as part of Phase B execution.

(Previously: AnalysisRun tracked review decisions separately and did not orchestrate income/liability calculations.)

| Field | Type | Values |
|-------|------|--------|
| executionStatus | enum | PENDING, RUNNING, COMPLETED, ERROR |
| outcome | enum | PASS, PARTIAL, FAIL |
| detail | JSONB | Rule-specific structured output |

#### Scenario: Synchronous analysis creates completed run

- GIVEN a mortgage case with at least one document
- WHEN the asesora triggers `POST /mortgage-cases/:caseId/analyze`
- THEN a new `AnalysisRun` is created with `executionStatus: COMPLETED` and `outcome` determined by rule results

#### Scenario: Each invocation creates a new record

- GIVEN an existing `AnalysisRun` for a case
- WHEN the asesora triggers analysis again
- THEN a second `AnalysisRun` is created; the first record remains unchanged

### Requirement: AnalysisRule Interface

The system SHALL define an `AnalysisRule` interface that each rule implements. The orchestrator SHALL execute all registered rules sequentially and aggregate their results into a single `AnalysisResult`. Rules SHALL NOT transition the case to `REQUIRES_REVIEW` status on FAIL — analysis produces results but does not gate case progression.

(Previously: Rules could transition case to REQUIRES_REVIEW status on FAIL.)

| Property | Description |
|----------|-------------|
| ruleId | Unique identifier (e.g., "identity-match") |
| severity | ERROR, WARNING, INFO |
| outcome | PASS, PARTIAL, FAIL |
| detail | Structured output with sources[], fields[] |

#### Scenario: Rule returns structured detail

- GIVEN an executed rule
- WHEN the rule completes
- THEN `detail` contains `sources[]` (document types involved) and `fields[]` (per-field comparisons)

#### Scenario: Orchestrator aggregates multiple rules

- GIVEN two registered rules (identity-match, income-match)
- WHEN the orchestrator runs analysis
- THEN both rules execute and results are aggregated into a single `AnalysisResult`

### Requirement: Phased Orchestration

The system SHALL execute `CaseAnalysisService.run()` in three phases: (A) document-level rules (identity match, bankarization validation, PFAE validation), (B) financial calculations (income + liability via injected services), (C) bank viability rule. Phase A results SHALL be passed to Phase C as typed `BankarizationFlags` to avoid stale DB reads. Phase B SHALL inject `IncomeCalculationService` and `LiabilityCalculationService`. Phase C SHALL execute after Phase B completes so that income and liability snapshots are available. The Phase A rule set (`phaseARules`) SHALL be resolved per-request based on `mortgageCase.personType`, not fixed at construction time. For `personType` = PFAE, `BankarizationValidationRule` SHALL be excluded from execution entirely (an explicit orchestrator decision, not an implicit empty-PASS side effect); Phase A SHALL execute `IdentityMatchRule` AND `PfaeValidationRule`. For `personType` = SALARIED (or absent/unrecognized), both `IdentityMatchRule` and `BankarizationValidationRule` SHALL execute, unchanged; `PfaeValidationRule` MUST NOT execute. The context object (`client`) spread into every Phase A rule SHALL include `personType` sourced from `mortgageCase.personType`. For `personType` = PFAE, Phase B MUST persist an income snapshot; missing payroll MUST NOT fail Phase B. Phase A FAIL from any rule MUST NOT block Phase B or Phase C.
(Previously: PFAE Phase A executed only `IdentityMatchRule`; bankarization was excluded but pfae-validation was not registered.)

#### Scenario: Three-phase execution completes in order

- GIVEN a mortgage case with documents
- WHEN `run()` is invoked
- THEN Phase A executes document rules, Phase B calculates income and liability, Phase C evaluates bank viability

#### Scenario: Phase A flags passed to Phase C

- GIVEN Phase A produces `bankarization-validation` with `hasPagadoraIncome` and `scotiabankExcluded`
- WHEN Phase C executes `BankViabilityRule`
- THEN the rule receives fresh flags from the current run, not from a previous persisted `AnalysisRun`

#### Scenario: Phase B injects calculation services

- GIVEN `CaseAnalysisService` is instantiated
- WHEN `IncomeCalculationService` and `LiabilityCalculationService` are injected
- THEN `run()` calls both services during Phase B before executing bank viability

#### Scenario: PFAE case skips BankarizationValidationRule

- GIVEN a mortgage case with `personType: "PFAE"`
- WHEN `run()` resolves `phaseARules` for this request
- THEN `IdentityMatchRule` and `PfaeValidationRule` execute in Phase A
- AND `BankarizationValidationRule.execute()` is never invoked

#### Scenario: PFAE Phase A runs identity and pfae-validation

- GIVEN a mortgage case with `personType: "PFAE"`
- WHEN `run()` executes Phase A
- THEN both `IdentityMatchRule` and `PfaeValidationRule` execute sequentially
- AND bankarization validation remains excluded from Phase A

#### Scenario: SALARIED case runs both Phase A rules (regression)

- GIVEN a mortgage case with `personType: "SALARIED"`
- WHEN `run()` resolves `phaseARules` for this request
- THEN both `IdentityMatchRule` and `BankarizationValidationRule` execute, matching prior behavior
- AND `PfaeValidationRule` is not invoked

#### Scenario: Rule context includes personType

- GIVEN any mortgage case
- WHEN `CaseAnalysisService` builds the `client` context object for Phase A rules
- THEN the object includes `personType` equal to `mortgageCase.personType`

#### Scenario: PFAE Phase B persists income snapshot without payroll

- GIVEN a PFAE case with no payroll receipts
- WHEN `run()` executes Phase B
- THEN an income snapshot SHALL be persisted
- AND Phase B SHALL NOT fail for missing payroll

### Requirement: Income Fallback in Bank Viability

The system SHALL use `averageGrossIncome` and `averageNetIncome` as fallback values when `confirmedGrossIncome` and `confirmedNetIncome` are null during bank viability evaluation.

#### Scenario: Fallback to calculated averages

- GIVEN `confirmedGrossIncome` is null and `averageGrossIncome` is 18,000
- WHEN `BankViabilityRule` resolves income
- THEN it uses 18,000 as the gross income input

### Requirement: BankarizationFlags Interface

The system SHALL define a `BankarizationFlags` interface with `{ hasPagadoraIncome: boolean; scotiabankExcluded: boolean }` to carry Phase A bankarization-validation results into Phase C without querying the database.

#### Scenario: Flags interface is defined and typed

- GIVEN the `BankViabilityRule` needs Phase A results
- WHEN the interface is defined
- THEN it contains exactly `hasPagadoraIncome` and `scotiabankExcluded` boolean fields

#### Scenario: Default flags when Phase A result is absent

- GIVEN no `bankarization-validation` result is available
- WHEN flags are resolved
- THEN both fields default to `false`

### Requirement: BankViability in POST Response

The system SHALL include `bankViability` inside `detail.bankViability` of the POST `/analyze` response payload, matching the structure returned by GET `/analysis/latest`.

#### Scenario: POST response includes bankViability

- GIVEN a completed analysis run with BankViabilityRule executed
- WHEN `POST /mortgage-cases/:caseId/analyze` returns
- THEN `detail.bankViability` contains a `BankViabilitySnapshot` with `productMatches`, `inputs`, `calculatedAt`, and `warningLegend`

#### Scenario: POST and GET expose identical bankViability structure

- GIVEN the same analysis run
- WHEN comparing `detail.bankViability` from POST response and GET `/analysis/latest`
- THEN both contain the same `BankViabilitySnapshot` shape with identical fields

### Requirement: AnalysisResult Contract

The system SHALL return an `AnalysisResult` containing: `runId`, `executionStatus`, `outcome`, `summary`, `detail` (stable structure), and `executionMetadata` (timestamp, triggeredBy).

| Field | Type | Description |
|-------|------|-------------|
| runId | string | UUID of the AnalysisRun |
| executionStatus | enum | PENDING, RUNNING, COMPLETED, ERROR |
| outcome | enum | PASS, PARTIAL, FAIL |
| summary | string | Human-readable outcome summary |
| detail | object | sources[], fields[] with per-field status |
| executionMetadata | object | timestamp, triggeredBy (asesora ID) |

#### Scenario: Result includes all required fields

- GIVEN a completed analysis
- WHEN the result is returned
- THEN it contains runId, executionStatus, outcome, summary, detail, and executionMetadata

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

### Requirement: BankResult Factor Audit

Phase C MUST persist additive per-bank audit on `BankResult`: `appliedFactor`, `factorMode`, `matchedNativeLabel`, `satDescription`, `taxReturnPolicy`. SALARIED values MUST be unused or null. Phase C factor math MUST NOT change. Comparativa MUST read these fields from the persisted result and MUST NOT reconstruct them.

#### Scenario: PFAE audit persisted

- GIVEN Phase C evaluates a PFAE product
- WHEN the `BankResult` is stored
- THEN it includes `appliedFactor`, `factorMode`, `matchedNativeLabel`, `satDescription`, and `taxReturnPolicy` from the same evaluation

#### Scenario: Unmapped giro audit

- GIVEN MATRIX activity unmapped
- WHEN the `BankResult` is stored
- THEN audit reflects unmapped (MUST NOT invent factor 1.0) and `satDescription` still persists if present

#### Scenario: SALARIED unused

- GIVEN a SALARIED Phase C run
- WHEN the `BankResult` is stored
- THEN audit fields are null or unused and CE remains unfactored

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


