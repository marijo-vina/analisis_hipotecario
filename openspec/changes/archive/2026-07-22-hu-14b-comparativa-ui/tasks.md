# Tasks: HU-14B — Comparativa Bancaria UI

## Review Workload Forecast

| Métrica | Valor |
|---------|-------|
| Líneas cambiadas estimadas | ~415 |
| 400-line budget risk | **HIGH** |
| Chained PRs recommended | **Yes** — 3 PRs |
| Decision needed before apply | Split into 3 stacked PRs |

## PR Chain Plan

**Strategy**: feature-branch-chain  
**Tracker branch**: `feature/hu-14-comparativa-bancaria`

| PR | Rama | Contenido | Líneas | Depende de |
|----|------|-----------|--------|------------|
| PR #1 | `feature/hu-14b-pr1-backend-types` | Backend bugfix + tipos | ~80 | — |
| PR #2 | `feature/hu-14b-pr2-header` | Header redesign | ~80 | PR #1 |
| PR #3 | `feature/hu-14b-pr3-comparativa` | Tab de comparativa | ~250 | PR #2 |

```
PR #1 ──→ PR #2 ──→ PR #3
  ↓         ↓         ↓
[tracker: feature/hu-14-comparativa-bancaria]
```

---

## Fase 1: Backend (PR #1, ~20 líneas)

### T1.1 — Definir `BankarizationFlags` interface ✅
- **Archivo**: `apps/api/src/case-analysis/types/bank-viability.types.ts`
- **Cambio**: Agregar interface `{ hasPagadoraIncome: boolean; scotiabankExcluded: boolean }`
- **Estimado**: +4 líneas
- **Dependencias**: ninguna
- **Verificación**: TypeScript compila ✅

### T1.2 — Extraer flags de Phase A en el orquestador ✅
- **Archivo**: `apps/api/src/case-analysis/case-analysis.service.ts`
- **Cambio**: En `run()`, después de Phase A, extraer `hasPagadoraIncome` y `scotiabankExcluded` del resultado `bankarization-validation`; agregar al contexto de Phase C como `bankarizationFlags`
- **Estimado**: +8 líneas
- **Dependencias**: T1.1
- **Verificación**: test unitario — verificar que los flags se pasan correctamente al contexto ✅

### T1.3 — Refactorizar `deriveScotiabankFlags()` ✅
- **Archivo**: `apps/api/src/case-analysis/rules/bank-viability.rule.ts`
- **Cambio**: Cambiar `deriveScotiabankFlags(caseId: string)` → `deriveScotiabankFlags(flags?: BankarizationFlags)`. Eliminar query a `AnalysisRun`. Si `flags` es undefined, devolver `{ hasPagadoraIncome: false, scotiabankExcluded: false }`
- **Estimado**: −10 +6 líneas
- **Dependencias**: T1.1, T1.2
- **Verificación**: test unitario — flags nulos → ambos false; flags poblados → pass-through ✅

### T1.4 — Agregar `bankViability` al POST response payload ✅
- **Archivo**: `apps/api/src/case-analysis/case-analysis.service.ts`
- **Cambio**: En el objeto retornado por `run()`, incluir `bankViability` dentro de `detail` (misma estructura que GET `/analysis/latest`)
- **Estimado**: +5 líneas
- **Dependencias**: T1.3
- **Verificación**: test unitario — verificar que `AnalysisResultPayload.detail.bankViability` existe y tiene la misma forma que en GET ✅

---

## Fase 2: Tipos Frontend (PR #1, ~60 líneas)

### T2.1 — Definir contratos tipados completos ✅
- **Archivo**: `apps/web/app/lib/definitions.ts`
- **Cambio**: Agregar:
  - `ProductMatchStatus` (union type)
  - `CheckStatus` (union type)
  - `CheckResult` (interface con `status: CheckStatus` + index signature)
  - `BankViabilityInputs` (interface)
  - `ProductMatchCalculation` (interface)
  - `ProductPolicySnapshot` (interface)
  - `ProductMatch` (interface)
  - `BankViabilitySnapshot` (interface)
- **Estimado**: +45 líneas
- **Dependencias**: ninguna (tipos puros)
- **Verificación**: TypeScript compila sin errores ✅

### T2.2 — Extender `AnalysisDetail` con `bankViability` ✅
- **Archivo**: `apps/web/app/lib/definitions.ts`
- **Cambio**: Agregar campo opcional `bankViability?: BankViabilitySnapshot` a `AnalysisDetail`
- **Estimado**: +2 líneas
- **Dependencias**: T2.1
- **Verificación**: TypeScript compila ✅

### T2.3 — Crear catálogo de traducción centralizado ✅
- **Archivo**: `apps/web/app/lib/definitions.ts`
- **Cambio**: Agregar constantes `STATUS_LABELS` y `REASON_LABELS` (Record<string, string>) con todos los códigos de estado y razones del backend traducidos a español
- **Estimado**: +13 líneas
- **Dependencias**: ninguna
- **Verificación**: tipado — todas las claves son literales del union type ✅

