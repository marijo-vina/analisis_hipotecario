# Delta for Bank Catalog

## ADDED Requirements

### Requirement: PFAE Factor and Tenure Catalog

Bank MUST store `pfaeFactorMode` (MATRIX, FLAT, NONE), optional `pfaeFlatFactor`, and `taxReturnPolicy` (ACCEPTED, NOT_PREFERRED, REJECTED). Bank MUST own `BankActivityFactor` rows (native label, SAT aliases, `factor`, optional `factorTaxReturn`). No global ActivityType. Policy row MUST store nullable `minimumActivityTenureMonths` and nullable PFAE income-min/age-min; empty PFAE cells MUST mean salaried values.

#### Scenario: Catalog exposes PFAE fields

- GIVEN seeded banks
- WHEN Banks APIs return a bank
- THEN PFAE factor, tenure, and CMA cells are present

### Requirement: PFAE Seed Defaults

Seed MUST set Banorte FLAT 0.6 + NOT_PREFERRED; HSBC NONE 1.0; Scotiabank REJECTED; Banamex PFAE age 28y and LIQUIDITY 35k; Santander PFAE 15k (construcción 67k); HSBC LIQUIDITY inactive; Mifel CE 0.50; Mifel health 1.5. Factors MAY exceed 1. BX+ MAY seed `factorEstados` ≠ `factorDeclaracion`.

#### Scenario: Locked seed values

- WHEN seed runs
- THEN those locked PFAE values persist
