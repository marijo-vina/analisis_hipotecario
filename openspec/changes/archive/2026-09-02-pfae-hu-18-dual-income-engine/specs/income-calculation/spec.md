# Delta for Income Calculation

## ADDED Requirements

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
