# Delta for Case Analysis

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Phased Orchestration

The system SHALL execute `CaseAnalysisService.run()` in three phases: (A) document-level rules (identity match, bankarization validation), (B) financial calculations (income + liability via injected services), (C) bank viability rule. Phase A results SHALL be passed to Phase C as typed `BankarizationFlags` to avoid stale DB reads. Phase B SHALL inject `IncomeCalculationService` and `LiabilityCalculationService`. Phase C SHALL execute after Phase B completes so that income and liability snapshots are available.
(Previously: Phase A results were not explicitly passed to Phase C; BankViabilityRule queried DB for stale flags.)

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

## REMOVED Requirements

### Requirement: BankViabilityRule derives Scotiabank flags from DB

(Reason: `deriveScotiabankFlags()` reads the latest persisted `AnalysisRun` which is stale during the current run — confirmed bug. Flags now come from Phase A result passed as parameter.)
(Migration: `deriveScotiabankFlags(caseId)` replaced by `deriveScotiabankFlags(flags: BankarizationFlags)`; no DB query needed.)
