# Proposal: Unificar flujo de análisis y eliminar confirmaciones (HU-14A)

## Intent

Replace the fragmented 3-trigger analysis flow (Validar expediente, Calcular ingresos, Calcular pasivos) with a single "Analizar expediente" button. Remove all manual confirmations. Bank viability currently runs before income/liability are calculated, receiving null data. We solve this by orchestrating all phases in the correct backend sequence.

## Scope

### In Scope
- Single "Analizar expediente" button replaces all individual triggers
- Remove "Confirmar revisión", "Calcular", "Calcular ingresos", "Confirmar ingresos" UI
- Remove per-receipt "PENDIENTE / REVISADO" toggle
- Restructure `CaseAnalysisService.run()` to execute: identity-match → bankarization-validation → income calculation → liability calculation → bankViabilityRule
- Inject `IncomeCalculationService` and `LiabilityCalculationService` into `CaseAnalysisService`
- `BankViabilityRule` falls back to `averageGrossIncome`/`averageNetIncome` when `confirmed*` is null
- Remove review-decision endpoint, income confirm endpoint, related DTOs and methods
- Remove `transitionToRequiresReview` gating
- Update/delete affected backend tests (~300–400 lines)

### Out of Scope
- "Comparativa bancaria" tab UI (→ HU-14B)
- Prisma schema cleanup (deferred to maintenance)
- Phase progress indicator UI (→ HU-14B)
- Status code translations (→ HU-14B)

## Capabilities

### New Capabilities
- `unified-analysis-flow`: Single button orchestrating identity → bankarization → income → liability → bankViability in backend sequence

### Modified Capabilities
- `case-analysis`: Restructure `run()` execution order. Remove review decision flow and `REQUIRES_REVIEW` transition.
- `income-calculation`: Remove manual confirmation flow. Calculated averages used directly.
- `frontend`: Remove individual execute/confirm buttons. Add single "Analizar expediente" button.

## Approach

1. **Backend orchestrator**: Inject `IncomeCalculationService` + `LiabilityCalculationService` into `CaseAnalysisService`. In `run()`, execute Phase A (document rules), Phase B (income + liability calculations), Phase C (bankViabilityRule).
2. **Income fallback**: `BankViabilityRule` uses `averageGrossIncome`/`averageNetIncome` as fallback when `confirmed*` is null.
3. **Frontend cleanup**: Remove all confirmation UI and individual buttons. Add single "Analizar expediente" button calling existing `POST /analyze`.
4. **Backend cleanup**: Remove `recordReviewDecision`, `confirm()`, related DTOs, endpoints.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `case-analysis.service.ts` | Modified | Restructure `run()` phases, inject services |
| `case-analysis.service.spec.ts` | Modified | Update tests |
| `bank-viability.rule.ts` | Modified | Fallback to average* income |
| `income-calculation.service.ts` | Modified | Remove `confirm()` |
| `income-calculation.controller.ts` | Modified | Remove confirm endpoint |
| `mortgage-cases.controller.ts` | Modified | Remove review-decision endpoint |
| `analysis-section.tsx` | Modified | Replace buttons, remove confirm UI |
| `income-calculation-section.tsx` | Modified | Remove confirm panel |
| `estados-conciliacion.tsx` | Modified | Remove review toggle |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Removing REQUIRES_REVIEW affects case-status workflows | Med | Verify dashboard/case-list dependencies |
| Liability depends on bureau extraction | Low | Skip liability with warning if no bureau data |
| BankViabilityRule falls back to averages (different precision) | Low | Acceptable for MVP; confirmed concept removed |

## Rollback Plan

Revert the commit. The old endpoints and UI components are deleted, not modified in place. A clean revert restores all prior functionality.

## Dependencies

- HU-13 merged (BankViabilityRule exists)
- HU-14B depends on this

## Success Criteria

- [ ] Single "Analizar expediente" button replaces all individual triggers
- [ ] No confirmation buttons or manual income confirmation forms remain
- [ ] Analysis executes identity → bankarization → income → liability → bankViability in order
- [ ] BankViabilityRule receives calculated income/liability from same execution
- [ ] All affected tests pass or are properly removed
- [ ] Backend orchestrator reuses existing `POST /analyze` endpoint
