# Design: Unificar flujo de análisis y eliminar confirmaciones (HU-14A)

## Technical Approach

Restructure `CaseAnalysisService.run()` from a flat rule loop into 3 sequenced phases. Inject `IncomeCalculationService` + `LiabilityCalculationService` for Phase B. Remove all manual confirmation UI and endpoints. `BankViabilityRule` falls back to calculated `averageGrossIncome`/`averageNetIncome` when `confirmed*` is null. Single "Analizar expediente" button replaces individual triggers.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| Phased execution | 3-phase: A (identity+bankarization rules) → B (income+liability calc) → C (bankViability rule) | Single rule loop with services injected as rules | Rules are pure evaluation; calculations are side-effect-producing services. Phases enforce ordering without mixing concerns |
| Income fallback | `confirmedGrossIncome ?? averageGrossIncome ?? null` in `BankViabilityRule` lines 108-110 | Require confirmed income; block without it | Confirmed income concept is removed in MVP. Averages are the source of truth |
| Liability w/o bureau data | Skip liability with warning log; bankViability uses `grossCurrentMonthlyDebt=null` | Block entire analysis | PROPOSAL: liability is optional — bankViability already handles null liabilities gracefully |
| Phase A failure | Execute all phases regardless; individual failures logged as warnings | Halt on first failure | Spec requires "Phase failure does not block subsequent phases" |
| Remove `transitionToRequiresReview` | Delete method + call site (lines 118-120, 213-225); FAIL outcome no longer gates case status | Keep for audit trail | Spec removes `REQUIRES_REVIEW` gating. Analysis produces results without blocking case progression |
| Single button replaces all triggers | One "Analizar expediente" calls existing `POST /analyze`; backend orchestrates everything | New unified endpoint | Existing endpoint already triggers `run()` — only internal orchestration changes |

## Data Flow

```
POST /analyze
     │
     ▼
CaseAnalysisService.run(caseId, userId)
     │
     ├── Phase A ────────────────────────────────
     │   identityMatchRule.execute()
     │   bankarizationValidationRule.execute()
     │   │
     ├── Phase B ────────────────────────────────
     │   incomeCalc  = IncomeCalculationService.calculate(caseId)
     │   liabilityCalc = LiabilityCalculationService.calculate(caseId, credits)
     │   │               ↳ if no bureau data → skip, log warning
     │   │
     ├── Phase C ────────────────────────────────
     │   BankViabilityRule.execute()
     │   │    reads latest incomeCalc (averageGrossIncome fallback)
     │   │    reads latest liabilityCalc (grossCurrentMonthlyDebt)
     │   │
     ├── aggregate() without transitionToRequiresReview
     │
     └── return AnalysisResultPayload
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/case-analysis/case-analysis.service.ts` | Modify | Inject `IncomeCalculationService`, `LiabilityCalculationService`. Restructure `run()` into 3 phases. Remove `recordReviewDecision()` (lines 149-170), `transitionToRequiresReview()` (lines 213-225), call site (lines 118-120). Remove `review-decision.dto` import. |
| `apps/api/src/case-analysis/case-analysis.service.spec.ts` | Modify | Remove `describe('recordReviewDecision')` block (lines 256-307). Add test for 3-phase execution order. Inject mock calculation services. Remove `reviewDecision.create` mock. |
| `apps/api/src/case-analysis/rules/bank-viability.rule.ts` | Modify | Lines 108-110: change `confirmedGrossIncome ?? null` to `confirmedGrossIncome ?? averageGrossIncome ?? null`; same for net. Add `averageGrossIncome`/`averageNetIncome` reads from `incomeCalc`. |
| `apps/api/src/case-analysis/rules/bank-viability.rule.spec.ts` | Modify | Add test: when `confirmedNetIncome=null` but `averageNetIncome` exists → uses average. Update mock `incomeCalculation` to include `averageGrossIncome`/`averageNetIncome`. |
| `apps/api/src/income-calculation/income-calculation.service.ts` | Modify | Remove `confirm()` method (lines 217-241). |
| `apps/api/src/income-calculation/income-calculation.controller.ts` | Modify | Remove `POST confirm` endpoint (lines 122-130), `ConfirmIncomeDto` import (line 15). |
| `apps/api/src/income-calculation/income-calculation.service.spec.ts` | Modify | Remove confirm-related tests. |
| `apps/api/src/mortgage-cases/mortgage-cases.controller.ts` | Modify | Remove `submitReviewDecision` endpoint (lines 87-109). Remove `ReviewDecisionDto` import (line 17). |
| `apps/api/src/mortgage-cases/mortgage-cases.controller.spec.ts` | Modify | Remove `describe('submitReviewDecision')` block (lines 163-227). Remove `recordReviewDecision` mock. |
| `apps/web/app/ui/expedientes/analysis-section.tsx` | Modify | Remove `submitReviewDecision` import (line 8), `handleReviewDecision` (lines 140-162), `OperationalStatusBadge` (lines 397-422), `ActionsGroup` (lines 690-758), `reviewSubmitting`/`operationalStatus` state. Replace "Validar expediente" button text (line 358) with "Analizar expediente". Remove confirm decision UI from `IdentityValidationSection`. |
| `apps/web/app/ui/expedientes/income-calculation-section.tsx` | Modify | Remove confirmation panel (lines 422-495), confirmed KPI cards (lines 563-610), `confirmIncome` import (line 9), `handleConfirm` (lines 266-284), confirmation form state (lines 180-183). Remove "Calcular ingresos" button (lines 319-335). Remove `StatusBadge` CONFIRMADO state. |
| `apps/web/app/ui/extraction/estados-conciliacion.tsx` | Modify | Remove `reviewStates` state (line 42), `toggleReview` (lines 127-144), per-receipt PENDIENTE/REVISADO toggle button (lines 255-266 in ReceiptCard). Keep reconciliation logic. |
| `apps/web/app/actions/analysis.ts` | Modify | Remove `submitReviewDecision` function (lines 60-83). |
| `apps/web/app/actions/income.ts` | Modify | Remove `confirmIncome` function (lines 160-192), `CONFIRMED`/`REQUIRES_REVIEW` from IncomeCalculationStatus (line 24). |

