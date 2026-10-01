# Bank Catalog Specification

## Purpose

Store and serve bank metadata and product policies from the Anaquel Hipotecario. Provides read-only catalog endpoints for the matcher to evaluate preliminary product viability per case.

## Requirements

### Requirement: Bank model

The system MUST store banks with a unique code, debt commitment factor (CE), income criterion, and active status. The system MUST return all active banks via `GET /catalogs/banks`.

| Field | Type | Constraint |
|-------|------|------------|
| code | String | @unique |
| name | String | Required |
| debtCommitmentFactor | Decimal | Required (e.g., 0.60) |
| incomeCriterion | enum | NET or GROSS |
| isActive | Boolean | @default(true) |
| sourceVersion | String | Required (e.g., "ANAQUEL_MAYO_2026") |

#### Scenario: Consult banks returns all active banks

- GIVEN 5 active banks seeded with codes BANORTE, SCOTIABANK, SANTANDER, HSBC, CITIBANAMEX
- WHEN GET /catalogs/banks
- THEN returns 5 banks with code, name, debtCommitmentFactor, incomeCriterion
- AND each bank includes sourceVersion

#### Scenario: Inactive banks excluded from catalog

- GIVEN 5 active banks and 1 inactive bank (isActive: false)
- WHEN GET /catalogs/banks
- THEN returns only the 5 active banks

### Requirement: BankProductPolicy model

The system MUST store product policies linked to a bank. Each product MUST have a unique code, destination, personType, maximum LTV, age limits, and minimum employment tenure. The system MUST return active products via `GET /catalogs/bank-products`, filterable by destination.

| Field | Type | Constraint |
|-------|------|------------|
| code | String | @unique |
| bankId | String | FK → Bank.id |
| destination | enum | ACQUISITION, LIQUIDITY, MORTGAGE_REPLACEMENT |
| personType | enum | Reuses existing PersonType |
| minimumEmploymentTenureMonths | Int? | Nullable — NOT_APPLICABLE in matcher when null |
| minimumApplicantAgeMonths | Int? | Nullable — NOT_APPLICABLE in matcher when null |
| maximumApplicationAgeMonths | Int? | Nullable — NOT_APPLICABLE in matcher when null |
| maximumMaturityAgeMonths | Int? | Nullable — NOT_APPLICABLE in matcher when null |
| maximumLtv | Decimal? | Nullable — NOT_APPLICABLE in matcher when null |
| isActive | Boolean | @default(true) |
| sourceVersion | String | Required |

#### Scenario: Filter products by destination

- GIVEN products for ACQUISITION, LIQUIDITY, and MORTGAGE_REPLACEMENT destinations
- WHEN GET /catalogs/bank-products?destination=ACQUISITION
- THEN returns only ACQUISITION products
- AND each product includes bankCode, code, name, maximumLtv

#### Scenario: Products without filter returns all active

- GIVEN 15 active products across 5 banks
- WHEN GET /catalogs/bank-products (no query params)
- THEN returns all 15 active products

### Requirement: CreditType destination mapping

The system SHALL add a nullable `destination` field to CreditType. Only COMPRA maps to ACQUISITION, LIQUIDEZ to LIQUIDITY, and MEJORA to MORTGAGE_REPLACEMENT. Other CreditType rows SHALL have destination=null. The matcher SHALL treat null destination as unsupported, returning REQUIRES_REVIEW.

| CreditType | destination |
|------------|-------------|
| COMPRA | ACQUISITION |
| LIQUIDEZ | LIQUIDITY |
| MEJORA | MORTGAGE_REPLACEMENT |
| TERRENO | null |
| REMODELACION | null |
| CONSTRUCCION | null |

#### Scenario: Unsupported credit type destination

- GIVEN CreditType "TERRENO" with destination=null
- WHEN matcher evaluates a case with this credit type
- THEN returns REQUIRES_REVIEW with reason UNSUPPORTED_DESTINATION

### Requirement: No duplicate product codes

The system MUST reject duplicate `code` values in BankProductPolicy via a unique constraint at the database level.

#### Scenario: Duplicate product code rejected

- GIVEN an existing product with code "BANORTE_ADQ_HF"
- WHEN inserting another product with the same code
- THEN the database rejects the insertion with a unique constraint violation

### Requirement: PersonType reuse

BankProductPolicy.personType SHALL reference the existing PersonType enum. The system MUST NOT create a separate ApplicantProfile enum or duplicate person-type values.

#### Scenario: Product references existing PersonType

- GIVEN PersonType enum includes SALARIED
- WHEN creating a BankProductPolicy for a salaried product
- THEN personType references the existing PersonType.SALARIED value
- AND no new enum is created

### Requirement: Seed data

The system MUST seed 5 banks and 15 products (3 per bank) with sourceVersion "ANAQUEL_MAYO_2026" on migration.

| code | name | debtCommitmentFactor | incomeCriterion |
|------|------|---------------------:|-----------------|
| BANORTE | Banorte | 0.60 | NET |
| SCOTIABANK | Scotiabank | 0.55 | GROSS |
| SANTANDER | Santander | 0.50 | NET |
| HSBC | HSBC | 0.50 | NET |
| CITIBANAMEX | Citibanamex | 0.50 | GROSS |

Each bank has 3 products: one per destination (ACQUISITION, LIQUIDITY, MORTGAGE_REPLACEMENT), each with destination-specific LTV, employment tenure, and age limits.

#### Scenario: Seed inserts correct counts

- WHEN seed script runs
- THEN 5 banks are inserted
- AND 15 products are inserted (3 per bank)
- AND 3 CreditType rows are updated with non-null destination

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
