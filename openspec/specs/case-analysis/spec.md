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

The system SHALL execute `CaseAnalysisService.run()` in three phases: (A) document-level rules (identity match, bankarization validation), (B) financial calculations (income + liability via injected services), (C) bank viability rule. Phase B SHALL inject `IncomeCalculationService` and `LiabilityCalculationService`. Phase C SHALL execute after Phase B completes so that income and liability snapshots are available.

#### Scenario: Three-phase execution completes in order

- GIVEN a mortgage case with documents
- WHEN `run()` is invoked
- THEN Phase A executes document rules, Phase B calculates income and liability, Phase C evaluates bank viability

#### Scenario: Phase B injects calculation services

- GIVEN `CaseAnalysisService` is instantiated
- WHEN `IncomeCalculationService` and `LiabilityCalculationService` are injected
- THEN `run()` calls both services during Phase B before executing bank viability

### Requirement: Income Fallback in Bank Viability

The system SHALL use `averageGrossIncome` and `averageNetIncome` as fallback values when `confirmedGrossIncome` and `confirmedNetIncome` are null during bank viability evaluation.

#### Scenario: Fallback to calculated averages

- GIVEN `confirmedGrossIncome` is null and `averageGrossIncome` is 18,000
- WHEN `BankViabilityRule` resolves income
- THEN it uses 18,000 as the gross income input

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


