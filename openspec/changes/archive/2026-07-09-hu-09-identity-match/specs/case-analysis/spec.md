# Case Analysis Specification

## Purpose

Module-level spec for the `case-analysis` domain: `AnalysisRun` lifecycle, `AnalysisRule` interface, `AnalysisResult` contract, and the orchestration service that executes rules against a mortgage case.

## Requirements

### Requirement: AnalysisRun Lifecycle

The system SHALL maintain an `AnalysisRun` record per execution with split status fields: `executionStatus` (PENDING | RUNNING | COMPLETED | ERROR) and `outcome` (PASS | PARTIAL | FAIL). Each invocation of the analysis endpoint SHALL create a new immutable `AnalysisRun` record. The raw result SHALL NOT be mutated after creation.

| Field | Type | Values |
|-------|------|--------|
| executionStatus | enum | PENDING, RUNNING, COMPLETED, ERROR |
| outcome | enum | PASS, PARTIAL, FAIL |
| detail | JSONB | Rule-specific structured output |
| reviewDecision | separate model | MARK_FALSE_POSITIVE, CONFIRM_ISSUE, CANCEL_CASE |

#### Scenario: Synchronous analysis creates completed run

- GIVEN a mortgage case with at least one document
- WHEN the asesora triggers `POST /mortgage-cases/:caseId/analyze`
- THEN a new `AnalysisRun` is created with `executionStatus: COMPLETED` and `outcome` determined by rule results

#### Scenario: Each invocation creates a new record

- GIVEN an existing `AnalysisRun` for a case
- WHEN the asesora triggers analysis again
- THEN a second `AnalysisRun` is created; the first record remains unchanged

#### Scenario: Review decision does not mutate raw result

- GIVEN an `AnalysisRun` with `outcome: FAIL`
- WHEN the asesora submits a review decision (MARK_FALSE_POSITIVE)
- THEN the `reviewDecision` is stored separately; the `AnalysisRun` outcome remains `FAIL`

### Requirement: AnalysisRule Interface

The system SHALL define an `AnalysisRule` interface that each rule implements. The orchestrator SHALL execute all registered rules sequentially and aggregate their results into a single `AnalysisResult`.

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

### Requirement: Review Decision Actions

The system SHALL accept three review decision actions from the asesora: `MARK_FALSE_POSITIVE` (requires justification), `CONFIRM_ISSUE`, `CANCEL_CASE`. Each decision SHALL be stored in a separate model without altering the original `AnalysisRun`.

#### Scenario: False positive requires justification

- GIVEN an AnalysisRun with outcome FAIL
- WHEN the asesora submits MARK_FALSE_POSITIVE without justification
- THEN the system returns 400 with "Justification required for false positive"

#### Scenario: Cancel case action

- GIVEN an AnalysisRun with outcome FAIL
- WHEN the asesora submits CANCEL_CASE
- THEN the case status transitions to CANCELLED and the decision is recorded
