# Bank Policy Management Specification

## Purpose

Advisor-facing CRUD UI and NestJS API for managing bank CMA (Criterios Minimos de Aceptacion) policies. Enables advisors to view, edit, and toggle bank policies inline without code changes.

## Requirements

### Requirement: Sidebar Navigation Entry

The system SHALL display a "Bancos" navigation item in the dashboard sidebar. The active state MUST use background `#9C001F` with white text. The sidebar background MUST be `#111111`.

#### Scenario: Bancos nav item visible

- GIVEN the advisor is logged into the dashboard
- WHEN the sidebar renders
- THEN a "Bancos" nav item is visible in the sidebar

#### Scenario: Active nav styling

- GIVEN the advisor navigates to `/dashboard/bancos`
- WHEN the "Bancos" item is active
- THEN it renders with `#9C001F` background and white text

### Requirement: Bank List Page

The system SHALL provide `/dashboard/bancos` displaying a table with columns: Banco, Tipo Ingreso, CE, Score Minimo, Destinos, Estado. Each row SHALL link to the bank detail page.

#### Scenario: List page shows all banks

- GIVEN 9 active banks in the database
- WHEN the advisor navigates to `/dashboard/bancos`
- THEN a table renders 9 rows with Banco, Tipo Ingreso, CE, Score Minimo, Destinos, Estado columns

#### Scenario: Estado column reflects active state

- GIVEN a bank with `isActive=true`
- WHEN the list renders
- THEN Estado shows "Activo" for that bank

### Requirement: Bank Detail Page

The system SHALL provide `/dashboard/bancos/[code]` with: a back button, an editable bank info card, and a policies table with inline editing. Cards MUST follow design.md: Inter font, white background, `#D7DCE2` border, 12px border-radius.

#### Scenario: Detail page loads bank data

- GIVEN a bank with code "BANORTE"
- WHEN the advisor navigates to `/dashboard/bancos/BANORTE`
- THEN the page shows bank info card and policies table with all destinations

#### Scenario: Inline edit saves immediately

- GIVEN the policies table shows a destination row
- WHEN the advisor edits `minimumIncome` for ACQUISITION
- THEN PATCH `/banks/BANORTE/policies/ACQUISITION` is called
- AND the table reflects the new value without full page reload

### Requirement: Policy Destination Toggle

The system SHALL allow toggling each policy destination between Activo and Inactivo per bank.

#### Scenario: Toggle destination inactive

- GIVEN Santander has ACQUISITION active
- WHEN advisor toggles ACQUISITION to inactive
- THEN PATCH `/banks/SANTANDER/policies/ACQUISITION` is called with `isActive: false`
- AND the UI updates to show "Inactivo"

#### Scenario: Toggle destination active

- GIVEN Banorte has LIQUIDITY inactive
- WHEN advisor toggles LIQUIDITY to active
- THEN PATCH `/banks/BANORTE/policies/LIQUIDITY` is called with `isActive: true`

### Requirement: Bank CRUD API Endpoints

The system SHALL expose NestJS endpoints:

| Method | Path | Purpose |
|--------|------|---------|
| GET | /banks | List all banks with policies |
| GET | /banks/:code | Bank detail with policies |
| PATCH | /banks/:code | Update bank-level fields |
| PATCH | /banks/:code/policies/:destination | Update policy CMA fields |

#### Scenario: GET /banks returns bank list

- WHEN GET `/banks` is called
- THEN returns array of banks with code, name, debtCommitmentFactor, incomeCriterion, minimumBureauScore, isActive

#### Scenario: GET /banks/:code returns detail with policies

- GIVEN bank code "SCOTIABANK" exists
- WHEN GET `/banks/SCOTIABANK` is called
- THEN returns bank info and array of policies with destination, isActive, and all CMA fields

#### Scenario: PATCH policy updates CMA field

- GIVEN PATCH `/banks/SANTANDER/policies/ACQUISITION` with `{ minimumIncome: 15000 }`
- WHEN the endpoint is called
- THEN Santander ACQUISITION minimumIncome is updated to 15000
- AND the response returns the updated policy

### Requirement: Banks PFAE Editors

`/dashboard/bancos/:code` MUST edit factor mode, flat factor, taxReturnPolicy, PFAE tenure, optional PFAE CMA cells, and a factors table. Factors MUST allow > 1. API MUST CRUD `BankActivityFactor` and PATCH those fields.

#### Scenario: Save factor above one

- GIVEN Mifel health factor 1.5
- WHEN the advisor saves it
- THEN the Banks API persists 1.5

#### Scenario: PATCH bank factor card

- GIVEN PATCH `/banks/BANORTE` with FLAT 0.6
- WHEN called
- THEN Banorte stores that mode and flat factor

#### Scenario: Edit PFAE tenure and CMA

- GIVEN a bank detail page
- WHEN the advisor edits `minimumActivityTenureMonths` or a PFAE income-min
- THEN the same policy row updates
