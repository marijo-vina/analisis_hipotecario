# Proposal: HU-14B — Visualizar Comparativa Bancaria Preliminar

## Intent

Build the frontend "Comparativa bancaria" tab so the asesora can view bank product viability (viable, conditioned, review, not compatible) after an analysis run. The `BankViabilityRule` already executes in the 3-phase orchestrator and persists rich data; the backend registration is complete. This HU is now frontend visualization plus one backend bugfix.

## Scope

### In Scope
- **BUGFIX: Stale Scotiabank flags** — refactor `BankViabilityRule.deriveScotiabankFlags()` to accept Phase A `bankarization-validation` results as a parameter instead of querying the DB for the latest persisted run
- **POST response gap** — add `bankViability` to the POST `/analyze` response payload in `CaseAnalysisService.run()` so the UI receives it immediately without a second fetch
- Extend `AnalysisDetail` (frontend) with optional `bankViability?: BankViabilitySnapshot`
- Rename tab "Bancos / Viabilidad" → "Comparativa bancaria"
- Build 4-block UI: status header, financial summary, product comparison table, expandable product detail
- Translate backend status codes and reasons to Spanish
- Handle 7 UI states: empty, loading, results, unsupported destination, insufficient data, no products, error
- Display warning legend below results
- **Header redesign**: Move "Analizar expediente" / "Re-ejecutar análisis" button to the same row as "Análisis del expediente" title, aligned right; remove duplicate "Re-ejecutar análisis" link from inside Validaciones tab
- **Global progress stepper**: 3-phase indicator (Validaciones → Motor financiero → Comparativa bancaria) visible only during execution or error; phases use green (completed), amber (active), gray (pending), red (error); tabs remain visible but disabled during analysis
- **Compact status bar**: After completion, stepper hidden; only "✓ Análisis completado el [fecha]" bar shown
- **Error handling**: "Reintentar análisis" button on error; no partial results published; last successful analysis preserved if it exists
- **"Análisis completado con observaciones" variant**: Amber warning bar when analysis completes with warnings or no viable products
- Frontend tests + manual flow test

### Out of Scope
- Backend orchestrator changes (3-phase flow already exists)
- Remove individual execute/confirm buttons (done in HU-14A)
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
- `case-analysis`: Refactor `BankViabilityRule.deriveScotiabankFlags` to accept Phase A result instead of querying DB; add `bankViability` to POST response payload
- `frontend`: Add "Comparativa bancaria" tab to analysis section; extend `AnalysisDetail` type; redesign header with global button, stepper, and compact status bar

## Approach

