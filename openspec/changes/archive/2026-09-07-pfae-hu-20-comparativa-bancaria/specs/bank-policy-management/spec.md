# Delta for Bank Policy Management

## ADDED Requirements

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
