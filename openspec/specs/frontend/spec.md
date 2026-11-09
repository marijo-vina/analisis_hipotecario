# Spec: Interfaz Base Interna para Asesora (HU-04)

## Purpose

Frontend web UI mínima para que la asesora gestione clientes y expedientes hipotecarios desde el navegador. Autenticación vía JWT en cookie httpOnly, Server Components para fetching, Client Components solo para formularios interactivos.

> **Convención de rutas:** Las rutas frontend usan español (`/dashboard/clientes`, `/dashboard/expedientes`). Los endpoints del backend se mantienen en inglés (`/clients`, `/mortgage-cases`). El mapeo ocurre dentro de `apiFetch` y las Server Actions; las URLs del navegador nunca exponen endpoints del backend.

## Capabilities

| Capability | Type | Description |
|---|---|---|
| `frontend-auth` | New | Login, logout y gestión de sesión JWT en httpOnly cookie |
| `frontend-clients` | New | Listado, alta y detalle de clientes desde UI |
| `frontend-mortgage-cases` | Modified | Listado, alta y detalle de expedientes desde UI. StatusBadge compartido en listado y detalle. Detalle incluye dropdown inline para cambio de estado. |
| `frontend-proxy` | New | Redirección de rutas protegidas en Next.js |

---

## 1. Requirements

### Functional

| ID | Requirement |
|----|-------------|
| FR-01 | La asesora MUST poder iniciar sesión con email y contraseña desde `/login` |
| FR-02 | El sistema MUST almacenar el JWT como cookie httpOnly `token` al iniciar sesión |
| FR-03 | El sistema MUST redirigir a `/login` si no hay cookie `token` en rutas `/dashboard/*` |
| FR-04 | El sistema MUST redirigir a `/dashboard` si hay cookie `token` al acceder a `/login` |
| FR-05 | La asesora MUST poder cerrar sesión (borrar cookie y redirigir a `/login`) |
| FR-06 | La asesora MUST ver listado paginado de clientes en `/dashboard/clientes` |
| FR-07 | La asesora MUST poder crear un cliente desde `/dashboard/clientes/nuevo` |
| FR-08 | La asesora MUST ver detalle de un cliente en `/dashboard/clientes/[id]` (datos básicos: nombre, RFC, CURP, email, teléfono, fechas). Expedientes vinculados diferidos a HU posterior. |
| FR-09 | La asesora MUST ver listado paginado de expedientes en `/dashboard/expedientes` |
| FR-10 | La asesora MUST poder crear un expediente desde `/dashboard/expedientes/nuevo` |
| FR-11 | La asesora MUST ver detalle de expediente en `/dashboard/expedientes/[id]` |
| FR-12 | El sistema MUST mostrar errores de validación (400) al usuario. Si el backend devuelve un campo específico en `message`, se muestra error inline debajo del campo correspondiente. Si no, se muestra un mensaje general del formulario. |
| FR-13 | El sistema MUST redirigir a `/login` y borrar cookie ante cualquier respuesta 401 del backend |
| FR-14 | El sistema MUST mostrar "No encontrado" ante 404 en páginas de detalle |
| FR-15 | El sistema MUST mostrar mensaje específico ante 409 ("RFC ya registrado" / "Email ya registrado") |
| FR-16 | La asesora MUST poder navegar entre módulos desde una barra lateral en el dashboard |
| FR-0512 | P0 | Listado de expedientes MUST renderizar columna de estado vía `StatusBadge` compartido con color correcto por estado |
| FR-0513 | P0 | Detalle de expediente MUST mostrar dropdown poblado desde `GET /case-statuses` con los 8 estados, pre-seleccionando el actual |
| FR-0514 | P0 | Botón "Cambiar" MUST llamar `updateCaseStatus` server action, revalidar página de detalle en éxito, mostrar error inline en falla |

### Non-Functional

