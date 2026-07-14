# Payroll-Bank Matching Specification

## Purpose

Algoritmo de conciliación individual entre recibos de nómina y depósitos bancarios. Matching determinístico 1:1 con prioridad RFC, fallback obligatorio y tolerancias trazables.

## Requirements

### Requirement: RFC Match con Validación Triangular

El sistema DEBE intentar primero el matching por RFC del empleador (`employer.rfc`) contra el RFC detectado del depósito (`detectedPayerRfc`). Cuando ambos RFCs coinciden, el sistema DEBE además validar compatibilidad de fecha (±2 días) y monto (≤5%).

| Sub-regla | Condición | Resultado |
|-----------|-----------|-----------|
| RFC + fecha + monto OK | RFC coincide, fecha ±2d, monto ≤5% | `MATCHED` |
| RFC + fecha OK, monto >5% | RFC coincide, fecha ±2d, monto >5% | `DISCREPANCY` |
| RFC presente pero diferente | Ambos tienen RFC pero difieren | `RFC_INCOMPATIBLE` (no fallback) |

#### Scenario: RFC match exitoso

- GIVEN un recibo con `employer.rfc = "ABC123456XYZ"`
- AND un depósito con `detectedPayerRfc = "ABC123456XYZ"`
- AND la fecha del depósito está dentro de ±2 días de la fecha de pago del recibo
- AND la diferencia de monto es ≤5%
- WHEN se ejecuta el matching
- THEN el resultado es `status = MATCHED`, `method = RFC`
- AND el depósito queda vinculado al recibo (bidireccional 1:1)

#### Scenario: Discrepancia de monto conserva candidato

- GIVEN un recibo con `employer.rfc = "ABC123456XYZ"`, `netIncome = 10000`
- AND un depósito con `detectedPayerRfc = "ABC123456XYZ"`, `amount = 11000` (diferencia 10%)
- AND la fecha del depósito está dentro de ±2 días
- WHEN se ejecuta el matching
- THEN el resultado es `status = DISCREPANCY`, `method = RFC`, `reconciled = false`
- AND el depósito se conserva como candidato vinculado para la UI

#### Scenario: RFC incompatible sin fallback

- GIVEN un recibo con `employer.rfc = "ABC123456XYZ"`
- AND un depósito con `detectedPayerRfc = "DEF789012GHI"`
- WHEN se ejecuta el matching
- THEN el resultado es `status = RFC_INCOMPATIBLE`
- AND NO se activa fallback por monto/fecha/concepto
- AND se evalúa esquema de pagadora (ver spec `pagadora-detection`)

### Requirement: Fallback Obligatorio sin RFC

Cuando falta el RFC en al menos uno de los lados (recibo o depósito), el sistema DEBE activar fallback con tres reglas OBLIGATORIAS: monto ±5%, fecha ±2d, y concepto compatible con catálogo determinístico.

| Regla | Tolerancia | Obligatoria |
|-------|------------|-------------|
| Monto | ≤5% diferencia | Sí |
| Fecha | ±2 días | Sí |
| Concepto | Catálogo determinístico | Sí |

El score (monto 40% + fecha 30% + concepto 30%) SOLO se usa para ordenar candidatos cuando múltiples cumplen las 3 reglas.

#### Scenario: Fallback con candidato único

- GIVEN un recibo sin `employer.rfc`, `netIncome = 15000`, fecha pago `2026-07-01`
- AND un depósito sin `detectedPayerRfc`, `amount = 14800` (1.3% diff), fecha `2026-07-02`
- AND `originalConcept` contiene "nomina" (normalizado)
- WHEN se ejecuta el matching
- THEN el resultado es `status = MATCHED`, `method = FALLBACK`

#### Scenario: Fallback sin candidatos pasa las 3 reglas

- GIVEN un recibo sin `employer.rfc`
- AND depósitos disponibles pero ninguno cumple las 3 reglas simultáneamente
- WHEN se ejecuta el matching
- THEN el resultado es `status = NOT_MATCHED`, `method = NONE`

#### Scenario: Fallback con múltiples candidatos ordenados por score

- GIVEN un recibo sin `employer.rfc`
- AND tres depósitos que cumplen las 3 reglas obligatorias
- WHEN se ejecuta el matching
- THEN se calcula score para cada candidato (monto 40% + fecha 30% + concepto 30%)
- AND se selecciona el de mayor score
- AND `status = MATCHED`, `method = FALLBACK`

