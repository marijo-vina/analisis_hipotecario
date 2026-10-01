# Delta for Income Calculation

## ADDED Requirements

### Requirement: SAT Synonyms for Window N

N=12 MUST match SAT synonyms (cultivo, ganadería, pecuario, pesca, agrícola, restaurante, alimentos y bebidas) and MUST NOT depend on "primaria". Default MUST remain 6. Window MUST stay case-level.

#### Scenario: Synonym selects twelve months

- GIVEN CSF activity "cultivo"
- WHEN the bank window is resolved
- THEN N SHALL be 12

### Requirement: PATCH Income Source

`PATCH /cases/:caseId/income/source` MUST create a new IncomeCalculation with the same `bases`, new `source`, and projected averages, then invoke `runPhaseC`. Invalid chosen bases MUST be rejected.

#### Scenario: Switch source

- GIVEN PFAE snapshot with both bases valid
- WHEN PATCH sets TAX_RETURN
- THEN a new snapshot keeps identical bases, stores TAX_RETURN, and projects tax averages
