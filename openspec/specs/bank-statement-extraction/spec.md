# Bank Statement Extraction Specification

## Purpose

JSON schema contract for structured bank statement data extraction from AI models (Gemini). Covers currency handling, RFC detection from concept text, balance fields for scoring, and joint account identification. All new fields default to `null` — additive, no breaking changes.

## Requirements

### Requirement: Currency Enum and Validation

The currency field in `payrollDeposits[]` and the root schema MUST accept the enum `"MXN" | "USD" | "OTHER"` with default `"MXN"`. When currency is not `"MXN"`, the extraction MUST append an alert to the `alerts[]` array.

| ID | Rule |
|----|------|
| CUR-001 | `currency` MUST be one of `"MXN"`, `"USD"`, `"OTHER"` |
| CUR-002 | Default value MUST be `"MXN"` when not explicitly detected |
| CUR-003 | When `currency !== "MXN"`, an alert MUST be added to `alerts[]` |
| CUR-004 | Non-MXN currency MUST NOT block extraction or cause schema validation failure |

#### Scenario: MXN currency (happy path)

- GIVEN a bank statement in Mexican pesos
- WHEN Gemini extracts `payrollDeposits[].currency`
- THEN `currency` is `"MXN"`
- AND no currency alert is generated

#### Scenario: USD currency (frontera account)

- GIVEN a bank statement from a border branch with USD deposits
- WHEN Gemini extracts `payrollDeposits[].currency`
- THEN `currency` is `"USD"`
- AND `alerts[]` contains a non-MXN currency alert

#### Scenario: Unrecognized currency

- GIVEN a statement with an unknown currency code
- WHEN Gemini cannot map to MXN or USD
- THEN `currency` is `"OTHER"`
- AND `alerts[]` contains a non-MXN currency alert

---

### Requirement: RFC Detection from Concept Text

The fields `payrollDeposits[].detectedPayerRfc` and `possiblePayrollProviders[].detectedPayerRfc` MUST be `string | null`. The extraction model SHOULD apply RFC pattern regex `[A-Z\u00D1&]{3,4}\d{6}[A-Z0-9]{3}` against `originalConcept`. If no match is found, the field MUST be `null`.

| ID | Rule |
|----|------|
| RFC-001 | `detectedPayerRfc` MUST be `string | null` in both `payrollDeposits[]` and `possiblePayrollProviders[]` |
| RFC-002 | Extraction SHOULD regex-hunt RFC pattern in `originalConcept` text |
| RFC-003 | If no RFC pattern found, `detectedPayerRfc` MUST be `null` |
| RFC-004 | A `null` `detectedPayerRfc` MUST NOT block payroll matching — fallback to Name+Amount+Date |

#### Scenario: RFC found in concept (happy path)

- GIVEN `originalConcept` = `"NOMINA RFC123456ABC EMPLEADOR SA"`
- WHEN extraction runs RFC regex against concept
- THEN `detectedPayerRfc` = `"RFC123456ABC"`

#### Scenario: No RFC in concept

- GIVEN `originalConcept` = `"DEPOSITO NOMINA MAYO"`
- WHEN extraction runs RFC regex against concept
- THEN `detectedPayerRfc` = `null`
- AND payroll matching falls back to Name+Amount+Date

#### Scenario: False positive RFC-like string

- GIVEN `originalConcept` contains a 12-13 char alphanumeric that resembles RFC but is not valid
- WHEN extraction runs RFC regex
- THEN `detectedPayerRfc` MAY capture the match (downstream validation handles false positives)
- AND false positives degrade gracefully to Name+Amount+Date fallback

---

### Requirement: Balance Fields in Statement Period

The `statementPeriod` object MUST include `averageBalance: number | null` and `endingBalance: number | null`. Both fields MUST validate as non-negative when present. If detected balance is negative, an alert MUST be appended.

| ID | Rule |
|----|------|
| BAL-001 | `averageBalance` MUST be `number | null` in `statementPeriod` |
| BAL-002 | `endingBalance` MUST be `number | null` in `statementPeriod` |
| BAL-003 | When present, both values MUST be non-negative (>= 0) |
| BAL-004 | Negative balance MUST generate an alert in `alerts[]` but MUST NOT block extraction |

#### Scenario: Balances present and valid (happy path)

- GIVEN a closed monthly statement with saldo promedio and saldo final
- WHEN extraction reads balance fields
- THEN `averageBalance` and `endingBalance` are populated as positive numbers

#### Scenario: Negative balance detected

- GIVEN a statement where saldo final is negative (overdraft)
- WHEN extraction reads balance fields
- THEN `endingBalance` contains the negative value
- AND `alerts[]` contains a negative balance alert

#### Scenario: Balances not available in document

- GIVEN a statement that does not show average or ending balance
- WHEN extraction runs
- THEN `averageBalance` = `null` and `endingBalance` = `null`

---

### Requirement: Joint Account Identification

The `accountHolder` object MUST include `isJointAccount: boolean | null`. When the statement indicates multiple titulars or mancomunidad, the field SHOULD be `true`. When unclear, it MUST be `null`.

| ID | Rule |
|----|------|
| JNT-001 | `isJointAccount` MUST be `boolean | null` in `accountHolder` |
| JNT-002 | When statement shows multiple titulars, `isJointAccount` SHOULD be `true` |
| JNT-003 | When titularity is unclear, `isJointAccount` MUST be `null` |

#### Scenario: Single account holder (happy path)

- GIVEN a statement with one titular name
- WHEN extraction reads account holder info
- THEN `isJointAccount` = `false` or `null`

#### Scenario: Joint account detected

- GIVEN a statement with two titular names or "cuenta mancomunada" text
- WHEN extraction reads account holder info
- THEN `isJointAccount` = `true`

---

### Requirement: Schema Backward Compatibility

All new fields MUST default to `null` or their existing default. The schema change MUST NOT break existing consumers that ignore unknown fields.

| ID | Rule |
|----|------|
| BC-001 | All new fields MUST be optional (`null` default) |
| BC-002 | `currency` enum expansion MUST NOT invalidate existing `"MXN"` values |
| BC-003 | Existing fields MUST retain their current types and positions |

#### Scenario: Consumer ignores new fields

- GIVEN an existing consumer that only reads known fields
- WHEN it receives extraction output with new fields
- THEN the consumer processes output without error
