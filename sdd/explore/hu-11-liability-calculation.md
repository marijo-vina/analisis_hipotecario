# Exploration: HU-11 — Cálculo de pasivos desde Buró de Crédito

## Current State

El sistema ya extrae y normaliza créditos del buró con campos financieros completos, pero **NO existe aún ningún cálculo de pasivos agregado a nivel de caso**. Lo que hay hoy es un precursor por crédito llamado `monthlyDebtContribution`, que simplemente copia `paymentDueAmountEffective` para créditos activos, pone 0 para cerrados, y `null` cuando el monto no está confirmado.

Los documentos del proyecto marcan explícitamente el cálculo de pasivos como **Sprint 3 / future work** en múltiples specs:
- `specs/ai-extraction/schemas/credit-bureau.schema.md` líneas 5, 79, 83-87
- `openspec/changes/payment-due-guardrail/proposal.md` líneas 5, 17, 33, 51
- `openspec/changes/bureau-manual-validation/proposal.md` línea 19

### Affected Areas

- `apps/api/src/documents/credit-bureau-extraction.service.ts` — define el schema completo de créditos y el guardrail `paymentDueAmountEffective` / `monthlyDebtContribution` (líneas 1880-1918)
- `apps/web/app/lib/extraction.ts` — parser `parseBuro()` que expone `ParsedCreditBureauCredit` con todos los campos financieros al frontend
- `apps/web/app/ui/extraction/buro-tab.tsx` — tabla de créditos que ya muestra `paymentDueAmountEffective` pero sin agregación ni fórmulas de pasivos
- `apps/api/src/case-analysis/case-analysis.service.ts` — placeholder comentado para "income, liability" rules (línea 59)
- `apps/api/src/documents/documents.controller.ts` — endpoints PATCH para manual override de `paymentDueAmount` que recalculan `monthlyDebtContribution` (líneas 197-218)

---

## 1. Campos disponibles por crédito (del schema del buró)

El schema del servicio de extracción (`credit-bureau-extraction.service.ts`, líneas 191-245) define los siguientes campos por crédito:

### Campos principales
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `institution` | `string \| null` | Nombre del otorgante |
| `creditType` | `string \| null` | Tipo textual (ej. "TARJETA DE CREDITO") |
| `classification` | enum | `REVOLVING \| FIXED_PAYMENT \| MORTGAGE \| AUTO \| PERSONAL_LOAN \| DEPARTMENT_STORE \| NON_BANK_SERVICE \| UNKNOWN` |
| `status` | enum | `ACTIVE \| CLOSED \| UNKNOWN` |
| `currentBalance` | `number \| null` | Saldo actual |
| `paymentDueAmount` | `number \| null` | Monto a pagar (oficial) |
| `lastPaymentAmount` | `number \| null` | Monto último pago (antes de "NO APLICA") |
| `creditLimit` | `number \| null` | Límite de crédito |
| `currency` | `string` | "MXN" por defecto |
| `paymentHistory` | `string \| null` | Histórico de pagos crudo |
| `mopCodes` | `string[]` | Códigos MOP |
| `observationKeys` | `string[]` | Claves de observación (UP, LC, FD, etc.) |
| `hasLatePayments` | `boolean \| null` | MOP 2-3 |
| `hasSeriousDelinquency` | `boolean \| null` | MOP 4-9 |
| `hasWriteOff` | `boolean \| null` | Quebranto (UP) |
| `hasSettlementOrDiscount` | `boolean \| null` | Quita (LC/LG) |
| `hasFraudFlag` | `boolean \| null` | Fraude (FD) |
| `hasIdentityTheft` | `boolean \| null` | Robo identidad (RI) |
| `isClosed` | `boolean \| null` | `true` si `status === "CLOSED"` |
| `monthlyDebtContribution` | `number \| null` | Precursor de pasivo: `paymentDueAmountEffective` para activos, 0 para cerrados, null sin confirmar |
| `rawTextReference` | `string \| null` | Texto original del OCR |

