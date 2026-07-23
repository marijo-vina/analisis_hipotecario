# Delta for Frontend

## ADDED Requirements

### Requirement: Bank Viability Type Definitions

The system SHALL define typed contracts in `app/lib/definitions.ts`: `ProductMatchStatus` (`PRELIMINARY_VIABLE | CONDITIONED | REQUIRES_REVIEW | NOT_COMPATIBLE`), `CheckStatus` (`PASS | FAIL | REQUIRES_REVIEW | NOT_APPLICABLE`), `BankViabilitySnapshot`, `ProductMatch`, `ProductMatchCalculation`, `ProductPolicySnapshot`, and `CheckResult`. No `Record<string, unknown>` casts SHALL be used in the comparison tab UI.

#### Scenario: All types are declared and exported

- GIVEN the frontend needs to consume `bankViability` data
- WHEN types are defined in `definitions.ts`
- THEN `BankViabilitySnapshot` includes `sourceVersion`, `creditTypeCode`, `destination`, `calculatedAt`, `warningLegend`, `reasons`, `inputs`, and `productMatches`

#### Scenario: ProductMatchCalculation matches backend shape

- GIVEN a `ProductMatch` from the API
- WHEN its `calculation` field is typed
- THEN it includes `incomeUsed`, `maximumDebt`, `totalMonthlyLiabilities`, `availableCapacity`, `requestedLtv`, `maximumAmountByLtv`, `requiredReduction`, `currentAgeMonths`, `ageAtMaturityMonths`, `employmentTenureMonths`, and `maximumTheoreticalTermMonths`

#### Scenario: ProductPolicySnapshot defines expected shape

- GIVEN the backend `policySnapshot` is typed as `Record<string, unknown>`
- WHEN the frontend defines `ProductPolicySnapshot`
- THEN it includes `bankName`, `productName`, `incomeCriterion`, `debtCommitmentFactor`, `maximumLtv`, `minimumApplicantAgeMonths`, `maximumApplicationAgeMonths`, `maximumMaturityAgeMonths`, and `minimumEmploymentTenureMonths`
- AND the frontend SHALL handle missing `bankName`/`productName` by falling back to `bankCode`/`productCode`

### Requirement: AnalysisDetail Extended with bankViability

The system SHALL extend `AnalysisDetail` with an optional `bankViability?: BankViabilitySnapshot` field so TypeScript recognizes the data returned by both POST and GET analysis endpoints.

#### Scenario: bankViability is accessible on AnalysisDetail

- GIVEN an `AnalysisDetail` object from the API
- WHEN accessing `detail.bankViability`
- THEN TypeScript accepts it without casting

### Requirement: Centralized Translation Catalog

Status codes and reasons SHALL be translated through a centralized mapping constant or module, not through inline conditionals scattered across components. The system SHALL define:

```typescript
const STATUS_LABELS: Record<string, string> = {
  PRELIMINARY_VIABLE: 'Viable preliminarmente',
  CONDITIONED: 'Condicionado',
  REQUIRES_REVIEW: 'Requiere revisión',
  NOT_COMPATIBLE: 'No compatible',
};
const REASON_LABELS: Record<string, string> = {
  NEGATIVE_CAPACITY: 'Capacidad negativa',
  LTV_EXCEEDED: 'Aforo excede el máximo permitido',
};
```

#### Scenario: All status codes use centralized labels

- GIVEN a product match with status `PRELIMINARY_VIABLE`
- WHEN the status badge renders
- THEN it uses `STATUS_LABELS.PRELIMINARY_VIABLE` to display "Viable preliminarmente"

#### Scenario: All reason codes use centralized labels

- GIVEN a product match with reasons `['NEGATIVE_CAPACITY', 'LTV_EXCEEDED']`
- WHEN reasons render in the detail panel
- THEN each reason is looked up in `REASON_LABELS` and displays the Spanish description

### Requirement: Human-Readable Age Formatting

Ages SHALL be displayed as human-readable years and remaining months, omitting zero-value units. The system SHALL convert months to years and months: 360 months → "30 años", 365 months → "30 años 5 meses", 12 months → "1 año", 13 months → "1 año 1 mes".

#### Scenario: Whole years display without months

- GIVEN `currentAgeMonths: 360`
- WHEN the age renders
- THEN it displays "30 años"

#### Scenario: Years with remaining months display both units

