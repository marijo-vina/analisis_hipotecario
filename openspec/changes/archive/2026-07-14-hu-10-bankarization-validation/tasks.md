# Tasks: HU-10 Validación de Bancarización

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~520-680 (7 archivos nuevos + 3 modificados + 3 spec files) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (tipos + matching + pagadora) → PR 2 (regla + módulo + tests) → PR 3 (frontend) |
| Delivery strategy | single-pr |
| Chain strategy | size:exception |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: size:exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Tipos + servicios core (matching + pagadora) | PR 1 | Base branch; lógica pura sin NestJS; tests unitarios incluidos |
| 2 | Regla + registro módulo + orquestador | PR 2 | Base = main o PR 1; integra servicios al pipeline de análisis |
| 3 | Frontend UI conciliación | PR 3 | Base = PR 2; solo cambios en `estados-conciliacion.tsx` |

## Phase 1: Tipos e Interfaces

- [x] 1.1 Crear `apps/api/src/case-analysis/types/bankarization.types.ts` con enums `PayrollReconciliationStatus` (MATCHED, DISCREPANCY, RFC_INCOMPATIBLE, NOT_MATCHED, AMBIGUOUS, PROVIDER_CANDIDATE, PROVIDER_MIRROR_CONFIRMED, MANUAL_REVIEW) y `PayrollMatchMethod` (RFC, FALLBACK, PROVIDER_MIRROR, NONE)
- [x] 1.2 Definir interfaces `PayrollMatchInput`, `PayrollMatchResult`, `MatchTrace`, `PagadoraEvaluation` en `bankarization.types.ts`

## Phase 2: Servicio de Matching Recibo→Depósito

- [x] 2.1 Crear `apps/api/src/case-analysis/services/payroll-bank-matching.service.ts` con clase `PayrollBankMatchingService` (inyectable, sin estado)
- [x] 2.2 Implementar método `match(receipts, deposits, isJointAccount)` con algoritmo 9 pasos: pre-filtro ±7d, RFC match, validación fecha(±2d) + monto(≤5%)
- [x] 2.3 Implementar fallback 3 reglas obligatorias (monto, fecha, concepto) con score `monto(40%) + fecha(30%) + concepto(30%)`
- [x] 2.4 Implementar normalización RFC y matching bidireccional con tracking de trazabilidad (`MatchTrace`)
- [x] 2.5 Forzar `MANUAL_REVIEW` cuando `isJointAccount = true`
- [x] 2.6 Implementar catálogo de conceptos + keyword matching para regla de concepto del fallback

## Phase 3: Servicio de Detección de Pagadora

- [x] 3.1 Crear `apps/api/src/case-analysis/services/pagadora-detection.service.ts` con clase `PagadoraDetectionService`
- [x] 3.2 Implementar detección de proveedor candidato (RFC recurrente diferente al empleador)
- [x] 3.3 Implementar matching doble espejo (empleador directo + pagadora)
- [x] 3.4 Implementar regla Scotiabank: pagadora detectada + concepto sin "NOMINA" → `scotiabankExcluded = true`

## Phase 4: Regla de Validación

- [x] 4.1 Crear `apps/api/src/case-analysis/rules/bankarization-validation.rule.ts` implementando `AnalysisRule` con `ruleId = 'bankarization-validation'`
- [x] 4.2 Implementar `execute(client, documents)`: extraer payrollReceipts[] y payrollDeposits[], orquestar matching + pagadora
- [x] 4.3 Mapear resultados a alertas: `BANK_PAYROLL_MISMATCH`, `DISCREPANCY_5PCT`, `PAYROLL_PROVIDER_SCOTIABANK`, `PAYROLL_PROVIDER_MIRROR`
- [x] 4.4 Calcular outcome: PASS si todos MATCHED, FAIL si algún RFC_INCOMPATIBLE o scotiabankExcluded, PARTIAL en otro caso

## Phase 5: Registro en Módulo y Orquestador

- [x] 5.1 Modificar `apps/api/src/case-analysis/case-analysis.service.ts`: inyectar `BankarizationValidationRule` y registrar en array de reglas
- [x] 5.2 Modificar `apps/api/src/case-analysis/case-analysis.module.ts`: declarar `PayrollBankMatchingService`, `PagadoraDetectionService`, `BankarizationValidationRule` como providers

## Phase 6: Tests Unitarios

- [x] 6.1 Crear `apps/api/src/case-analysis/services/payroll-bank-matching.service.spec.ts`: tests RFC match, fallback 3 reglas, bidireccionalidad, score, joint account
- [x] 6.2 Crear `apps/api/src/case-analysis/services/pagadora-detection.service.spec.ts`: tests provider candidate, doble espejo, Scotiabank excluido/OK (5 escenarios de spec)
- [x] 6.3 Crear `apps/api/src/case-analysis/rules/bankarization-validation.rule.spec.ts`: tests orquestación, mapeo resultados→alertas, cálculo outcome con mocks de servicios

## Phase 7: Frontend UI Conciliación

- [x] 7.1 Modificar `apps/web/app/ui/extraction/estados-conciliacion.tsx`: reemplazar totales agregados por vista por recibo con `PayrollReconciliationStatus`
- [x] 7.2 Añadir columna/badge mostrando `PayrollMatchMethod` usado por cada recibo
- [x] 7.3 Añadir badge visual para `scotiabankExcluded` cuando aplique
- [x] 7.4 Renderizar alertas de la regla (`BANK_PAYROLL_MISMATCH`, `DISCREPANCY_5PCT`, etc.) en la UI de conciliación