| ID | Requirement |
|----|-------------|
| NFR-01 | El proxy (`proxy.ts`, reemplaza al deprecado `middleware.ts` en Next.js 16) MUST evaluar la cookie `token` server-side antes de servir rutas `/dashboard/*`. No debe depender de redirecciones client-side. |
| NFR-02 | Toda llamada a API desde Server Components/Actions MUST incluir `Authorization: Bearer <token>` |
| NFR-03 | La cookie `token` MUST ser httpOnly, SameSite=Lax, Path=/. `Secure` solo en producción (`NODE_ENV=production`). En desarrollo local debe funcionar sobre `localhost` sin HTTPS. |
| NFR-04 | Ante JWT expirado (401), el frontend SHOULD borrar la cookie y redirigir consistentemente |
| NFR-05 | Las páginas de listado MUST aceptar query params `page` y `limit` para paginación |

---

## 2. Scenarios

### FR-01: Login con email y contraseña

- **GIVEN** credenciales válidas → **WHEN** envía formulario en `/login` → **THEN** `POST /auth/login` retorna `access_token`, se guarda cookie `token`, redirige a `/dashboard`
- **GIVEN** credenciales inválidas → **WHEN** envía formulario → **THEN** se muestra "Credenciales inválidas", permanece en `/login`
- **GIVEN** email vacío → **WHEN** intenta enviar → **THEN** error inline "El email es obligatorio"
- **GIVEN** contraseña vacía → **WHEN** intenta enviar → **THEN** error inline "La contraseña es obligatoria"
- **GIVEN** contraseña < 6 caracteres → **WHEN** envía → **THEN** error inline del backend

### FR-02: Cookie JWT httpOnly

- **GIVEN** login exitoso → **WHEN** Server Action recibe `access_token` → **THEN** cookie `token` seteada con flags: httpOnly, Secure (prod), SameSite=Lax, Path=/
- **GIVEN** sesión activa → **WHEN** inspecciona `document.cookie` en browser → **THEN** cookie `token` no es accesible desde JavaScript

### FR-03: Redirección no autenticados

- **GIVEN** usuario sin cookie `token` → **WHEN** accede a cualquier `/dashboard/*` → **THEN** proxy redirige a `/login`
- **GIVEN** cookie con JWT expirado → **WHEN** `apiFetch` recibe 401 del backend → **THEN** borra cookie, redirige a `/login` con mensaje "Sesión expirada"

### FR-04: Redirección desde /login con sesión activa

- **GIVEN** cookie `token` presente y válida → **WHEN** accede a `/login` → **THEN** proxy redirige a `/dashboard`

### FR-05: Cierre de sesión

- **GIVEN** asesora autenticada → **WHEN** hace clic en "Cerrar sesión" → **THEN** cookie `token` eliminada, redirige a `/login`

### FR-06: Listado de clientes

- **GIVEN** clientes registrados → **WHEN** accede a `/dashboard/clientes` → **THEN** tabla muestra: nombre completo, email, teléfono, RFC, acción "Ver"
- **GIVEN** más de 10 clientes → **WHEN** navega a página 2 → **THEN** `GET /clients?page=2&limit=10`, muestra segunda página
- **GIVEN** cero clientes → **WHEN** accede al listado → **THEN** mensaje "No hay clientes registrados"

### FR-07: Alta de cliente

- **GIVEN** campos obligatorios completos (firstName, paternalLastName, email, phone) → **WHEN** envía formulario → **THEN** `POST /clients`, redirige a listado con confirmación
- **GIVEN** RFC o email duplicado → **WHEN** envía → **THEN** 409, mensaje específico inline
- **GIVEN** email con formato inválido → **WHEN** envía → **THEN** 400, error inline "Debe ser un email válido"
- **GIVEN** RFC mal formado → **WHEN** envía → **THEN** 400, error inline "RFC debe tener un formato válido"

### FR-08: Detalle de cliente

- **GIVEN** cliente con id `abc-123` → **WHEN** accede a `/dashboard/clientes/abc-123` → **THEN** muestra nombre completo, RFC, CURP, email, teléfono, fechas de creación/actualización. Expedientes vinculados quedan diferidos (no se consultan en HU-04).
- **GIVEN** id inexistente → **WHEN** accede → **THEN** 404, muestra "Cliente no encontrado"

### FR-09: Listado de expedientes

