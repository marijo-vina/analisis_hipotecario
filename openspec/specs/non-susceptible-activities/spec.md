# Non-Susceptible Activities Specification

## Purpose

Closed, code-level catalog of economic activities that are excluded from financing, plus a pure matcher that returns a verdict. There is no schema, seed, or admin UI.

## Requirements

### Requirement: Catalog Contract

The system MUST define a versioned code catalog with exactly 13 global entries: government (including embassies), NGO/non-profit, political parties, churches, jewelry, gas stations, motels, mining, non-metallic mining, firearms/explosives manufacturing, firearms/explosives trade, adult entertainment, and forestry. Each entry MUST have a `code`, a Spanish `label`, and SAT-text aliases. The catalog MUST contain one bank-scoped entry: `bankCode: HSBC`, `destinations: [LIQUIDITY]`, `personTypes: [PFAE, PM]`, with four subsectors (construction, building-materials store, accounting firm, chemical/pharmaceutical) and their rama/subrama aliases. Global entries MUST NOT be copied per bank. The catalog MUST NOT model the truncated Ingenieros/Arquitectos footnote.

#### Scenario: Catalog pinned

- GIVEN the catalog module
- WHEN it is loaded
- THEN it has 13 unique global codes and one HSBC entry with four subsectors, LIQUIDITY only, and PFAE and PM

### Requirement: Matcher Verdict

`matchNonSusceptibleActivity()` MUST be pure. It MUST normalize with `normalizeSatText` and match aliases on word boundaries. It MUST return either `excluded` with `code`, `label`, and `scope`, or `eligible`. It MUST NOT return a factor.

#### Scenario: Global hit

- GIVEN "Comercio al por menor de gasolina y diésel"
- WHEN matched
- THEN it returns `excluded` with the gas-station code and global scope

#### Scenario: Short alias does not leak

- GIVEN a description that contains "bares" only inside a longer word
- WHEN matched
- THEN it returns `eligible`

#### Scenario: Professional services are not construction

- GIVEN "Servicios de arquitectura" or "Servicios de ingeniería"
- WHEN matched against the HSBC scope
- THEN it returns `eligible`

#### Scenario: Scoped hit

- GIVEN "Construcción de inmuebles comerciales, institucionales y de servicios"
- WHEN matched for HSBC, LIQUIDITY, PFAE
- THEN it returns `excluded` with HSBC scope

#### Scenario: Scope mismatch

- GIVEN the same construction description
- WHEN matched for a different bank, or for ACQUISITION or MORTGAGE_REPLACEMENT
- THEN it returns `eligible`
