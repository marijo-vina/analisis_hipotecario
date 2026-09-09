# Design: PFAE HU-21 Expediente UI

## Technical Approach

Approach 2: extract PFAE islands; parents branch on `personType === "PFAE"` only. Same three tabs, one header Analyze. Surface HU-18–20 contracts (`ruleResults["pfae-validation"]`, `source`/`bases`, `PATCH /income/source`) with existing `gf-*` kit. Do not grow `analysis-section.tsx` (1046). Do not invent a new aesthetic.

Gates Card **reads** persisted snapshot + flattened `alerts` — never recomputes. Comparativa stays presentational; factor/giro come from additive `BankResult` audit. Picker PATCHes then parent `loadLatest()`.

## Architecture Decisions

| Decision | Options | Tradeoff | Choice |
|----------|---------|----------|--------|
| Component split | Inline in 1046-line parent vs extract islands vs 4th tab | Inline blows review budget; 4th tab is out of product | Extract `PfaeValidationGates`, `PfaeIncomePanel`, `PfaeProductDetailExtras` |
| FAIL vs stored status | Rewrite `BankResult.status` vs presentational overlay | Rewrite lies about Phase C and breaks salaried reads of same JSON | Overlay: hide “Viables” chip, suppress green viable chrome, keep `status` untouched; rows stay expandable |
| Factor/giro in UI | Reconstruct from Banks catalog vs persist audit | Reconstruct drifts from Phase C; catalog is out of expediente | Persist five audit fields at `evaluateBank` return; UI reads only |
| Picker loading | Copy Banks chrome vs `useTransition` only | Banks UI is out of scope | Reuse HU-20 `startTransition` + inline error, not `/dashboard/bancos` chrome |
| Refresh after PATCH | Second Analyze vs parent `loadLatest()` | Second Analyze is forbidden | Existing `PATCH /source` (Phase C only) then `AnalysisSection.loadLatest()` + income reload |
| Visual kit | New PFAE look vs HU-08 `gf-*` | Spec forbids salaried restyle | Reuse `Card`/`Button`/`DataTable`/`StatusBadge`/`FieldGrid`/`FormField`; Spanish sentence-case |

## Data Flow

```
Analizar expediente
  POST /analyze → loadLatest() GET /analysis/latest
        │
        ├─ Validaciones ─ PfaeValidationGates(ruleResults pfae-validation + alerts)
        ├─ Cálculo ────── PfaeIncomePanel(GET income/latest source+bases)
        └─ Comparativa ── BankComparisonTab(bankViability + overlay flag)

Picker change
  useTransition → PATCH /income/source { BANK_STATEMENTS | TAX_RETURN }
       → switchSource clones bases + runPhaseC (copy Phase A)
       → PfaeIncomePanel setSnapshot
       → onSourceSwitched() → AnalysisSection.loadLatest()
       → Comparativa shows new factored incomeUsed + audit
```

FAIL overlay (parent derives, does not persist):

```
alerts.ruleCode === REGIMEN_EXCLUSIVAMENTE_ASALARIADO
  OR snapshot.regime.outcome === FAIL
    → suppressViablePresentation
    → StatusHeader: no PRELIMINARY_VIABLE chip; copy
      “este camino PFAE no aplica — cambie a asalariado”
      (not “Evaluación con opciones viables”)
    → table/detail: mute green viable badge; onRowClick unchanged
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/web/app/ui/expedientes/pfae-validation-gates.tsx` | Create | Gates Card: régimen, vigencia, tenure INFO, activity, coherence from snapshot/alerts |
| `apps/web/app/ui/expedientes/pfae-income-panel.tsx` | Create | Dual unfactored bases + “Base a enviar al banco”; TAX_LOSS disable; peinado warn + `#extraccion` |
| `apps/web/app/ui/expedientes/pfae-product-detail-extras.tsx` | Create | Origin, giro+SAT, factor+mode, tax policy — expanded detail only |
| `apps/web/app/ui/expedientes/analysis-section.tsx` | Modify | Wire gates; pass `personType`, `onSourceSwitched=loadLatest`, peinado flag; no new tabs |
| `apps/web/app/ui/expedientes/income-calculation-section.tsx` | Modify | PFAE → panel; salaried payroll table untouched |
| `apps/web/app/ui/expedientes/bank-comparison-tab.tsx` | Modify | Overlay flag; extras; `activityTenure` row; six columns unchanged |
| `apps/web/app/actions/income.ts` | Modify | `source`/`bases` on result; `switchIncomeSource` |
| `apps/web/app/lib/definitions.ts` | Modify | `ruleResults`, PFAE snapshot, audit fields, `inputs.personType`/`incomeSource`, PFAE `REASON_LABELS` |
| `apps/api/src/case-analysis/types/bank-viability.types.ts` | Modify | Additive audit on `BankResult` |
| `apps/api/src/case-analysis/rules/bank-viability.rule.ts` | Modify | Serialize audit from `resolvePfaeFactor` / match; math unchanged |
| `apps/api/src/case-analysis/rules/bank-viability.rule.spec.ts` | Modify | Persist audit; unmapped must not invent 1.0; salaried null |

Unchanged: `actions/analysis.ts` fetchers, PATCH `/source` controller, Banks UI, pasivos UI, Banorte 0.70, extraction peinado editor.

## Interfaces / Contracts

Non-obvious persist (salaried: all null). Unmapped MATRIX: `appliedFactor` null, still store `satDescription`.

```ts
// BankResult additive — string factor matches CE serialization (d2)
appliedFactor: string | null;
factorMode: PfaeFactorMode | null;
matchedNativeLabel: string | null;
satDescription: string | null;
taxReturnPolicy: TaxReturnPolicy | null;
```

```ts
// web action — existing endpoint only
switchIncomeSource(caseId, "BANK_STATEMENTS" | "TAX_RETURN")
  → PATCH /cases/:id/income/source
```

Gates: `detail.ruleResults.find(r => r.ruleId === "pfae-validation").detail.pfaeValidation` plus `run.alerts`. Peinado: parent `integrityCheck` CRITICAL/MINOR → warn + `<a href="#extraccion">`; no deposit editor.

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit (API) | Audit persist, unmapped ≠ 1.0, salaried null | Extend `bank-viability.rule.spec.ts` |
| Unit (API) | PATCH + Phase C copy | Already in `income-calculation.service.spec.ts` + `income-source-phase-c.integration.spec.ts` — do not duplicate |
| Web | No Jest (same as HU-20 Banks) | TypeScript types lock `source`/`bases`/audit/`ruleResults` |
| Manual | PFAE expediente | Gates, picker refresh, FAIL overlay, detail extras, salaried regression |

## Migration / Rollout

No migration. Audit fields additive JSON; old runs show “—” in extras. Gate UI on `personType`. Rollback = revert branch. Leave PATCH `/source`. Forecast >400 lines: chain types → Validaciones → Cálculo → Comparativa+API (tasks phase).

## Open Questions

None. Product is locked. Overlay fits: `StatusHeader`/`ProductDetail` already map labels without mutating stored `status`.