- **GIVEN** expedientes registrados → **WHEN** accede a `/dashboard/expedientes` → **THEN** tabla con cliente, tipo crédito, estado (badge con color), monto, fecha, acción "Ver"
- **GIVEN** más de 10 expedientes → **WHEN** navega página 2 → **THEN** `GET /mortgage-cases?page=2&limit=10`
- **GIVEN** cero expedientes → **WHEN** accede → **THEN** "No hay expedientes registrados"

### FR-10: Alta de expediente

- **GIVEN** clientId válido y creditTypeId seleccionado → **WHEN** envía en `/dashboard/expedientes/nuevo` → **THEN** `POST /mortgage-cases`, redirige a listado
- **GIVEN** clientId inexistente → **WHEN** envía → **THEN** 404 backend, mensaje "Cliente no encontrado" inline
- **GIVEN** creditTypeId no seleccionado → **WHEN** envía → **THEN** 400, error inline

### FR-11: Detalle de expediente

- **GIVEN** expediente existente → **WHEN** accede a `/dashboard/expedientes/:id` → **THEN** muestra cliente, asesor, tipo crédito, estado (badge con color), monto, ubicación, plazo, notas
- **GIVEN** advisor en detalle de expediente → **WHEN** selecciona nuevo estado en dropdown y clickea "Cambiar" → **THEN** se actualiza el estado, se revalida la página, el badge muestra el nuevo color
- **GIVEN** id inexistente → **WHEN** accede → **THEN** 404, "Expediente no encontrado"

### FR-12 a FR-15: Manejo de errores — ver Sección 5

### FR-16: Navegación entre módulos

- **GIVEN** asesora en `/dashboard` → **WHEN** hace clic en "Clientes" en la barra lateral → **THEN** navega a `/dashboard/clientes`
- **GIVEN** asesora en cualquier página del dashboard → **WHEN** hace clic en "Dashboard" → **THEN** vuelve a `/dashboard`

---

## 3. API Contracts (Frontend Perspective)

| Página / Acción | Método | Endpoint | Request | Respuesta Esperada |
|---|---|---|---|---|
| `/login` submit | POST | `/auth/login` | `{ email, password }` | `{ access_token, user: { id, email, name, role } }` |
| Logout | — | (local) | — | Borra cookie, redirect `/login` |
| Listado clientes | GET | `/clients?page=&limit=` | — | `{ data: Client[], meta: { page, limit, total } }` |
| Crear cliente | POST | `/clients` | `{ firstName, paternalLastName, maternalLastName?, rfc?, curp?, email, phone }` | `Client` (201) |
| Detalle cliente | GET | `/clients/:id` | — | `Client` (datos básicos: id, firstName, paternalLastName, maternalLastName, fullName, rfc, curp, email, phone, createdAt, updatedAt) |
| Listado expedientes | GET | `/mortgage-cases?page=&limit=` | — | `{ data: MortgageCase[], meta }` |
| Crear expediente | POST | `/mortgage-cases` | `{ clientId, creditTypeId, personType?, propertyLocation?, requestedAmount?, propertyValue?, estimatedTermMonths?, notes? }` | `MortgageCase` (201) |
| Detalle expediente | GET | `/mortgage-cases/:id` | — | `MortgageCase` con `client`, `advisor`, `creditType`, `status` |
| Cambiar estado expediente | PATCH | `/mortgage-cases/:id` | `{ statusCode }` | `MortgageCase` con includes (200) |
| Tipos de crédito | GET | `/credit-types` | — | `{ data: { id, code, name }[] }` |
| Estados de expediente | GET | `/case-statuses` | — | `{ data: { id, code, name, order }[] }` |

**Auth header:** `apiFetch()` lee cookie `token` y agrega `Authorization: Bearer <token>` en cada request. Solo corre en server-side (`server-only`).

---

## 4. Route Design

