# Tasks: Schema Adjustments for Bank Statement Extraction (Task 2.9)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~25 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Chain strategy | feature-branch-chain |
| Delivery strategy | force-chained |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: feature-branch-chain
400-line budget risk: Low

## Phase 1: Schema Field Additions & Version Bump

- [x] 1.1 Bump `schemaVersion` from `"1.0"` to `"1.1"` in `specs/ai-extraction/schemas/bank-statement.schema.md`
- [x] 1.2 Change `payrollDeposits[].currency` from `"MXN"` to `"MXN | USD | OTHER"` with default `"MXN"`
- [x] 1.3 Add `detectedPayerRfc: "string | null"` to both `payrollDeposits[]` and `possiblePayrollProviders[]`
- [x] 1.4 Add `averageBalance: "number | null"` and `endingBalance: "number | null"` to `statementPeriod`
- [x] 1.5 Add `isJointAccount: "boolean | null"` to `accountHolder`

## Phase 2: Validation Rules & Alert Definitions

- [x] 2.1 Add RFC regex guidance (`[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}` against `originalConcept`) and `null` fallback rule to alerts section
- [x] 2.2 Add non-MXN currency alert rule (when `currency !== "MXN"`, append to `alerts[]`)
- [x] 2.3 Add negative balance alert rule for `averageBalance`/`endingBalance`
- [x] 2.4 Add joint account detection guidance (multiple titulars → `true`, unclear → `null`)

## Phase 3: Example JSON Update & Verification

- [x] 3.1 Update example `schemaVersion` to `"1.1"` and add `isJointAccount` to `accountHolder`
- [x] 3.2 Add `detectedPayerRfc`, `averageBalance`, and `endingBalance` to example JSON entries
- [x] 3.3 Verify example JSON is syntactically valid and all new fields match schema definitions