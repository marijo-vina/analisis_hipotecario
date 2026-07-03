# Credit Score Extraction

## Purpose

Defines the separate extraction pipeline for CREDIT_SCORE document type ("Mi Score"), independent from REPORT_CREDIT_BUREAU extraction.

## ADDED Requirements

### Requirement: CREDIT_SCORE Document Type

The system MUST recognize `CREDIT_SCORE` as a distinct document type that triggers its own extraction pipeline, separate from REPORT_CREDIT_BUREAU.

| ID | Rule |
|----|------|
| CS-001 | `CREDIT_SCORE` MUST exist in DocumentType seed/migration |
| CS-002 | CREDIT_SCORE documents MUST NOT trigger bureau extraction |
| CS-003 | CREDIT_SCORE extraction MUST produce `{ score, scoreIsExcluded, scoreExclusionReason }` |

#### Scenario: CREDIT_SCORE document triggers separate extraction

- GIVEN a document with type code "CREDIT_SCORE"
- WHEN the extraction service processes it
- THEN it uses the CREDIT_SCORE extraction pipeline (not bureau)
- AND the output contains score data only

#### Scenario: CREDIT_SCORE does not trigger bureau extraction

- GIVEN a document with type code "CREDIT_SCORE"
- WHEN `CreditBureauExtractionService.isCreditBureauDocument()` is called
- THEN it returns false

### Requirement: Mi Score Extraction Output

The CREDIT_SCORE extraction MUST produce a score value (400-800), exclusion code detection (negative values), and the corresponding exclusion reason.

| ID | Rule |
|----|------|
| EXT-001 | Valid score range: 400-800 → `score` = number |
| EXT-002 | Negative values → `scoreIsExcluded` = true, `scoreExclusionReason` populated |
| EXT-003 | Unknown/negative codes not in exclusion map → `scoreExclusionReason` = "Código de exclusión desconocido: {code}" |
| EXT-004 | No score detectable → `score` = null, no exclusion |

#### Scenario: Valid Mi Score extracted

- GIVEN a "Mi Score" document with score 720
- WHEN extraction runs
- THEN `score` = 720
- AND `scoreIsExcluded` = false
- AND `scoreExclusionReason` = null

#### Scenario: Exclusion code detected

- GIVEN a "Mi Score" document with code -5
- WHEN extraction runs
- THEN `score` = -5
- AND `scoreIsExcluded` = true
- AND `scoreExclusionReason` = "Todas las cuentas cerradas, al menos una con morosidad de 90+ días (MOP>=04)"

#### Scenario: No score in document

- GIVEN a "Mi Score" document with no score visible
- WHEN extraction runs
- THEN `score` = null
- AND `scoreIsExcluded` = false
- AND `scoreExclusionReason` = null

### Requirement: Score Merge into Bureau View

The frontend `parseBuro` function MUST merge CREDIT_SCORE extraction output into the ParsedCreditBureau view when both document types exist for the same case.

| ID | Rule |
|----|------|
| MRG-001 | `parseBuro` MUST check for CREDIT_SCORE documents alongside CREDIT_BUREAU_REPORT |
| MRG-002 | When CREDIT_SCORE exists, its score populates `parsed.score` |
| MRG-003 | When CREDIT_SCORE is absent, `parsed.score` = null |
| MRG-004 | `scoreSource` field indicates origin: "CREDIT_SCORE" | "REPORT_CREDIT_BUREAU" | null |

#### Scenario: Both documents present

- GIVEN a case with CREDIT_BUREAU_REPORT and CREDIT_SCORE documents
- WHEN `parseBuro` runs
- THEN `parsed.score` comes from CREDIT_SCORE extraction
- AND `parsed.scoreSource` = "CREDIT_SCORE"

#### Scenario: Only bureau report present

- GIVEN a case with only CREDIT_BUREAU_REPORT
- WHEN `parseBuro` runs
- THEN `parsed.score` = null
- AND `parsed.scoreSource` = null