### Campos del guardrail (Sprint 2.5 — ya disponibles)
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `paymentDueAmountExtracted` | `number \| null` | Valor extraído inmutable |
| `paymentDueAmountManual` | `number \| null` | Override manual por analista |
| `paymentDueAmountEffective` | `number \| null` | `manual ?? (confirmed ? extracted : null)` |
| `paymentDueAmountSource` | enum | `LAYOUT \| GEMINI \| BAND_MATCH \| RESCUE \| UNCONFIRMED \| CONFIRMED_AUTO \| MANUAL` |
| `paymentDueAmountConfirmed` | `boolean` | Confirmado por analista o auto-confiado |
| `paymentDueAmountManualOverride` | `number \| null` | Alias del override manual |
| `needsManualReview` | `boolean` | `true` si `paymentDueAmount` es nulo por LOW confidence |
| `candidatePaymentDueAmount` | `number \| null` | Valor Gemini archivado para audit |
| `financialFieldsSource` | enum | Origen de los campos financieros |
| `financialFieldsConfidence` | map | Confianza per-field del layout extractor |

---

## 2. ¿Ya existe algún cálculo de pasivos?

**NO.** Búsquedas globales por `pasivo`, `liability`, `liabilities`, `totalDebt`, `deudaTotal` no arrojan ningún módulo de cálculo de pasivos.

Lo más cercano es `monthlyDebtContribution` en `credit-bureau-extraction.service.ts` (líneas 1880-1918), que actúa como un **precursor**:
- Crédito cerrado (`isClosed`) → `monthlyDebtContribution = 0`
- Crédito activo (`ACTIVE`) → `monthlyDebtContribution = paymentDueAmountEffective`
- Estado `UNKNOWN` → `monthlyDebtContribution = null`

Este campo NO aplica fórmulas diferenciadas por tipo de crédito (revolvente vs fijo). Es simplemente un passthrough de `paymentDueAmountEffective`.

El `case-analysis.service.ts` (línea 59) tiene un comentario placeholder: "Future Sprint 3/4 rules (income, liability, bank viability)". Hoy solo existen rules de `identity-match` y `bankarization-validation`.

---

## 3. Clasificación de créditos

**SÍ, el campo existe y está poblado.**

- `classification` enum con valores: `REVOLVING`, `FIXED_PAYMENT`, `MORTGAGE`, `AUTO`, `PERSONAL_LOAN`, `DEPARTMENT_STORE`, `NON_BANK_SERVICE`, `UNKNOWN`
- En la UI (`buro-tab.tsx`, línea 704), los créditos se separan en:
  - **Créditos Bancarios**: `classification !== "NON_BANK_SERVICE"`
  - **Créditos No Bancarios**: `classification === "NON_BANK_SERVICE"`
- No hay campo `isRevolving` booleano; se usa la clasificación directamente.
- El schema del buró ya documenta las fórmulas futuras (líneas 83-87):
  - Revolventes: `max(currentBalance * 0.06, paymentDueAmount)`
  - Pagos fijos: `paymentDueAmount`

---

## 4. Datos de monto disponibles por crédito

| Campo | Significado | Relevancia para pasivos |
|-------|-------------|------------------------|
| `currentBalance` | Saldo actual | Necesario para fórmula de revolventes (`* 0.06`) |
| `paymentDueAmount` / `paymentDueAmountEffective` | Monto a pagar mensual | Base para TODAS las fórmulas de pasivos |
| `lastPaymentAmount` | Monto último pago | NO usado en cálculo de pasivos (es audit) |
| `creditLimit` | Límite de crédito | NO usado en fórmula actual; potencial para ratio de utilización |
| `monthlyDebtContribution` | Precursor existente | Se puede migrar a la nueva fórmula o deprecar |

---

## 5. Tabla de créditos en la UI (`buro-tab.tsx`)

Columnas actuales (líneas 760-769):
1. `#` — índice
2. `Institución`
3. `Tipo` — chip con `CLASSIFICATION_LABELS`
4. `Estado` — `ACTIVE`/`CLOSED`
5. `Saldo actual` — `currentBalance`
6. `Monto a pagar` — `paymentDueAmountEffective` + badge de origen (Manual, Coord., Auto, Gemini, etc.) + botón de edición inline
7. `Límite / crédito` — `creditLimit`
8. `MOP` — badges colapsables
9. `Flags` — Q (quebranto), F (fraude), M (mora grave), A (atraso)

La tabla se divide en dos secciones: **Créditos Bancarios** y **Créditos No Bancarios**.

---

## Approaches

