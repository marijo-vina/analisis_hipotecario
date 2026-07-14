# Proposal: HU-10 Validación de Bancarización (Nómina vs Depósitos)

## Intent

Cerrar la brecha entre los datos ya extraídos (ingreso neto, RFC del empleador, RFC del pagador, concepto original) y la validación operativa de bancarización. Hoy la UI de conciliación solo muestra totales agregados por empleador; no existe matching individual recibo-depósito ni reglas de tolerancia, pagadoras ni alertas de discrepancia.

## Scope

### In Scope
- Servicio de matching individual: RFC primero, fallback por monto+concepto+fecha.
- Tolerancia de ±2 días en fecha de pago.
- Discrepancia de monto: flag si la diferencia supera el 5%, pero conservando el candidato vinculado.
- Detección de pagadoras y conciliación de "doble espejo" (empresa principal + pagadora).
- Regla Scotiabank (exclusión de depósito de pagadora): cuando un depósito proviene de una pagadora (RFC diferente al empleador) y el concepto normalizado NO contiene "NOMINA", se marca `scotiabankExcluded = true`; aplica a cualquier banco emisor, el flag es para cálculos de Scotiabank como banco destino del crédito.
- Cuenta mancomunada (`isJointAccount`): ejecutar matching pero forzar `MANUAL_REVIEW`.
- Estados y métodos explícitos del resultado (`PayrollReconciliationStatus`, `PayrollMatchMethod`).
- UI de conciliación: pasar de totales agregados a estado por recibo individual.
- Regla de análisis `bankarization-validation` en el orquestador de `case-analysis`.

### Out of Scope
- Cambiar la extracción de RFC ni el schema v1.1 (ya implementado).
- Reescribir la UI de extracción de documentos.
- Validación de identidad (HU separada).
- Conciliación automática de depósitos en efectivo o transferencias interbancarias no SPEI.

## Capabilities

### New Capabilities
- `payroll-bank-matching`: Algoritmo de conciliación recibo a depósito con prioridad RFC, fallback triangulación y tolerancias.
- `pagadora-detection`: Identificación de esquemas de pagadora, doble espejo y regla limitativa Scotiabank.

### Modified Capabilities
- `case-analysis`: Agregar la regla `bankarization-validation` al orquestador para ejecutar matching y emitir alertas `BANK_PAYROLL_MISMATCH`, `DISCREPANCY_5PCT`, `PAYROLL_PROVIDER_SCOTIABANK`, `PAYROLL_PROVIDER_MIRROR`.

## Approach

**Tipos explícitos del resultado:**

```typescript
type PayrollReconciliationStatus =
  | 'MATCHED'           // Conciliado exitosamente
  | 'NOT_MATCHED'       // Sin depósito compatible
  | 'DISCREPANCY'       // RFC coincide + fecha OK, pero monto >5%
  | 'RFC_INCOMPATIBLE'  // RFCs presentes pero diferentes (deriva a pagadora o manual)
  | 'AMBIGUOUS'         // Múltiples candidatos en fallback con score similar
  | 'PROVIDER_CANDIDATE'      // Posible pagadora detectada
  | 'PROVIDER_MIRROR_CONFIRMED' // Doble espejo confirmado
  | 'MANUAL_REVIEW';     // Requiere revisión humana (isJointAccount, RFC incompatible sin pagadora, etc.)

type PayrollMatchMethod =
  | 'RFC'             // Match por RFC del empleador
  | 'FALLBACK'        // Triangulación monto+fecha+concepto
  | 'PROVIDER_MIRROR' // Doble espejo pagadora
  | 'NONE';           // Sin método (no conciliado)
```

**Reglas refinadas de matching:**

1. **Matching uno a uno, bidireccional, auditable y determinístico.** Cada recibo de nómina se empareja con exactamente un depósito bancario (o queda sin conciliar). Un mismo depósito NO puede usarse para conciliar más de un recibo. El algoritmo es determinístico: sin ML, sin fuzzy. Cada decisión de matching debe ser trazable (por qué se eligió ese depósito).

2. **RFC como filtro de candidatos, no como match único.** El RFC del empleador (`employer.rfc`) y del pagador (`detectedPayerRfc`) se usan para PRIORIZAR candidatos, pero la conciliación final requiere ADEMÁS:
   - Compatibilidad de fecha: ±2 días entre la fecha de pago del recibo y la fecha del depósito.
   - Compatibilidad de monto: diferencia ≤ 5% entre el ingreso neto del recibo y el monto del depósito.

