# Motor de Viabilidad Bancaria — Políticas, Knockouts y Fuentes de Datos

> **Versión**: ANAQUEL_AGOSTO_2026  
> **Última actualización**: 2026-08-05

---

## I. Estructura de Políticas Bancarias

Las políticas están organizadas en **dos niveles**: banco y objetivo de crédito.

### Nivel 1 — Banco (`Bank`)

Parámetros generales que aplican a todos los destinos de ese banco:

| Banco | Criterio ingreso | Factor CE | Score mín. Buró |
|---|---|---|---|
| Banorte | Neto | 60% | — |
| Santander | Neto | 50% | 541 |
| Scotiabank | Bruto | 55% | — |
| HSBC | Neto | 50% | — |
| Citibanamex | Bruto | 50% | — |
| BX+ | Bruto | 50% | — |
| Mifel | Bruto | 50% | — |
| Banregio | Bruto | 50% | 629 |
| Afirme | Bruto | 60% | — |

- **`incomeCriterion`**: si el cálculo de capacidad se hace sobre ingreso **neto** (libre de impuestos) o **bruto** (antes de impuestos).
- **`debtCommitmentFactor`** (CE): % máximo del ingreso que el banco permite destinar al pago total de deudas. Es el **CMA de entrada**, no un tier dinámico. Ej: Santander usa 50% como filtro mínimo obligatorio aunque internamente maneje tiers R1-R5 según score de admisión.
- **`minimumBureauScore`**: puntaje mínimo de Buró de Crédito requerido. Solo Santander (541) y Banregio (629) lo tienen documentado. Los demás bancos no publican este dato.

### Nivel 2 — Política por objetivo (`BankPolicy`)

Cada banco tiene políticas por **destino de crédito**, con estos CMA's:

| Campo | Significado | Ejemplo |
|---|---|---|
| `minimumIncome` | Ingreso mínimo mensual requerido | Santander construcción: $20,000 |
| `minimumPropertyValue` | Valor mínimo del inmueble | Banorte: $350,000 |
| `minimumEmploymentTenureMonths` | Antigüedad laboral mínima (meses) | Banorte: 12 meses |
| `minimumApplicantAgeMonths` | Edad mínima del solicitante (meses) | Santander: 21 años (252m) |
| `maximumApplicationAgeMonths` | Edad máxima al solicitar (meses) | Scotiabank: 74 años (888m) |
| `isActive` | Si ese destino aplica para ese banco | HSBC solo opera Adquisición |

**Distribución de políticas activas** (38 en total):

| Banco | Destinos activos | No opera |
|---|---|---|
| Banorte | Adq, Liq, Sust, Terreno, Const, Remod (6) | — |
| Santander | Adq, Liq, Sust, Terreno, Const, Remod (6) | — |
| Scotiabank | Adq, Liq, Sust, Const, Remod (5) | Terreno |
| Citibanamex | Adq, Liq, Sust (3) | Terreno, Const, Remod |
| HSBC | Adq (1) | Liq, Sust, Terreno, Const, Remod |
| Mifel | Adq, Liq, Sust (3) | Terreno, Const, Remod |
| Banregio | Adq, Liq, Sust (3) | Terreno, Const, Remod |
| BX+ | Ninguno (0) | Pendiente completar desde UI |
| Afirme | Ninguno (0) | Pendiente completar desde UI |

---

## II. Knockouts de Buró de Crédito

Se ejecutan **antes** de evaluar la viabilidad por banco. Son **binarios y absolutos** (sin override de la asesora).

### Universales (aplican a todos los bancos)

| Regla | Condición | Efecto |
|---|---|---|
| **Quita o quebranto** | El Buró muestra antecedente de quita/quebranto | Todo el análisis devuelve `FAIL`. No importa si ya fue saldada o tiene carta finiquito. |
| **Score < 500** | BC Score inferior a 500 puntos | Rechazo universal por zona de exclusión (alta probabilidad de incumplimiento) |
| **Score faltante** | No hay score extraído (ej: documento pendiente) | Se **salta** el check — no se rechaza ni se marca como revisión |

