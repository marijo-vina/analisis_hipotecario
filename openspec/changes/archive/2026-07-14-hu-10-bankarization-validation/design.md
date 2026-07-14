# Design: HU-10 Validación de Bancarización

## Technical Approach

Backend puro: nuevo `PayrollBankMatchingService` (sin estado, determinístico) ejecuta matching 1:1 recibo→depósito con prioridad RFC y fallback obligatorio. `PagadoraDetectionService` identifica esquemas de pagadora y aplica regla Scotiabank. Ambos son orquestados por `BankarizationValidationRule`, que implementa `AnalysisRule` y emite alertas al `CaseAnalysisService`. Sin ML, sin fuzzy — cada decisión trazable.

## Architecture Decisions

| Opción | Tradeoffs | Decisión |
|--------|-----------|----------|
| Servicio en backend vs lógica en frontend | Backend: auditabilidad, reutilización, testabilidad | **Backend** — matching debe ser determinístico y auditable, no disperso en UI |
| Regla integrada al orquestador vs endpoint standalone | Regla: consistencia con identity-match, agregación automática de outcomes | **Regla AnalysisRule** — mismo ciclo de vida, misma persistencia en AnalysisRun |
| Determinístico vs ML/fuzzy | ML: falsos positivos no auditables. Determinístico: trazable, predecible | **Determinístico** — catálogo de concepto fijo, tolerancias numéricas exactas |

## Data Flow

```
Documentos extraídos (PAYROLL_RECEIPT + BANK_STATEMENT)
         │
         ▼
CaseAnalysisService.run(caseId)
         │
         ▼
BankarizationValidationRule.execute(client, documents)
         │
         ├── Extrae payrollReceipts[] y payrollDeposits[]
         │
         ├── PayrollBankMatchingService.match(receipts, deposits)
         │       │
         │       ├── Pre-filtro: depósitos ±7d del recibo
         │       ├── RFC match → validar fecha(±2d) + monto(≤5%)
         │       ├── RFC diff → marcar RFC_INCOMPATIBLE (no fallback)
         │       └── Sin RFC → fallback 3 reglas obligatorias → score ordena
         │
         ├── PagadoraDetectionService.evaluate(unmatchedReceipts, deposits)
         │       ├── Provider candidate: RFC recurrente distinto
         │       ├── Doble espejo: matching employer + pagadora
         │       └── Scotiabank: concepto sin "NOMINA" → excluded
         │
         └── Mapeo a RuleResult { outcome, alerts[], detail }
                    │
                    ▼
              AnalysisRun → UI estados-conciliacion.tsx
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/case-analysis/types/bankarization.types.ts` | Create | Tipos: `PayrollReconciliationStatus`, `PayrollMatchMethod`, `PayrollMatchInput`, `PayrollMatchResult`, `PagadoraEvaluation` |
| `apps/api/src/case-analysis/services/payroll-bank-matching.service.ts` | Create | Algoritmo matching 9-pasos con RFC + fallback + tolerancias |
| `apps/api/src/case-analysis/services/pagadora-detection.service.ts` | Create | Detección pagadora, doble espejo, regla Scotiabank |
| `apps/api/src/case-analysis/rules/bankarization-validation.rule.ts` | Create | Regla `AnalysisRule`: orquesta servicios, emite 4 alertas |
| `apps/api/src/case-analysis/rules/bankarization-validation.rule.spec.ts` | Create | Tests unitarios de la regla |
| `apps/api/src/case-analysis/services/payroll-bank-matching.service.spec.ts` | Create | Tests unitarios del algoritmo matching |
| `apps/api/src/case-analysis/services/pagadora-detection.service.spec.ts` | Create | Tests unitarios de detección pagadora |
| `apps/api/src/case-analysis/case-analysis.service.ts` | Modify | Inyectar y registrar `BankarizationValidationRule` |
| `apps/api/src/case-analysis/case-analysis.module.ts` | Modify | Declarar servicios + regla como providers |
| `apps/web/app/ui/extraction/estados-conciliacion.tsx` | Modify | Mostrar estado por recibo con alertas |

## Interfaces / Contracts

Tipos en `types/bankarization.types.ts`:

```typescript
// Entrada del matching
interface PayrollMatchingInput {
  receipts: PayrollReceipt[];
  deposits: PayrollDeposit[];
  isJointAccount: boolean;
}

// Resultado individual por recibo
interface PayrollMatchResult {
  receiptIndex: number;
  status: PayrollReconciliationStatus;
  method: PayrollMatchMethod;
  candidateDepositId: string | null;
  candidateAmount: number | null;
  candidateDate: string | null;
  score: number | null;
  scotiabankExcluded: boolean;
  traceability: MatchTrace;
}

interface MatchTrace {
  rule: 'RFC_MATCH' | 'FALLBACK_3RULES' | 'NONE';
  rfcUsed?: string;
  dateDiff?: number;
  amountDiffPercent?: number;
  conceptKeyword?: string;
}

// Método público del PayrollBankMatchingService
match(receipts: PayrollReceipt[], deposits: PayrollDeposit[], isJointAccount: boolean): PayrollMatchResult[]
```

La regla implementa `AnalysisRule` (interface existente) con `ruleId = 'bankarization-validation'`.

## Testing Strategy

| Capa | Qué probar | Enfoque |
|------|-----------|---------|
| Unit — matching | RFC match, fallback 3 reglas, bidireccionalidad, score, catálogo concepto | Pure functions, sin NestJS. Casos: MATCHED, DISCREPANCY, RFC_INCOMPATIBLE, NOT_MATCHED, AMBIGUOUS |
| Unit — pagadora | Provider candidate, doble espejo, Scotiabank excl/OK | Cada escenario de spec pagadora-detection |
| Unit — rule | Orquestación: llama servicios, mapea resultados → alertas, calcula outcome | Mock de servicios, verificar RuleResult |
| Integration | Pipeline completo: documentos → matching → regla → AnalysisResult | Test con datos extraídos reales |

## Migración / Rollout

No se requiere migración de datos. La extracción existente no se modifica. El matching es computado en cada ejecución. Rollback: remover registro de la regla en `CaseAnalysisService` y revertir `estados-conciliacion.tsx`.

## Open Questions

- [ ] ¿Priorizar depósitos con `paymentMethodLabel = 'SPEI'` en fallback cuando hay empate de score? (propuesta: sí, como tie-breaker secundario)
- [ ] ¿Calcular score de fecha como `1 - (|diff| / 2)` o binario (0 o 1)? (propuesta: binario — si pasa ±2d, fecha = 30%; si no, descartado)