3. **RFC diferente NUNCA es fallback automático.** Si el depósito tiene un RFC y el recibo tiene un RFC, pero SON DIFERENTES, NO se activa el fallback. En su lugar:
   - Se evalúa si corresponde a un esquema de **pagadora** (razón social distinta, depósito recurrente).
   - Si no es pagadora → se marca como **revisión manual** (`RFC_INCOMPATIBLE`).
   - JAMÁS se intenta matching por monto+fecha cuando los RFCs difieren.

4. **Fallback solo cuando falta RFC.** La triangulación por monto + concepto + fecha SOLO se activa cuando:
   - El recibo NO tiene `employer.rfc`, O
   - El depósito NO tiene `detectedPayerRfc`, O
   - Ambos carecen de RFC.
   - En fallback, las tres condiciones son **OBLIGATORIAS** (todas deben cumplirse):
     - Monto dentro del 5%: obligatorio.
     - Fecha dentro de ±2 días: obligatorio.
     - Concepto compatible (catálogo determinístico): obligatorio.
   - El score (monto 40% + fecha 30% + concepto 30%) **SOLO** se usa para ordenar candidatos cuando hay más de uno que cumple las 3 reglas. Si ninguno cumple las 3 → `NOT_MATCHED`.

5. **Concepto compatible = catálogo determinístico (sin fuzzy).** El concepto se normaliza: eliminar acentos, convertir a minúsculas, compactar espacios múltiples. Se considera COMPATIBLE si contiene al menos una palabra o expresión del catálogo: `"nomina"`, `"nómina"`, `"sueldo"`, `"pago de haberes"`, `"haberes"`, `"pago empleado"`, `"spei empleador"`. Esto es determinístico y auditable — cada decisión de compatibilidad es trazable (qué keyword matcheó).

6. **Discrepancia >5% conserva el candidato.** Cuando RFC coincide + fecha es válida (±2 días), pero el monto difiere >5%:
   - El depósito se **CONSERVA** como candidato vinculado (no se descarta).
   - `status = DISCREPANCY`
   - `reconciled = false`
   - La UI muestra el depósito vinculado pero con bandera de discrepancia. Esto permite que la asesora vea CUÁL depósito causó la diferencia.

7. **Regla Scotiabank (exclusión de depósito).** Cuando se detecta un esquema de pagadora 
   (RFC diferente al empleador) Y el `originalConcept` del depósito de la pagadora, normalizado 
   (mayúsculas, sin acentos), NO contiene la palabra "NOMINA":
   - El resultado del matching incluye `scotiabankExcluded = true`.
   - La UI muestra un badge "Excluido Scotiabank" en ese depósito.
   - El motor financiero (Sprint 4) excluirá ese depósito de los cálculos para Scotiabank.
   - NOTA: aplica independientemente del banco emisor del estado de cuenta.

8. **Cuenta mancomunada.** Cuando `isJointAccount === true`:
   - El matching se ejecuta normalmente (no se bloquea).
   - El resultado NUNCA se presenta como validación definitiva.
   - `status = MANUAL_REVIEW`
   - `matchMethod` se preserva (el que haya aplicado: RFC, FALLBACK, etc.)
   - Se incluye la alerta `BANK_JOINT_ACCOUNT` existente.

9. **Flujo de decisión completo** (por cada recibo):
   ```
   1. Si isJointAccount === true → ejecutar matching → forzar status = MANUAL_REVIEW
   2. Si ambos tienen RFC y coinciden → filtrar depósitos por ese RFC → evaluar fecha + monto
      - Si monto >5% → DISCREPANCY (conserva candidato)
      - Si monto ≤5% → MATCHED
   3. Si ambos tienen RFC pero difieren → ¿esquema pagadora? → doble espejo → sino RFC_INCOMPATIBLE / MANUAL_REVIEW
   4. Si falta RFC en alguno → fallback obligatorio (monto±5% + fecha±2d + concepto catálogo) → ordenar por score
   5. Si múltiples candidatos fallback con score similar → AMBIGUOUS
   6. Si ningún candidato pasa tolerancias → NOT_MATCHED
   ```

