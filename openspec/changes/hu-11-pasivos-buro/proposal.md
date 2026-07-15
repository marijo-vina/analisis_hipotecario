# Proposal: Cálculo de pasivos desde buró de crédito (HU-11)

## Intent

El sistema extrae créditos del buró pero no calcula la carga mensual de pasivos del cliente. La asesora debe hacerlo manualmente, lo que genera errores y demora el análisis de capacidad de pago. HU-11 automatiza el cálculo de pasivos por crédito y su suma total, aplicando reglas de negocio diferenciadas para revolventes, fijos y créditos de naturaleza desconocida. Los datos crudos del buró se mantienen separados de los datos derivados por el motor de pasivos.

## Scope

### In Scope
- Motor de cálculo de pasivo mensual por crédito activo según naturaleza (REVOLVING, FIXED, UNKNOWN).
- Separación estricta: los campos enriquecidos (`institutionCategory`, `creditNature`, `monthlyDebtContribution`, `ruleApplied`, `liabilityStatus`, `classificationSource`, `classificationReason`, `factorUsed`, `calculatedAt`, `rulesVersion`) NO se escriben en el JSON crudo de extracción; son parte del resultado del motor.
- Clasificación determinista de UNKNOWN por keywords en tipo de crédito y nombre de producto.
- Clasificación `institutionCategory` por institución (BANK, DEPARTMENT_STORE, FINTECH, NON_BANK_SERVICE).
- Clasificación `creditNature` por tipo de crédito y nombre de producto, NO por institución. Ej: tarjeta Liverpool → DEPT_STORE + REVOLVING; préstamo Sofom → FINTECH + FIXED.
- Regla FIXED: usar `paymentDueAmountEffective` directamente. Si es mayor que `currentBalance`, usar el pago + generar advertencia. Si `currentBalance > 0` pero `paymentDueAmountEffective` es null o 0 → INCOMPLETE.
- Regla REVOLVING: `MAX(currentBalance × factor, paymentDueAmountEffective)`. Si falta un importe → calcular provisionalmente con el disponible + REQUIRES_REVIEW. Si faltan ambos → INCOMPLETE.
- Regla UNKNOWN: clasificación por keywords primero. Si sigue UNKNOWN → `MAX(currentBalance × 0.06, paymentDueAmountEffective)` + REQUIRES_REVIEW. Sin importes suficientes → INCOMPLETE.
- Factor revolvente parametrizable (default 0.06) con versionado (`factorUsed`, `rulesVersion`, `calculatedAt`). Cambios de factor no modifican resultados históricos sin recálculo explícito.
- Estados de pasivo: CALCULATED, REQUIRES_REVIEW, INCOMPLETE.
- Estados globales: CALCULADO (todos CALCULATED → "Total de pasivos"), PARCIAL (al menos un REQUIRES_REVIEW, ningún INCOMPLETE → "Total provisional"), INCOMPLETO (algún INCOMPLETE → "Subtotal calculado").
- Null ≠ cero: crédito activo con `currentBalance = null` y `paymentDueAmountEffective = null` queda con `liabilityStatus = INCOMPLETE` y `monthlyDebtContribution = null`.
- UI: tabla de pasivos en tab de buró con columnas Tipo, Institución, Naturaleza, Saldo, Pago, Regla, Pasivo, Estado.
- Ordenamiento: revolventes → fijos → pendientes (REQUIRES_REVIEW).
- Edición manual de `creditNature` por la asesora; `classificationSource` (EXTRACTED | KEYWORD | MANUAL) y `classificationReason`; recálculo automático al cambiar.
- Créditos cerrados o sin saldo ni pago aportan $0.
- NON_BANK_SERVICE con saldo o pago activo se incluye.
- Pagadoras: se calculan igual que cualquier persona asalariada (sin reglas adicionales).
- Tests unitarios obligatorios para: 6% > pago, pago > 6%, igualdad, fijo normal, fijo sin pago, cero vs null, crédito cerrado, cuenta no bancaria, UNKNOWN resuelto por keyword, UNKNOWN provisional, override manual, ordenamiento, estado global.

