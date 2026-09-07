# Unified Analysis Flow Specification

## Purpose

Single "Analizar expediente" trigger that orchestrates identity validation, bankarization reconciliation, income calculation, liability calculation, and bank viability evaluation in the correct backend sequence. No manual confirmations required.

## Requirements

### Requirement: Single Analysis Trigger

The system SHALL provide a single "Analizar expediente" button that initiates the full analysis pipeline. The button SHALL be located in the analysis section header, right-aligned with the title. The system SHALL NOT require individual phase triggers or manual confirmations between phases. The frontend SHALL NOT receive per-phase progress updates — the backend executes all phases in a single `POST /analyze` call.

(Previously: Button was located inside the Validaciones tab content area.)

#### Scenario: Single button triggers all phases

- GIVEN a mortgage case with documents uploaded
- WHEN the advisor clicks "Analizar expediente" in the header
- THEN the system executes identity validation, bankarization, income calculation, liability calculation, and bank viability in sequence

#### Scenario: No confirmation between phases

- GIVEN analysis is executing
- WHEN income calculation completes
- THEN the system proceeds directly to liability calculation without requiring user confirmation

### Requirement: Analysis Button Location

The system SHALL place the "Analizar expediente" / "Re-ejecutar análisis" action button in the analysis section header row, aligned right alongside the "Análisis del expediente" title. The button SHALL NOT be embedded within any tab's content area.

#### Scenario: Button in header, not in tab content

- GIVEN the analysis section is rendered
- WHEN the header displays
- THEN the action button is in the header row, right-aligned
- AND no duplicate button exists inside the Validaciones tab body

### Requirement: Global Progress Indicator (No Per-Phase Tracking)

The system SHALL display a 3-phase progress indicator (Validaciones → Motor financiero → Comparativa bancaria) ONLY during active analysis execution or when an error occurs. Since the backend executes a single `POST /analyze` call without SSE, polling, or WebSocket, the frontend SHALL NOT track or display per-phase completion mid-request. All 3 phases SHALL render as "pending" (gray) during the request. Only after the request succeeds SHALL all 3 phases be marked as completed (green).

#### Scenario: All phases shown as pending during request

- GIVEN the user clicks "Analizar expediente"
- WHEN the unified analysis request is pending
- THEN Validaciones, Motor financiero and Comparativa bancaria are displayed as pending
- AND the UI does not simulate completed phases using timers
- AND tabs remain disabled until the request finishes

#### Scenario: All phases marked completed after success

- GIVEN the analysis request succeeds
- WHEN the UI updates
- THEN all 3 phases are marked as completed (green)
- AND the progress indicator is replaced by a compact status bar showing "✓ Análisis completado el [fecha]"

### Requirement: Error State with Re-attempt

The system SHALL display all phases as pending during execution. If the request fails, the UI SHALL show an error state with a "Reintentar análisis" button. A failed execution SHALL NOT replace the latest complete analysis displayed in the UI. Intermediate results from the failed execution SHALL not be presented as a completed analysis.

#### Scenario: Error preserves last successful analysis

- GIVEN a previous successful analysis exists
- WHEN the current run fails
- THEN the last successful results remain visible, an error state is shown, and "Reintentar análisis" is available

#### Scenario: No partial results presented on error

- GIVEN analysis fails mid-execution
- WHEN the UI updates
- THEN no intermediate results are displayed as a completed analysis; only the error state is shown

### Requirement: Completion with Observations

The system SHALL display an amber warning bar when analysis completes with observations. This state SHALL be triggered when ANY of the following conditions are met in the response data:

- `outcome` is `PARTIAL`, OR
- At least one product match has status `CONDITIONED`, OR
- At least one product match has status `REQUIRES_REVIEW`

The UI SHALL NOT invent this condition — it MUST derive from the response data.

#### Scenario: Amber warning bar for PARTIAL outcome

- GIVEN analysis completes with `outcome: PARTIAL`
- WHEN the UI updates
- THEN an amber bar shows "Análisis completado con observaciones" instead of the green success bar

#### Scenario: Amber warning bar for conditioned products

- GIVEN analysis completes with at least one product match having status `CONDITIONED`
- WHEN the UI updates
- THEN an amber bar shows "Análisis completado con observaciones"

#### Scenario: Amber warning bar for products requiring review

- GIVEN analysis completes with at least one product match having status `REQUIRES_REVIEW`
- WHEN the UI updates
- THEN an amber bar shows "Análisis completado con observaciones"

### Requirement: Tabs During Analysis

The system SHALL keep all tabs visible during analysis execution but render them in a disabled (grayed out) state to prevent navigation while the request is pending. Tabs SHALL NOT be individually enabled based on simulated phase completion.

(Previously: Tab behavior during analysis was not explicitly specified.)

#### Scenario: Tabs disabled but visible during execution

- GIVEN analysis is running
- WHEN the user views the tab bar
- THEN all tabs are visible but disabled (gray), preventing clicks until analysis completes or errors

### Requirement: Phased Execution Order

The system SHALL execute analysis phases in this order: (A) identity validation + bankarization reconciliation, (B) income calculation + liability calculation, (C) bank viability evaluation. Phase B results SHALL be available to Phase C.

#### Scenario: Income and liability available to bank viability

- GIVEN Phase B completes with calculated income averages and liability snapshot
- WHEN Phase C (bank viability) executes
- THEN the bank viability rule receives calculated income and liability data from the same execution

#### Scenario: Phase failure does not block subsequent phases

- GIVEN income calculation fails during Phase B
- WHEN the orchestrator continues execution
- THEN liability calculation and bank viability SHALL still execute where possible, with warnings logged

### Requirement: Automatic Income Usage

The system SHALL use calculated income averages (averageGrossIncome, averageNetIncome) directly. The system SHALL NOT require manual income confirmation before bank viability evaluation.

#### Scenario: Calculated income used automatically

- GIVEN income calculation produces averageGrossIncome = 18,000 and averageNetIncome = 15,000
- WHEN bank viability rule executes
- THEN it uses the calculated averages as income input

#### Scenario: Fallback when confirmed income is null

- GIVEN confirmedGrossIncome and confirmedNetIncome are null
- WHEN bank viability rule resolves income
- THEN it falls back to averageGrossIncome and averageNetIncome

### Requirement: Re-executable Analysis

The system SHALL allow re-execution of the full analysis pipeline when case data changes. Each execution SHALL create a new immutable AnalysisRun record.

#### Scenario: Re-analysis after data modification

- GIVEN a completed analysis run exists
- WHEN the advisor uploads a new document and clicks "Analizar expediente"
- THEN a new AnalysisRun is created with updated results; the previous run remains unchanged

### Requirement: Income-Source Switch Re-runs Phase C

PATCH income source MUST re-run Phase C only and MUST copy prior Phase A. The header MUST NOT gain a second Analyze control. Expediente Comparativa UI MUST stay unchanged this HU.

#### Scenario: PATCH is not a second Analyze

- GIVEN a completed analysis
- WHEN the advisor PATCHes income source
- THEN only Phase C re-runs, Phase A is copied, no second header Analyze appears, and Comparativa/picker/Validaciones UI stay unchanged