| Ruta | Auth | Comportamiento |
|---|---|---|
| `/` | Opcional | Redirige a `/dashboard` si hay cookie; sino landing |
| `/login` | Pública | Formulario login; redirige a `/dashboard` si autenticada |
| `/dashboard` | Requerida | Layout con sidebar + resumen de módulos |
| `/dashboard/clientes` | Requerida | Tabla paginada |
| `/dashboard/clientes/nuevo` | Requerida | Formulario alta cliente |
| `/dashboard/clientes/[id]` | Requerida | Detalle read-only |
| `/dashboard/expedientes` | Requerida | Tabla paginada |
| `/dashboard/expedientes/nuevo` | Requerida | Formulario con selectores de catálogo |
| `/dashboard/expedientes/[id]` | Requerida | Detalle con badge de estado y dropdown inline para cambio de estado |

**Proxy rules (`proxy.ts`):**
- `startsWith('/dashboard')` sin cookie `token` → 307 `/login`
- `/login` con cookie `token` → 307 `/dashboard`
- Archivo `proxy.ts` en raíz de `apps/web` (mismo nivel que `app/`). `middleware.ts` está deprecado en Next.js 16.

---

## 5. Error Handling

| Código | Origen | UX |
|---|---|---|
| **400** | Backend validation | Si el `message` incluye nombre de campo (ej. `["firstName should not be empty"]`), error inline debajo del campo. Si no, mensaje general del formulario. |
| **401** | Token inválido/expirado | Borrar cookie `token`, redirect `/login?reason=expired`, toast "Sesión expirada" |
| **404** | Recurso no encontrado | Página centrada con mensaje "Cliente no encontrado" / "Expediente no encontrado" + link volver |
| **409** | Conflicto (unique constraint) | Mensaje inline específico: "RFC ya registrado" o "Email ya registrado" |
| **500** | Error interno servidor | Banner/toast genérico: "Error inesperado. Intente nuevamente." |
| **Network** | Fetch falla (sin respuesta) | Mensaje: "No se pudo conectar con el servidor" |

---

## 6. Unified Analysis Flow (HU-14A)

### Requirement: Single Analysis Button

The system SHALL display a single "Analizar expediente" button in the Validaciones tab that calls `POST /mortgage-cases/:caseId/analyze`. This button SHALL replace all individual phase trigger buttons (no separate "Validar expediente", "Calcular", "Calcular ingresos" buttons).

#### Scenario: Single button triggers full analysis

- GIVEN the advisor is viewing a case's Validaciones tab
- WHEN they click "Analizar expediente"
- THEN the system calls `POST /mortgage-cases/:caseId/analyze` and displays progress/results

### Requirement: Auto-Refresh on Completion

The system SHALL refresh all tabs (validations, motor financiero, comparativa) upon analysis completion so that income, liability, and bank viability results are visible without manual navigation.

#### Scenario: All tabs update after analysis

- GIVEN analysis completes successfully
- WHEN the advisor switches to Motor Financiero tab
- THEN income and liability results are already populated

### Removed UI (HU-14A cleanup)

The following UI elements were eliminated as part of HU-14A's MVP simplification and are no longer present in the frontend:

- "Validar expediente" button (replaced by single "Analizar expediente" button)
- "Calcular" button for liability (replaced by single button)
- "Calcular ingresos" button (replaced by single button)
- "Confirmar revisión" button + `ActionsGroup` component + `OperationalStatusBadge` (manual review gating removed)
- Per-receipt "PENDIENTE / REVISADO" toggle in `estados-conciliacion` (manual receipt review removed)
- "Confirmar ingresos" card with confirmed KPI cards and CONFIRMADO badge (manual income confirmation removed)
- `submitReviewDecision` server action in `apps/web/app/actions/analysis.ts` (removed)
- `confirmIncome` server action in `apps/web/app/actions/income.ts` (removed)

---

## 7. Comparativa Bancaria (HU-14B)

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

Status codes and reasons SHALL be translated through a centralized mapping constant or module, not through inline conditionals scattered across components. The system SHALL define `STATUS_LABELS` and `REASON_LABELS` constants in `definitions.ts` mapping every backend code to its Spanish label.

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

The system SHALL render a "Comparativa bancaria" tab with four blocks: status header, financial summary, product comparison table, and expandable product detail. The tab SHALL display 6 UI states: Sin análisis, Resultados, Destino no soportado, Datos insuficientes, Sin productos, and Error (delegated to section-level error boundary). `loading` is NOT a tab state — execution/loading belongs to the "Análisis del expediente" section's progress indicator.

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

