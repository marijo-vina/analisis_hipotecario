# Delta for Frontend

## ADDED Requirements

### Requirement: PersonType-Aware Identity Source Rendering

`AnalysisSection` SHALL accept an optional `personType?: string` prop, threaded from `case-detail-workspace.tsx` (`personType={caseData.personType}`), mirroring the existing pattern used by `DocumentUpload`/`DocumentBrowser`/`ExtractionSection`. `SOURCE_LABELS` and `SOURCE_ICONS` SHALL include a `csf` entry, and `IdentitySummaryCard.COLUMNS` SHALL include `csf`, so that a `csf` identity source returned by the API is rendered instead of being silently dropped by the `sources.filter(s => s in SOURCE_LABELS)` guard.

#### Scenario: PFAE csf source renders in the identity table

- GIVEN a PFAE case's analysis result includes a `csf` source
- WHEN the Validaciones tab renders the identity comparison table
- THEN a "CSF" column/row appears with its label and icon

#### Scenario: SALARIED rendering unchanged (regression)

- GIVEN a SALARIED case's analysis result (no `csf` source)
- WHEN the identity table renders
- THEN it displays exactly as before this change

### Requirement: Bankarization Section Hidden for PFAE

The Validaciones tab SHALL NOT render the "Conciliación nómina vs banco" section (including its empty-state card) when `personType === "PFAE"`. For any other `personType`, the section SHALL render as before.

#### Scenario: PFAE case hides conciliation section entirely

- GIVEN a case with `personType: "PFAE"`
- WHEN the Validaciones tab renders
- THEN no "Conciliación nómina vs banco" heading or empty-state card is present

#### Scenario: SALARIED case still shows conciliation section (regression)

- GIVEN a case with `personType: "SALARIED"`
- WHEN the Validaciones tab renders
- THEN the "Conciliación nómina vs banco" section renders as before this change

### Requirement: PersonType-Aware Pre-Analysis Checklist

The pre-analysis confirmation modal (`AnalysisConfirmModal`) and its `hasMissingDocs` check SHALL branch by `personType`. For PFAE, the checklist SHALL list: identification (INE/passport), CSF, tax return, bank statements, credit bureau — no nómina/payroll row. For SALARIED, the existing checklist SHALL remain unchanged. In both cases, missing documents SHALL produce a soft, non-blocking confirmation — never a blocking state.

#### Scenario: PFAE checklist omits nómina row

- GIVEN a PFAE case opening the pre-analysis modal
- WHEN the checklist renders
- THEN it shows INE/passport, CSF, tax return, bank statements, and credit bureau, with no payroll/nómina item

#### Scenario: Missing PFAE documents do not block confirmation

- GIVEN a PFAE case missing the tax return document
- WHEN the pre-analysis modal renders
- THEN it shows a soft warning for the missing document but still allows the advisor to confirm and proceed

#### Scenario: SALARIED checklist unchanged (regression)

- GIVEN a SALARIED case opening the pre-analysis modal
- WHEN the checklist renders
- THEN it lists the same items as before this change (Identificación, Recibo de nómina, Estado de cuenta, Buró)