- GIVEN `currentAgeMonths: 365`
- WHEN the age renders
- THEN it displays "30 años 5 meses"

#### Scenario: Single year displays singular form

- GIVEN `currentAgeMonths: 12`
- WHEN the age renders
- THEN it displays "1 año"

#### Scenario: Single year with months displays both

- GIVEN `currentAgeMonths: 13`
- WHEN the age renders
- THEN it displays "1 año 1 mes"

### Requirement: Comparativa Bancaria Tab UI

The system SHALL render a "Comparativa bancaria" tab with four blocks: status header, financial summary, product comparison table, and expandable product detail. The tab SHALL display 6 UI states:

| State | Trigger |
|-------|---------|
| Sin análisis | No analysis exists (`bankViability` is null/undefined) |
| Resultados | `productMatches` array exists with data |
| Destino no soportado | `destination` is null or has no bank mapping |
| Datos insuficientes | No `productMatches` OR all are `REQUIRES_REVIEW`, AND global reasons include `MISSING_INCOME_CALCULATION`, `MISSING_LIABILITY_SNAPSHOT`, `INVALID_PROPERTY_VALUE`, or `INVALID_REQUESTED_AMOUNT` |
| Sin productos | `productMatches.length === 0` with supported destination |
| Error | Backend returned an error response |

`loading` is NOT a tab state — execution/loading belongs to the "Análisis del expediente" section's progress indicator.

#### Scenario: Status header shows aggregated result

- GIVEN a completed analysis with bank viability data
- WHEN the tab renders
- THEN it shows total products evaluated, count by status, and a summary like "5 productos evaluados para adquisición"

#### Scenario: Financial summary displays 7 fields

- GIVEN bank viability inputs are available
- WHEN the financial summary renders
- THEN it shows ingreso bruto, ingreso neto, pasivo mensual, monto solicitado, valor inmueble, plazo, and destino

#### Scenario: Product table renders 8 columns

- GIVEN product matches exist
- WHEN the comparison table renders
- THEN columns are: Banco, Producto, Ingreso (Neto/Bruto · $X), CE, Máx. endeud., Cap. disponible, Aforo, Estado

#### Scenario: Products ordered by status then capacity

- GIVEN multiple product matches with varying statuses and capacities
- WHEN the table renders
- THEN products are ordered PRELIMINARY_VIABLE → CONDITIONED → REQUIRES_REVIEW → NOT_COMPATIBLE, then by `availableCapacity DESC` (nulls last)

#### Scenario: Null values render as dash

- GIVEN a product match with `availableCapacity: null`
- WHEN the table cell renders
- THEN it displays "—" instead of "null" or "undefined"

#### Scenario: Compact status badges render correctly

- GIVEN a product with status `PRELIMINARY_VIABLE`
- WHEN the status badge renders
- THEN it shows a solid green background with white text
- AND `CONDITIONED` → amber, `REQUIRES_REVIEW` → blue, `NOT_COMPATIBLE` → red

#### Scenario: Expandable detail shows 3 sections

- GIVEN a product row is expanded
- WHEN the detail panel renders
- THEN it shows Cálculo financiero (with income criterion, income used, Factor CE, max debt, liabilities, available capacity), Controles evaluados (Control/Expediente/Política/Resultado), and Razones

#### Scenario: Income criterion is displayed in financial calculation

- GIVEN a product match with `policySnapshot.incomeCriterion`
- WHEN the Cálculo financiero table renders
- THEN the first row shows "Criterio de ingreso" with value "Bruto" (for GROSS) or "Neto" (for NET)

#### Scenario: 6 controls are displayed

- GIVEN a product match with checks
- WHEN the controls table renders
- THEN it shows exactly 6 controls: capacidad de pago, aforo, edad mínima solicitante, edad máxima de solicitud, edad al vencimiento, antigüedad laboral

#### Scenario: Aforo-conditioned shows max amount and reduction

- GIVEN a product with LTV check status `FAIL`
- WHEN the detail renders
- THEN it shows the maximum viable amount and the required reduction (e.g., "90% / máx. 80%")

#### Scenario: Maturity-conditioned shows max theoretical term

- GIVEN a product with `maximumTheoreticalTermMonths: 240`
- WHEN the detail renders
- THEN it displays the maximum theoretical term in years/months

#### Scenario: Warning legend displays below results

- GIVEN bank viability data with a `warningLegend`
- WHEN the tab renders
- THEN the legend appears as a separate block below the comparison table