## Interfaces / Contracts

No new interfaces. Existing contract changes:

- **`IncomeCalculationResult`**: `confirmedGrossIncome`/`confirmedNetIncome` remain nullable (DB columns preserved) but are no longer written.
- **`CaseAnalysisService`** constructor gains 2 injected params:
  ```typescript
  constructor(
    prisma: PrismaService,
    identityMatchRule: IdentityMatchRule,
    bankarizationValidationRule: BankarizationValidationRule,
    bankViabilityRule: BankViabilityRule,
    incomeCalcService: IncomeCalculationService,   // NEW
    liabilityCalcService: LiabilityCalculationService, // NEW
  )
  ```
- **Removed endpoint**: `POST :caseId/analysis/:runId/review-decision`, `POST /cases/:caseId/income/confirm`

## Testing Strategy

| Layer | What | How |
|-------|------|-----|
| Unit | 3-phase execution order | Verify Phase A rules execute before B services, Phase B before C |
| Unit | Income fallback in BankViabilityRule | confirmed=null, average=18000 → uses 18000 |
| Unit | Liability skip w/o bureau data | No credits → warn, bankViability executes with null liability |
| Unit | Removed endpoints 404 | Verify deleted routes return 404 |
| Deletion | ~300-400 lines across 6 spec files | Remove review-decision tests, confirm tests, related mocks |

## Migration / Rollout

No DB migration. `confirmedGrossIncome`/`confirmedNetIncome`/`ReviewDecision` columns remain nullable in schema (cleanup deferred). Rollback: revert commit.

## Open Questions

- [ ] Confirm liability credits come from bureau `extractedData.credits[]` — provider doc shape needed for `LiabilityCreditInput[]` conversion in Phase B
- [ ] `averageGrossIncome`/`averageNetIncome` stored as Prisma `Decimal` in snapshot but `Number` in result — confirm serialization works in `BankViabilityRule` (currently reads `incomeCalc?.confirmedGrossIncome`, needs field addition)
