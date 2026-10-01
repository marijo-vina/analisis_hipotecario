# Proposal: PFAE HU-20 Bank Comparison

## Intent

PFAE comparativa is all `REQUIRES_REVIEW` because Phase C still looks for payroll hire dates. Advisors need real admissible income and capacity per bank from the Banks catalog plus a PFAE Phase C branch.

## Scope

### In Scope

- Per-bank `BankActivityFactor` (native label, SAT aliases, `factor`, optional `factorTaxReturn`); `pfaeFactorMode` MATRIX | FLAT | NONE
- Expand HU-18 `TWELVE_MONTH_KEYWORDS` with SAT synonyms (cultivo, ganadería, pecuario, pesca, agrícola, restaurante, alimentos y bebidas…); case-level 6/12
- Phase C `personType` branch: giro after base choice on both paths; CSF tenure vs `minimumActivityTenureMonths`; `taxReturnPolicy`; PFAE CMA cells; `CONDITIONED`
- Banks UI `/dashboard/bancos`: factor card, PFAE tenure, factors table (`factor` may be `> 1`), nullable PFAE income-min / age-min on the same `BankPolicy` row
- `PATCH /cases/:caseId/income/source` → new `IncomeCalculation` (same `bases`, new `source`, projected averages) + `runPhaseC` (copy Phase A; `BankViabilityRule` only)
- Seed: Banorte FLAT 0.6; HSBC NONE 1.0; Scotiabank REJECTED; Banorte NOT_PREFERRED; Banamex age 28y / liq 35k; Santander 15k (construcción 67k); HSBC liq inactive; Mifel 0.50/1.5

### Out of Scope

- Expediente Comparativa/picker/Validaciones (HU-21); global `ActivityType`; Banorte 0.70 checkbox (`backlog/banorte-pfae-cliente-070`)
- Second orchestrator; SALARIED payroll math; Mifel CE 0.42; push; merge to `perfil-pfae` until QA

## Capabilities

### New Capabilities

None

### Modified Capabilities

- `case-analysis`: PFAE Phase C; `CONDITIONED`; `runPhaseC`; giro after base; unmapped MATRIX → `REQUIRES_REVIEW` (never invent 1.0); PFAE CMA reasons
- `income-calculation`: SAT synonyms for N=6/12; PATCH income source
- `bank-catalog`: factor mode, `BankActivityFactor`, `taxReturnPolicy`, activity tenure, nullable PFAE CMA cells (empty = salaried)
- `bank-policy-management`: Banks API/UI; factor CRUD allowing `> 1`
- `pfae-validation`: persist `ACTIVITY_UNMAPPED` WARNING (render HU-21); tenure INFO
- `unified-analysis-flow`: PATCH re-runs Phase C only; no second header trigger

## Approach

Exploration **Approach 1**. `personType` only discriminator. Cálculo unfactored. Comparativa: `ingresoAdmisible = chosenBase × factor` (BX+ may use `factorEstados` ≠ `factorDeclaracion`). Banorte 0.6; HSBC 1.0. Scotiabank `TAX_RETURN`+REJECTED → `NOT_COMPATIBLE`. Banorte NOT_PREFERRED → `CONDITIONED`. CSF will not say “primaria”. Filled PFAE CMA cell wins and is cited.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `prisma/schema.prisma` + `seed-data.ts` | Modified | Factor catalog, PFAE CMA cells, locked seed |
| `src/banks/*` + `app/ui/banks/*` | Modified | CRUD + Banks UI; factor `> 1` |
| `src/case-analysis/*` + `src/income-calculation/*` | Modified | PFAE branch, `runPhaseC`, PATCH source |
| `app/ui/expedientes/bank-comparison-tab.tsx` | Unchanged | HU-21 |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Review size | High | Chain: catalog → Banks UI → Phase C → PATCH |
| Unmapped giro | Med | `REQUIRES_REVIEW`; never invent 1.0 |
| Phase-C-only blanks Validaciones | Med | Copy prior Phase A `ruleResults` |

## Rollback Plan

Revert the feature branch. Roll back Prisma migration; re-seed. PATCH snapshots/runs are additive. No production merge until QA.

## Dependencies

HU-18 `source`/`bases`; HU-19b `PfaeValidationRule`; `docs/bank-policies-matrix.md` (captura-first); Engram `backlog/banorte-pfae-cliente-070` (do not implement).

## Success Criteria

- [ ] PFAE comparativa is not all-`REQUIRES_REVIEW` from missing payroll hire date; SALARIED and Mifel 0.50 / 1.5 unchanged
- [ ] Admissible income = chosen base × factor on both paths; Cálculo unfactored
- [ ] Banorte 0.6; HSBC 1.0; Scotiabank tax REJECTED → `NOT_COMPATIBLE`; Banorte NOT_PREFERRED → `CONDITIONED`
- [ ] Unmapped MATRIX → `REQUIRES_REVIEW`; filled PFAE CMA cells used; Banks UI editable
- [ ] PATCH source creates new income + AnalysisRun (Phase A copied, BankViability only)