### Requirement: Catálogo Determinístico de Concepto

El sistema DEBE normalizar el concepto del depósito eliminando acentos, convirtiendo a minúsculas y compactando espacios múltiples. Un concepto es COMPATIBLE si contiene al menos una expresión del catálogo.

| Keyword | Normalizada |
|---------|-------------|
| "nómina" | "nomina" |
| "nomina" | "nomina" |
| "sueldo" | "sueldo" |
| "pago de haberes" | "pago de haberes" |
| "haberes" | "haberes" |
| "pago empleado" | "pago empleado" |
| "spei empleador" | "spei empleador" |

#### Scenario: Concepto matchea keyword del catálogo

- GIVEN un depósito con `originalConcept = "PAGO DE NOMINA MENSUAL"`
- WHEN se normaliza el concepto
- THEN contiene "nomina" → COMPATIBLE

#### Scenario: Concepto no matchea ninguna keyword

- GIVEN un depósito con `originalConcept = "TRANSFERENCIA TERCEROS"`
- WHEN se normaliza el concepto
- THEN no contiene ninguna keyword del catálogo → NO COMPATIBLE

#### Scenario: Normalización con acentos y espacios

- GIVEN un depósito con `originalConcept = "  Nómina   del   empleado  "`
- WHEN se normaliza (strip accents, lowercase, compact whitespace)
- THEN el resultado es `"nomina del empleado"` → COMPATIBLE (contiene "nomina")

### Requirement: Bidireccionalidad 1:1

Cada depósito puede vincularse a UN ÚNICO recibo de nómina. El primer recibo procesado que reclama un depósito lo bloquea para los demás.

#### Scenario: Primer recibo bloquea depósito

- GIVEN dos recibos de nómina (R1, R2) sin RFC
- AND un depósito D que cumple las 3 reglas de fallback para ambos
- WHEN R1 se procesa primero y reclama D
- THEN R1 → `status = MATCHED`, `method = FALLBACK`, deposit = D
- AND R2 → `status = NOT_MATCHED` (D ya no está disponible)

#### Scenario: Depósito liberado si recibo no lo reclama

- GIVEN un recibo R1 que NO cumple las 3 reglas con depósito D
- AND un recibo R2 que SÍ cumple las 3 reglas con depósito D
- WHEN se ejecuta el matching
- THEN R1 → `status = NOT_MATCHED`
- AND R2 → `status = MATCHED`, deposit = D

### Requirement: Cuenta Mancomunada Forza Manual Review

Cuando `isJointAccount === true`, el sistema DEBE ejecutar el matching normalmente pero forzar `status = MANUAL_REVIEW` en el resultado, preservando el método aplicado.

#### Scenario: Matching con cuenta mancomunada

- GIVEN `isJointAccount = true`
- AND un recibo con RFC que matchea un depósito (fecha OK, monto OK)
- WHEN se ejecuta el matching
- THEN el resultado es `status = MANUAL_REVIEW`, `method = RFC`
- AND se incluye la alerta `BANK_JOINT_ACCOUNT`

#### Scenario: Fallback con cuenta mancomunada

- GIVEN `isJointAccount = true`
- AND un recibo sin RFC que cumple fallback con un depósito
- WHEN se ejecuta el matching
- THEN el resultado es `status = MANUAL_REVIEW`, `method = FALLBACK`
- AND se incluye la alerta `BANK_JOINT_ACCOUNT`

### Requirement: Trazabilidad del Resultado

Cada resultado DEBE incluir: `status` (PayrollReconciliationStatus), `method` (PayrollMatchMethod), `candidateDeposit` (o null), `score` (cuando aplica), `alerts[]`, y `traceability` (regla aplicada, valores comparados).

#### Scenario: Resultado con trazabilidad completa

- GIVEN un matching exitoso por RFC
- WHEN se genera el resultado
- THEN incluye: `status = MATCHED`, `method = RFC`, `candidateDeposit = {id, amount, date}`, `score = null`, `alerts = []`, `traceability = {rule: "RFC_MATCH", rfc: "ABC123456XYZ", dateDiff: 1, amountDiff: 0.02}`
