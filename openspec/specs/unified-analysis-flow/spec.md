# Unified Analysis Flow Specification

## Purpose

Single "Analizar expediente" trigger that orchestrates identity validation, bankarization reconciliation, income calculation, liability calculation, and bank viability evaluation in the correct backend sequence. No manual confirmations required.

## Requirements

### Requirement: Single Analysis Trigger

The system SHALL provide a single "Analizar expediente" button that initiates the full analysis pipeline. The system SHALL NOT require individual phase triggers or manual confirmations between phases.

#### Scenario: Single button triggers all phases

- GIVEN a mortgage case with documents uploaded
- WHEN the advisor clicks "Analizar expediente"
- THEN the system executes identity validation, bankarization, income calculation, liability calculation, and bank viability in sequence

#### Scenario: No confirmation between phases

- GIVEN analysis is executing
- WHEN income calculation completes
- THEN the system proceeds directly to liability calculation without requiring user confirmation

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