### Out of Scope
- Modificar el pipeline de extracción del buró (OCR/Gemini/layout).
- Cálculo de capacidad de pago (Sprint 4).
- Integración con motor financiero externo.
- Conversión de moneda.
- Recálculo automático masivo de casos históricos al cambiar factor o reglas.

## Capabilities

### New Capabilities
- `liability-calculation`: Motor de cálculo de pasivos mensuales por crédito y suma total. Incluye clasificación determinista por keywords, reglas por naturaleza, factor parametrizable, versionado de cálculo, manejo de datos incompletos, edición manual de naturaleza y estados globales.

### Modified Capabilities
- `bureau-extraction`: El campo existente `monthlyDebtContribution` pasa a ser poblado por el nuevo motor de pasivos en lugar de quedar como null. NO se agregan `institutionCategory`, `creditNature`, `ruleApplied` ni `liabilityStatus` al schema crudo de extracción; esos campos pertenecen al resultado enriquecido del motor.
- `frontend`: Tab de buró (`buro-tab.tsx`) agrega columnas de pasivo, naturaleza, estado, clasificación y versión; reordena créditos por tipo; muestra total de pasivos y estado global (CALCULATED | INCOMPLETE | PARTIAL); permite edición manual de `creditNature`.

## Approach

Nuevo módulo NestJS `src/liability/` con `LiabilityCalculationService` puro (sin estado). Se consume desde el controller de análisis de caso o desde un endpoint dedicado. El servicio recibe el array de créditos ya extraídos, aplica clasificación determinista, ejecuta fórmulas y devuelve resultado enriquecido separado del JSON crudo.

### Reglas de cálculo detalladas

**FIXED:**
```
IF paymentDueAmountEffective > 0:
  monthlyDebtContribution = paymentDueAmountEffective
  IF paymentDueAmountEffective > currentBalance:
    → warn("posible desfase de actualización")
ELSE IF currentBalance > 0 AND (paymentDueAmountEffective IS NULL OR 0):
  monthlyDebtContribution = NULL
  liabilityStatus = INCOMPLETE
```

**REVOLVING:**
```
revolvingCandidate = currentBalance × factorUsed
IF currentBalance IS NOT NULL AND paymentDueAmountEffective IS NOT NULL:
  monthlyDebtContribution = MAX(revolvingCandidate, paymentDueAmountEffective)
  liabilityStatus = CALCULATED
ELSE IF one of them IS NOT NULL:
  monthlyDebtContribution = available_value  // provisional
  liabilityStatus = REQUIRES_REVIEW
ELSE:
  monthlyDebtContribution = NULL
  liabilityStatus = INCOMPLETE
```

**UNKNOWN (no resuelto por keywords):**
```
IF currentBalance IS NOT NULL OR paymentDueAmountEffective IS NOT NULL:
  monthlyDebtContribution = MAX(currentBalance × 0.06, paymentDueAmountEffective)  // provisional
  liabilityStatus = REQUIRES_REVIEW
ELSE:
  monthlyDebtContribution = NULL
  liabilityStatus = INCOMPLETE
```

**Versionado:** cada resultado de pasivo guarda `factorUsed`, `calculatedAt` (timestamp), `rulesVersion` (semver del motor). Cambios de configuración no invalidan históricos.

**Edición manual:** la asesora puede cambiar `creditNature`. `classificationSource` se actualiza a `MANUAL` y se agrega `classificationReason`. El recálculo se dispara automáticamente y genera nuevos valores versionados.

**Clasificación:** `institutionCategory` se determina por el nombre de la institución. `creditNature` se determina por tipo de crédito + nombre de producto, nunca por institución.

**Estado global:**
- `CALCULATED` (todos CALCULATED) → UI muestra "Total de pasivos".
- `PARTIAL` (≥1 REQUIRES_REVIEW, 0 INCOMPLETE) → UI muestra "Total provisional".
- `INCOMPLETE` (≥1 INCOMPLETE) → UI muestra "Subtotal calculado".

