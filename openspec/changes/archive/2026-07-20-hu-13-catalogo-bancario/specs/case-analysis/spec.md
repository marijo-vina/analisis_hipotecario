# Delta for Case Analysis

## ADDED Requirements

### Requirement: BankViabilityRule

The system SHALL implement a BankViabilityRule that evaluates all active BankProductPolicy rows matching the case's destination against the case's financial data.

**Inputs**: destination (from CreditType), requestedAmount, propertyValue, estimatedTermMonths (from MortgageCase), confirmedGrossIncome, confirmedNetIncome (from latest IncomeCalculation), totalMonthlyLiabilities (from latest LiabilitySnapshot), birthDate (from latest identity document extraction), employmentStartDate (from latest payroll document extraction), hasPagadoraIncome (derived from bankarization/payroll analysis), scotiabankExcluded (from Document.processingResults), calculatedAt (execution timestamp).

**7 Controls**:

| # | Control | Formula | Failure Status | Null Behavior |
|---|---------|---------|----------------|---------------|
| 1 | Income selection | NET→confirmedNetIncome, GROSS→confirmedGrossIncome | REQUIRES_REVIEW if not confirmed | N/A |
| 2 | Debt capacity | incomeUsed × bank.debtCommitmentFactor - totalMonthlyLiabilities | NOT_COMPATIBLE if ≤ 0 | N/A |
| 3 | LTV | Guarded: requestedAmount / propertyValue only if both > 0 | REQUIRES_REVIEW if invalid; CONDITIONED if exceeded | N/A |
| 4 | Maturity age | currentAgeMonths + estimatedTermMonths ≤ maximumMaturityAgeMonths | CONDITIONED if exceeded; NOT_COMPATIBLE if no valid term available | NOT_APPLICABLE if null |
| 5 | Minimum applicant age | currentAgeMonths ≥ minimumApplicantAgeMonths | NOT_COMPATIBLE if below | NOT_APPLICABLE if null |
| 6 | Employment tenure | completeMonthsBetween(employmentStartDate, calculatedAt) ≥ minimumEmploymentTenureMonths | NOT_COMPATIBLE if below | NOT_APPLICABLE if null |
| 7 | Maximum application age | currentAgeMonths ≤ maximumApplicationAgeMonths | NOT_COMPATIBLE if exceeded | NOT_APPLICABLE if null |

**Data Source Precedence**:

| Input | Source | Missing → |
|-------|--------|-----------|
| birthDate | Latest INE extraction (Document.processingResults) | REQUIRES_REVIEW / MISSING_BIRTH_DATE |
| employmentStartDate | Latest payroll OCR (hireDate or computed from tenure) | REQUIRES_REVIEW if missing; REQUIRES_REVIEW if conflicting across receipts |
| confirmedGrossIncome | Latest IncomeCalculation.confirmedGrossIncome | REQUIRES_REVIEW if null |
| confirmedNetIncome | Latest IncomeCalculation.confirmedNetIncome | REQUIRES_REVIEW if null |
| totalMonthlyLiabilities | Latest LiabilitySnapshot.grossCurrentMonthlyDebt | REQUIRES_REVIEW if no snapshot |
| destination | CreditType.destination | PARTIAL / UNSUPPORTED_DESTINATION (no products evaluated) |
| hasPagadoraIncome | Latest bankarization/payroll analysis result | false (default) |
| scotiabankExcluded | Document.processingResults flag | false (default) |

**LTV Guard**: Before computing requestedAmount / propertyValue, the system SHALL validate: if requestedAmount is null or ≤ 0 → REQUIRES_REVIEW with INVALID_REQUESTED_AMOUNT. If propertyValue is null or ≤ 0 → REQUIRES_REVIEW with INVALID_PROPERTY_VALUE. No division SHALL be performed with invalid values.

**Scotiabank Rule**: If hasPagadoraIncome === true AND scotiabankExcluded === true, all Scotiabank products SHALL return REQUIRES_REVIEW with SCOTIABANK_PAGADORA_EXCLUSION. Other bank products SHALL be evaluated normally. hasPagadoraIncome is derived from the latest bankarization or payroll analysis result, NOT from mere document existence.

**Null Policy Fields**: When any optional policy limit is null (minimumEmploymentTenureMonths, minimumApplicantAgeMonths, maximumApplicationAgeMonths, maximumMaturityAgeMonths, maximumLtv), its corresponding check SHALL return NOT_APPLICABLE and SHALL NOT affect the product verdict.