**Arquitectura:** Backend: nuevo servicio `PayrollBankMatchingService` puro (sin estado, sin ML) que recibe `payrollReceipts[]` y `payrollDeposits[]` y devuelve candidatos de match con trazabilidad de regla aplicada. Una regla de `case-analysis` lo invoca y produce `AnalysisResult`. Frontend: extender `estados-conciliacion.tsx` para renderizar la lista de recibos con su depósito candidato, estado (`PayrollReconciliationStatus`), método (`PayrollMatchMethod`) y alertas.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/src/case-analysis/services/payroll-bank-matching.service.ts` | New | Matching RFC + fallback + tolerancias. |
| `apps/api/src/case-analysis/services/pagadora-detection.service.ts` | New | Lógica de doble espejo y alerta Scotiabank. |
| `apps/api/src/case-analysis/rules/bankarization-validation.rule.ts` | New | Regla que orquesta matching y emite alertas. |
| `apps/api/src/case-analysis/case-analysis.service.ts` | Modified | Registrar nueva regla en el orquestador. |
| `apps/web/app/ui/extraction/estados-conciliacion.tsx` | Modified | Mostrar estado por recibo y alertas. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Falsos positivos en fallback por monto+fecha | Med | Requerir coincidencia de concepto del catálogo determinístico; sin las 3 reglas obligatorias no hay match. |
| Pagadoras con RFCs distintos no detectadas | Med | Usar mirror de monto en mismo periodo como señal adicional. |
| Degradación de performance con >100 depósitos | Baja | Pre-filtrar depósitos por rango de fechas ±7 días antes de matching; un depósito solo puede vincularse a un recibo. |
| RFC diferente mal clasificado como pagadora | Med | Validar que el depósito sea recurrente y la razón social sea distinta; si no, forzar `RFC_INCOMPATIBLE` / `MANUAL_REVIEW`. |
| Discrepancia de monto mal interpretada como no conciliado | Med | Conservar el candidato vinculado con `status = DISCREPANCY` para que la asesora vea el depósito causal. |
| Cuenta mancomunada aceptada como válida | Baja | Forzar `MANUAL_REVIEW` en todo resultado cuando `isJointAccount === true`; nunca presentar como validación definitiva. |
| Depósito de pagadora excluido incorrectamente para Scotiabank | Baja | Solo marcar `scotiabankExcluded = true` cuando el concepto normalizado NO contiene "NOMINA" Y el RFC difiere del empleador. |

## Rollback Plan

1. Remover el registro de `bankarization-validation.rule` del orquestador en `case-analysis.service.ts`.
2. Revertir cambios en `estados-conciliacion.tsx` a la versión agregada.
3. Los datos fuente (extracciones) no se modifican; el matching es computado, no persistido como verdad absoluta.

## Dependencies

- Schema de extracción bancaria v1.1 (`payrollDeposits[]`, `detectedPayerRfc`, `originalConcept`).
- Schema de nómina con `employer.rfc` e `income.netIncome`.

## Success Criteria

- [ ] El match por RFC exacto se intenta antes que cualquier fallback.
- [ ] Cuando RFCs coinciden, se filtran candidatos por ese RFC y luego se evalúa fecha ±2 días + monto ≤5%.
- [ ] Cuando RFC coincide + fecha OK pero monto >5%, el depósito se conserva vinculado con `status = DISCREPANCY` y `reconciled = false`.
- [ ] Cuando RFCs difieren, NUNCA se hace fallback por monto/fecha; se evalúa pagadora o se marca `RFC_INCOMPATIBLE` / `MANUAL_REVIEW`.
- [ ] El fallback por monto+concepto+fecha SOLO se activa cuando falta RFC en al menos uno de los lados, y las 3 reglas (monto±5%, fecha±2d, concepto catálogo) son OBLIGATORIAS.
- [ ] El score en fallback SOLO ordena candidatos; sin candidatos que cumplan las 3 reglas el resultado es `NOT_MATCHED`.
- [ ] Un mismo depósito NO puede conciliar más de un recibo (bidireccionalidad 1:1).
- [ ] En esquemas de pagadoras, si el concepto normalizado no contiene "NOMINA", el depósito se marca `scotiabankExcluded = true` y la UI muestra el badge correspondiente.
- [ ] Cuando `isJointAccount === true`, el matching se ejecuta pero el resultado fuerza `status = MANUAL_REVIEW` y nunca se presenta como validación definitiva.
- [ ] La UI muestra por cada recibo: estado de conciliación (`PayrollReconciliationStatus`), método aplicado (`PayrollMatchMethod`), depósito vinculado y alertas.
