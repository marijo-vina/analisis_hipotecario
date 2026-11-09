# Bureau Extraction — Context Isolation & Field Correctness

## Purpose

Defines correct behavior for credit bureau extraction: per-document isolation, score optionality, payment field separation, MOP thresholds, balance alert logic, closed credit markers, and observation key interpretation.

## ADDED Requirements

### Requirement: Document Context Isolation

The extraction service MUST treat each document independently. Score data from a CREDIT_SCORE document MUST NEVER bleed into REPORT_CREDIT_BUREAU extraction. The Gemini prompt for REPORT_CREDIT_BUREAU MUST contain an explicit rule: "Extract ONLY from this document's text. Never infer or cross-reference other documents."

| ID | Rule |
|----|------|
| ISO-001 | Each document's OCR text MUST be sent to Gemini in isolation |
| ISO-002 | REPORT_CREDIT_BUREAU instructions MUST NOT reference score fields |
| ISO-003 | Cross-document inference MUST be explicitly prohibited in the prompt |

#### Scenario: Bureau report extracted without score bleed

- GIVEN a mortgage case with both REPORT_CREDIT_BUREAU and CREDIT_SCORE documents
- WHEN the bureau report is extracted
- THEN `report.publicScore` is null (no score inferred from the other document)
- AND no score-related alerts are generated from bureau extraction

#### Scenario: Prompt enforces isolation

- GIVEN the CREDIT_BUREAU_INSTRUCTIONS constant
- WHEN the prompt is inspected
- THEN it contains "Extract ONLY from this document" or equivalent isolation rule
- AND it does NOT contain score extraction instructions (400-800 range, exclusion codes)

### Requirement: Score Optionality

Score MUST be null when no CREDIT_SCORE document is present. The `report.publicScore` field in bureau extraction output MUST default to null, not inferred.

| ID | Rule |
|----|------|
| SCO-001 | `report.publicScore` MUST be null when only REPORT_CREDIT_BUREAU is processed |
| SCO-002 | Score MUST NOT be listed as a missing field when absent from bureau-only extraction |
| SCO-003 | Score-related alerts MUST NOT fire when score is null (not provided) |

#### Scenario: No Mi Score document

- GIVEN a case with only a REPORT_CREDIT_BUREAU document
- WHEN extraction completes
- THEN `report.publicScore` is null
- AND `missingFields` does NOT include `report.publicScore`
- AND no BURO_SCORE_LOW, BURO_SCORE_CRITICAL, or BURO_SCORE_EXCLUDED alerts fire

#### Scenario: Score present in separate CREDIT_SCORE document

- GIVEN a case with both REPORT_CREDIT_BUREAU and CREDIT_SCORE documents
- WHEN CREDIT_SCORE is extracted
- THEN score is populated from that document only
- AND the bureau report extraction remains score-null

### Requirement: Payment Field Separation

The extraction MUST distinguish `paymentDueAmount` ("Monto a Pagar") from `lastPaymentAmount` ("Monto Último Pago"). The schema MUST include both fields separately.

| ID | Rule |
|----|------|
| PAY-001 | `paymentDueAmount` maps to "Monto a Pagar" column |
| PAY-002 | `lastPaymentAmount` maps to "Monto Último Pago" column |
| PAY-003 | Both fields MUST be `number | null` in the credit schema |
| PAY-004 | The legacy `amountToPay` field MUST be deprecated in favor of `paymentDueAmount` |

#### Scenario: Both payment fields extracted

- GIVEN a bureau report with "Monto a Pagar" = $5,200 and "Monto Último Pago" = $3,100
- WHEN extraction runs
- THEN `paymentDueAmount` = 5200
- AND `lastPaymentAmount` = 3100

#### Scenario: Only one payment column present

- GIVEN a report with only "Monto a Pagar" visible
- WHEN extraction runs
- THEN `paymentDueAmount` has the value
- AND `lastPaymentAmount` is null

### Requirement: MOP Code Thresholds

MOP code flags MUST follow corrected thresholds: MOP 0-1 = current (no flag), MOP 2-3 = minor delinquency ("A" flag), MOP 4+ = serious delinquency ("M" flag), MOP 9 = fraud/extreme, MOP "U" = no information (NOT a delinquency).

| ID | Rule |
|----|------|
| MOP-001 | `hasLatePayments` MUST be true only when MOP >= 2 |
| MOP-002 | `hasSeriousDelinquency` MUST be true only when MOP >= 4 |
| MOP-003 | MOP "U" and "-" MUST NOT trigger any delinquency flag |
| MOP-004 | MOP 9 MUST set `hasFraudFlag` = true |
| MOP-005 | MOP 8 MUST set `hasWriteOff` = true |

#### Scenario: MOP 1 does not trigger late payment flag

- GIVEN a credit with mopCodes = ["0", "1", "0", "1"]
- WHEN normalization runs
- THEN `hasLatePayments` = false
- AND `hasSeriousDelinquency` = false

#### Scenario: MOP 2 triggers minor delinquency

- GIVEN a credit with mopCodes = ["0", "2", "0", "1"]
- WHEN normalization runs
- THEN `hasLatePayments` = true
- AND `hasSeriousDelinquency` = false

