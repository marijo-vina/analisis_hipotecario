# Liability Calculation Specification

## Purpose

Motor de cálculo de pasivos mensuales por crédito activo según naturaleza (REVOLVING, FIXED, UNKNOWN), con clasificación determinista, factor parametrizable, versionado, snapshots persistidos y cálculo decimal exacto.

## Requirements

### Requirement: REVOLVING Calculation

The system MUST compute monthly debt contribution for revolving credits as `MAX(currentBalance × factorUsed, paymentDueAmountEffective)` when both amounts are present. All monetary calculations MUST use integer cents (not floating-point `number`).

| Condition | monthlyDebtContribution | liabilityStatus |
|-----------|------------------------|-----------------|
| Both saldo and pago present | `MAX(saldo × factor, pago)` | CALCULATED |
| Only saldo present | `saldo × factor` (provisional) | REQUIRES_REVIEW |
| Only pago present | `pago` (provisional) | REQUIRES_REVIEW |
| Neither present | null | INCOMPLETE |

#### Scenario: Both amounts present — 6% greater than payment

- GIVEN a revolving credit with currentBalance = 100,000 and paymentDueAmountEffective = 2,000
- WHEN the liability engine calculates with factorUsed = 0.06
- THEN monthlyDebtContribution SHALL be 6,000 (MAX(6,000, 2,000))
- AND liabilityStatus SHALL be CALCULATED

#### Scenario: Both amounts present — payment greater than 6%

- GIVEN a revolving credit with currentBalance = 100,000 and paymentDueAmountEffective = 8,000
- WHEN the liability engine calculates with factorUsed = 0.06
- THEN monthlyDebtContribution SHALL be 8,000 (MAX(6,000, 8,000))
- AND liabilityStatus SHALL be CALCULATED

### Requirement: FIXED Calculation

The system MUST compute monthly debt contribution for fixed credits using `paymentDueAmountEffective` directly. When `currentBalance > 0` AND `paymentDueAmountEffective` is explicitly `0`, the credit SHALL be marked INCOMPLETE — a $0 payment on an active balance is suspicious data.

| Condition | monthlyDebtContribution | liabilityStatus |
|-----------|------------------------|-----------------|
| paymentDueAmountEffective > 0 | `paymentDueAmountEffective` | CALCULATED |
| pago > saldo | `pago` + warning | CALCULATED |
| saldo > 0, pago null | null | INCOMPLETE |
| saldo > 0, pago = 0 (explicit) | null | INCOMPLETE |

#### Scenario: Normal fixed payment

- GIVEN a fixed credit with currentBalance = 200,000 and paymentDueAmountEffective = 5,000
- WHEN the liability engine calculates
- THEN monthlyDebtContribution SHALL be 5,000
- AND liabilityStatus SHALL be CALCULATED

#### Scenario: Balance present, explicit $0 payment — incomplete

- GIVEN a fixed credit with currentBalance = 150,000 and paymentDueAmountEffective = 0
- WHEN the liability engine calculates
- THEN monthlyDebtContribution SHALL be null
- AND liabilityStatus SHALL be INCOMPLETE

### Requirement: UNKNOWN Calculation

The system MUST attempt keyword-based classification first. If still UNKNOWN, apply conservative calculation with explicit sub-cases for each combination of available amounts. A `FALLBACK` classificationSource SHALL be recorded when the deterministic classifier cannot resolve the nature.

| Available data | monthlyDebtContribution | liabilityStatus | classificationSource |
|---------------|------------------------|-----------------|---------------------|
| Resolved by keyword | Per resolved rule | Per resolved rule | KEYWORD |
| Both amounts | `MAX(saldo × 0.06, pago)` | REQUIRES_REVIEW | FALLBACK |
| Only saldo | `saldo × 0.06` | REQUIRES_REVIEW | FALLBACK |
| Only pago | `pago` | REQUIRES_REVIEW | FALLBACK |
| Neither | null | INCOMPLETE | FALLBACK |

#### Scenario: UNKNOWN with both amounts — provisional

