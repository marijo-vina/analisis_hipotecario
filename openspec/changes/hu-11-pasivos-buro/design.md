# Diseño: Cálculo de pasivos desde buró de crédito (HU-11)

## Enfoque técnico

Nuevo módulo NestJS `src/liability/` con servicio puro `LiabilityCalculationService` que recibe créditos extraídos del buró y devuelve resultado enriquecido separado del JSON crudo. Cálculo en centavos enteros (sin punto flotante). Snapshots versionados en tabla `LiabilitySnapshot`. Frontend consume endpoint de último snapshot y permite override manual de `creditNature`.

## Decisiones de arquitectura

| Decisión | Opciones | Elección | Por qué |
|----------|----------|----------|---------|
| Módulo separado vs dentro de case-analysis | `liability/` independiente | Módulo separado | Bajo acoplamiento, responsabilidad única, no modifica el pipeline de análisis existente |
| Decimal.js vs enteros en centavos | Decimal.js (dependencia externa) / enteros | Enteros en centavos | Sin dependencia, exactitud garantizada, más simple de testear |
| Persistir vs calcular on-the-fly | Snapshots versionados / recálculo cada consulta | Snapshots versionados | Auditable, trazable, cambios de factor no invalidan históricos |

## Modelo de dominio

```typescript
enum CreditNature { REVOLVING, FIXED, UNKNOWN }
enum InstitutionCategory { BANK, DEPARTMENT_STORE, FINTECH, NON_BANK_SERVICE }
enum LiabilityStatus { CALCULATED, REQUIRES_REVIEW, INCOMPLETE }
enum ClassificationSource { EXTRACTED, KEYWORD, MANUAL, FALLBACK }
enum GlobalLiabilityStatus { CALCULATED, PARTIAL, INCOMPLETE }
enum RuleApplied { REVOLVING_STANDARD, FIXED_DIRECT, UNKNOWN_PROVISIONAL, CLOSED_ZERO, INCOMPLETE_DATA }

interface LiabilityCreditInput {
  creditReference: string; institution: string;
  creditType: string; classification: string;
  status: string; currentBalance: number | null;
  paymentDueAmountEffective: number | null; isClosed: boolean;
}

interface LiabilityCreditResult extends LiabilityCreditInput {
  monthlyDebtContribution: number | null; creditNature: CreditNature;
  institutionCategory: InstitutionCategory; ruleApplied: RuleApplied;
  liabilityStatus: LiabilityStatus; classificationSource: ClassificationSource;
  classificationReason: string | null;
}

interface LiabilityCalculationResult {
  id: string; caseId: string; calculatedAt: string;
  factorUsed: number; rulesVersion: string; credits: LiabilityCreditResult[];
  globalStatus: GlobalLiabilityStatus;
  grossCurrentMonthlyDebt: number; totalCurrentBalance: number;
}
```

## Modelo de persistencia

```prisma
model LiabilitySnapshot {
  id             String   @id @default(uuid())
  mortgageCaseId String
  mortgageCase   MortgageCase @relation(fields: [mortgageCaseId], references: [id])
  factorUsed     Decimal
  rulesVersion   String
  credits        Json
  globalStatus   String
  grossCurrentMonthlyDebt Decimal
  totalCurrentBalance     Decimal
  calculatedAt   DateTime @default(now())
}
```

Relación con `MortgageCase`. NO se modifica el `extractedData` de `Document`. Cada `POST /calculate` crea un nuevo snapshot.

## Algoritmo de clasificación

1. Si `creditType` del buró ya trae `REVOLVING`/`FIXED_PAYMENT` → usar como `creditNature`, `classificationSource = EXTRACTED`
2. Si no, buscar keywords en `creditType` + `productName`:
   - Keywords REVOLVING: TARJETA, REVOLVENTE, LÍNEA
   - Keywords FIXED: AUTO, HIPOTECA, PERSONAL, NÓMINA, SERVICIO
   - Si colisionan (ej. "TARJETA" + "PERSONAL") → UNKNOWN + REQUIRES_REVIEW + razón documentada
3. Si no resuelve → FALLBACK (UNKNOWN con cálculo provisional conservador)

`institutionCategory`: mapeo determinista por nombre de institución.

## Flujo de cálculo por crédito (en centavos)

```
1. Si isClosed → contribution = 0, status = CALCULATED, rule = CLOSED_ZERO
2. Clasificar creditNature según algoritmo de clasificación
3. Si REVOLVING:
   balanceCents = currentBalance × 100, paymentCents = paymentDueAmountEffective × 100
   revolvingCents = balanceCents × factorUsed (factor es decimal, se trunca a entero)
   contributionCents = MAX(revolvingCents, paymentCents)
   Si falta un dato → REQUIRES_REVIEW; ambos → INCOMPLETE
4. Si FIXED:
   Si paymentCents > 0 → contribution = paymentCents
   Si saldo > 0 y pago explícitamente 0 → INCOMPLETE
   Si pago > saldo → CALCULATED + warning
5. Si UNKNOWN:
   Ambos → MAX(saldo × 0.06, pago) + REQUIRES_REVIEW
   Solo saldo → saldo × 0.06 + REQUIRES_REVIEW
   Solo pago → pago + REQUIRES_REVIEW
   Ninguno → null + INCOMPLETE
6. Convertir contributionCents a pesos: contribution / 100 para display
```