**Maturity Age — Theoretical Max Term**: The system SHALL compute `maximumTheoreticalTermMonths = max(0, maximumMaturityAgeMonths - currentAgeMonths)`. If maximumTheoreticalTermMonths > 0: maturity age failure is CONDITIONED. If maximumTheoreticalTermMonths ≤ 0: the product is NOT_COMPATIBLE with NO_VALID_TERM_AVAILABLE. The caveat "Requiere reducir el plazo; validar disponibilidad del plazo resultante en el producto." SHALL be included only when maximumTheoreticalTermMonths > 0.

**Age Calculations**: All age/tenure calculations SHALL use `completeMonthsBetween(date, calculatedAt)` with the same calculatedAt reference timestamp. birthDate, employmentStartDate, and calculatedAt SHALL be treated as date-only (no time component) to avoid timezone drift.

**Product Status Precedence** (per product):
1. Non-correctable rule fails → NOT_COMPATIBLE
2. No non-correctable failures, but data missing → REQUIRES_REVIEW
3. No data missing, correctable rule fails → CONDITIONED
4. All applicable rules pass → PRELIMINARY_VIABLE

**Aggregate Outcome Mapping**:
- ≥1 PRELIMINARY_VIABLE → outcome: PASS
- No viable, but ≥1 CONDITIONED or REQUIRES_REVIEW → outcome: PARTIAL
- All NOT_COMPATIBLE → outcome: FAIL
- Destination null → outcome: PARTIAL (empty productMatches, bankViability-level UNSUPPORTED_DESTINATION)

**Two-Level Reasons**:
- `bankViability.reasons`: global issues that prevent match execution (UNSUPPORTED_DESTINATION, MISSING_BIRTH_DATE)
- `productMatches[].reasons`: per-product failures (LTV_EXCEEDED, MATURITY_AGE_EXCEEDED, etc.)

All calculations SHALL use Prisma.Decimal for arithmetic to avoid floating-point drift.

#### Scenario: Producto viable preliminarmente

- GIVEN confirmed income, liabilities, birth date, and employment date available
- AND all 7 controls pass for product BANORTE_ADQ_HF
- WHEN BankViabilityRule executes
- THEN status is PRELIMINARY_VIABLE
- AND all checks show PASS (or NOT_APPLICABLE)
- AND productMatches[].reasons is empty

#### Scenario: Producto condicionado por aforo

- GIVEN capacity is positive
- AND requestedAmount / propertyValue exceeds maximumLtv
- WHEN BankViabilityRule executes
- THEN status is CONDITIONED
- AND requiredReduction > 0
- AND reasons includes LTV_EXCEEDED

#### Scenario: Producto condicionado por edad al vencimiento

- GIVEN currentAgeMonths + estimatedTermMonths > maximumMaturityAgeMonths
- AND all non-correctable rules pass
- AND maximumTheoreticalTermMonths > 0
- WHEN BankViabilityRule executes
- THEN status is CONDITIONED
- AND reasons includes MATURITY_AGE_EXCEEDED
- AND maximumTheoreticalTermMonths is included in calculation

#### Scenario: No existe plazo teórico disponible

- GIVEN currentAgeMonths >= maximumMaturityAgeMonths
- AND maximumApplicationAge does not already produce a failure
- WHEN BankViabilityRule executes
- THEN maximumTheoreticalTermMonths is 0
- AND status is NOT_COMPATIBLE
- AND reasons includes NO_VALID_TERM_AVAILABLE

#### Scenario: Producto no compatible por capacidad negativa

- GIVEN maximumDebt <= totalMonthlyLiabilities
- WHEN BankViabilityRule executes
- THEN status is NOT_COMPATIBLE
- AND availableCapacity <= 0

#### Scenario: Producto no compatible por antigüedad insuficiente

- GIVEN employment tenure is 3 months and minimum is 6 months
- WHEN BankViabilityRule executes
- THEN status is NOT_COMPATIBLE
- AND reasons includes INSUFFICIENT_EMPLOYMENT_TENURE

#### Scenario: Producto no compatible por edad actual superior al máximo de solicitud

- GIVEN currentAgeMonths exceeds maximumApplicationAgeMonths by 1 month
- WHEN BankViabilityRule executes
- THEN status is NOT_COMPATIBLE
- AND reasons includes MAXIMUM_APPLICATION_AGE_EXCEEDED

#### Scenario: Producto sin edad máxima de solicitud configurada

