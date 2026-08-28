# Identity Match Validation Specification

## Purpose

First cross-document validation rule comparing identity fields (`fullName`, `rfc`, `curp`) across Official ID, Payroll, Bank Statement, Credit Bureau, and the canonical `Client` record (operational reference, not absolute legal truth).

## Requirements

### Requirement: Field Intersection Comparison

The system SHALL compare identity fields only where BOTH documents contain the field. If a field is absent in one or more documents, it SHALL be marked `NOT_AVAILABLE` and SHALL NOT contribute to FAIL outcome.

| Source | Fields Compared |
|--------|----------------|
| Official ID | fullName, rfc, curp |
| Payroll | fullName, rfc, curp |
| Bank Statement | fullName, rfc |
| Credit Bureau | fullName, rfc, curp |
| Client (operational ref) | fullName, rfc, curp |

#### Scenario: All fields present and matching

- GIVEN a case where Official ID, Payroll, and Client all have rfc="XAXX010101000"
- WHEN identity match rule executes
- THEN rfc status is MATCH across all sources

#### Scenario: Absent field does not cause FAIL

- GIVEN Bank Statement has no curp field
- WHEN identity match compares curp across sources
- THEN curp status is NOT_AVAILABLE; outcome is determined by other comparable fields

### Requirement: Deterministic Text Normalization

The system SHALL normalize text values before comparison using: uppercase conversion, accent stripping, whitespace trimming, double-space collapsing, and removal of non-significant special characters. The system SHALL NOT use fuzzy matching or ML-based similarity.

| Step | Example Input | Output |
|------|--------------|--------|
| Uppercase | "josé pérez" | "JOSÉ PÉREZ" |
| Strip accents | "JOSÉ PÉREZ" | "JOSE PEREZ" |
| Trim + collapse | "  JOSE   PEREZ  " | "JOSE PEREZ" |
| Remove special chars | "JOSE PEREZ-GARCIA" | "JOSE PEREZGARCIA" |

#### Scenario: Normalized values match

- GIVEN Official ID fullName = "José  Pérez García" and Client fullName = "JOSE PEREZ GARCIA"
- WHEN both values are normalized
- THEN normalized values are identical and status is MATCH

#### Scenario: Real discrepancy after normalization

- GIVEN Official ID rfc = "XAXX010101000" and Payroll rfc = "XAXX010102000"
- WHEN both values are normalized
- THEN normalized values differ and status is MISMATCH

### Requirement: Severity Classification

The system SHALL classify identity match outcomes based on field type and match quality:

| Condition | Outcome | Severity |
|-----------|---------|----------|
| RFC or CURP mismatch (both present) | FAIL | ERROR |
| Full name mismatch only (RFC/CURP match or absent) | PARTIAL | WARNING |
| All comparable fields match | PASS | INFO |
| No comparable fields available | PASS | INFO |

#### Scenario: RFC mismatch causes FAIL

- GIVEN Official ID rfc and Payroll rfc are both present and differ after normalization
- WHEN identity match executes
- THEN outcome is FAIL with severity ERROR and alert IDENTITY_MISMATCH

#### Scenario: Name-only mismatch causes PARTIAL

- GIVEN RFC matches across all sources but fullName differs between Client and Official ID
- WHEN identity match executes
- THEN outcome is PARTIAL with severity WARNING and alert "Coincidencia por nombre"

### Requirement: Client as Operational Reference

The system SHALL treat the `Client` record as operational reference only. A mismatch between `Client` fields and document fields SHALL generate an alert but SHALL NOT auto-cancel the case. The asesora decides the resolution.

#### Scenario: Client differs from documents

- GIVEN Client rfc = "XAXX010101000" but Official ID rfc = "XAXX010102000"
- WHEN identity match executes
- THEN an alert is generated; case status becomes REQUIRES_REVIEW; case is NOT cancelled

#### Scenario: All documents match but Client differs

- GIVEN Official ID, Payroll, and Credit Bureau all have matching rfc
- AND Client rfc differs
- WHEN identity match executes
- THEN alert indicates Client-document discrepancy; outcome is PARTIAL (not FAIL)

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
