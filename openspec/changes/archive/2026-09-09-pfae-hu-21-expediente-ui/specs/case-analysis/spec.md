# Delta for Case Analysis

## ADDED Requirements

### Requirement: BankResult Factor Audit

Phase C MUST persist additive per-bank audit on `BankResult`: `appliedFactor`, `factorMode`, `matchedNativeLabel`, `satDescription`, `taxReturnPolicy`. SALARIED values MUST be unused or null. Phase C factor math MUST NOT change. Comparativa MUST read these fields from the persisted result and MUST NOT reconstruct them.

#### Scenario: PFAE audit persisted

- GIVEN Phase C evaluates a PFAE product
- WHEN the `BankResult` is stored
- THEN it includes `appliedFactor`, `factorMode`, `matchedNativeLabel`, `satDescription`, and `taxReturnPolicy` from the same evaluation

#### Scenario: Unmapped giro audit

- GIVEN MATRIX activity unmapped
- WHEN the `BankResult` is stored
- THEN audit reflects unmapped (MUST NOT invent factor 1.0) and `satDescription` still persists if present

#### Scenario: SALARIED unused

- GIVEN a SALARIED Phase C run
- WHEN the `BankResult` is stored
- THEN audit fields are null or unused and CE remains unfactored
