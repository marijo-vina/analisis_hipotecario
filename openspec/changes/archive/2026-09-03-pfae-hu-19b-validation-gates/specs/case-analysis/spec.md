# Delta for Case Analysis

## MODIFIED Requirements

### Requirement: Phased Orchestration

The system SHALL execute `CaseAnalysisService.run()` in three phases: (A) document-level rules (identity match, bankarization validation, PFAE validation), (B) financial calculations (income + liability via injected services), (C) bank viability rule. Phase A results SHALL be passed to Phase C as typed `BankarizationFlags` to avoid stale DB reads. Phase B SHALL inject `IncomeCalculationService` and `LiabilityCalculationService`. Phase C SHALL execute after Phase B completes so that income and liability snapshots are available. The Phase A rule set (`phaseARules`) SHALL be resolved per-request based on `mortgageCase.personType`, not fixed at construction time. For `personType` = PFAE, `BankarizationValidationRule` SHALL be excluded from execution entirely (an explicit orchestrator decision, not an implicit empty-PASS side effect); Phase A SHALL execute `IdentityMatchRule` AND `PfaeValidationRule`. For `personType` = SALARIED (or absent/unrecognized), both `IdentityMatchRule` and `BankarizationValidationRule` SHALL execute, unchanged; `PfaeValidationRule` MUST NOT execute. The context object (`client`) spread into every Phase A rule SHALL include `personType` sourced from `mortgageCase.personType`. For `personType` = PFAE, Phase B MUST persist an income snapshot; missing payroll MUST NOT fail Phase B. Phase A FAIL from any rule MUST NOT block Phase B or Phase C.
(Previously: PFAE Phase A executed only `IdentityMatchRule`; bankarization was excluded but pfae-validation was not registered.)

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
- THEN `IdentityMatchRule` and `PfaeValidationRule` execute in Phase A
- AND `BankarizationValidationRule.execute()` is never invoked

#### Scenario: PFAE Phase A runs identity and pfae-validation

- GIVEN a mortgage case with `personType: "PFAE"`
- WHEN `run()` executes Phase A
- THEN both `IdentityMatchRule` and `PfaeValidationRule` execute sequentially
- AND bankarization validation remains excluded from Phase A

#### Scenario: SALARIED case runs both Phase A rules (regression)

- GIVEN a mortgage case with `personType: "SALARIED"`
- WHEN `run()` resolves `phaseARules` for this request
- THEN both `IdentityMatchRule` and `BankarizationValidationRule` execute, matching prior behavior
- AND `PfaeValidationRule` is not invoked

#### Scenario: Rule context includes personType

- GIVEN any mortgage case
- WHEN `CaseAnalysisService` builds the `client` context object for Phase A rules
- THEN the object includes `personType` equal to `mortgageCase.personType`

#### Scenario: PFAE Phase B persists income snapshot without payroll

- GIVEN a PFAE case with no payroll receipts
- WHEN `run()` executes Phase B
- THEN an income snapshot SHALL be persisted
- AND Phase B SHALL NOT fail for missing payroll