- GIVEN a credit with classification = UNKNOWN, currentBalance = 30,000, paymentDueAmountEffective = 1,500
- WHEN keywords do not resolve the nature
- THEN monthlyDebtContribution SHALL be 1,800 (MAX(1,800, 1,500))
- AND liabilityStatus SHALL be REQUIRES_REVIEW
- AND classificationSource SHALL be FALLBACK

#### Scenario: UNKNOWN with only balance — provisional

- GIVEN a credit with classification = UNKNOWN, currentBalance = 50,000, paymentDueAmountEffective = null
- WHEN keywords do not resolve the nature
- THEN monthlyDebtContribution SHALL be 3,000 (50,000 × 0.06)
- AND liabilityStatus SHALL be REQUIRES_REVIEW
- AND classificationSource SHALL be FALLBACK

#### Scenario: UNKNOWN with no amounts — incomplete

- GIVEN a credit with classification = UNKNOWN, currentBalance = null, paymentDueAmountEffective = null
- WHEN keywords do not resolve the nature
- THEN monthlyDebtContribution SHALL be null
- AND liabilityStatus SHALL be INCOMPLETE

### Requirement: Keyword Collision Resolution

The system MUST NOT arbitrarily resolve keyword collisions. When a credit matches keywords from multiple nature groups (e.g., "TARJETA" from REVOLVING AND "PERSONAL" from FIXED), it SHALL be classified as UNKNOWN with REQUIRES_REVIEW and `classificationReason` SHALL list the conflicting keywords.

#### Scenario: Colliding keywords — both REVOLVING and FIXED

- GIVEN a credit with creditType = "TARJETA DE CREDITO PERSONAL"
- WHEN the keyword classifier matches both REVOLVING ("TARJETA") and FIXED ("PERSONAL")
- THEN creditNature SHALL remain UNKNOWN
- AND liabilityStatus SHALL be REQUIRES_REVIEW
- AND classificationReason SHALL be "colisión de keywords: TARJETA, PERSONAL"

### Requirement: Exact Monetary Calculation

The system MUST perform all monetary calculations using integer cents (multiply all peso amounts by 100, operate with integers, divide by 100 only for display). `number` (IEEE 754 floating-point) MUST NOT be used for monetary sums, multiplications, or comparisons.

#### Scenario: No floating-point accumulation error

- GIVEN 3 credits with contributions of 1333.33, 1333.33, and 1333.34
- WHEN the liability engine sums using integer cents
- THEN grossCurrentMonthlyDebt SHALL be exactly 4000.00 (not 3999.99 or 4000.000000000001)

### Requirement: Snapshot Persistence

Each calculation execution MUST save an immutable snapshot with: `id`, `caseId`, `calculatedAt`, `factorUsed`, `rulesVersion`, `credits[]` (each with enriched fields), `globalStatus`, `grossCurrentMonthlyDebt`, `totalCurrentBalance`. Previous snapshots MUST NOT be modified when factor or rules change. A `POST /cases/:id/liability/calculate` triggers calculation and snapshot creation. `GET /cases/:id/liability/latest` returns the most recent snapshot.

#### Scenario: New calculation creates new snapshot

- GIVEN a previous snapshot exists for case X with factorUsed = 0.06
- WHEN the advisor changes the factor to 0.08 and recalculates
- THEN a NEW snapshot SHALL be created with factorUsed = 0.08
- AND the previous snapshot SHALL remain unchanged

### Requirement: Deterministic Classification

The system MUST classify creditNature by credit type and product name keywords, never by institution. Keyword collisions resolve to UNKNOWN + REQUIRES_REVIEW.

| Keyword group | creditNature |
|---------------|-------------|
| TARJETA, REVOLVENTE, LÍNEA | REVOLVING |
| AUTO, HIPOTECA, PERSONAL, NÓMINA, SERVICIO | FIXED |

classificationSource values: EXTRACTED (from Gemini), KEYWORD (resolved deterministically), MANUAL (advisor override), FALLBACK (UNKNOWN conservative rule).

institutionCategory MUST be derived from institution name (BANK, DEPARTMENT_STORE, FINTECH, NON_BANK_SERVICE).

### Requirement: Null vs Zero Distinction

The system MUST treat null in currentBalance or paymentDueAmountEffective as absent data, never as $0. An explicit value of 0 SHALL contribute $0 to calculations.

### Requirement: Manual Override

