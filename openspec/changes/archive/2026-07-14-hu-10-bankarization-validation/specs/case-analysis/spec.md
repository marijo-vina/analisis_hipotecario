# Delta for Case Analysis

## ADDED Requirements

### Requirement: Bankarization Validation Rule

The system SHALL register a new rule `bankarization-validation` in the case-analysis orchestrator. This rule SHALL invoke `PayrollBankMatchingService` and `PagadoraDetectionService`, load payroll receipts and bank statement deposits for the case, and produce an `AnalysisResult` with outcome (PASS/PARTIAL/FAIL) and severity.

| Sub-rule | Condition | Outcome |
|----------|-----------|---------|
| All receipts MATCHED | Every receipt → `MATCHED` or `PROVIDER_MIRROR_CONFIRMED` | PASS |
| Any DISCREPANCY or NOT_MATCHED | At least one receipt → `DISCREPANCY` or `NOT_MATCHED` | PARTIAL |
| Any RFC_INCOMPATIBLE unresolved | At least one receipt → `RFC_INCOMPATIBLE` sin resolución pagadora | FAIL |
| Any MANUAL_REVIEW | At least one receipt → `MANUAL_REVIEW` | PARTIAL |

#### Scenario: All receipts matched → PASS

- GIVEN a mortgage case with 3 payroll receipts
- AND all 3 receipts reconcile with bank deposits (`status = MATCHED`)
- WHEN the `bankarization-validation` rule executes
- THEN the outcome is `PASS`, severity is `INFO`
- AND no alerts are emitted

#### Scenario: Discrepancy detected → PARTIAL

- GIVEN a mortgage case with 2 payroll receipts
- AND one receipt → `status = MATCHED`, one receipt → `status = DISCREPANCY`
- WHEN the `bankarization-validation` rule executes
- THEN the outcome is `PARTIAL`, severity is `WARNING`
- AND the alert `DISCREPANCY_5PCT` is emitted for the discrepant receipt

#### Scenario: RFC incompatible without resolution → FAIL

- GIVEN a mortgage case with 2 payroll receipts
- AND one receipt → `status = MATCHED`, one receipt → `status = RFC_INCOMPATIBLE`
- AND the RFC incompatible receipt has no provider scheme detected
- WHEN the `bankarization-validation` rule executes
- THEN the outcome is `FAIL`, severity is `ERROR`
- AND the alert `BANK_PAYROLL_MISMATCH` is emitted

#### Scenario: Manual review → PARTIAL

- GIVEN a mortgage case with `isJointAccount = true`
- AND all receipts reconcile but force `status = MANUAL_REVIEW`
- WHEN the `bankarization-validation` rule executes
- THEN the outcome is `PARTIAL`, severity is `WARNING`
- AND the alert `BANK_JOINT_ACCOUNT` is included in results

#### Scenario: Provider Scotiabank alert emitted

- GIVEN a mortgage case with `bank.institutionName = "Scotiabank México"`
- AND a receipt → `status = PROVIDER_CANDIDATE`
- AND the provider's `originalConcept` does not contain "NOMINA" (normalized)
- WHEN the `bankarization-validation` rule executes
- THEN the outcome is `PARTIAL`, severity is `WARNING`
- AND the alert `PAYROLL_PROVIDER_SCOTIABANK` is emitted with message "No aplicable para Scotiabank"

#### Scenario: Provider mirror confirmed → PASS

- GIVEN a mortgage case with provider scheme detected
- AND a receipt → `status = PROVIDER_MIRROR_CONFIRMED` (double mirror from employer + provider)
- WHEN the `bankarization-validation` rule executes
- THEN the outcome is `PASS` (mirror confirmed counts as matched)
- AND the alert `PAYROLL_PROVIDER_MIRROR` is emitted

### Requirement: Alert Catalog for Bankarization

The system SHALL emit the following alerts from the bankarization-validation rule:

| Alert Code | Severity | Trigger |
|------------|----------|---------|
| `BANK_PAYROLL_MISMATCH` | ERROR | RFC incompatible sin resolución |
| `DISCREPANCY_5PCT` | WARNING | Monto difiere >5% con RFC y fecha OK |
| `PAYROLL_PROVIDER_SCOTIABANK` | WARNING | Pagadora en Scotiabank sin "NOMINA" en concepto |
| `PAYROLL_PROVIDER_MIRROR` | INFO | Doble espejo confirmado |

#### Scenario: Multiple alerts emitted for mixed results

- GIVEN a case with 3 receipts: one MATCHED, one DISCREPANCY, one RFC_INCOMPATIBLE
- WHEN the `bankarization-validation` rule executes
- THEN alerts include `DISCREPANCY_5PCT` and `BANK_PAYROLL_MISMATCH`
- AND the outcome is `FAIL` (highest severity wins)