### Option A: Extender `case-analysis` con una nueva rule de pasivos
**Descripción**: Crear `LiabilityCalculationRule` dentro del módulo existente `src/case-analysis/rules/`, que consuma `extractedData.credits[]` del documento de buró y compute pasivos totales.
- **Pros**: Reusa la arquitectura existente de rules; el endpoint de case-analysis ya expone resultados agregados.
- **Cons**: Las rules actuales son de validación (identity-match, bankarization), no de cálculo financiero. Rompe la semántica del módulo.
- **Effort**: Medium

### Option B: Nuevo módulo `src/liability/` (recomendado)
**Descripción**: Crear un módulo NestJS dedicado `LiabilityModule` con `LiabilityCalculationService` que:
1. Lea los créditos del buró desde `Document.extractedData`
2. Aplique fórmulas por clasificación
3. Persista el resultado en un nuevo campo del caso o documento
4. Exponer endpoint `GET /mortgage-cases/:id/liability`
- **Pros**: Single responsibility; el módulo `case-analysis` no se convierte en god object; facilita futuras rules de `paymentCapacity` y `debtRatio`; testeable en aislamiento.
- **Cons**: Requiere crear módulo, controller, service, tests, y conectarlo al `AppModule`.
- **Effort**: Medium

### Option C: Agregar cálculo inline en el frontend
**Descripción**: Computar pasivos en `parseBuro()` o directamente en `BuroTab` usando los créditos ya parseados.
- **Pros**: Cero cambios en backend; rápido de implementar.
- **Cons**: Los pasivos no se persisten ni se comparten con otros módulos (case-analysis, reportes, aprobación automática). Va en contra de la arquitectura existente donde toda la lógica de negocio vive en el backend.
- **Effort**: Low
- **Veredicto**: Rechazado. Solo para prototipo rápido, NO para producción.

---

## Recommendation

**Option B — Nuevo módulo `src/liability/`** es la opción correcta. La arquitectura actual del proyecto ya separa responsabilidades en módulos (`documents`, `case-analysis`, `mortgage-cases`). Un módulo dedicado a cálculo de pasivos:
1. Se alinea con el comentario en `case-analysis.service.ts` sobre "future Sprint 3/4 rules (income, liability, bank viability)"
2. Permite que `case-analysis` lo consuma como dependencia sin acoplamiento directo
3. Facilita la fórmula documentada en el schema:
   - Revolventes activos: `Math.max(credit.currentBalance * 0.06, credit.paymentDueAmountEffective)`
   - Fijos/hipotecarios/automotriz/personal: `credit.paymentDueAmountEffective`
   - Cerrados: `0`
   - Unconfirmed/null: excluir o marcar como "pending"
4. Permite agregar campos agregados: `totalMonthlyDebt`, `totalRevolvingDebt`, `totalFixedDebt`, `revolvingCount`, `activeCount`, `pendingReviewCount`
5. Es testeable con unit tests aislados

---

## Risks

1. **Guardrail de paymentDueAmount**: Si `paymentDueAmountEffective` es `null` (UNCONFIRMED), el cálculo de pasivos debe manejarlo explícitamente — no puede asumir 0. La UI debe mostrar "N créditos pendientes de revisión" en lugar de un total incorrecto.
2. **Clasificación UNKNOWN**: Créditos con clasificación no reconocida no deben romper el cálculo. Necesita default seguro (ej: tratar como FIXED_PAYMENT o excluir).
3. **Créditos no bancarios**: La fórmula actual del schema no menciona qué hacer con `NON_BANK_SERVICE`. Decisión de negocio pendiente: ¿se incluyen o excluyen del pasivo total?
4. **Double counting**: Si hay múltiples documentos de buró (raro pero posible), el cálculo debe deduplicar por `institution + creditType` o similar.
5. **Currency**: Hoy todo es MXN, pero el schema permite `USD` y `OTHER`. Necesita conversión o al menos un warning.

---

## Ready for Proposal

**Yes** — pero se necesita clarificación de negocio sobre:
1. ¿Incluir `NON_BANK_SERVICE` en pasivos totales?
2. ¿Qué hacer con créditos `UNKNOWN` classification?
3. ¿Dónde se muestra el resultado? (nueva pestaña, sidebar del buro-tab, o panel de análisis financiero)
4. ¿Se necesita persistir el resultado en DB o se calcula on-the-fly?

Con esas respuestas, se puede armar el `proposal.md` y continuar al phase `design`.