#### Scenario: Unsupported destination state

- GIVEN `destination` is null or unsupported
- WHEN the tab renders
- THEN it shows a message indicating the credit type has no bank mapping

#### Scenario: Datos insuficientes with missing income calculation

- GIVEN `productMatches` is empty or all are `REQUIRES_REVIEW`
- AND global `reasons` includes `MISSING_INCOME_CALCULATION`
- WHEN the tab renders
- THEN it shows "Datos insuficientes" with "Falta cálculo de ingresos"

#### Scenario: Datos insuficientes with missing liability snapshot

- GIVEN `productMatches` is empty or all are `REQUIRES_REVIEW`
- AND global `reasons` includes `MISSING_LIABILITY_SNAPSHOT`
- WHEN the tab renders
- THEN it shows "Datos insuficientes" with "Falta snapshot de pasivos"

#### Scenario: Datos insuficientes NOT triggered by missing birth date alone

- GIVEN `productMatches` contains viable or conditioned products
- AND global `reasons` includes `MISSING_BIRTH_DATE`
- WHEN the tab renders
- THEN the product table is shown (not "Datos insuficientes")

#### Scenario: Table shown when productMatches exist even with REQUIRES_REVIEW

- GIVEN `productMatches` contains entries (even if all are `REQUIRES_REVIEW`)
- WHEN the tab renders
- THEN the product table is shown, not the "Datos insuficientes" empty state

#### Scenario: No products state

- GIVEN `productMatches.length === 0` with a supported destination
- WHEN the tab renders
- THEN it shows "No se encontraron productos compatibles"

#### Scenario: Backend codes are never exposed

- GIVEN product reasons contain codes like `UNCONFIRMED_INCOME`, `LTV_EXCEEDED`
- WHEN the UI renders reasons
- THEN codes are translated to Spanish descriptions via the centralized translation catalog

#### Scenario: Aforo displays requested and maximum LTV when both exist

- GIVEN a product match with `requestedLtv: "90%"` and `maximumLtv: "80%"`
- WHEN the aforo column renders
- THEN it displays "90% / máx. 80%"

### Requirement: Header Redesign with Global Button

The system SHALL display the "Analizar expediente" / "Re-ejecutar análisis" button in the same row as the "Análisis del expediente" title, aligned to the right. The button SHALL NOT appear inside the Validaciones tab content.

#### Scenario: Button in header row

- GIVEN the analysis section is rendered
- WHEN the header displays
- THEN the title and action button are on the same row, button aligned right

#### Scenario: No re-execute link inside Validaciones tab

- GIVEN the Validaciones tab content
- WHEN the tab renders
- THEN there is no "Re-ejecutar análisis" link within the tab body

### Requirement: Global 3-Phase Progress Indicator

The system SHALL display a 3-phase progress indicator (Validaciones → Motor financiero → Comparativa bancaria) ONLY during analysis execution or when an error occurs. Since the backend uses a single `POST /analyze` call without per-phase progress, all phases SHALL render as pending (gray) during the request. Only after the request succeeds SHALL all phases be marked as completed (green). If the request fails, the error state SHALL be shown without marking any individual phase as failed.

#### Scenario: All phases pending during request

- GIVEN analysis is in progress
- WHEN the UI renders
- THEN all 3 phases display as pending (gray)
- AND no phase is marked as completed (green) or active (amber) using timers

#### Scenario: All phases completed after success

- GIVEN analysis completed successfully
- WHEN the UI renders
- THEN all 3 phases are marked as completed (green)
- AND the progress indicator is replaced by "✓ Análisis completado el [fecha]"

#### Scenario: Error state without per-phase failure

- GIVEN analysis failed
- WHEN the UI renders
- THEN an error state is shown with "Reintentar análisis"
- AND a failed execution SHALL NOT replace the latest complete analysis displayed in the UI

#### Scenario: Tabs disabled during analysis

- GIVEN analysis is executing
- WHEN tabs render
- THEN all tabs are visible but grayed out (disabled), preventing navigation during execution

## MODIFIED Requirements

### Requirement: Tab Label Rename

The tab previously labeled "Bancos / Viabilidad" SHALL be renamed to "Comparativa bancaria".
(Previously: Tab label was "Bancos / Viabilidad".)

#### Scenario: Tab displays new label

- GIVEN the analysis section renders
- WHEN tabs are displayed
- THEN the third tab shows "Comparativa bancaria"
