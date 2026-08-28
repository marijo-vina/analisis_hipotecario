# Delta for Case Analysis

## MODIFIED Requirements

### Requirement: Phased Orchestration

The system SHALL execute `CaseAnalysisService.run()` in three phases: (A) document-level rules (identity match, bankarization validation), (B) financial calculations (income + liability via injected services), (C) bank viability rule. Phase A results SHALL be passed to Phase C as typed `BankarizationFlags` to avoid stale DB reads. Phase B SHALL inject `IncomeCalculationService` and `LiabilityCalculationService`. Phase C SHALL execute after Phase B completes so that income and liability snapshots are available. The Phase A rule set (`phaseARules`) SHALL be resolved per-request based on `mortgageCase.personType`, not fixed at construction time. For `personType` = PFAE, `BankarizationValidationRule` SHALL be excluded from execution entirely (an explicit orchestrator decision, not an implicit empty-PASS side effect); `IdentityMatchRule` SHALL still execute. For `personType` = SALARIED (or absent/unrecognized), both `IdentityMatchRule` and `BankarizationValidationRule` SHALL execute, unchanged. The context object (`client`) spread into every Phase A rule SHALL include `personType` sourced from `mortgageCase.personType`.
(Previously: Phase A results were not explicitly passed to Phase C; BankViabilityRule queried DB for stale flags. `phaseARules` was a fixed array built once in the constructor, always running both rules for every case; the rule context did not include `personType`.)

#### Scenario: Three-phase execution completes in order

- GIVEN a mortgage case with documents
- WHEN `run()` is invoked
- THEN Phase A executes document rules, Phase B calculates income and liability, Phase C evaluates bank viability

#### Scenario: Phase A flags passed to Phase C

- GIVEN Phase A produces `bankarization-validation` with `hasPagadoraIncome` and `scotiabankExcluded`
- WHEN Phase C executes `BankViabilityRule`
- THEN the rule receives fresh flags from the current run, not from a previous persisted `AnalysisRun`

#### Scenario: Phase B injects calculation services

- GIVEN `CaseAnalysisService` is instantiated
- WHEN `IncomeCalculationService` and `LiabilityCalculationService` are injected
- THEN `run()` calls both services during Phase B before executing bank viability

#### Scenario: PFAE case skips BankarizationValidationRule

- GIVEN a mortgage case with `personType: "PFAE"`
- WHEN `run()` resolves `phaseARules` for this request
- THEN only `IdentityMatchRule` executes in Phase A; `BankarizationValidationRule.execute()` is never invoked

#### Scenario: SALARIED case runs both Phase A rules (regression)

- GIVEN a mortgage case with `personType: "SALARIED"`
- WHEN `run()` resolves `phaseARules` for this request
- THEN both `IdentityMatchRule` and `BankarizationValidationRule` execute, matching prior behavior

#### Scenario: Rule context includes personType

- GIVEN any mortgage case
- WHEN `CaseAnalysisService` builds the `client` context object for Phase A rules
- THEN the object includes `personType` equal to `mortgageCase.personType`