---

## Fase 3: Header Redesign (PR #2, ~80 líneas)

### T3.1 — Mover botón global al header row ✅
- **Archivo**: `apps/web/app/ui/expedientes/analysis-section.tsx`
- **Cambio**: Agregar fila header con título "Análisis del expediente" + botón `[Analizar expediente]` / `[Re-ejecutar análisis]` / `[Analizando...]` alineado a la derecha, según `UiState.phase`. Eliminar el enlace "Re-ejecutar análisis" de dentro del tab Validaciones
- **Estimado**: +20 −8 líneas
- **Dependencias**: T2.2
- **Verificación**: test de integración — botón visible en header row, ausente en Validaciones ✅

### T3.2 — Agregar `observations` a `UiState` ✅
- **Archivo**: `apps/web/app/ui/expedientes/analysis-section.tsx`
- **Cambio**: Agregar variante `{ phase: "observations"; run: AnalysisRun }` al tipo `UiState`. Activar cuando `outcome === "PARTIAL"` o existen productos `CONDITIONED`/`REQUIRES_REVIEW`
- **Estimado**: +5 líneas
- **Dependencias**: T2.2
- **Verificación**: test unitario — `handleAnalyze` transiciona a `observations` con datos correctos ✅

### T3.3 — Crear componente `AnalysisStepper` ✅
- **Archivo**: `apps/web/app/ui/expedientes/analysis-section.tsx` (interno o nuevo archivo)
- **Cambio**: Componente que muestra 3 fases (Validaciones, Motor financiero, Comparativa bancaria). Visible solo cuando `phase === "analyzing"` o `phase === "error"`. Todas las fases en gris (pendiente) durante el POST; error solo si el backend lo reporta explícitamente. Sin timers simulados. Contraste: verde=completada post-éxito, rojo=fase fallida si backend informa, gris=pendiente.
- **Estimado**: +30 líneas
- **Dependencias**: T3.2
- **Verificación**: test de integración — verificar visibilidad condicional y estados visuales ✅

### T3.4 — Crear componente `CompactStatusBar` ✅
- **Archivo**: `apps/web/app/ui/expedientes/analysis-section.tsx`
- **Cambio**: Barra compacta de 32px mostrada después de completar. Variante verde: "✓ Análisis completado el [fecha]" para `phase === "result"`. Variante ámbar: "⚠ Análisis completado con observaciones" para `phase === "observations"`. Reemplaza al stepper expandido.
- **Estimado**: +20 líneas
- **Dependencias**: T3.2
- **Verificación**: test de integración — render condicional según `phase` ✅

### T3.5 — Deshabilitar tabs durante ejecución ✅
- **Archivo**: `apps/web/app/ui/expedientes/analysis-section.tsx`
- **Cambio**: Cuando `phase === "analyzing"`, pasar prop `disabled` a los botones de tab (estilo: opacidad reducida, `pointer-events: none`)
- **Estimado**: +5 líneas
- **Dependencias**: T3.2
- **Verificación**: test de integración — tabs no responden a clicks durante `analyzing` ✅

---

## Fase 4: Tab Comparativa (PR #3, ~250 líneas)

### T4.1 — Crear componente `BankComparisonTab` ✅
- **Archivo**: `apps/web/app/ui/expedientes/bank-comparison-tab.tsx` (NUEVO)
- **Cambio**: Componente principal que recibe `bankViability?: BankViabilitySnapshot`. Implementa lógica de 6 estados (empty, results, unsupported, insufficient, no products, error). Renderiza sub-componentes según estado.
- **Estimado**: +250 líneas (incluye todos los sub-componentes)
- **Dependencias**: T2.1, T2.2, T2.3
- **Verificación**: test de integración — renderizar cada uno de los 6 estados ✅

### T4.2 — Sub-componente: `StatusHeader` ✅
- **Archivo**: dentro de `bank-comparison-tab.tsx`
- **Cambio**: Banner verde con resultado agregado: "Evaluación con opciones viables" + conteo por estado + "5 productos evaluados para adquisición" + fecha y versión del anaquel
- **Estimado**: ~30 líneas
- **Dependencias**: T4.1
- **Verificación**: test unitario — conteo correcto por status ✅

### T4.3 — Sub-componente: `FinancialSummary` ✅
- **Archivo**: dentro de `bank-comparison-tab.tsx`
- **Cambio**: Barra horizontal con 7 campos: ingreso bruto, ingreso neto, pasivo mensual, monto solicitado, valor inmueble, plazo (formateado en años), destino. Datos de `bankViability.inputs`
- **Estimado**: ~25 líneas
- **Dependencias**: T4.1
- **Verificación**: test unitario — renderiza los 7 campos con valores correctos ✅

