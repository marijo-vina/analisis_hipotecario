# Delta for Income Calculation

## REMOVED Requirements

### Requirement: Manual Confirmation

(Reason: MVP eliminates manual confirmation workflow. Calculated averages are used directly by bank viability without human confirmation step.)
(Migration: `confirmedGrossIncome`, `confirmedNetIncome`, `confirmedBy`, `confirmedAt`, and `observations` columns remain in DB as nullable but are not written by new code. `ConfirmIncomeDto` and the `POST /cases/:caseId/income/confirm` endpoint are removed.)

### Requirement: Simple States

(Reason: Without manual confirmation, the CALCULATED → CONFIRMED transition no longer exists. Income snapshots remain in CALCULATED state permanently.)
(Migration: The `CONFIRMED` and `REQUIRES_REVIEW` states are no longer transitioned to. Existing confirmed snapshots retain their status for historical reads.)

## MODIFIED Requirements

### Requirement: Snapshot Persistence and Retrieval

The system MUST persist immutable snapshots. POST /cases/:caseId/income/calculate creates a new snapshot. GET /cases/:caseId/income/latest returns the most recent. Reopening the case MUST retrieve the latest snapshot correctly. The system MUST NOT re-execute conciliation rules during income calculation. Snapshots SHALL remain in CALCULATED state; no CONFIRMED transition occurs.

(Previously: Snapshots transitioned from CALCULATED to CONFIRMED upon manual confirmation.)

#### Scenario: Result retrieved when reopening case

- GIVEN a calculated snapshot exists for a case
- WHEN the case detail page reloads
- THEN GET /cases/:caseId/income/latest SHALL return the snapshot with calculated averages intact

#### Scenario: Conciliation rules not re-executed

- GIVEN payroll receipts with existing conciliation statuses
- WHEN income calculation triggers
- THEN the system SHALL NOT call the conciliation engine
- AND existing conciliation statuses SHALL remain unchanged
