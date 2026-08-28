# Delta for Identity Match Validation

## ADDED Requirements

### Requirement: Person-Type-Aware Source Selection

The system SHALL select active identity sources based on `personType`, received via the rule execution context (`client.personType`). For SALARIED (or absent/unrecognized), sources remain unchanged: `official-id`, `payroll`, `bank-statement`, `credit-bureau`, `client`. For PFAE, sources SHALL be: `official-id`, `csf`, `tax-return`, `bank-statement`, `credit-bureau`, `client`. `payroll` SHALL be excluded for PFAE even if a `PAYROLL_RECEIPT` document exists.

#### Scenario: SALARIED case retains payroll source

- GIVEN a case with `personType: "SALARIED"` and a Payroll document
- WHEN identity match executes
- THEN `detail.sources` includes `payroll`; behavior is unchanged from before this change

#### Scenario: PFAE case excludes payroll, includes csf and tax-return

- GIVEN a case with `personType: "PFAE"` and CSF, tax-return, bank statement, and bureau documents
- WHEN identity match executes
- THEN `detail.sources` includes `csf` and `tax-return`, and does NOT include `payroll`

#### Scenario: Stray payroll document on PFAE case is ignored

- GIVEN a case with `personType: "PFAE"` and an accidental `PAYROLL_RECEIPT` document
- WHEN identity match executes
- THEN no `payroll` source is produced and it does not affect the outcome

### Requirement: CSF Identity Source

The system SHALL define a `csf` source, applicable only to PFAE cases, reading `taxpayer.fullName`, `taxpayer.rfc`, and `taxpayer.curp` from the CSF extraction payload. Comparison follows the same field-intersection, normalization, and severity rules as `official-id`.

#### Scenario: CSF fields match

- GIVEN CSF `taxpayer.rfc` matches Official ID `rfc` after normalization
- WHEN identity match executes
- THEN `csf` rfc status is MATCH

#### Scenario: CSF missing curp does not cause FAIL

- GIVEN the CSF extraction has no `curp` value
- WHEN identity match compares curp for the `csf` source
- THEN curp status is `NOT_AVAILABLE` and does not contribute to FAIL

### Requirement: Tax-Return Identity Source (First-Class)

The system SHALL define a `tax-return` source, applicable only to PFAE cases, reading `satReceipt.taxpayerName` (compared as `fullName`) and `satReceipt.rfc`. No `curp` field exists for this source; `curp` SHALL always be `NOT_AVAILABLE` for `tax-return`. An RFC mismatch (both sides present) SHALL be classified FAIL/ERROR via the existing Severity Classification requirement — SAME severity as any other source's RFC mismatch, NOT a WARNING. A name-only mismatch SHALL be PARTIAL/WARNING. An absent document or field SHALL yield `NOT_AVAILABLE` and SHALL NOT contribute to FAIL.

#### Scenario: Tax-return RFC mismatch causes FAIL

- GIVEN `satReceipt.rfc` differs from Official ID `rfc` after normalization
- WHEN identity match executes
- THEN outcome includes FAIL with severity ERROR, same as a bank-statement RFC mismatch

#### Scenario: Tax-return name-only mismatch causes PARTIAL

- GIVEN `satReceipt.rfc` matches but `satReceipt.taxpayerName` differs from Client fullName
- WHEN identity match executes
- THEN the fullName field is PARTIAL/WARNING; outcome is not FAIL solely from this

#### Scenario: Missing tax-return document yields NOT_AVAILABLE

- GIVEN a PFAE case with no `TAX_RETURN` document
- WHEN identity match executes
- THEN `tax-return` fields are `NOT_AVAILABLE` and do not cause FAIL

## MODIFIED Requirements

### Requirement: Stable Detail Structure

The system SHALL produce a stable `detail` structure for UI consumption. The `sources[]` array SHALL vary by `personType`: SALARIED includes `payroll`; PFAE includes `csf` and `tax-return` instead, and excludes `payroll`.
(Previously: `sources` was a fixed array `["official-id", "payroll", "bank-statement", "credit-bureau", "client"]` regardless of personType.)

```
detail: {
  sources: string[], // personType-dependent, e.g. PFAE: ["official-id","csf","tax-return","bank-statement","credit-bureau","client"]
  fields: [
    {
      fieldName: "rfc",
      originalValue: { source: value },
      normalizedValue: { source: value },
      status: MATCH | MISMATCH | NOT_AVAILABLE,
      severity: ERROR | WARNING | INFO,
      alerts: ["IDENTITY_MISMATCH"]
    }
  ]
}
```

#### Scenario: Detail contains all compared fields

- GIVEN identity match executes on a case with 3 document sources
- WHEN detail is returned
- THEN fields[] contains entries for rfc, curp, and fullName with per-source values and status

#### Scenario: PFAE detail includes csf and tax-return, excludes payroll

- GIVEN a PFAE case with CSF and tax-return documents
- WHEN detail is returned
- THEN `sources` includes `csf` and `tax-return`, and `payroll` is absent
