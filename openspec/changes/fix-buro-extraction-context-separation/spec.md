# Delta Spec: Fix Bureau Extraction Context Separation

## Bureau Extraction — Context Isolation & Field Correctness

### ISO-001: Document Context Isolation
| ID | Rule |
|----|------|
| ISO-001 | Each document's OCR text MUST be sent to Gemini in isolation |
| ISO-002 | REPORT_CREDIT_BUREAU instructions MUST NOT reference score fields |
| ISO-003 | Cross-document inference MUST be explicitly prohibited in the prompt |

**Scenario: Bureau report extracted without score bleed**
- GIVEN a mortgage case with both REPORT_CREDIT_BUREAU and CREDIT_SCORE documents
- WHEN the bureau report is extracted
- THEN `report.publicScore` is null (no score inferred from the other document)
- AND no score-related alerts are generated from bureau extraction

**Scenario: Prompt enforces isolation**
- GIVEN the CREDIT_BUREAU_INSTRUCTIONS constant
- WHEN the prompt is inspected
- THEN it contains "Extract ONLY from this document" or equivalent isolation rule
- AND it does NOT contain score extraction instructions (400-800 range, exclusion codes)

### SCO-001: Score Optionality
| ID | Rule |
|----|------|
| SCO-001 | `report.publicScore` MUST be null when only REPORT_CREDIT_BUREAU is processed |
| SCO-002 | Score MUST NOT be listed as a missing field when absent from bureau-only extraction |
| SCO-003 | Score-related alerts MUST NOT fire when score is null (not provided) |

**Scenario: No Mi Score document**
- GIVEN a case with only a REPORT_CREDIT_BUREAU document
- WHEN extraction completes
- THEN `report.publicScore` is null
- AND `missingFields` does NOT include `report.publicScore`
- AND no BURO_SCORE_LOW, BURO_SCORE_CRITICAL, or BURO_SCORE_EXCLUDED alerts fire

### PAY-001: Payment Field Separation
| ID | Rule |
|----|------|
| PAY-001 | `paymentDueAmount` maps to "Monto a Pagar" column |
| PAY-002 | `lastPaymentAmount` maps to "Monto Último Pago" column |
| PAY-003 | Both fields MUST be `number | null` in the credit schema |
| PAY-004 | The legacy `amountToPay` field MUST be deprecated in favor of `paymentDueAmount` |

**Scenario: Both payment fields extracted**
- GIVEN a bureau report with "Monto a Pagar" = $5,200 and "Monto Último Pago" = $3,100
- WHEN extraction runs
- THEN `paymentDueAmount` = 5200 AND `lastPaymentAmount` = 3100

### MOP-001: MOP Code Thresholds
| ID | Rule |
|----|------|
| MOP-001 | `hasLatePayments` MUST be true only when MOP >= 2 |
| MOP-002 | `hasSeriousDelinquency` MUST be true only when MOP >= 4 |
| MOP-003 | MOP "U" and "-" MUST NOT trigger any delinquency flag |
| MOP-004 | MOP 9 MUST set `hasFraudFlag` = true |
| MOP-005 | MOP 8 MUST set `hasWriteOff` = true |

**Scenario: MOP 1 does not trigger late payment flag**
- GIVEN a credit with mopCodes = ["0", "1", "0", "1"]
- WHEN normalization runs
- THEN `hasLatePayments` = false

**Scenario: MOP 2 triggers minor delinquency**
- GIVEN a credit with mopCodes = ["0", "2", "0", "1"]
- WHEN normalization runs
- THEN `hasLatePayments` = true AND `hasSeriousDelinquency` = false

**Scenario: MOP "U" is neutral**
- GIVEN a credit with mopCodes = ["0", "U", "0", "-"]
- WHEN normalization runs
- THEN `hasLatePayments` = false AND no delinquency alert fires

### BAL-001: Balance Alert Fix
| ID | Rule |
|----|------|
| BAL-001 | `currentBalance == null` triggers BURO_MISSING_BALANCE |
| BAL-002 | `currentBalance === 0` MUST NOT trigger BURO_MISSING_BALANCE |
| BAL-003 | Credits with `hasWriteOff === true` are excluded from balance alert check |

**Scenario: Zero balance does not alert**
- GIVEN an active credit with `currentBalance` = 0
- WHEN alerts are computed
- THEN BURO_MISSING_BALANCE does NOT fire for this credit

### CLS-001: Closed Credit Marker
| ID | Rule |
|----|------|
| CLS-001 | Each credit MUST include `isClosed: boolean` |
| CLS-002 | Each credit MUST include `monthlyDebtContribution: number | null` |
| CLS-003 | When `status === "CLOSED"`, `monthlyDebtContribution` MUST be 0 |
| CLS-004 | When `status === "ACTIVE"`, `monthlyDebtContribution` = `paymentDueAmount` |

**Scenario: Closed credit has zero debt contribution**
- GIVEN a credit with `status` = "CLOSED" and `paymentDueAmount` = 5000
- WHEN normalization runs
- THEN `isClosed` = true AND `monthlyDebtContribution` = 0