- GIVEN maximumApplicationAgeMonths is null
- WHEN BankViabilityRule executes
- THEN maximumApplicationAge check is NOT_APPLICABLE
- AND the check does not affect the product verdict

#### Scenario: Política opcional null no afecta veredicto

- GIVEN minimumEmploymentTenureMonths is null
- AND minimumApplicantAgeMonths is null
- AND maximumMaturityAgeMonths is null
- WHEN BankViabilityRule executes
- THEN employmentTenure check is NOT_APPLICABLE
- AND minimumApplicantAge check is NOT_APPLICABLE
- AND maturityAge check is NOT_APPLICABLE
- AND none of these checks affect the product status

#### Scenario: Edad al vencimiento excedida pero edad al solicitar dentro de límite

- GIVEN currentAgeMonths <= maximumApplicationAgeMonths
- AND currentAgeMonths + estimatedTermMonths > maximumMaturityAgeMonths
- AND maximumTheoreticalTermMonths > 0
- WHEN BankViabilityRule executes
- THEN maximumApplicationAge is PASS
- AND maturityAge is FAIL
- AND status is CONDITIONED (not NOT_COMPATIBLE)

#### Scenario: Scotiabank requiere revisión por pagadora

- GIVEN hasPagadoraIncome is true AND scotiabankExcluded is true
- WHEN BankViabilityRule evaluates Scotiabank products
- THEN Scotiabank products return REQUIRES_REVIEW with SCOTIABANK_PAGADORA_EXCLUSION
- AND other bank products are evaluated normally

#### Scenario: Fecha de nacimiento ausente

- GIVEN no birthDate in any identity document extraction
- WHEN BankViabilityRule executes
- THEN all products return REQUIRES_REVIEW
- AND reasons includes MISSING_BIRTH_DATE

#### Scenario: Fechas de ingreso contradictorias entre recibos

- GIVEN two payroll receipts with different employmentStartDate values
- WHEN BankViabilityRule executes
- THEN products return REQUIRES_REVIEW
- AND reasons includes CONFLICTING_EMPLOYMENT_DATES

#### Scenario: Ingreso no confirmado

- GIVEN confirmedNetIncome is null and incomeCriterion is NET
- WHEN BankViabilityRule executes
- THEN products return REQUIRES_REVIEW
- AND reasons includes UNCONFIRMED_INCOME

#### Scenario: Destino no soportado

- GIVEN CreditType.destination is null
- WHEN BankViabilityRule executes
- THEN aggregate outcome is PARTIAL
- AND productMatches is empty
- AND bankViability.reasons includes UNSUPPORTED_DESTINATION

#### Scenario: Valor del inmueble inválido

- GIVEN propertyValue is null or zero
- WHEN BankViabilityRule executes
- THEN affected products return REQUIRES_REVIEW
- AND reasons includes INVALID_PROPERTY_VALUE
- AND no division is performed

#### Scenario: Monto solicitado inválido

- GIVEN requestedAmount is null or less than or equal to zero
- WHEN BankViabilityRule executes
- THEN affected products return REQUIRES_REVIEW
- AND reasons includes INVALID_REQUESTED_AMOUNT

#### Scenario: Agregado de resultados a nivel caso

- GIVEN one product is PRELIMINARY_VIABLE and two are NOT_COMPATIBLE
- WHEN BankViabilityRule completes
- THEN aggregate outcome is PASS

#### Scenario: Agregado sin viables pero con condicionados

- GIVEN no PRELIMINARY_VIABLE products
- AND one product is CONDITIONED
- WHEN BankViabilityRule completes
- THEN aggregate outcome is PARTIAL

#### Scenario: Agregado todos no compatibles

- GIVEN all products are NOT_COMPATIBLE
- WHEN BankViabilityRule completes
- THEN aggregate outcome is FAIL

#### Scenario: Cálculos con Decimal

- GIVEN incomeUsed is 56976.33 and debtCommitmentFactor is 0.60
- WHEN computing maximumDebt
- THEN arithmetic uses Prisma.Decimal to avoid floating-point drift

#### Scenario: completeMonthsBetween usa fecha de referencia común

- GIVEN birthDate is 1992-06-14 and calculatedAt is 2026-07-20
- WHEN computing currentAgeMonths
- THEN result is completeMonthsBetween(birthDate, calculatedAt) in whole months
- AND employmentTenureMonths uses the same calculatedAt

### Requirement: Audit snapshot in AnalysisRun.detail

