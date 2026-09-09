# Proposal: PFAE HU-21 Expediente UI

## Intent

PFAE tabs still render the salaried path. Backend (HU-18–20) persists gates, `source`/`bases`, and `PATCH /income/source`. Surface that contract in the same three tabs.

## Scope

### In Scope
- Validaciones: gates Card from `ruleResults["pfae-validation"]` + `alerts`; tenure INFO
- Cálculo: two unfactored bases + picker; PATCH then `loadLatest()`; peinado warn + link (no in-Cálculo editor)
- Comparativa: keep six columns; origin/giro/factor/tax policy **only** in expanded detail; persist `BankResult` audit; PFAE `REASON_LABELS`; `activityTenure`
- Solely-salaried FAIL: “este camino PFAE no aplica — cambie a asalariado”; suppress PRELIMINARY_VIABLE chips/viable presentation; rows inspectable, not a successful PFAE result
- Extract `PfaeValidationGates`, `PfaeIncomePanel`, Comparativa detail extras; web types for `source`/`bases`/`pfaeValidation`/audit

### Out of Scope
- Banorte 0.70 (`backlog/banorte-pfae-cliente-070`); Banks UI `/dashboard/bancos`; peinado redesign; second Analyze; wizard; 4th tab; salaried restyle; pasivos UI; new income endpoints

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `frontend`: PFAE gates, picker, Comparativa detail extras, FAIL non-viable presentation, visual kit
- `unified-analysis-flow`: lift HU-20 expediente UI freeze; PATCH is not a second Analyze
- `pfae-validation`: lift “render is HU-21”; Validaciones MUST show gates
- `income-calculation`: PFAE Cálculo panel + picker UX
- `case-analysis`: persist `BankResult` audit (`appliedFactor`, `factorMode`, `matchedNativeLabel`, `satDescription`, `taxReturnPolicy`); salaried unused/null

## Approach

**Approach 2**: extract PFAE components; parents branch on `personType` only. Do not grow `analysis-section.tsx`. Picker (`useTransition`) calls existing PATCH, then `loadLatest()`. Inline Spanish `TAX_LOSS` errors. Comparativa stays presentational; factor/giro from persisted audit. Visual kit: `gf-*`; reuse `Card`/`Button`/`DataTable`/`StatusBadge`/`FieldGrid`/`FormField`/`Drawer`; Spanish sentence-case.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `analysis-section.tsx` | Modified | Wire gates; `loadLatest` |
| `pfae-validation-gates.tsx`, `pfae-income-panel.tsx` | New | Gates + picker |
| `income-calculation-section.tsx`, `bank-comparison-tab.tsx` | Modified | PFAE branch; detail extras; FAIL suppression |
| `actions/income.ts`, `lib/definitions.ts` | Modified | Types; `switchIncomeSource` |
| `bank-viability.rule.ts` + types | Modified | Persist audit |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Factor/giro discarded after Phase C | High | Additive `BankResult` audit |
| Stale Comparativa after PATCH | Med | Parent `loadLatest()` |
| FAIL shown as PRELIMINARY_VIABLE | Med | Suppress viable chips |
| Diff >400 lines | High | Chain types → Validaciones → Cálculo → Comparativa+API |

## Rollback Plan

Revert the feature branch. Audit fields additive/null for salaried; no migration. Leave PATCH `/income/source`. Gate UI on `personType === "PFAE"`.

## Dependencies

- HU-18 PATCH `/source`; HU-19b/20 `pfae-validation` snapshot; HU-20 Phase C factor math (not serialized)

## Success Criteria

- [ ] PFAE Validaciones/Cálculo/Comparativa render as scoped; salaried unchanged
- [ ] PATCH refreshes Comparativa; solely-salaried FAIL is not presented as PFAE-viable
- [ ] No second Analyze, wizard, 4th tab, Banks UI, or Banorte 0.70