The system MUST allow manual change of creditNature via `PATCH /cases/:id/liability/credits/:creditIndex`. Upon change, classificationSource SHALL become MANUAL, classificationReason SHALL be recorded, and recalculation SHALL trigger automatically producing a new snapshot.

### Requirement: Global Status

The system MUST compute a global liability status from all individual credit statuses.

| Global condition | globalStatus | UI label |
|-----------------|-------------|----------|
| All CALCULATED | CALCULATED | "Total de pasivos" |
| ≥1 REQUIRES_REVIEW, 0 INCOMPLETE | PARTIAL | "Total provisional" |
| ≥1 INCOMPLETE | INCOMPLETE | "Subtotal calculado" |

### Requirement: Closed Credits

Closed credits SHALL contribute $0 monthly. They SHALL NOT be included in the total liability sum.

### Requirement: NON_BANK_SERVICE Inclusion

NON_BANK_SERVICE credits with active balance or payment SHALL be included using the same calculation rules as other categories.

### Requirement: Stable Credit Reference

The system MUST include `creditReference` as a mandatory stable identifier for each credit processed. `creditReference` SHALL originate from the bureau extraction, pass through the liability engine unmodified, and appear in both input and enriched result. This identifier allows the advisor to later select which mortgage credit will be settled by the new product (future HU).

#### Scenario: creditReference preserved through calculation

- GIVEN a credit extracted from bureau with creditReference = "CR-001234-ABC"
- WHEN the liability engine processes the credit
- THEN the enriched LiabilityCreditResult SHALL include creditReference = "CR-001234-ABC"
- AND the value SHALL be identical to the raw extraction

### Requirement: Total Current Balance Aggregate

The system MUST compute `totalCurrentBalance` as the simple arithmetic sum of all `currentBalance` values across all non-closed credits. This value SHALL be independent of `creditNature`, `factorUsed`, or any calculation rule. It SHALL be included in `LiabilityCalculationResult` alongside `grossCurrentMonthlyDebt`.

`totalCurrentBalance` serves the advisor in consolidation and liquidity scenarios to determine the total amount needed from the bank to settle all current client debts.

#### Scenario: totalCurrentBalance with mixed credits

- GIVEN credits with currentBalance values of 150,000 (FIXED), 30,000 (REVOLVING), null (INCOMPLETE), and 0 (closed)
- WHEN the liability engine aggregates
- THEN totalCurrentBalance SHALL be 180,000 (150,000 + 30,000; null and closed credits contribute 0)
- AND grossCurrentMonthlyDebt SHALL be calculated independently per each credit's nature

### Requirement: No Automatic Exclusion of Settleable Credits

The system MUST NOT automatically exclude credits that could potentially be settled through mortgage substitution, mortgage improvement, or debt consolidation. HU-11 represents the client's gross current liabilities as reported by the credit bureau. Any exclusion or adjustment of individual credits for product evaluation purposes SHALL be handled by a separate layer (future HU).

The client's current mortgage (if present in the bureau report) SHALL be included in both `grossCurrentMonthlyDebt` and `totalCurrentBalance`.

#### Scenario: Current mortgage included in gross liabilities

- GIVEN the client has a mortgage credit with monthlyDebtContribution = 12,000 and two revolving credits with contributions of 3,000 and 1,500
- WHEN the liability engine calculates grossCurrentMonthlyDebt
- THEN grossCurrentMonthlyDebt SHALL be 16,500 (12,000 + 3,000 + 1,500)
- AND the mortgage credit SHALL NOT be excluded from the total

### Out of Scope

The following treatment is explicitly excluded from HU-11 and reserved for a future user story focused on product evaluation:

| Treatment value | Meaning | Future use |
|----------------|---------|------------|
| `INCLUDED` | Credit is included in gross liability | Default state for all credits in HU-11 |
| `TO_BE_SETTLED` | Credit will be fully settled by the new product | Removes the credit's `monthlyDebtContribution` from adjusted debt |
| `REPLACED_BY_NEW_PAYMENT` | Credit's monthly payment is replaced by the new product's payment | Substitutes the credit's payment with the new product's monthly installment |

This second layer will prevent products like mortgage substitution or debt consolidation from double-counting the current mortgage payment.
