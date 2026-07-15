# Delta for Bureau Extraction

## MODIFIED Requirements

### Requirement: monthlyDebtContribution Populated by Liability Engine

The system MUST keep `monthlyDebtContribution` as `null` in the raw extraction JSON. The populated value SHALL exist exclusively in the enriched result produced by the liability-calculation engine. The raw extraction contract MUST NOT be modified to carry derived calculation fields.

(Previously: `monthlyDebtContribution` was left null with no clear separation from enriched result.)

#### Scenario: Raw extraction keeps monthlyDebtContribution null

- GIVEN credits extracted from bureau with currentBalance and paymentDueAmountEffective
- WHEN the raw extraction JSON is persisted
- THEN each credit's monthlyDebtContribution SHALL remain null
- AND the populated value SHALL only exist in the liability engine's enriched result

#### Scenario: Enriched result carries calculated monthlyDebtContribution

- GIVEN the liability engine processes extracted credits
- WHEN the enriched result is returned
- THEN each credit's monthlyDebtContribution SHALL contain the value calculated per its nature rule

### Requirement: Enriched Fields Separated from Raw Extraction

The system MUST NOT write `institutionCategory`, `creditNature`, `ruleApplied`, `liabilityStatus`, `classificationSource`, `classificationReason`, `factorUsed`, `calculatedAt`, `rulesVersion`, populated `monthlyDebtContribution`, `grossCurrentMonthlyDebt`, or `totalCurrentBalance` to the raw extraction JSON. These fields SHALL belong exclusively to the enriched liability engine result.

(Previously: `monthlyDebtContribution` was not explicitly listed as an enriched-only field.)

#### Scenario: Raw extraction JSON unchanged

- GIVEN a bureau extraction completes
- WHEN the raw extraction JSON is inspected
- THEN it SHALL NOT contain populated values for: institutionCategory, creditNature, ruleApplied, liabilityStatus, classificationSource, classificationReason, factorUsed, calculatedAt, rulesVersion, monthlyDebtContribution, grossCurrentMonthlyDebt, totalCurrentBalance
- AND these fields SHALL only exist in the liability engine's enriched result

#### Scenario: Enriched result contains all derived fields

- GIVEN the liability engine processes extracted credits
- WHEN the enriched result is returned
- THEN it SHALL include institutionCategory, creditNature, monthlyDebtContribution, ruleApplied, liabilityStatus, classificationSource, classificationReason (if applicable), factorUsed, calculatedAt, and rulesVersion for each credit

### Requirement: creditReference as Mandatory Raw Extraction Field

The system MUST extract `creditReference` as a stable, mandatory identifier from each credit in the bureau report. `creditReference` SHALL be present in the raw extraction JSON and SHALL pass through to the liability engine unmodified. It SHALL NOT be a derived or enriched field.

#### Scenario: creditReference extracted from bureau

- GIVEN a credit report contains a credit with a unique identifier
- WHEN Gemini extracts the credit data
- THEN the raw extraction JSON SHALL include `creditReference` for that credit
- AND the value SHALL be the identifier as it appears in the bureau report