**Null vs cero:** un `null` en saldo o pago nunca se trata como $0 para cálculo. Solo un valor explícito `0` aporta $0.

**Pagadoras:** misma lógica que asalariado. Sin reglas adicionales.

El factor revolvente se lee de `ConfigService`. No se modifica la extracción del buró; el cálculo es una capa posterior.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/src/liability/` | New | Módulo, servicio, DTOs, entidades de resultado enriquecido y tests unitarios. |
| `apps/api/src/documents/credit-bureau-extraction.service.ts` | Modified | Schema de salida: `monthlyDebtContribution` pasa a ser poblado por el motor. NO se agregan campos enriquecidos al JSON crudo. |
| `apps/web/app/ui/extraction/buro-tab.tsx` | Modified | Nuevas columnas de pasivo, naturaleza, estado, clasificación, versión; ordenamiento por tipo; total con estado global; edición manual de naturaleza. |
| `apps/web/app/lib/extraction/` | Modified | Parser y tipos deben exponer campos base para el motor de pasivos. |
| `apps/api/src/config/` | Modified | Agregar configuración de factor revolvente y reglas de versionado. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Clasificación UNKNOWN incorrecta por keywords limitados | Medio | Logs de clasificación; asesora puede editar naturaleza antes de recalcular; `classificationReason` documenta la decisión. |
| Factor parametrizable cambia comportamiento si se modifica en producción | Bajo | Default 0.06; cambios requieren re-procesamiento explícito del caso; versionado (`rulesVersion`, `factorUsed`) protege históricos. |
| Performance con >50 créditos | Bajo | Cálculo es O(n) puro; benchmark en verify. |
| Confusión datos crudos vs calculados | Medio | Separación estricta en schema; documentación de contrato; campos enriquecidos solo en resultado del motor. |
| Override manual sin trazabilidad | Bajo | `classificationSource` y `classificationReason` obligatorios en edición; recálculo versionado. |

## Rollback Plan

Eliminar módulo `src/liability/` y revertir cambios en `buro-tab.tsx` y parser. El campo `monthlyDebtContribution` vuelve a ser `null` en extracciones nuevas. Los resultados enriquecidos históricos persistidos con versionado permanecen intactos pero no se recalculan hasta que se restaure el motor.

## Dependencies

- Extracción del buró ya implementada (Sprint 2) con campos `currentBalance`, `paymentDueAmountEffective`, `classification`, `status`.
- `paymentDueAmountEffective` ya validado/confirmado manualmente.

## Success Criteria

- [ ] Cada crédito activo tiene pasivo calculado según naturaleza con reglas FIXED, REVOLVING y UNKNOWN correctas.
- [ ] Créditos UNKNOWN se clasifican determinísticamente por keywords o se marcan REQUIRES_REVIEW con cálculo provisional conservador.
- [ ] UI muestra desglose por tipo con total de pasivos y estado global correcto (CALCULATED/PARTIAL/INCOMPLETE).
- [ ] Factor revolvente es parametrizable desde config y versionado (`factorUsed`, `rulesVersion`, `calculatedAt`).
- [ ] Créditos cerrados aportan $0; créditos con saldo/pago null quedan INCOMPLETE (no $0).
- [ ] Cuentas no bancarias con saldo se incluyen en el total.
- [ ] Pagadoras se calculan igual que asalariados sin reglas especiales.
- [ ] Edición manual de `creditNature` actualiza `classificationSource` a MANUAL, guarda `classificationReason` y dispara recálculo versionado.
- [ ] Tests unitarios cubren: 6% > pago, pago > 6%, igualdad, fijo normal, fijo sin pago, cero vs null, crédito cerrado, cuenta no bancaria, UNKNOWN resuelto por keyword, UNKNOWN provisional, override manual, ordenamiento, estado global.
