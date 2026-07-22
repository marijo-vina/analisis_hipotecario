# Delta for Frontend

## ADDED Requirements

### Requirement: Single Analysis Button

The system SHALL display a single "Analizar expediente" button in the Validaciones tab that calls `POST /mortgage-cases/:caseId/analyze`. This button SHALL replace all individual phase trigger buttons.

#### Scenario: Single button triggers full analysis

- GIVEN the advisor is viewing a case's Validaciones tab
- WHEN they click "Analizar expediente"
- THEN the system calls `POST /mortgage-cases/:caseId/analyze` and displays progress/results

### Requirement: Auto-Refresh on Completion

The system SHALL refresh all tabs (validations, motor financiero, comparativa) upon analysis completion so that income, liability, and bank viability results are visible without manual navigation.

#### Scenario: All tabs update after analysis

- GIVEN analysis completes successfully
- WHEN the advisor switches to Motor Financiero tab
- THEN income and liability results are already populated

## REMOVED Requirements

### Requirement: Individual Analysis Triggers

(Reason: Replaced by single "Analizar expediente" button that orchestrates all phases.)
(Migration: None. The following UI elements are removed: "Validar expediente" button, "Calcular" button (liability), "Calcular ingresos" button.)

### Requirement: Review Confirmation UI

(Reason: Manual review confirmation is eliminated in MVP. Analysis results are used directly.)
(Migration: None. The following UI elements are removed: "Confirmar revisión" button, ActionsGroup component, OperationalStatusBadge, per-receipt "PENDIENTE/REVISADO" toggle.)

### Requirement: Income Confirmation Panel

(Reason: Income confirmation is eliminated. Calculated averages are used directly.)
(Migration: None. The following UI elements are removed: "Confirmar ingresos" card, confirmed KPI cards ("Bruto confirmado", "Neto confirmado"), CONFIRMADO badge, income confirmation form inputs.)
