# Design: Cálculo de ingreso mensual admisible — HU-12

## Technical Approach

Mirrors the `LiabilitySnapshot` immutable-snapshot pattern from HU-11. A new `IncomeCalculation` Prisma model stores receipt-level results (JSON), computed averages (Decimal), and confirmation metadata. The service reads `PAYROLL_RECEIPT` documents, computes gross/net averages from included receipts, and persists an immutable snapshot. The frontend uses `parsePayroll()` to build a 9-column table with inclusion toggles, KPI cards, and a confirmation panel.

## Architecture Decisions

| Option | Tradeoff | Decision |
|--------|----------|----------|
| New `IncomeCalculation` model vs extend `MortgageCase` | Isolated model = clean separation, multi-snapshot history, immutable audit | New `IncomeCalculation` model (same pattern as `LiabilitySnapshot`) |
| Decimal vs integer cents for averages | Averages need fractional precision; integer cents loses it | `Decimal` (Prisma) with 2 decimal places |
| Snapshot on each toggle vs explicit "Calcular" step | Explicit button matches liability UX pattern | POST `/calculate` creates snapshot; `PATCH /receipts/:docId` toggles and recalculates in memory then persists |
| Snake_case vs camelCase in JSON column | Existing `LiabilitySnapshot.credits` already uses camelCase | camelCase for `receiptResults` consistency |

## Data Flow

```
PAYROLL_RECEIPT docs → parsePayroll() (client) → UI table
                                ↕
  POST /calculate ──→ IncomeCalculationService
    reads docs from DB ← extracts gross/net
    from included receipts → computes averages
    → saves IncomeCalculation snapshot → returns
  GET /latest ← reads snapshot → returns cached
  PATCH /receipts/:docId → toggles include → recalculates → new snapshot
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/api/prisma/schema.prisma` | Modify | Add `IncomeCalculation` model + `incomeCalculations` relation on `MortgageCase` |
| `apps/api/src/income-calculation/income-calculation.module.ts` | Create | NestJS module importing PrismaModule |
| `apps/api/src/income-calculation/income-calculation.types.ts` | Create | `IncomeCalculationStatus` enum + `IncomeReceiptResult`, `IncomeCalculationResult` interfaces |
| `apps/api/src/income-calculation/income-calculation.service.ts` | Create | Core service: `calculate()`, `getLatest()`, `toggleReceipt()`, `confirm()` |
| `apps/api/src/income-calculation/income-calculation.controller.ts` | Create | REST endpoints with JwtAuthGuard |
| `apps/api/src/income-calculation/dto/` | Create | `confirm-income.dto.ts` |
| `apps/api/src/app.module.ts` | Modify | Import `IncomeCalculationModule` |
| `apps/web/app/actions/income.ts` | Create | Server actions: `calculateIncome`, `fetchIncomeLatest`, `toggleReceipt`, `confirmIncome` |
| `apps/web/app/ui/expedientes/income-calculation-section.tsx` | Create | Full section: table, KPI cards, confirmation panel |
| `apps/web/app/ui/expedientes/analysis-section.tsx` | Modify | Add `<IncomeCalculationSection caseId={caseId} />` below `<LiabilityCalculationSection />` in motor tab |

## Interfaces / Contracts

```typescript
// income-calculation.types.ts
enum IncomeCalculationStatus {
  CALCULATED = 'CALCULATED',
  CONFIRMED = 'CONFIRMED',
  REQUIRES_REVIEW = 'REQUIRES_REVIEW',
}

interface IncomeReceiptResult {
  documentId: string;
  period: string | null;
  paymentDate: string | null;
  employer: string | null;
  employerRfc: string | null;
  grossIncome: number | null;
  netIncome: number | null;
  conciliationStatus: string | null;
  reviewStatus: string | null;
  included: boolean;
}

interface IncomeCalculationResult {
  id: string;
  caseId: string;
  calculatedAt: string;
  receiptResults: IncomeReceiptResult[];
  averageGrossIncome: number;
  averageNetIncome: number;
  confirmedGrossIncome: number | null;
  confirmedNetIncome: number | null;
  receiptCount: number;
  includedCount: number;
  status: IncomeCalculationStatus;
  confirmedBy: string | null;
  confirmedAt: string | null;
  observations: string | null;
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (service) | `calculate()` with 0/1/N receipts, Decimal averages, exclusion logic | `liability.service.spec.ts` pattern: mock Prisma, assert snapshot fields |
| Unit (controller) | 400 on empty selection, 404 on no docs, correct status transitions | `liability.controller.spec.ts` pattern: mock service, assert HTTP codes |
| Integration | Full POST→GET→PATCH→POST/confirm lifecycle | Supertest e2e, seed PAYROLL_RECEIPT docs |
| Frontend | Table renders all 9 columns, checkbox toggle recalculates, KPIs show correct values | Component tests with mocked server actions |

## Migration / Rollout

- Prisma migration adds `IncomeCalculation` table (non-breaking: new table, new optional relation)
- No existing data migration needed — empty table for all cases
- Rollback: drop table, revert schema, remove module import and component

## Open Questions

- [ ] Should `confirm()` send email notification to the analyst? (Out of scope per proposal — defer)
- [ ] Conciliation/review status columns read from existing `AnalysisRun` or replicated in snapshot? → Read from existing conciliation data stored in `Document.extractedData` at calculation time, mirrored in snapshot for immutability