### Requirement: Tab Label Rename (MODIFIED)

The tab previously labeled "Bancos / Viabilidad" SHALL be renamed to "Comparativa bancaria".

(Previously: Tab label was "Bancos / Viabilidad".)

#### Scenario: Tab displays new label

- GIVEN the analysis section renders
- WHEN tabs are displayed
- THEN the third tab shows "Comparativa bancaria"

---

## 8. PFAE Identity Match (HU-19a)

### Requirement: PersonType-Aware Identity Source Rendering

`AnalysisSection` SHALL accept an optional `personType?: string` prop, threaded from `case-detail-workspace.tsx` (`personType={caseData.personType}`), mirroring the existing pattern used by `DocumentUpload`/`DocumentBrowser`/`ExtractionSection`. `SOURCE_LABELS` and `SOURCE_ICONS` SHALL include a `csf` entry, and `IdentitySummaryCard.COLUMNS` SHALL include `csf`, so that a `csf` identity source returned by the API is rendered instead of being silently dropped by the `sources.filter(s => s in SOURCE_LABELS)` guard.

#### Scenario: PFAE csf source renders in the identity table

- GIVEN a PFAE case's analysis result includes a `csf` source
- WHEN the Validaciones tab renders the identity comparison table
- THEN a "CSF" column/row appears with its label and icon

#### Scenario: SALARIED rendering unchanged (regression)

- GIVEN a SALARIED case's analysis result (no `csf` source)
- WHEN the identity table renders
- THEN it displays exactly as before this change

### Requirement: Bankarization Section Hidden for PFAE

The Validaciones tab SHALL NOT render the "Conciliación nómina vs banco" section (including its empty-state card) when `personType === "PFAE"`. For any other `personType`, the section SHALL render as before.

#### Scenario: PFAE case hides conciliation section entirely

- GIVEN a case with `personType: "PFAE"`
- WHEN the Validaciones tab renders
- THEN no "Conciliación nómina vs banco" heading or empty-state card is present

#### Scenario: SALARIED case still shows conciliation section (regression)

- GIVEN a case with `personType: "SALARIED"`
- WHEN the Validaciones tab renders
- THEN the "Conciliación nómina vs banco" section renders as before this change

### Requirement: PersonType-Aware Pre-Analysis Checklist

The pre-analysis confirmation modal (`AnalysisConfirmModal`) and its `hasMissingDocs` check SHALL branch by `personType`. For PFAE, the checklist SHALL list: identification (INE/passport), CSF, tax return, bank statements, credit bureau — no nómina/payroll row. For SALARIED, the existing checklist SHALL remain unchanged. In both cases, missing documents SHALL produce a soft, non-blocking confirmation — never a blocking state.

#### Scenario: PFAE checklist omits nómina row

- GIVEN a PFAE case opening the pre-analysis modal
- WHEN the checklist renders
- THEN it shows INE/passport, CSF, tax return, bank statements, and credit bureau, with no payroll/nómina item

#### Scenario: Missing PFAE documents do not block confirmation

- GIVEN a PFAE case missing the tax return document
- WHEN the pre-analysis modal renders
- THEN it shows a soft warning for the missing document but still allows the advisor to confirm and proceed

#### Scenario: SALARIED checklist unchanged (regression)

- GIVEN a SALARIED case opening the pre-analysis modal
- WHEN the checklist renders
- THEN it lists the same items as before this change (Identificación, Recibo de nómina, Estado de cuenta, Buró)

---

## 9. PFAE Expediente UI (HU-21)

### Requirement: PFAE Visual Kit and Tab Shell

PFAE expediente surfaces MUST use existing `gf-*` tokens and existing common components (`Card`, `Button`, `DataTable`, `StatusBadge`, `FieldGrid`, `FormField`, `Drawer`). Copy MUST be Spanish sentence-case. SALARIED Validaciones, Cálculo, and Comparativa MUST NOT be restyled. The analysis section MUST keep the same three tabs. The system MUST NOT add a wizard, a fourth tab, a second Analyze control, Banks catalog UI, pasivos UI, or Banorte 0.70.

