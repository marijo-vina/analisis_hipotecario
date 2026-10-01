# Delta for Income Calculation

## ADDED Requirements

### Requirement: PFAE Cálculo Panel

For PFAE, Cálculo MUST show two unfactored bases (bank statements and tax return) and a single “Base a enviar al banco” picker. Changing the picker MUST call existing PATCH `/income/source`, then refresh latest income and analysis. Peinado discrepancies MUST warn and link to existing extraction. The panel MUST NOT include a deposit editor. SALARIED payroll table requirements MUST remain unchanged. The system MUST NOT add income endpoints.

#### Scenario: Dual bases and picker

- GIVEN a PFAE snapshot with both bases valid
- WHEN Cálculo renders
- THEN both unfactored bases display and the picker shows the persisted source

#### Scenario: PATCH refresh

- GIVEN a completed PFAE analysis with both bases valid
- WHEN the advisor selects the other valid base
- THEN existing PATCH runs and Cálculo plus Comparativa refresh from latest

#### Scenario: TAX_LOSS disables tax base

- GIVEN tax-return INVALID for fiscal loss and bank valid
- WHEN Cálculo renders
- THEN tax-return is not selectable as a successful send path; bank remains; no in-panel editor

#### Scenario: Peinado warn and link

- GIVEN peinado discrepancies exist
- WHEN Cálculo renders
- THEN a warning and a link to existing extraction appear, with no deposit editor

#### Scenario: Bank vs tax labels

- GIVEN a PFAE snapshot with both bases
- WHEN Cálculo renders
- THEN bank statements show a single monthly deposit average
- AND tax return shows bruto as acumulables/12 and neto as utilidad/12
- AND month keys display as `MM/YYYY`