### OBS-001: Observation Key Interpretation
| ID | Rule |
|----|------|
| OBS-001 | LC in rawText → `hasWriteOff` = true, contributes to Q flag |
| OBS-002 | UP in rawText → `hasWriteOff` = true |
| OBS-003 | FD in rawText → `hasFraudFlag` = true |
| OBS-004 | RI in rawText → separate `hasIdentityTheft` flag, does NOT trigger fraud alert |

**Scenario: RI does not trigger fraud alert**
- GIVEN a credit with rawTextReference containing "RI" only
- WHEN normalization runs
- THEN `hasFraudFlag` = false AND no BURO_FRAUD_FLAG alert fires

### Validation Case: BC - JUAN PEREZ
- GIVEN the PDF "BC - JUAN PEREZ - 2025.08.22" processed as REPORT_CREDIT_BUREAU
- WHEN extraction completes
- THEN 16 credits (8 active, 8 closed), `report.publicScore` = null, RFC = PEGJ800101XX1
- AND birthDate = "1980-01-01", no quebranto/fraude, minor delinquency from MOP 2-3

---

## Bureau Extraction UI — Score Display & Null Handling

### UI-001: Null Score Display
| ID | Rule |
|----|------|
| UI-001 | KPI score value shows "—" when score is null |
| UI-002 | KPI score subtitle shows "Score no disponible" when score is null |
| UI-003 | Note "El cliente no adjuntó documento Mi Score." renders below KPI row |

**Scenario: Null score KPI display**
- GIVEN parsed bureau data with `score` = null
- WHEN the KPI row renders
- THEN the score card shows value "—" AND subtitle "Score no disponible"
- AND no risk band color is applied

### SRC-001: Score Source Labeling
| ID | Rule |
|----|------|
| SRC-001 | When `scoreSource === "CREDIT_SCORE"`, show "Fuente: Mi Score" label |
| SRC-002 | When score is null, no source label is shown |

**Scenario: Score from Mi Score document**
- GIVEN `score` = 720 and `scoreSource` = "CREDIT_SCORE"
- WHEN the KPI row renders
- THEN the score card shows "720" AND "Fuente: Mi Score" is displayed

### DX-001: Diagnosis Decoupling
| ID | Rule |
|----|------|
| DX-001 | Diagnosis risk level derives from `riskSummary` flags, not score |
| DX-002 | When score is null and no flags, diagnosis = "Sin indicadores de riesgo detectados." |
| DX-003 | Score-based risk messages MUST NOT appear when score is null |

**Scenario: Diagnosis without score**
- GIVEN `score` = null and all `riskSummary` flags false
- WHEN diagnosis card renders
- THEN risk level = "Bajo" AND message = "Sin indicadores de riesgo detectados."

---

## Credit Score Extraction

### CS-001: CREDIT_SCORE Document Type
| ID | Rule |
|----|------|
| CS-001 | `CREDIT_SCORE` MUST exist in DocumentType seed/migration |
| CS-002 | CREDIT_SCORE documents MUST NOT trigger bureau extraction |
| CS-003 | CREDIT_SCORE extraction MUST produce `{ score, scoreIsExcluded, scoreExclusionReason }` |

**Scenario: CREDIT_SCORE document triggers separate extraction**
- GIVEN a document with type code "CREDIT_SCORE"
- WHEN the extraction service processes it
- THEN it uses the CREDIT_SCORE extraction pipeline (not bureau)
- AND the output contains score data only

### EXT-001: Mi Score Extraction Output
| ID | Rule |
|----|------|
| EXT-001 | Valid score range: 400-800 → `score` = number |
| EXT-002 | Negative values → `scoreIsExcluded` = true, `scoreExclusionReason` populated |
| EXT-003 | No score detectable → `score` = null, no exclusion |

**Scenario: Valid Mi Score extracted**
- GIVEN a "Mi Score" document with score 720
- WHEN extraction runs
- THEN `score` = 720 AND `scoreIsExcluded` = false

**Scenario: Exclusion code detected**
- GIVEN a "Mi Score" document with code -5
- WHEN extraction runs
- THEN `score` = -5 AND `scoreIsExcluded` = true AND `scoreExclusionReason` populated

### MRG-001: Score Merge into Bureau View
| ID | Rule |
|----|------|
| MRG-001 | `parseBuro` MUST check for CREDIT_SCORE documents alongside CREDIT_BUREAU_REPORT |
| MRG-002 | When CREDIT_SCORE exists, its score populates `parsed.score` |
| MRG-003 | When CREDIT_SCORE is absent, `parsed.score` = null |
| MRG-004 | `scoreSource` field indicates origin: "CREDIT_SCORE" | "REPORT_CREDIT_BUREAU" | null |

**Scenario: Both documents present**
- GIVEN a case with CREDIT_BUREAU_REPORT and CREDIT_SCORE documents
- WHEN `parseBuro` runs
- THEN `parsed.score` comes from CREDIT_SCORE extraction AND `parsed.scoreSource` = "CREDIT_SCORE"

**Scenario: Only bureau report present**
- GIVEN a case with only CREDIT_BUREAU_REPORT
- WHEN `parseBuro` runs
- THEN `parsed.score` = null AND `parsed.scoreSource` = null
