# Design: PFAE HU-18 Dual Income Engine

## Technical Approach

`IncomeCalculationService.calculate()` gains a `personType` branch. SALARIED keeps today's payroll `computeAverages` path untouched. PFAE skips payroll entirely, builds two independent bases (bank statements, tax return) from `Document.extractedData`, picks a default `source`, and projects the winning figures into `averageGrossIncome` / `averageNetIncome` so Phase C and the frontend keep reading the same columns. All new math lives in pure `Prisma.Decimal` helpers, mirroring the existing `computeAverages` style. `LiabilityCalculationService` derives its revolving factor from `personType` instead of the hardcoded `0.06`.

## Architecture Decisions

| # | Decision | Alternatives rejected | Rationale |
|---|----------|----------------------|-----------|
| 1 | Extend `IncomeCalculation` with `source` + JSON `bases` | Parallel `PfaeIncomeCalculation` table | Snapshot immutability, `getLatest`, and Phase C all keep working; one migration, no join |
| 2 | `personType` resolved inside both services via a `mortgageCase` lookup | Extra parameter from `CaseAnalysisService` | Controller callers (`POST /income/calculate`, liability) get correct behavior without signature churn at every call site |
| 3 | Pure exported helpers in `pfae-income.helpers.ts` | Private service methods | Unit-testable without Prisma mocks, matching `computeAverages` / `mapDocumentToReceipt` |
| 4 | Deterministic drop max+min tie-break | Drop by value comparison | Sort months by `(total ASC, monthKey ASC)`; drop index `0` and index `len-1`. Exactly one min and one max drop even with duplicate totals |
| 5 | Bank base emits one figure for gross and net | Separate gross/net | The cleaner only produces `depurationSummary.totalValidIncome`; inventing a gross would be fabricated data |
| 6 | Tax loss invalidates only the tax base | Global knockout | Expediente survives on bank statements per spec |
| 7 | Both bases invalid ⇒ persist `REQUIRES_REVIEW` with zero averages and `source=BANK_STATEMENTS` | Throw 404/400 or `source=PAYROLL` | Preferred default is bank; PAYROLL would label a PFAE as payroll |
| 8 | UNKNOWN credits use the resolved factor | Keep hardcoded `0.06` | Spec requires PFAE UNKNOWN at 7% |

## Data Flow

```
analyze → Phase B → IncomeCalculationService.calculate(caseId)
                       │
                       ├─ personType = SALARIED → payroll docs → computeAverages   → source=PAYROLL
                       │
                       └─ personType = PFAE
                            ├─ CSF activities[]   → resolveActivity()  → N = 6 | 12
                            ├─ BANK_STATEMENT[]   → assembleMonths()   → smooth(N) → bank base
                            ├─ TAX_RETURN         → taxMonthly()                   → tax base
                            └─ chooseSource(bank, tax) → averages + bases JSON → IncomeCalculation
```

`assembleMonths` keys each statement by `YYYY-MM` of `statementPeriod.periodStartDate` (fallback `periodEndDate`), skips `isCurrentIncompleteMonth === true`, and sums `financialDepuration.depurationSummary.totalValidIncome` across statements sharing a month. `smooth` takes the most recent N months; fewer than N unique months returns `null` ⇒ bank base INVALID.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/api/prisma/schema.prisma` | Modify | `IncomeCalculation.source String @default("PAYROLL")`, `bases Json?` |
| `apps/api/prisma/migrations/<ts>_add_income_source_bases/migration.sql` | Create | Two `ALTER TABLE ... ADD COLUMN`; the default backfills existing rows |
| `apps/api/src/income-calculation/income-calculation.types.ts` | Modify | `IncomeSource`, `IncomeBase`, `BankIncomeBase`, `ActivityResolution`, `PfaeIncomeBases`; extend `IncomeCalculationResult` |
| `apps/api/src/income-calculation/pfae-income.helpers.ts` | Create | `resolveActivity`, `assembleMonths`, `smooth`, `taxMonthly`, `chooseSource` (pure `Decimal`) |
| `apps/api/src/income-calculation/pfae-income.helpers.spec.ts` | Create | Unit tests for all helpers |
| `apps/api/src/income-calculation/income-calculation.service.ts` | Modify | PFAE branch in `calculate()`; `snapshotToResult` returns `source` + `bases` |
| `apps/api/src/income-calculation/income-calculation.service.spec.ts` | Modify | PFAE integration tests + SALARIED regression |
| `apps/api/src/liability/liability.service.ts` | Modify | `resolveFactor(caseId, factorUsed?)`; thread factor into `calculateUnknown` |
| `apps/api/src/liability/liability.service.spec.ts` | Modify | PFAE 7%, SALARIED 6%, UNKNOWN 7% |
| `apps/api/src/case-analysis/case-analysis.service.spec.ts` | Modify | PFAE Phase B persists a snapshot without payroll |

## Interfaces

```ts
export type IncomeSource = 'PAYROLL' | 'BANK_STATEMENTS' | 'TAX_RETURN';