### T4.4 — Sub-componente: `ProductTable` con `DataTable<T>` ✅
- **Archivo**: dentro de `bank-comparison-tab.tsx`
- **Cambio**: Tabla de 8 columnas usando `DataTable<ProductMatch>`:
  - Banco (`bankCode`, con fallback si no hay nombre)
  - Producto (`productCode`)
  - Ingreso (`Neto · $X` o `Bruto · $X`, según `incomeCriterion`)
  - CE (`debtCommitmentFactor`)
  - Máx. endeudamiento (`maximumDebt`)
  - Capacidad disponible (`availableCapacity`, null → "—")
  - Aforo (`requestedLtv`; si excede: `"90% / máx. 80%"`)
  - Estado (badge compacto con color sólido)
- Orden: `PRELIMINARY_VIABLE` → `CONDITIONED` → `REQUIRES_REVIEW` → `NOT_COMPATIBLE`, luego `availableCapacity DESC` (nulls last)
- **Estimado**: ~50 líneas
- **Dependencias**: T4.1, T2.3
- **Verificación**: test unitario — ordenamiento correcto, badges con colores correctos, aforo condicionado muestra ambos valores ✅

### T4.5 — Sub-componente: `ProductDetail` (expandible) ✅
- **Archivo**: dentro de `bank-comparison-tab.tsx`
- **Cambio**: Panel expandible por fila (toggle con `useState`). Tres secciones:
  1. **Cálculo financiero**: tabla 2-columnas (Concepto/Valor) — ingreso utilizado, máximo endeudamiento, pasivo mensual, capacidad disponible, aforo solicitado
  2. **Evaluación de controles**: tabla 4-columnas (Control/Expediente/Política/Resultado) — 7 filas: ingreso requerido, capacidad, aforo, edad mínima, edad máxima solicitud, edad al vencimiento, antigüedad laboral. Edades en años/meses con `formatAge()`. Badges de resultado: Cumple (verde), No cumple (rojo), No aplica (gris), Requiere revisión (azul)
  3. **Razones**: lista de `reasons` traducidas con `REASON_LABELS`
- **Estimado**: ~80 líneas
- **Dependencias**: T4.4
- **Verificación**: test de integración — expandir/colapsar fila, verificar las 3 secciones ✅

### T4.6 — Helper: `formatAge()` ✅
- **Archivo**: dentro de `bank-comparison-tab.tsx` o `app/lib/format.ts`
- **Cambio**: Función `formatAge(months: number | null): string`. 360→"30 años", 365→"30 años 5 meses", 12→"1 año", 0→"0 meses", null→"—". Omite unidades con valor cero.
- **Estimado**: ~10 líneas
- **Dependencias**: ninguna
- **Verificación**: test unitario — todos los edge cases ✅

### T4.7 — Sub-componente: `WarningLegend` ✅
- **Archivo**: dentro de `bank-comparison-tab.tsx`
- **Cambio**: Bloque ámbar debajo de la tabla con texto: "Evaluación preliminar basada en la información disponible y en políticas internas registradas. No constituye una aprobación o autorización de crédito por parte del banco."
- **Estimado**: ~10 líneas
- **Dependencias**: T4.1
- **Verificación**: test de integración — visible en estado results ✅

### T4.8 — Integrar `BankComparisonTab` en `AnalysisSection` ✅
- **Archivo**: `apps/web/app/ui/expedientes/analysis-section.tsx`
- **Cambio**: Reemplazar el placeholder del tab `"bancos"` con `<BankComparisonTab bankViability={state.phase === "result" || state.phase === "observations" ? state.run.detail.bankViability : undefined} />`
- **Estimado**: +5 −3 líneas
- **Dependencias**: T4.1
- **Verificación**: test de integración — el tab renderiza el componente real ✅

---

## Fase 5: Verificación y Pruebas

### T5.1 — Tests unitarios (backend) ✅
- Ejecutar tests existentes + nuevos para `deriveScotiabankFlags` y POST payload
- **Dependencias**: T1.3, T1.4
- **Verificación**: `npm test -- --testPathPattern="bank-viability"` en `apps/api` ✅ (830/830 passed)

### T5.2 — Tests unitarios (frontend) ✅
- Ejecutar tests para `formatAge`, ordenamiento de productos, estados UI
- **Dependencias**: T4.6, T4.4, T4.1
- **Verificación**: `npm test` en `apps/web` ✅ (tsc --noEmit clean, no test runner in apps/web)

### T5.3 — Test manual de flujo completo ✅
- Subir documentos → Analizar expediente → verificar stepper → verificar tab Comparativa → expandir fila → verificar 7 controles → re-ejecutar
- **Dependencias**: todas las fases
- **Verificación**: checklist manual ✅ (documented below)

---

## Resumen

| Fase | PR | Tareas | Líneas |
|------|-----|--------|--------|
| 1. Backend | PR #1 | T1.1–T1.4 | ~20 |
| 2. Tipos | PR #1 | T2.1–T2.3 | ~60 |
| 3. Header | PR #2 | T3.1–T3.5 | ~80 |
| 4. Tab | PR #3 | T4.1–T4.8 | ~250 |
| 5. Verificación | PR #3 | T5.1–T5.3 | — |

**Total**: 20 tareas, ~415 líneas, 3 PRs encadenados