1. **Backend bugfix (~15 lines)**: Define `BankarizationFlags` interface (`{ hasPagadoraIncome: boolean; scotiabankExcluded: boolean }`). The orchestrator extracts these flags from the Phase A `bankarization-validation` result and passes them in the Phase C context. `BankViabilityRule.deriveScotiabankFlags()` accepts the flags as a parameter instead of querying the DB. In absence of the result, flags default to `false`. Logic for other banks is unchanged. No `AnalysisRun` DB read for these flags.
2. **Backend POST payload (~5 lines)**: Add `bankViability` inside `detail.bankViability` (not as a root property) in the object returned by `CaseAnalysisService.run()`. POST `/analyze` and GET `/analysis/latest` must expose the same `detail.bankViability` structure so the frontend treats both responses identically.
3. **Frontend types (~60 lines)**: Define full typed contracts in `app/lib/definitions.ts` — `ProductMatchStatus`, `CheckStatus`, `BankViabilitySnapshot`, `ProductMatch`, `ProductMatchCalculation`, `ProductPolicySnapshot`, `CheckResult` — plus extend `AnalysisDetail` with `bankViability?: BankViabilitySnapshot`. No `Record<string, unknown>` casts in the tab UI.
4. **Frontend UI (~250 lines)**: Replace placeholder in `analysis-section.tsx` with a new "Comparativa bancaria" tab component using existing `DataTable`, `Card`, and expandable panel patterns. Four blocks: result header, financial summary, product comparison table, expandable product detail. Order products by `status` priority (PRELIMINARY_VIABLE → CONDITIONED → REQUIRES_REVIEW → NOT_COMPATIBLE), then by `availableCapacity DESC` (nulls last). Render null capacity as "—". Show LTV-conditioned reduction + max viable amount. Display warning legend below results.
5. **Empty state distinctions**: Empty (no analysis yet), Unsupported destination (no mapping for credit type), Insufficient data (global reasons indicate missing info), No products (`productMatches.length === 0`). Each renders a distinct message.
6. **No new backend endpoints** — reuse existing `POST /analyze` and `GET /analysis/latest`.
7. **Header redesign (~80 lines)**: Move the "Analizar expediente" button from inside Validaciones tab to the header row, right-aligned alongside "Análisis del expediente" title. Remove the duplicate "Re-ejecutar análisis" link. Add a global 3-phase stepper component that renders below the header and before the tabs, visible only during execution or error. Stepper reads phase completion from backend responses (no simulated timers). Tabs render with reduced opacity during analysis. On completion, stepper collapses to a compact 32px status bar. On error, stepper shows failure phase in red with a "Reintentar análisis" button and preserves the last successful analysis data. Add an amber "completado con observaciones" variant for analyses with warnings.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/src/case-analysis/rules/bank-viability.rule.ts` | Modified | Refactor `deriveScotiabankFlags` to accept Phase A result instead of querying DB |
| `apps/api/src/case-analysis/case-analysis.service.ts` | Modified | Add `bankViability` to POST `/analyze` response payload |
| `apps/web/app/lib/definitions.ts` | Modified | Extend `AnalysisDetail` with `bankViability` |
| `apps/web/app/ui/expedientes/analysis-section.tsx` | Modified | Relocate button to header row, remove duplicate link, add stepper, compact status bar, disable tabs during analysis |
| `apps/web/app/ui/expedientes/` | New | New comparison tab component(s) + stepper component |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Stale Scotiabank flags (confirmed bug) | High | Refactor `deriveScotiabankFlags` to accept Phase A result; add unit test |
| Type drift between POST and GET responses | Low | Add `bankViability` to POST payload explicitly; TypeScript catches mismatches |
| Missing Income/Liability → many `REQUIRES_REVIEW` | Low | UI handles null capacity with "—"; empty states covered |

## Rollback Plan

The frontend comparison UI and POST payload change can be rolled back independently. The Scotiabank stale-flag fix must remain as a standalone correctness fix even if the visualization portion is reverted — it corrects a confirmed defect and must not be restored to the previous-run DB lookup.

## Dependencies

- **HU-14A merged to main** (provides unified 3-phase orchestrator)

## Success Criteria

- [ ] Scotiabank flags are derived from the current run's Phase A result and no longer query the previous persisted `AnalysisRun`
- [ ] A unit test proves that first-run Scotiabank flags are evaluated correctly
- [ ] `POST /analyze` includes `detail.bankViability`
- [ ] `POST /analyze` and `GET /analysis/latest` expose the same `bankViability` structure
- [ ] Frontend declares typed `BankViabilitySnapshot`, `ProductMatch`, `CheckResult`, calculation types, and status unions
- [ ] The tab is renamed to "Comparativa bancaria"
- [ ] Empty state is shown before the first analysis
- [ ] Products are ordered viable → conditioned → review → not compatible
- [ ] Null financial values render as "—"
- [ ] Expandable detail shows policy, calculation, checks, and translated reasons
- [ ] LTV-conditioned products show maximum amount and required reduction
- [ ] Maturity-conditioned products show maximum theoretical term when present
- [ ] The warning legend is displayed
- [ ] Results remain visible after page reload through `GET /analysis/latest`
- [ ] All 7 defined UI states are handled gracefully
- [ ] Backend codes are never exposed directly to the asesora
- [ ] "Analizar expediente" button is in the header row, right-aligned; no duplicate inside Validaciones tab
- [ ] During analysis, 3-phase stepper shows green/amber/gray states; tabs are visible but disabled
- [ ] After completion, stepper is hidden; only compact "✓ Análisis completado" bar remains
- [ ] On error, stepper shows failure phase in red; "Reintentar análisis" button is present; last successful analysis is preserved
- [ ] "Análisis completado con observaciones" variant renders with amber warning bar
- [ ] Frontend tests and a manual flow test are completed
