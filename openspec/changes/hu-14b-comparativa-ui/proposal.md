# Proposal: HU-14B — Visualizar Comparativa Bancaria Preliminar

## Intent

Wire the already-implemented `BankViabilityRule` into the analysis orchestrator and build a frontend tab that lets the asesora compare bank products (viable, conditioned, review, not compatible) after an analysis run. The rule produces rich data but never executes; the tab exists as a placeholder. This HU is wiring + visualization.

## Scope

### In Scope
- Remove individual execute/confirm buttons from analysis section; replace with single "Analizar expediente" button
- Register `BankViabilityRule` in `CaseAnalysisModule` providers and `CaseAnalysisService.rules`
- Extend `RuleDetail` (API) and `AnalysisDetail` (frontend) with optional `bankViability`
- Rename tab "Bancos / Viabilidad" → "Comparativa bancaria"
- Build 4-block UI: status header, financial summary, product comparison table, expandable product detail
- Translate backend status codes and reasons to Spanish
- Handle 8 UI states: empty, loading, results, unsupported destination, insufficient data, no products, error, stale snapshot
- Phase progress indicator (3 deterministic steps: Validación de identidad → Conciliación nómina → Evaluación bancaria)
- Display warning legend below results
- Frontend tests + manual flow test

### Out of Scope
- New backend calculations (rule already exists)
- Confirmation workflow (REVISADO, confirmar ingreso) — analysis is re-executable if data changes
- CRUD for banks/products
- PDF/Excel export, rate simulation, amortization tables
- Real-time progress via SSE/WebSocket
- Manual override of product results
- Historical run comparison

## Capabilities

### New Capabilities
- `bank-comparison-ui`: Frontend tab displaying `bankViability` snapshot with product table, detail panels, and state management

### Modified Capabilities
- `case-analysis`: Register `BankViabilityRule` in orchestrator; extend `RuleDetail` to include `bankViability`
- `frontend`: Add "Comparativa bancaria" tab to analysis section; extend `AnalysisDetail` type

## Approach

1. **UX simplification**: Remove individual execute/confirm buttons from analysis section. Single "Analizar expediente" button triggers all rules. Analysis is re-executable — confirmation workflow removed for MVP.
2. **Backend (~5 lines)**: Add `BankViabilityRule` to module providers and service registry. Extend `RuleDetail` with optional `bankViability?: BankViabilitySnapshot`.
3. **Frontend types (~5 lines)**: Extend `AnalysisDetail` in `app/lib/definitions.ts` with `bankViability`.
4. **Frontend UI (~250 lines)**: Replace placeholder in `analysis-section.tsx` with a new tab component using existing `DataTable`, `Card`, and expandable panel patterns. Show 3 deterministic phase steps during analysis. Order products by status priority. Render null capacity as "—". Show LTV-conditioned reduction + max viable amount.
5. **No new backend endpoints** — reuse existing `GET /analysis/latest`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/src/case-analysis/case-analysis.module.ts` | Modified | Add `BankViabilityRule` to providers |
| `apps/api/src/case-analysis/case-analysis.service.ts` | Modified | Append `BankViabilityRule` to `this.rules` |
| `apps/api/src/case-analysis/analysis-rule.interface.ts` | Modified | Extend `RuleDetail` with `bankViability` |
| `apps/api/src/case-analysis/dto/analysis-result.dto.ts` | Modified | Inherits `RuleDetail` change |
| `apps/web/app/lib/definitions.ts` | Modified | Extend `AnalysisDetail` with `bankViability` |
| `apps/web/app/ui/expedientes/analysis-section.tsx` | Modified | Rename tab, replace placeholder with real UI |
| `apps/web/app/ui/expedientes/` | New | New comparison tab component(s) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| HU-13 not merged before apply — rule not on main | Med | Plan now; apply after merge |
| Rule execution order — stale Scotiabank flags | Low | Append after `bankarization-validation`; rule reads previous run flags |
| Types out of sync between API and frontend | Low | Extend both simultaneously; TypeScript catches mismatches |
| Missing Income/Liability → many `REQUIRES_REVIEW` | Low | UI handles null capacity with "—"; empty states covered |

## Rollback Plan

Revert the 3 backend lines (remove rule from providers/registry, revert `RuleDetail`). Revert the 1 frontend type line. Delete or hide the new tab component and restore the original placeholder content. No database migration needed.

## Dependencies

- **HU-13 merged to main** (provides `BankViabilityRule`, types, bank-catalog seed)

## Success Criteria

- [ ] Individual execute/confirm buttons removed; single "Analizar expediente" button present
- [ ] `BankViabilityRule` registered and executes during analysis
- [ ] "Comparativa bancaria" tab shows empty state before analysis
- [ ] After analysis, tab shows product table ordered by status (viable → conditioned → review → not compatible)
- [ ] Expandable detail shows controls, calculation, and reasons per product
- [ ] Phase progress indicator shows 3 steps during analysis
- [ ] LTV-conditioned products show reduction + maximum viable amount
- [ ] Warning legend displayed below comparison
- [ ] Results persist after page reload (via `GET /analysis/latest`)
- [ ] All 8 UI states handled gracefully
- [ ] Backend status codes translated to Spanish
