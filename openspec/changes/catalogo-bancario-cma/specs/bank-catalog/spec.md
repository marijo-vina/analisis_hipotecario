# Delta for Bank Catalog

## RENAMED Requirements

### Requirement: BankProductPolicy model → BankPolicy model

The system MUST store policies linked to a bank. Each policy MUST have a destination, minimum income, minimum property value, age/tenure limits, and active status. The system MUST return active policies via `GET /banks/:code`, grouped by destination.

| Field | Type | Constraint |
|-------|------|------------|
| bankId | String | FK → Bank.id |
| destination | enum | ACQUISITION, LIQUIDITY, MORTGAGE_REPLACEMENT, TERRENO, CONSTRUCCION, REMODELACION |
| minimumIncome | Decimal? | Nullable |
| minimumPropertyValue | Decimal? | Nullable |
| minimumEmploymentTenureMonths | Int? | Nullable |
| minimumApplicantAgeMonths | Int? | Nullable |
| maximumApplicationAgeMonths | Int? | Nullable |
| isActive | Boolean | @default(true) |

Removed fields: `code`, `name`, `personType`, `maximumLtv`, `maximumMaturityAgeMonths`, `sourceVersion`. Unique constraint is now (bankId, destination) instead of code.

(Previously: BankProductPolicy with product-level fields: code, name, personType, maximumLtv, maximumMaturityAgeMonths, sourceVersion.)

## MODIFIED Requirements

### Requirement: Bank model

The system MUST store banks with a unique code, debt commitment factor (CE), income criterion, minimum bureau score, and active status. The system MUST return all active banks via `GET /catalogs/banks`.

| Field | Type | Constraint |
|-------|------|------------|
| code | String | @unique |
| name | String | Required |
| debtCommitmentFactor | Decimal | Required (e.g., 0.60) |
| incomeCriterion | enum | NET or GROSS |
| minimumBureauScore | Int? | Nullable — null means no bank-specific score knockout |
| isActive | Boolean | @default(true) |

Removed field: `sourceVersion`.

(Previously: Bank model included `sourceVersion` and had no `minimumBureauScore`.)

#### Scenario: Consult banks returns all active banks

- GIVEN 9 active banks seeded with codes including BANORTE, SCOTIABANK, SANTANDER, HSBC, CITIBANAMEX, BX_PLUS, MIFEL, BANREGIO, AFIRME
- WHEN GET /catalogs/banks
- THEN returns 9 banks with code, name, debtCommitmentFactor, incomeCriterion, minimumBureauScore

#### Scenario: Inactive banks excluded from catalog

- GIVEN 9 active banks and 1 inactive bank (isActive: false)
- WHEN GET /catalogs/banks
- THEN returns only the 9 active banks

#### Scenario: Bank with minimumBureauScore set

- GIVEN Santander with minimumBureauScore=542
- WHEN GET /catalogs/banks
- THEN Santander is returned with minimumBureauScore=542

#### Scenario: Bank without minimumBureauScore

- GIVEN Banorte with minimumBureauScore=null
- WHEN GET /catalogs/banks
- THEN Banorte is returned with minimumBureauScore=null

### Requirement: CreditType destination mapping

The system SHALL add a `destination` field to CreditType. COMPRA maps to ACQUISITION, LIQUIDEZ to LIQUIDITY, MEJORA to MORTGAGE_REPLACEMENT, TERRENO to TERRENO, CONSTRUCCION to CONSTRUCCION, REMODELACION to REMODELACION. All six CreditType rows SHALL have non-null destination.

| CreditType | destination |
|------------|-------------|
| COMPRA | ACQUISITION |
| LIQUIDEZ | LIQUIDITY |
| MEJORA | MORTGAGE_REPLACEMENT |
| TERRENO | TERRENO |
| REMODELACION | REMODELACION |
| CONSTRUCCION | CONSTRUCCION |

(Previously: Only 3 CreditType rows mapped; TERRENO, REMODELACION, CONSTRUCCION had destination=null and produced REQUIRES_REVIEW.)

#### Scenario: All credit types map to destinations

- GIVEN 6 CreditType rows
- WHEN the system resolves destinations
- THEN all 6 have non-null destination values

### Requirement: Seed data

The system MUST seed 9 banks with CMA policies on migration.

| code | name | debtCommitmentFactor | incomeCriterion | minimumBureauScore |
|------|------|---------------------:|-----------------|-------------------:|
| BANORTE | Banorte | 0.60 | NET | null |
| SCOTIABANK | Scotiabank | 0.55 | GROSS | null |
| SANTANDER | Santander | 0.50 | NET | 542 |
| HSBC | HSBC | 0.50 | NET | null |
| CITIBANAMEX | Citibanamex | 0.50 | GROSS | null |
| BX_PLUS | BX+ | null | null | null |
| MIFEL | Mifel | null | null | null |
| BANREGIO | Banregio | null | null | 629 |
| AFIRME | Afirme | null | null | null |

Seeding rules:
- Mifel + Banregio: Adquisicion, Sustitucion (MORTGAGE_REPLACEMENT), Liquidez active; Terreno, Construccion, Remodelacion inactive.
- HSBC: only Acquisition active; all others inactive.
- BX+ and Afirme: bank-level data only; no destination policies seeded.

(Previously: 5 banks and 15 products with sourceVersion "ANAQUEL_MAYO_2026".)

#### Scenario: Seed inserts correct bank count

- WHEN seed script runs
- THEN 9 banks are inserted
- AND 6 CreditType rows are updated with non-null destination

#### Scenario: Seed inserts correct policy states

- WHEN seed script runs for MIFEL
- THEN ACQUISITION, LIQUIDITY, MORTGAGE_REPLACEMENT are active
- AND TERRENO, CONSTRUCCION, REMODELACION are inactive

#### Scenario: HSBC seed only Acquisition active

- WHEN seed script runs for HSBC
- THEN only ACQUISITION is active
- AND LIQUIDITY, MORTGAGE_REPLACEMENT are inactive

## REMOVED Requirements

### Requirement: No duplicate product codes

(Removed: BankPolicy uses composite unique (bankId, destination) instead of individual product codes.)

### Requirement: PersonType reuse

(Removed: BankPolicy no longer has personType field.)