Estado global: si todos CALCULATED → CALCULATED; si ≥1 REQUIRES_REVIEW sin INCOMPLETE → PARTIAL; si ≥1 INCOMPLETE → INCOMPLETE.

## Agregados globales

Además de `grossCurrentMonthlyDebt` (suma de `monthlyDebtContribution`), el cálculo produce `totalCurrentBalance` como la suma simple de todos los `currentBalance` de los créditos. Este valor le sirve a la asesora en escenarios de consolidación de pasivos o hipoteca de liquidez, para saber cuánto necesitaría solicitar al banco para liquidar la totalidad de deudas actuales del cliente. `totalCurrentBalance` no usa factor ni naturaleza — es una suma aritmética directa.

## Principio de no-exclusión

HU-11 representa los pasivos brutos reportados en Buró. El cálculo NO excluye automáticamente créditos que pudieran ser liquidados mediante sustitución, mejora de hipoteca o pago de pasivos. La hipoteca actual del cliente (si aparece en Buró) se incluye en `grossCurrentMonthlyDebt` y `totalCurrentBalance`. La exclusión o ajuste de créditos específicos corresponde a una capa posterior de evaluación de producto (fuera de HU-11).

## Fuera de alcance (out-of-scope para HU-11)

El tratamiento por crédito con valores `INCLUDED`, `TO_BE_SETTLED` y `REPLACED_BY_NEW_PAYMENT` queda fuera de HU-11. Esta segunda capa permitirá que productos de sustitución o pago de pasivos no dupliquen la mensualidad de la hipoteca actual. Se implementará en una historia de usuario posterior (prevista para evaluación de productos).

## Archivos

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `apps/api/src/liability/liability.module.ts` | Crear | Módulo NestJS |
| `apps/api/src/liability/liability.service.ts` | Crear | Servicio de cálculo puro |
| `apps/api/src/liability/liability.controller.ts` | Crear | Endpoints POST calculate, PATCH override, GET latest |
| `apps/api/src/liability/dto/` | Crear | DTOs de entrada/salida, incluyendo `UpdateCreditDto` con creditNature, currentBalance, paymentDueAmountEffective y reason obligatorio |
| `apps/api/src/liability/liability.types.ts` | Crear | Enums e interfaces |
| `apps/api/prisma/schema.prisma` | Modificar | Agregar modelo LiabilitySnapshot |
| `apps/web/app/ui/expedientes/analysis-section.tsx` | Modificar | Reemplazar placeholder del tab `"motor"` con `LiabilityCalculationSection` |
| `apps/web/app/ui/expedientes/liability-calculation-section.tsx` | Crear | Componente principal: KPI cards + acordeón + tabla + modal (ver Especificación de UI) |
| `apps/web/app/lib/extraction.ts` | Modificar | Tipos para `LiabilityCreditResult` |
| `openspec/changes/hu-11-pasivos-buro/ui-mockup.fig` | Referencia | Mockup visual OpenPencil del diseño aprobado |

## Especificación de UI

La UI de HU-11 reside en el tab **"Motor financiero"** (`activeTab === "motor"`) dentro de `analysis-section.tsx`. Mockup de referencia: `ui-mockup.fig`.

### Componentes

| Componente | Responsabilidad |
|---|---|
| `LiabilityCalculationSection` | Orquesta KPI cards, acordeón, tabla y modal. Recibe `caseId` como prop |
| KPI cards (inline) | 3 tarjetas: Saldo actual total, Deuda total mensual, Estado del cálculo |
| Acordeón (inline) | Botón clickeable que expande/colapsa la tabla. Barra completa es clickeable |
| `LiabilityTable` | Tabla con columnas, ordenamiento, badges, separadores de grupo y footer de totales |
| `EditCreditModal` | Modal para corregir créditos con `REQUIRES_REVIEW` |

### KPI Cards

Tres tarjetas en fila, misma altura (96px), padding 16px:

| Card | Color fondo | Color texto | Contenido |
|---|---|---|---|
| Saldo actual total | `#F0FDF4` (verde) | `#166534` | `totalCurrentBalance` + subtítulo "Suma de saldos activos en Buró" |
| Deuda total mensual | `#EFF6FF` (azul) | `#1E40AF` | `grossCurrentMonthlyDebt` + subtítulo "Pasivo mensual calculado" |
| Estado del cálculo | `#FFFBEB` (ámbar) | `#92400E` | Badge con ícono + etiqueta de `globalStatus` + texto descriptivo |

Etiquetas de estado global:
- `CALCULATED` → "Completo" (badge verde)
- `PARTIAL` → "Provisional" (badge ámbar)
- `INCOMPLETE` → "Incompleto" (badge rojo suave)

### Acordeón

- **Colapsado**: ▸ "Ver desglose del cálculo"
- **Expandido**: ▾ "Ocultar desglose del cálculo"
- Toda la barra es clickeable. Por defecto colapsado.