#### Scenario: MOP "U" is neutral

- GIVEN a credit with mopCodes = ["0", "U", "0", "-"]
- WHEN normalization runs
- THEN `hasLatePayments` = false
- AND no delinquency alert fires

#### Scenario: MOP 4+ triggers serious delinquency

- GIVEN a credit with mopCodes = ["0", "4", "0", "5"]
- WHEN normalization runs
- THEN `hasLatePayments` = true
- AND `hasSeriousDelinquency` = true
- AND BURO_SERIOUS_DELINQUENCY alert fires

### Requirement: Balance Alert Fix

The BURO_MISSING_BALANCE alert MUST fire only when `currentBalance` is null (truly undetectable), NOT when it is explicitly $0.00.

| ID | Rule |
|----|------|
| BAL-001 | `currentBalance == null` triggers BURO_MISSING_BALANCE |
| BAL-002 | `currentBalance === 0` MUST NOT trigger BURO_MISSING_BALANCE |
| BAL-003 | Credits with `hasWriteOff === true` are excluded from balance alert check |

#### Scenario: Zero balance does not alert

- GIVEN an active credit with `currentBalance` = 0
- WHEN alerts are computed
- THEN BURO_MISSING_BALANCE does NOT fire for this credit

#### Scenario: Null balance alerts

- GIVEN an active credit with `currentBalance` = null
- WHEN alerts are computed
- THEN BURO_MISSING_BALANCE fires and counts this credit

### Requirement: Closed Credit Marker

Closed credits MUST carry `monthlyDebtContribution: 0` and `isClosed: true`. Active credits carry `monthlyDebtContribution: paymentDueAmount` (or null if unavailable).

| ID | Rule |
|----|------|
| CLS-001 | Each credit MUST include `isClosed: boolean` |
| CLS-002 | Each credit MUST include `monthlyDebtContribution: number | null` |
| CLS-003 | When `status === "CLOSED"`, `monthlyDebtContribution` MUST be 0 |
| CLS-004 | When `status === "ACTIVE"`, `monthlyDebtContribution` = `paymentDueAmount` |

#### Scenario: Closed credit has zero debt contribution

- GIVEN a credit with `status` = "CLOSED" and `paymentDueAmount` = 5000
- WHEN normalization runs
- THEN `isClosed` = true
- AND `monthlyDebtContribution` = 0

#### Scenario: Active credit uses paymentDueAmount

- GIVEN a credit with `status` = "ACTIVE" and `paymentDueAmount` = 3200
- WHEN normalization runs
- THEN `isClosed` = false
- AND `monthlyDebtContribution` = 3200

### Requirement: Observation Key Interpretation

Observation keys MUST map to flags correctly: LC → quita (Q flag, `hasWriteOff`), UP → quebranto (`hasWriteOff`), FD → fraude (F flag, `hasFraudFlag`), RI → robo identidad (not attributable, separate flag).

| ID | Rule |
|----|------|
| OBS-001 | LC in rawText → `hasWriteOff` = true, contributes to Q flag |
| OBS-002 | UP in rawText → `hasWriteOff` = true |
| OBS-003 | FD in rawText → `hasFraudFlag` = true |
| OBS-004 | RI in rawText → separate `hasIdentityTheft` flag, does NOT trigger fraud alert |

#### Scenario: LC triggers write-off flag

- GIVEN a credit with rawTextReference containing "LC"
- WHEN normalization runs
- THEN `hasWriteOff` = true
- AND BURO_WRITE_OFF alert fires

#### Scenario: RI does not trigger fraud alert

- GIVEN a credit with rawTextReference containing "RI" only
- WHEN normalization runs
- THEN `hasFraudFlag` = false
- AND no BURO_FRAUD_FLAG alert fires

## REMOVED Requirements

### Requirement: Score extraction from bureau report

(Reason: Score belongs to separate CREDIT_SCORE document type; extracting from bureau report causes cross-document contamination)
(Migration: Remove all score-related instructions from CREDIT_BUREAU_INSTRUCTIONS. Score is now handled by credit-score-extraction capability.)

### Requirement: amountToPay single payment field

(Reason: Ambiguous mapping conflated "Monto a Pagar" with "Monto Último Pago", producing wrong payment amounts)
(Migration: Replace `amountToPay` with `paymentDueAmount` + `lastPaymentAmount`. Update schema and prompt.)

## Validation Case

### Scenario: BC - ALEJANDRO DIAZ - 2025.08.22

- GIVEN the PDF "BC - ALEJANDRO DIAZ - 2025.08.22" is processed as REPORT_CREDIT_BUREAU
- WHEN extraction completes
- THEN 16 credits are extracted (8 active, 8 closed)
- AND `report.publicScore` = null
- AND `borrower.rfc` = "DICA690402SD3"
- AND `borrower.birthDate` = "1969-04-02"
- AND `riskSummary.hasWriteOff` = false (no quebranto)
- AND `riskSummary.hasFraudFlag` = false (no fraude)
- AND `riskSummary.hasMinorDelinquency` = true (MOP 2-3 present)
- AND `riskSummary.hasSeriousDelinquency` = false
