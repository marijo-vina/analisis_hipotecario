# Delta for Frontend

## ADDED Requirements

### Requirement: PFAE Visual Kit and Tab Shell

PFAE expediente surfaces MUST use existing `gf-*` tokens and existing common components (`Card`, `Button`, `DataTable`, `StatusBadge`, `FieldGrid`, `FormField`, `Drawer`). Copy MUST be Spanish sentence-case. SALARIED Validaciones, Cálculo, and Comparativa MUST NOT be restyled. The analysis section MUST keep the same three tabs. The system MUST NOT add a wizard, a fourth tab, a second Analyze control, Banks catalog UI, pasivos UI, or Banorte 0.70.

#### Scenario: Salaried unchanged, three tabs

- GIVEN a SALARIED case
- WHEN the analysis section renders
- THEN Validaciones, Cálculo, and Comparativa look and behave as before this change
- AND no fourth tab, wizard, or second Analyze control appears

#### Scenario: PFAE uses visual kit

- GIVEN a PFAE case
- WHEN PFAE gates, Cálculo panel, or Comparativa extras render
- THEN they use `gf-*` tokens, existing common components, and Spanish sentence-case

### Requirement: PFAE Validaciones Gates Card

For `personType` PFAE, Validaciones MUST render a gates Card from persisted `ruleResults["pfae-validation"]` snapshot and `alerts`. Tenure MUST display as informational. The UI MUST NOT recompute gate outcomes.

#### Scenario: Happy path gates Card

- GIVEN a PFAE analysis with persisted pfae-validation snapshot and alerts
- WHEN Validaciones renders
- THEN a gates Card shows regime, vigencia, tenure (INFO), activity, and coherence from that snapshot/alerts

#### Scenario: No CSF

- GIVEN persisted PARTIAL missing-CSF snapshot/alerts
- WHEN Validaciones renders
- THEN the gates Card shows that PARTIAL missing-CSF outcome

#### Scenario: Unmapped giro

- GIVEN persisted `ACTIVITY_UNMAPPED` WARNING
- WHEN Validaciones renders
- THEN the gates Card shows that warning, including which MATRIX banks matched and which remain unmapped

#### Scenario: Tenure and calendar dates

- GIVEN persisted tenure months and ISO calendar dates
- WHEN Validaciones renders
- THEN tenure is years plus leftover months, not a raw month count
- AND calendar dates display as `DD/MM/YYYY` without timezone shift

### Requirement: PFAE Dual-Base Picker

For PFAE, Cálculo MUST present two unfactored bases and a single “Base a enviar al banco” picker. Changing the picker MUST call the existing income-source PATCH, then refresh latest income and analysis. The picker MUST NOT add a second Analyze control.

#### Scenario: PATCH refreshes Comparativa

- GIVEN a completed PFAE analysis with both bases valid
- WHEN the advisor selects the other valid base
- THEN existing PATCH runs and Comparativa reflects the refreshed Phase C result
- AND no second header Analyze appears

#### Scenario: TAX_LOSS

- GIVEN tax-return INVALID for fiscal loss
- WHEN Cálculo renders or the advisor tries that base
- THEN tax-return is not a successful send path and an inline Spanish error or disabled state appears

### Requirement: Comparativa PFAE Detail Extras

Comparativa table columns MUST stay unchanged. PFAE origin, giro (canonical + SAT text), applied factor, tax-return policy, and activity tenure MUST appear only in expanded product detail. Factor and giro MUST come from persisted `BankResult` audit, not reconstructed. PFAE reason codes MUST use centralized Spanish labels.

#### Scenario: Extras in detail only

- GIVEN a PFAE analysis with persisted audit on a product
- WHEN the product row is expanded
- THEN detail shows origin, giro+SAT, factor, tax-return policy, and activity tenure
- AND the table gains no extra columns

#### Scenario: Unmapped giro from audit

- GIVEN persisted unmapped MATRIX audit
- WHEN detail renders
- THEN it shows the persisted unmapped audit and MUST NOT invent factor 1.0

### Requirement: Solely-Salaried FAIL Non-Viable Presentation

When régimen is solely salaried FAIL, Validaciones and Comparativa MUST show “este camino PFAE no aplica — cambie a asalariado”. The UI MUST suppress PRELIMINARY_VIABLE chips and viable presentation. Product rows MAY remain inspectable and MUST NOT be presented as a successful PFAE-viable result.

#### Scenario: FAIL régimen

- GIVEN `REGIMEN_EXCLUSIVAMENTE_ASALARIADO` FAIL
- WHEN Comparativa and Validaciones render
- THEN that Spanish message appears, PRELIMINARY_VIABLE chips/viable presentation are suppressed, and rows MAY stay inspectable
