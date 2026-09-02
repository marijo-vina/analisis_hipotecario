# Liability Calculation Specification

## Purpose

HU-18 revolving factor by `personType` only.

## Requirements

### Requirement: Default Factor by Person Type

The system MUST default the revolving factor from `personType`. UNKNOWN credits MUST use that factor. Revolving MUST remain `MAX(balance × factor, payment)` in cents. Snapshots MUST persist `factorUsed`.

| personType | Factor | UNKNOWN |
|------------|--------|---------|
| PFAE | 0.07 | 0.07 |
| SALARIED or absent | 0.06 | 0.06 |

#### Scenario: PFAE revolving at 7%

- GIVEN PFAE revolving balance 100000, payment 2000
- WHEN liabilities are calculated
- THEN contribution SHALL be 7000 and `factorUsed` 0.07

#### Scenario: SALARIED revolving at 6% (regression)

- GIVEN SALARIED revolving balance 100000, payment 2000
- WHEN liabilities are calculated
- THEN contribution SHALL be 6000 and `factorUsed` 0.06

#### Scenario: UNKNOWN uses personType factor

- GIVEN PFAE UNKNOWN balance 100000, payment 0
- WHEN liabilities are calculated
- THEN contribution SHALL be 7000, not 6000