### Por banco

| Banco | Regla | Condición |
|---|---|---|
| **Santander** | Score insuficiente | Score ≤ 541 (equivalente a < 542 según documentación del banco) |
| **Santander** | MOP — 2 PV | 2+ meses con Pago Vencido actual y monto acumulado > $3,000 MXN |
| **Santander** | MOP — 3 PV | 3+ meses con Pago Vencido actual con cualquier monto |
| **Banregio** | Score insuficiente | Score ≤ 629 |

### Flujo de ejecución

```
1. Extraer datos de Buró del expediente
2. ¿Quita/quebranto? → FAIL (corto-circuito, no se evalúa ningún banco)
3. ¿Score < 500? → FAIL (corto-circuito)
4. Para cada banco con políticas activas:
   a. ¿Score ≤ minimumBureauScore del banco? → NOT_COMPATIBLE
   b. ¿Santander MOP? → NOT_COMPATIBLE
   c. Evaluar CMA's: ingreso, propiedad, edad, antigüedad, capacidad
```

---

## III. Fuentes de Datos para la Comparativa Bancaria

El motor `BankViabilityRule` cruza **tres fuentes** independientes:

### 1. Datos del expediente (base de datos)

| Dato | Tabla / Campo | Cómo llega |
|---|---|---|
| Ingreso confirmado (bruto/neto) | `IncomeCalculation` → `confirmedGrossIncome` / `confirmedNetIncome` | Calculado por el motor de ingresos a partir de los recibos de nómina extraídos |
| Deudas mensuales | `LiabilitySnapshot` → `grossCurrentMonthlyDebt` | Calculado por el motor de pasivos a partir del Buró de Crédito |
| Valor del inmueble | `MortgageCase` → `propertyValue` | Ingresado por la asesora al crear el expediente |
| Tipo de persona | `MortgageCase` → `personType` | `SALARIED` por defecto |
| Objetivo del crédito | `MortgageCase` → `creditTypeId` → `CreditType.destination` | Elegido por la asesora (Compra, Liquidez, etc.) |
| Fecha de nacimiento | Documentos INE → `extractedData.identity.birthDate` | Extracción OCR del INE |
| Fecha de ingreso laboral | Recibos de nómina → `extractedData.employment.hireDate` | Extracción OCR de los recibos |

### 2. Documentos del expediente (extracción AI)

| Dato | Documento origen | Campo extraído |
|---|---|---|
| **Score de Buró** | Reporte de Buró de Crédito | `extractedData.creditData.bureauScore` |
| **Quita / quebranto** | Reporte de Buró de Crédito | `extractedData.creditData.hasQuita` / `hasQuebranto` |
| **Meses vencidos (MOP)** | Reporte de Buró de Crédito | `extractedData.creditData.pastDueMonths` |
| **Monto vencido acumulado** | Reporte de Buró de Crédito | `extractedData.creditData.pastDueTotalAmount` |

El array `documents` que recibe `BankViabilityRule.execute()` ya contiene estos datos extraídos — el motor filtra por tipo de documento (`CREDIT_BUREAU`) para acceder a los datos de Buró.

### 3. Catálogo de políticas (base de datos)

| Dato | Tabla | Fuente original |
|---|---|---|
| Políticas CMA por banco/destino | `BankPolicy` | Seed poblado desde `ANAQUEL_AGOSTO_2026` — datos recolectados de manuales operativos de cada banco |
| Parámetros generales del banco | `Bank` | Misma fuente. La asesora puede actualizarlos desde la UI (`/dashboard/bancos`) |

---

## IV. Mantenimiento

La asesora puede **ver y editar** todas las políticas desde **Dashboard → Bancos**. Cada celda de la tabla de políticas es editable inline con botón "Guardar". Los cambios persisten inmediatamente en la base de datos y afectan el siguiente cálculo de viabilidad.
