# Income Calculation Specification

## Purpose

Calculation of admissible monthly income for salaried persons from structured payroll receipts, with receipt selection, gross/net averages, and immutable snapshots that remain in CALCULATED state (no manual confirmation required).

## Requirements

### Requirement: Payroll Receipt Display

The system MUST display all payroll receipts for a salaried mortgage case in a table with: include checkbox, period, payment date (or "No identificada" if missing), employer, employer RFC, gross income, net income, conciliation status, and review status.

| Column | Source | Empty handling |
|--------|--------|--------------|
| Period | extractedData.period | Show as-is |
| Payment date | extractedData.paymentDate | "No identificada" |
| Employer | extractedData.employer | Show as-is |
| Employer RFC | extractedData.employerRfc | Show as-is or blank |
| Gross income | extractedData.grossIncome | Show as-is |
| Net income | extractedData.netIncome | Show as-is |

#### Scenario: Receipt with missing payment date

- GIVEN a payroll receipt with paymentDate = null
- WHEN the income table renders
- THEN the payment date cell SHALL display "No identificada"
- AND the receipt SHALL remain eligible for inclusion

#### Scenario: All receipts shown

- GIVEN a case with 3 PAYROLL_RECEIPT documents
- WHEN the income section loads
- THEN all 3 receipts SHALL appear in the table

### Requirement: Receipt Inclusion and Exclusion

The system MUST allow the advisor to include or exclude any receipt from the average calculation via checkbox. Excluded receipts MUST NOT contribute to averages. The system MUST prevent calculation when zero receipts are selected.

#### Scenario: Exclude receipt recalculates averages

- GIVEN 3 receipts with gross = [10,000, 20,000, 30,000] and all included
- WHEN the advisor excludes the third receipt
- THEN averageGross SHALL recalculate to 15,000 (from 20,000)
- AND averageNet SHALL recalculate accordingly

#### Scenario: Cannot calculate without selected receipts

- GIVEN zero receipts included
- WHEN the advisor attempts to calculate
- THEN the system SHALL return 400 with "At least one receipt must be selected"

### Requirement: Average Calculation

The system MUST calculate averageGrossIncome = sum(gross of included) / includedCount and averageNetIncome = sum(net of included) / includedCount using Decimal arithmetic, rounding to 2 decimal places.

#### Scenario: Gross average calculated correctly

- GIVEN included receipts with gross = [15,000.50, 14,999.50]
- WHEN the system calculates
- THEN averageGrossIncome SHALL be 15,000.00

#### Scenario: Net average calculated correctly

- GIVEN included receipts with net = [12,000.33, 11,999.67]
- WHEN the system calculates
- THEN averageNetIncome SHALL be 12,000.00

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

### Requirement: UI Placement

The "Cálculo de ingresos" section MUST appear BELOW "Cálculo de pasivos" in the Motor Financiero tab.

#### Scenario: Section ordering

- GIVEN the Motor Financiero tab renders
- WHEN both liability and income sections are present
- THEN the income section SHALL appear immediately after the liability section