### Tabla

**Columnas** (en orden):
Crédito reportado → Institución → Naturaleza → Saldo actual → Monto a considerar → Monto a pagar → Pasivo calculado → Estado

**Encabezados**: `#4B5563` semibold 11px. Fondo `#F3F4F6`.

**Significado de columnas**:
| Columna | Qué muestra |
|---|---|
| Crédito reportado | `creditType` o nombre legible del Buró |
| Institución | Nombre de la institución financiera |
| Naturaleza | Badge: Revolvente / Fijo / Pendiente |
| Saldo actual | `currentBalance` |
| Monto a considerar | Revolvente: `saldo × 6%` con anotación secundaria "6% del saldo". Fijo: "— No aplica" en gris. Pendiente: valor provisional con "cálculo provisional" |
| Monto a pagar | `paymentDueAmountEffective` |
| Pasivo calculado | `monthlyDebtContribution` en negrita. Revolvente y Fijo en `#1F2937`, Pendiente en `#D97706`. Faltante: "—" |
| Estado | Badge: Calculado / Requiere revisión / Incompleto |

**Badges de naturaleza**:
| Naturaleza | Fondo | Texto |
|---|---|---|
| Revolvente | `#DBEAFE` | `#1E40AF` |
| Fijo | `#F3E8FF` (morado) | `#7C3AED` |
| Pendiente | `#FEF3C7` | `#92400E` |

**Badges de estado**:
| Estado | Fondo | Texto |
|---|---|---|
| Calculado | `#D1FAE5` | `#065F46` |
| Requiere revisión | `#FEF3C7` | `#92400E` |
| Incompleto | `#FEE2E2` | `#991B1B` |

**Ordenamiento**: Revolventes → Fijos → Pendientes. Separador visual ligero (2px `#F3F4F6`) entre grupos.

**Filas clickeables**: Las filas con estado "Requiere revisión" o "Incompleto" son clickeables y abren el `EditCreditModal`.

**Footer**: Dos filas de totales con fondo `#F9FAFB`:
- Saldo actual total (`totalCurrentBalance`)
- Deuda total mensual (`grossCurrentMonthlyDebt`) con badge de estado global

### Modal de corrección (`EditCreditModal`)

Se abre al hacer clic en una fila con `REQUIRES_REVIEW` o `INCOMPLETE`.

**Campos**:
| Campo | Tipo | Editable |
|---|---|---|
| Naturaleza del crédito | Dropdown (Revolvente / Fijo) | Siempre |
| Saldo actual | Input numérico | Solo si `currentBalance === null` (marcado "dato faltante en Buró") |
| Monto a pagar | Input numérico | Solo si `paymentDueAmountEffective === null` (marcado "dato faltante en Buró") |
| Motivo del cambio | Textarea | Siempre (obligatorio, mínimo 10 caracteres) |

**Advertencia de impacto**: Banner ámbar (`#FFFBEB`) antes de los campos con texto: "Este cambio recalculará los totales. Al modificar la naturaleza o los montos, el sistema recalculará automáticamente la deuda total mensual y el saldo actual total."

**Botones**: Cancelar + "Recalcular y guardar" (rojo `#DC2626` para indicar acción destructiva/modificadora).

**Comportamiento**: Al guardar, llama `PATCH /cases/:id/liability/credits/:creditIndex` con los campos modificados + `reason`. El backend recalcula, crea nuevo snapshot, y el frontend refresca desde `GET /cases/:id/liability/latest`.

### Endpoint de corrección extendido

```
PATCH /cases/:id/liability/credits/:creditIndex
Body: {
  creditNature?: "REVOLVING" | "FIXED",
  currentBalance?: number,
  paymentDueAmountEffective?: number,
  reason: string   // obligatorio, mínimo 10 caracteres
}
```

Al recibir: `classificationSource = MANUAL`, recalcula el crédito, nuevo snapshot. Responde con el `LiabilityCalculationResult` completo actualizado.

| Capa | Qué probar | Enfoque |
|------|-----------|---------|
| Unit | 13 escenarios + modal de corrección: REVOLVING 6%>pago, pago>6%, solo saldo, sin datos; FIXED normal, pago>saldo, saldo+0→INCOMPLETE, sin pago; UNKNOWN ambos/uno/ninguno; colisión keywords; override manual; estado global; crédito cerrado; corrección con datos faltantes | `LiabilityCalculationService.calculate()` con datos mock |
| Integración | POST → cálculo → snapshot → GET latest; PATCH override → recalcula → nuevo snapshot | Supertest contra controllador |
| E2E | UI en tab Motor Financiero: KPI cards, acordeón expandir/colapsar, tabla con badges, modal de corrección, totales actualizados post-corrección | Playwright en `analysis-section.tsx` (tab `"motor"`) |

## Migración

No se requiere migración de datos existentes. Los `LiabilitySnapshot` son nuevos. Los créditos extraídos previamente se calculan bajo demanda al llamar `/calculate`. Sin feature flags — el módulo se habilita al importarse en `AppModule`.