The rule SHALL store a complete audit snapshot under `detail.bankViability` in the AnalysisRun record. The snapshot MUST include: sourceVersion, creditTypeCode, destination, calculatedAt, inputs (all case data used), warningLegend (once at bankViability level), bankViability.reasons (global issues), productMatches (per-product status, policySnapshot, calculation, checks, product-level reasons).

**Two-Level Reasons**:
- `bankViability.reasons`: global issues that prevent match execution (e.g., UNSUPPORTED_DESTINATION, MISSING_BIRTH_DATE)
- `productMatches[].reasons`: per-product failure codes (e.g., LTV_EXCEEDED, MATURITY_AGE_EXCEEDED, NO_VALID_TERM_AVAILABLE)

**Snapshot structure**:

```json
{
  "bankViability": {
    "sourceVersion": "ANAQUEL_MAYO_2026",
    "creditTypeCode": "COMPRA",
    "destination": "ACQUISITION",
    "calculatedAt": "2026-07-20T15:00:00Z",
    "warningLegend": "Evaluación preliminar basada en la información disponible y en políticas internas registradas. No constituye una aprobación o autorización de crédito por parte del banco.",
    "reasons": [],
    "inputs": {
      "confirmedGrossIncome": "83427.21",
      "confirmedNetIncome": "56976.33",
      "totalMonthlyLiabilities": "19304.74",
      "requestedAmount": "1600000.00",
      "propertyValue": "2000000.00",
      "estimatedTermMonths": 240,
      "birthDate": "1992-06-14",
      "employmentStartDate": "2024-01-15"
    },
    "productMatches": [
      {
        "bankCode": "BANORTE",
        "productCode": "BANORTE_ADQ_HF",
        "status": "PRELIMINARY_VIABLE",
        "reasons": [],
        "policySnapshot": {
          "incomeCriterion": "NET",
          "debtCommitmentFactor": "0.60",
          "minimumEmploymentTenureMonths": 6,
          "minimumApplicantAgeMonths": 300,
          "maximumApplicationAgeMonths": 839,
          "maximumMaturityAgeMonths": 960,
          "maximumLtv": "0.90"
        },
        "calculation": {
          "incomeUsed": "56976.33",
          "maximumDebt": "34185.80",
          "totalMonthlyLiabilities": "19304.74",
          "availableCapacity": "14881.06",
          "requestedLtv": "0.80",
          "maximumAmountByLtv": "1800000.00",
          "requiredReduction": "0.00",
          "maximumTheoreticalTermMonths": 420
        },
        "checks": {
          "capacity": { "status": "PASS", "availableCapacity": "14881.06" },
          "employmentTenure": { "status": "PASS", "actualMonths": 18, "requiredMonths": 6 },
          "minimumApplicantAge": { "status": "PASS", "actualMonths": 540, "requiredMonths": 300 },
          "maximumApplicationAge": { "status": "PASS", "actualMonths": 540, "maximumMonths": 839 },
          "maturityAge": { "status": "PASS", "actualMonths": 780, "maximumMonths": 960 },
          "ltv": { "status": "PASS", "requestedLtv": "0.80", "maximumLtv": "0.90" }
        }
      }
    ]
  }
}
```

When a policy limit is null, the check SHALL be `{ "status": "NOT_APPLICABLE" }` with relevant actual values where available.

#### Scenario: Snapshot contiene política usada

- GIVEN BankViabilityRule completes for BANORTE_ADQ_HF
- WHEN result is stored in AnalysisRun.detail
- THEN bankViability includes policySnapshot with debtCommitmentFactor 0.60 and incomeCriterion NET

#### Scenario: Snapshot contiene entradas del caso

- GIVEN BankViabilityRule completes
- WHEN result is stored
- THEN bankViability.inputs includes confirmedNetIncome, requestedAmount, propertyValue, birthDate, employmentStartDate, estimatedTermMonths

#### Scenario: Leyenda de advertencia a nivel bankViability

- GIVEN any match execution
- WHEN result is stored
- THEN warningLegend appears once at bankViability level
- AND is NOT duplicated inside individual productMatches

#### Scenario: Razones globales separadas de razones por producto

- GIVEN CreditType.destination is null
- WHEN BankViabilityRule executes
- THEN bankViability.reasons includes UNSUPPORTED_DESTINATION
- AND productMatches is empty

#### Scenario: Snapshot incluye calculatedAt

- GIVEN BankViabilityRule executes at a specific timestamp
- WHEN result is stored
- THEN bankViability.calculatedAt matches the execution timestamp
- AND all age/tenure calculations use this same timestamp
