# Proposal: Cálculo de ingreso mensual admisible — HU-12

## Intent

El sistema extrae recibos de nómina pero no calcula ingreso mensual admisible. La asesora lo hace manualmente, generando errores y demora. HU-12 automatiza el promedio de ingresos brutos y netos desde recibos ya extraídos, permitiendo selección de recibos, confirmación o ajuste manual, y snapshot inmutable.

## Scope

### In Scope
- Consumo de `Document.extractedData` (PAYROLL_RECEIPT).
- Tabla de recibos con checkbox de inclusión, periodo, fecha de pago, empleador, RFC, ingreso bruto/neto, estados de conciliación y revisión.
- Promedios bruto y neto sobre recibos incluidos con Decimal, 2 decimales.
- Estados: CALCULATED, CONFIRMED, REQUIRES_REVIEW.
- Snapshot inmutable: calculados, confirmados, incluidos/excluidos, usuario, fecha, observaciones.
- UI "Cálculo de ingresos" debajo de "Cálculo de pasivos" en Motor Financiero.

### Out of Scope
- Re-ejecución de conciliación, inferencia de fechas, conversión de periodicidad, clasificación fijo/variable, requisito 6 meses, pagadoras, PFAE, personas morales, deducciones, bonos, reglas bancarias, factor CE, capacidad de pago.

## Capabilities

### New Capabilities
- `income-calculation`: Cálculo de ingreso admisible para asalariados desde recibos de nómina. Incluye selección de recibos, promedios brutos/netos, confirmación manual, snapshot inmutable.

### Modified Capabilities
- `frontend`: Tab Motor Financiero agrega sección "Cálculo de ingresos" con tabla de recibos, KPIs, confirmación manual y observaciones.

## Approach

Módulo NestJS `src/income-calculation/` con `IncomeCalculationService` puro. Reutiliza `parsePayroll()` y patrón `LiabilitySnapshot` (calculate/getLatest/override). Prisma model `IncomeCalculation` guarda receiptResults, promedios, confirmados, estados, usuario y fecha.

Endpoints: POST /cases/:caseId/income/calculate, GET /cases/:caseId/income/latest, PATCH /cases/:caseId/income/receipts/:receiptIndex.

Frontend: IncomeCalculationSection en apps/web/app/ui/expedientes/ con tabla, KPIs, inputs de confirmación, observaciones, botón de confirmación. Posicionado debajo de LiabilityCalculationSection en tab motor.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/src/income-calculation/` | New | Módulo, servicio, DTOs, controller, tests. |
| `apps/api/prisma/schema.prisma` | Modified | Model `IncomeCalculation`. |
| `apps/web/app/ui/expedientes/income-calculation-section.tsx` | New | UI tabla, promedios, confirmación. |
| `apps/web/app/ui/expedientes/analysis-section.tsx` | Modified | Agregar sección debajo de pasivos. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Recibo sin fecha exacta | Medio | Mostrar "No identificada"; permitir inclusión. |
| Confusión calculado vs confirmado | Medio | UI separa claramente ambos valores. |
| Regresión HU-09/10/11 | Bajo | Tests de no-regresión; cambios aislados. |

## Rollback Plan

Eliminar módulo `src/income-calculation/`, revertir Prisma schema, remover componente de `analysis-section.tsx`. Snapshots históricos permanecen intactos.

## Dependencies

- Extracción nómina (HU-09) y conciliación (HU-10) implementadas.
- Patrón `LiabilitySnapshot` de HU-11.

## Success Criteria

- [ ] Recibos mostrados correctamente; promedios calculados con Decimal.
- [ ] Exclusión recalcula promedios; confirmación guarda sin sobrescribir calculados.
- [ ] Snapshot recuperado al reabrir caso; sin re-ejecución de conciliación.
- [ ] HU-09, HU-10, HU-11 no afectados.
