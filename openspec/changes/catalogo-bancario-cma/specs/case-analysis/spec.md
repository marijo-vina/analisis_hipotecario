# Delta for Case Analysis

## MODIFIED Requirements

### Requirement: Income Fallback in Bank Viability

The system SHALL use `averageGrossIncome` and `averageNetIncome` as fallback values when `confirmedGrossIncome` and `confirmedNetIncome` are null during bank viability evaluation. The BankViabilityRule SHALL evaluate bureau knockout rules first, then per-bank CMA checks (age, tenure, income, property value). LTV checks SHALL NOT be evaluated.

(Previously: BankViabilityRule evaluated product-level LTV, age, tenure, income checks per BankProductPolicy. No bureau knockout pre-pass.)

#### Scenario: Fallback to calculated averages

- GIVEN `confirmedGrossIncome` is null and `averageGrossIncome` is 18,000
- WHEN `BankViabilityRule` resolves income
- THEN it uses 18,000 as the gross income input

#### Scenario: Bureau knockout runs before CMA checks

- GIVEN applicant with bureau score 480
- WHEN `BankViabilityRule` executes
- THEN bureau knockout rejects all banks first
- AND per-bank CMA checks (income, age, tenure, property value) are not evaluated

#### Scenario: Property value below minimum rejects bank

- GIVEN propertyValue=200,000 and Santander ACQUISITION minimumPropertyValue=250,000
- WHEN `BankViabilityRule` evaluates Santander
- THEN Santander is rejected with reason PROPERTY_VALUE_BELOW_MINIMUM

#### Scenario: Missing bureau score does not reject

- GIVEN applicant with bureau score null
- WHEN `BankViabilityRule` executes
- THEN the bureau knockout check is skipped
- AND per-bank CMA evaluation proceeds normally

### Requirement: BankViability in POST Response

The system SHALL include `bankViability` inside `detail.bankViability` of the POST `/analyze` response payload, matching the structure returned by GET `/analysis/latest`. The snapshot SHALL include per-bank results with rejection reasons when bureau knockouts or CMA checks fail.

(Previously: BankViabilitySnapshot contained `productMatches` referencing BankProductPolicy. Now contains per-bank viability with knockout/CMA results.)

#### Scenario: POST response includes bankViability

- GIVEN a completed analysis run with BankViabilityRule executed
- WHEN `POST /mortgage-cases/:caseId/analyze` returns
- THEN `detail.bankViability` contains a `BankViabilitySnapshot` with `bankResults`, `inputs`, `calculatedAt`, and `warningLegend`

#### Scenario: POST and GET expose identical bankViability structure

- GIVEN the same analysis run
- WHEN comparing `detail.bankViability` from POST response and GET `/analysis/latest`
- THEN both contain the same `BankViabilitySnapshot` shape with identical fields

#### Scenario: Bureau knockout reflected in bank results

- GIVEN applicant with bureau score 480
- WHEN POST /analyze returns
- THEN `bankResults` shows all banks with status REJECTED and reason `BUREAU_SCORE_BELOW_MINIMUM`
