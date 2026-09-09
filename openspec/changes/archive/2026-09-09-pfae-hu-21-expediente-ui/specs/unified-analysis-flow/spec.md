# Delta for Unified Analysis Flow

## MODIFIED Requirements

### Requirement: Income-Source Switch Re-runs Phase C

PATCH income source MUST re-run Phase C only and MUST copy prior Phase A. The header MUST NOT gain a second Analyze control.

(Previously: Expediente Comparativa UI MUST stay unchanged this HU; scenario required Comparativa/picker/Validaciones UI to stay unchanged.)

#### Scenario: PATCH is not a second Analyze

- GIVEN a completed analysis
- WHEN the advisor PATCHes income source
- THEN only Phase C re-runs, Phase A is copied, and no second header Analyze appears
