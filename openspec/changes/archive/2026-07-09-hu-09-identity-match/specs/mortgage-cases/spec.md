# Delta for Mortgage Cases

## ADDED Requirements

### Requirement: Analyze Case Endpoint

The system SHALL provide `POST /mortgage-cases/:caseId/analyze` that triggers a synchronous `AnalysisRun` against the specified case. The endpoint SHALL return the complete `AnalysisResult` including `outcome`, `detail`, and `executionMetadata`.

#### Scenario: Successful analysis with PASS outcome

- GIVEN a mortgage case with documents where all identity fields match after normalization
- WHEN `POST /mortgage-cases/:caseId/analyze` is called
- THEN 200 with `AnalysisResult` containing `outcome: PASS`, `executionStatus: COMPLETED`, and structured `detail`

#### Scenario: Analysis with FAIL outcome

- GIVEN a mortgage case with an RFC mismatch between Official ID and Payroll
- WHEN `POST /mortgage-cases/:caseId/analyze` is called
- THEN 200 with `AnalysisResult` containing `outcome: FAIL`, `executionStatus: COMPLETED`, and `IDENTITY_MISMATCH` alert

#### Scenario: Non-existent case

- GIVEN no case exists for the provided ID
- WHEN `POST /mortgage-cases/nonexistent/analyze` is called
- THEN 404 with message "Mortgage case not found"

#### Scenario: Unauthenticated request

- GIVEN no valid JWT
- WHEN `POST /mortgage-cases/:caseId/analyze` is called
- THEN 401

### Requirement: Get Latest Analysis Endpoint

The system SHALL provide `GET /mortgage-cases/:caseId/analysis/latest` that returns the most recent `AnalysisRun` for the case, including structured `detail` (sources, fields, values, statuses, alerts).

#### Scenario: Latest analysis exists

- GIVEN a case with two completed AnalysisRuns
- WHEN `GET /mortgage-cases/:caseId/analysis/latest` is called
- THEN 200 with the most recent AnalysisRun and its full detail

#### Scenario: No analysis runs exist

- GIVEN a case with no AnalysisRuns
- WHEN `GET /mortgage-cases/:caseId/analysis/latest` is called
- THEN 200 with null or 404 with message "No analysis runs found"

### Requirement: Review Decision Endpoint

The system SHALL provide `POST /mortgage-cases/:caseId/analysis/:runId/review-decision` accepting actions: `MARK_FALSE_POSITIVE` (with justification), `CONFIRM_ISSUE`, `CANCEL_CASE`. The decision SHALL be stored separately without mutating the raw `AnalysisRun`.

#### Scenario: Mark false positive with justification

- GIVEN an AnalysisRun with outcome FAIL
- WHEN `POST /mortgage-cases/:caseId/analysis/:runId/review-decision` with `{ "action": "MARK_FALSE_POSITIVE", "justification": "..." }`
- THEN 200 with recorded decision; case status updates appropriately

#### Scenario: False positive without justification

- GIVEN an AnalysisRun with outcome FAIL
- WHEN the endpoint is called with `{ "action": "MARK_FALSE_POSITIVE" }` (no justification)
- THEN 400 with message "Justification required for false positive"

### Requirement: Financial Engine Advance Gate

The system SHALL gate automatic case advancement to the financial engine on the latest `AnalysisRun` outcome. If the latest outcome is `FAIL`, the case operational status SHALL be set to `REQUIRES_REVIEW`. This blocks ONLY automatic financial-engine advance; it does NOT block viewing, reviewing documents, reprocessing, or submitting a review decision.

#### Scenario: FAIL blocks automatic advance

- GIVEN a case with latest AnalysisRun outcome FAIL
- WHEN the system attempts automatic advancement to financial engine
- THEN advancement is blocked; case status remains REQUIRES_REVIEW

#### Scenario: PASS allows automatic advance

- GIVEN a case with latest AnalysisRun outcome PASS
- WHEN the system attempts automatic advancement to financial engine
- THEN advancement proceeds normally

#### Scenario: FAIL does not block manual actions

- GIVEN a case with latest AnalysisRun outcome FAIL
- WHEN the asesora views the case, reviews documents, or submits a review decision
- THEN all actions succeed; only automatic financial-engine advance is blocked

## MODIFIED Requirements

### Requirement: Case Status Lifecycle

The system SHALL support the `REQUIRES_REVIEW` status as a valid case status. This status is set automatically when an `AnalysisRun` outcome is `FAIL`. The system SHALL allow transitions from `REQUIRES_REVIEW` to subsequent statuses upon asesora review decision.
(Previously: Status lifecycle had 8 statuses ordered 1-8 without REQUIRES_REVIEW)

#### Scenario: Analysis FAIL sets REQUIRES_REVIEW

- GIVEN a case in `DATA_EXTRACTED` status
- WHEN analysis completes with outcome FAIL
- THEN case status transitions to `REQUIRES_REVIEW`

#### Scenario: Review decision resolves REQUIRES_REVIEW

- GIVEN a case in `REQUIRES_REVIEW` status
- WHEN asesora submits CONFIRM_ISSUE review decision
- THEN case status transitions to the next appropriate status per business rules