#### Scenario: Salaried unchanged, three tabs

- GIVEN a SALARIED case
- WHEN the analysis section renders
- THEN Validaciones, Cálculo, and Comparativa look and behave as before this change
- AND no fourth tab, wizard, or second Analyze control appears

#### Scenario: PFAE uses visual kit

- GIVEN a PFAE case
- WHEN PFAE gates, Cálculo panel, or Comparativa extras render
- THEN they use `gf-*` tokens, existing common components, and Spanish sentence-case

### Requirement: PFAE Validaciones Gates Card

For `personType` PFAE, Validaciones MUST render a gates Card from persisted `ruleResults["pfae-validation"]` snapshot and `alerts`. Tenure MUST display as informational. The UI MUST NOT recompute gate outcomes.

#### Scenario: Happy path gates Card

- GIVEN a PFAE analysis with persisted pfae-validation snapshot and alerts
- WHEN Validaciones renders
- THEN a gates Card shows regime, vigencia, tenure (INFO), activity, and coherence from that snapshot/alerts

#### Scenario: No CSF

- GIVEN persisted PARTIAL missing-CSF snapshot/alerts
- WHEN Validaciones renders
- THEN the gates Card shows that PARTIAL missing-CSF outcome

#### Scenario: Unmapped giro

- GIVEN persisted `ACTIVITY_UNMAPPED` WARNING
- WHEN Validaciones renders
- THEN the gates Card shows that warning, including which MATRIX banks matched and which remain unmapped

#### Scenario: Tenure and calendar dates

- GIVEN persisted tenure months and ISO calendar dates
- WHEN Validaciones renders
- THEN tenure is years plus leftover months, not a raw month count
- AND calendar dates display as `DD/MM/YYYY` without timezone shift

### Requirement: PFAE Dual-Base Picker

For PFAE, Cálculo MUST present two unfactored bases and a single “Base a enviar al banco” picker. Changing the picker MUST call the existing income-source PATCH, then refresh latest income and analysis. The picker MUST NOT add a second Analyze control.

#### Scenario: PATCH refreshes Comparativa

- GIVEN a completed PFAE analysis with both bases valid
- WHEN the advisor selects the other valid base
- THEN existing PATCH runs and Comparativa reflects the refreshed Phase C result
- AND no second header Analyze appears

#### Scenario: TAX_LOSS

- GIVEN tax-return INVALID for fiscal loss
- WHEN Cálculo renders or the advisor tries that base
- THEN tax-return is not a successful send path and an inline Spanish error or disabled state appears

### Requirement: Comparativa PFAE Detail Extras

Comparativa table columns MUST stay unchanged. PFAE origin, giro (canonical + SAT text), applied factor, tax-return policy, and activity tenure MUST appear only in expanded product detail. Factor and giro MUST come from persisted `BankResult` audit, not reconstructed. PFAE reason codes MUST use centralized Spanish labels.

#### Scenario: Extras in detail only

- GIVEN a PFAE analysis with persisted audit on a product
- WHEN the product row is expanded
- THEN detail shows origin, giro+SAT, factor, tax-return policy, and activity tenure
- AND the table gains no extra columns

#### Scenario: Unmapped giro from audit

- GIVEN persisted unmapped MATRIX audit
- WHEN detail renders
- THEN it shows the persisted unmapped audit and MUST NOT invent factor 1.0

### Requirement: Solely-Salaried FAIL Non-Viable Presentation

When régimen is solely salaried FAIL, Validaciones and Comparativa MUST show “este camino PFAE no aplica — cambie a asalariado”. The UI MUST suppress PRELIMINARY_VIABLE chips and viable presentation. Product rows MAY remain inspectable and MUST NOT be presented as a successful PFAE-viable result.

#### Scenario: FAIL régimen

- GIVEN `REGIMEN_EXCLUSIVAMENTE_ASALARIADO` FAIL
- WHEN Comparativa and Validaciones render
- THEN that Spanish message appears, PRELIMINARY_VIABLE chips/viable presentation are suppressed, and rows MAY stay inspectable