export interface IncomeBase {
  valid: boolean;
  invalidReason: string | null;   // 'INSUFFICIENT_MONTHS' | 'TAX_LOSS' | 'MISSING_DOCUMENT'
  monthlyGross: number | null;
  monthlyNet: number | null;
}

export interface BankIncomeBase extends IncomeBase {
  windowMonths: 6 | 12;
  monthsUsed: string[];           // YYYY-MM kept after dropping max and min
  droppedMax: string | null;
  droppedMin: string | null;
}

export interface ActivityResolution {
  description: string | null;
  percentage: number | null;
  order: number | null;
  matchedKeyword: string | null;  // stub until the HU-20 catalog
  windowMonths: 6 | 12;
}

export interface PfaeIncomeBases {
  bank: BankIncomeBase;
  taxReturn: IncomeBase;
  activity: ActivityResolution;
}
```

`resolveActivity` filters `activities[]` to `endDate === null`, sorts by `percentage DESC, order ASC`, then matches the description against `primaria | restaurantero | alimentos y bebidas` ⇒ `windowMonths = 12`, else `6`.

## Testing Strategy

Strict TDD (RED → GREEN → REFACTOR) for every item.

| Layer | Spec scenario | Test |
|-------|---------------|------|
| Unit (helpers) | Six-month smoothing | `[10,12,14,16,18,100]` ⇒ `15`, not `28.33` |
| Unit (helpers) | Twelve-month smoothing | `[1..11,100]` ⇒ `6.5`, not `13.83` |
| Unit (helpers) | Short window invalid | 5 unique months, N=6 ⇒ `valid: false`, `INSUFFICIENT_MONTHS` |
| Unit (helpers) | CSF activity selects N | restaurantero ⇒ `12`; generic ⇒ `6`; tie on % ⇒ lower `order` |
| Unit (helpers) | Tax monthly conversion | `fiscalProfit 120000` ⇒ net `10000`; `accumulable 240000` ⇒ gross `20000` |
| Service | Default source projection | Both valid ⇒ `BANK_STATEMENTS`, averages equal bank figures |
| Service | Tax source when bank invalid | Bank invalid ⇒ `TAX_RETURN`, averages equal tax figures |
| Service | Fiscal loss knocks out tax only | `hasTaxLoss` ⇒ tax invalid, `source = BANK_STATEMENTS` |
| Service | Both invalid requires review | `REQUIRES_REVIEW`, no throw, `getLatest` succeeds |
| Service | PFAE analyze without payroll | No `NotFoundException`; both bases present |
| Service | SALARIED regression | `[15000.50, 14999.50]` ⇒ `15000.00`, `source = PAYROLL` |
| Service | Liability factors | PFAE `7000` / `0.07`; SALARIED `6000` / `0.06`; PFAE UNKNOWN `7000` |
| Integration | GET latest contract | Response exposes `source` and `bases` |

## Migration / Rollout

Additive, zero-downtime. `source TEXT NOT NULL DEFAULT 'PAYROLL'` backfills every existing row; `bases JSONB` stays `NULL` for pre-HU-18 snapshots and `snapshotToResult` maps it to `null`. Rollback drops both columns.

## Open Questions

None.
