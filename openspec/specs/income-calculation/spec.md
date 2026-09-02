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

### Requirement: PFAE Dual-Base Snapshot

PFAE `calculate()` MUST NOT 404 for missing payroll. Analyze MUST compute both bases. GET `/cases/:id/income/latest` MUST return `source` (`PAYROLL` | `BANK_STATEMENTS` | `TAX_RETURN`) and JSON `bases`. Prior rows SHALL backfill `source=PAYROLL`, `bases=null`.

#### Scenario: GET latest returns source and bases

- GIVEN a PFAE calculated snapshot
- WHEN GET `/cases/:id/income/latest` runs
- THEN `source` SHALL be PAYROLL, BANK_STATEMENTS, or TAX_RETURN and `bases` JSON

#### Scenario: PFAE analyze without payroll

- GIVEN a PFAE case with no payroll
- WHEN analyze calculates income
- THEN the call MUST NOT 404 and both bases SHALL be computed

### Requirement: Bank-Statement Base

Month = unique `YYYY-MM` of `statementPeriod.periodStartDate` (fallback end). Sum VALID post-cleaner income; exclude `isCurrentIncompleteMonth`; take most recent N; drop max AND min. Unique valid months < N ⇒ bank base INVALID. N=12 when resolved CSF activity (active, `endDate` null, highest percentage, tie → lower `order`) matches primaria / restaurantero / alimentos-y-bebidas; else 6.

| N | Mean after drop max+min | Forbidden |
|---|-------------------------|-----------|
| 6 | remaining 4 | plain mean of 6 |
| 12 | remaining 10 | plain mean of 12 |

#### Scenario: Six-month smoothing

- GIVEN N=6 and totals [10, 12, 14, 16, 18, 100]
- WHEN the bank base is computed
- THEN mean SHALL be 15 (drop 100 and 10), not 28.33

#### Scenario: Twelve-month smoothing

- GIVEN N=12 and totals [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 100]
- WHEN the bank base is computed
- THEN mean SHALL be 6.5 (drop 100 and 1), not 13.83

#### Scenario: Short window invalid

- GIVEN N=6 and 5 unique valid months
- WHEN the bank base is computed
- THEN bank base SHALL be INVALID

#### Scenario: CSF activity selects N

- GIVEN resolved CSF activity (active, `endDate` null, highest %, tie → lower `order`)
- WHEN the window is resolved
- THEN N SHALL be 12 if primaria / restaurantero / alimentos-y-bebidas, else 6

### Requirement: Tax Base, Default Source, and Review

Tax NETO MUST be `fiscalProfit/12`; BRUTO MUST be `accumulableIncomeTotal/12`. Fiscal loss MUST invalidate tax-return only; bank remains if valid. Default `source` MUST be BANK_STATEMENTS if valid, else TAX_RETURN if valid. Chosen figures MUST fill `averageGrossIncome` / `averageNetIncome`. Both invalid ⇒ `REQUIRES_REVIEW`, no throw; GET latest MUST succeed; `source` MUST be `BANK_STATEMENTS` (preferred default, not `PAYROLL`).

#### Scenario: Tax monthly conversion

- GIVEN fiscalProfit=120000, accumulableIncomeTotal=240000
- WHEN the tax base is computed
- THEN NETO SHALL be 10000 and BRUTO 20000

#### Scenario: Fiscal loss knocks out tax only

- GIVEN fiscal loss and a valid bank base
- WHEN PFAE income is calculated
- THEN tax-return SHALL be INVALID and source BANK_STATEMENTS

#### Scenario: Default source projection

- GIVEN both bases valid
- WHEN the snapshot is persisted
- THEN source SHALL be BANK_STATEMENTS and averages equal bank figures

#### Scenario: Tax source when bank invalid

- GIVEN bank INVALID and tax valid
- WHEN the snapshot is persisted
- THEN source SHALL be TAX_RETURN and averages equal tax figures

#### Scenario: Both invalid requires review

- GIVEN both PFAE bases INVALID
- WHEN income is calculated
- THEN status SHALL be REQUIRES_REVIEW, no throw, and GET latest succeeds
- AND source SHALL be BANK_STATEMENTS

### Requirement: SALARIED Payroll Path Unchanged

SALARIED averages MUST stay payroll-only Decimal means.

#### Scenario: SALARIED payroll regression

- GIVEN SALARIED included gross [15000.50, 14999.50]
- WHEN income is calculated
- THEN averageGrossIncome SHALL be 15000.00 and source PAYROLL