---

## 10. Bureau Credit Utilization

### Requirement: Shared Buro Utilization Display

Shared Buro tab MUST NOT fork by `personType` and MUST NOT add a third table. Utilización MUST appear on **all** rows of both tables. In-scope open cards with limit > 0 and non-null balance MUST show rate + traffic light; all other rows `"—"`. Utilization MUST be UI-derived from stored `currentBalance`/`creditLimit`.

| Rule | Contract |
|------|----------|
| In-scope | `classification === 'REVOLVING'`; `DEPARTMENT_STORE` iff `creditLimit > 0`; `creditType` `/tarjeta/i` for all other classifications (covers NON_BANK_SERVICE AMEX in créditos no bancarios, OTHER/OTROS/UNKNOWN/FIXED_PAYMENT/PERSONAL_LOAN mislabels) |
| Exclude | MORTGAGE, AUTO always; PERSONAL_LOAN, FIXED_PAYMENT, NON_BANK_SERVICE only when `creditType` does not match `/tarjeta/i` |
| Rate | `currentBalance / creditLimit` if limit > 0. Null/0 limit → `"—"`, omit global. Null balance → `"—"` (not 0). Over-limit allowed, band 91+ |
| Closed | Per-row `"—"`; excluded from global |
| Global | Extra KPI (keep Score / activos / cerrados / consultas). `sum(balances)/sum(limits)` of in-scope active cards with limit > 0 and non-null balance. Denom 0 → `"—"` |
| Bands | After rounding display %: 0–10 Excelente; 11–30 Muy buena; 31–50 Aceptable; 51–70 Atención; 71–90 Crítico; 91+ Muy crítico. Legend beside MOP |

#### Scenario: In-scope rate

- GIVEN open REVOLVING credit, balance 3000, limit 10000
- WHEN the Buro tab renders
- THEN Utilización MUST show 30% Muy buena with a traffic light on both tables
- AND SALARIED and PFAE MUST share the same column, KPI, and MOP-adjacent legend

#### Scenario: Dashes

- GIVEN a MORTGAGE row, a closed REVOLVING row, and an in-scope row with null balance
- WHEN rows render
- THEN each cell MUST be `"—"` (null balance MUST NOT be 0)

#### Scenario: Weighted KPI and stored bureau

- GIVEN two open in-scope cards 5000/5000 and 10000/100000
- WHEN the extra KPI renders
- THEN global MUST be 15000/105000, not the average of per-card rates
- AND original four KPIs MUST remain; denom 0 MUST show `"—"`; stored bureaus MUST show utilization without re-OCR

#### Scenario: NON_BANK_SERVICE tarjeta in-scope

- GIVEN an open NON_BANK_SERVICE credit in créditos no bancarios with `creditType` matching `/tarjeta/i` (e.g., AMEX), balance 3000, limit 10000
- WHEN the Buro tab renders
- THEN Utilización MUST show the computed rate and band (not `"—"`)

### Requirement: Masked Last-4 under Institution

UI MUST show `****` + last 4 under Institución (MUST NOT show the full number). Source: `accountNumber` → ≥4 digits in `institution` → `rawTextReference` → `"—"`. Existing JSONB last-4 MUST be best-effort. Parser MUST read stored `accountNumber`.

#### Scenario: Mask and fallback

- GIVEN `accountNumber` "82953660"
- WHEN Institución renders
- THEN UI MUST show `****3660`
- AND with no `accountNumber` and institution "Visa 1234567890" MUST show `****7890`; if no ≥4-digit source, `"—"` without silent re-extract

---

## 11. Non-Susceptible Activity Reason Labels

### Requirement: Non-Susceptible Reason Labels

`REASON_LABELS` MUST map `ACTIVITY_NOT_SUSCEPTIBLE` and `HSBC_LIQUIDITY_ACTIVITY_RESTRICTED` to Spanish labels. Raw codes MUST NOT render.

#### Scenario: Codes translated

- GIVEN a result with either code
- WHEN Comparativa renders the reasons
- THEN it shows the Spanish labels
