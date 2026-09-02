# Proposal: PFAE HU-18 Dual Income Engine

## Intent

PFAE analyze yields no income: Phase B calls the payroll-only service, its 404 is swallowed, and Phase C runs on a missing snapshot. Liabilities also apply the salaried 6% to PFAE.

## Scope

### In Scope

- `IncomeCalculation.source` (`PAYROLL | BANK_STATEMENTS | TAX_RETURN`) + JSON `bases`; existing rows backfilled to `PAYROLL`.
- PFAE branch in `calculate()` keyed only on `personType`; SALARIED payroll path unchanged; PFAE never 404s on missing payroll. Both PFAE bases computed on analyze.
- Bank base: month = unique `YYYY-MM` of `statementPeriod.periodStartDate` (fallback end date); sum VALID post-cleaner income across that month's statements; exclude `isCurrentIncompleteMonth`; take most recent N; then drop max **and** min (6 → mean of 4, 12 → mean of 10). Never a plain mean of 6 or 12.
- Unique valid months < N ⇒ bank base INVALID. Short windows are not smoothed.
- N = 12 when the resolved CSF activity (active, highest percentage, tie → lower `order`) matches primaria / restaurantero / alimentos-y-bebidas keywords, else 6. Keyword stub until the HU-20 catalog.
- Tax base: NETO = `fiscalProfit / 12`, BRUTO = `accumulableIncomeTotal / 12`. Fiscal loss knocks out the tax-return base only; the expediente continues on bank statements if that base is valid.
- Default `source`: BANK_STATEMENTS if valid, else TAX_RETURN if valid. The chosen base is projected into `averageGrossIncome` / `averageNetIncome`, so Phase C keeps working without reading `source`. Both bases invalid ⇒ `REQUIRES_REVIEW`, no throw.
- Liability default factor: PFAE `0.07`, SALARIED `0.06`, both **including UNKNOWN** credits. `MAX(balance × factor, payment)` in cents unchanged.

### Out of Scope

- UI/picker, `PATCH income-source`, Phase C recálculo, bank activity factors, `ActivityType` catalog (HU-20/HU-21).
- CSF régimen/arraigo/vigencia gates (HU-19b), parallel PFAE table, frontend spec, git push, merge to `perfil-pfae`.

## Capabilities

### New Capabilities

- `liability-calculation`: default factor from `personType` (PFAE 0.07, SALARIED 0.06, UNKNOWN included). Reuses the archived HU-11 capability name; no main spec file exists today.

### Modified Capabilities

- `income-calculation`: PFAE dual-base engine — `source` + `bases`, max/min smoothing, 6/12 window, tax-loss knockout.
- `case-analysis`: Phase B MUST persist a PFAE income snapshot instead of treating missing payroll as failure.

`unified-analysis-flow` and `frontend` stay unchanged; extra JSON fields are ignorable.

## Approach

Exploration A1+B1+C1+D1: one snapshot model, pure `Prisma.Decimal` helpers beside `computeAverages` (smoothing, month assembly, CSF resolver, tax monthly), liability factor derived from `personType` when no override is passed.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `prisma/schema.prisma` | Modified | `source` + `bases`, backfill migration |
| `income-calculation/*` | Modified | PFAE branch, types, helpers, specs |
| `liability.service.ts`, `case-analysis.service.ts` | Modified | Factor by `personType`; Phase B keeps PFAE income |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| PFAE comparativa shifts (income was null) | High | Update fixtures; giro factors stay HU-20 |
| 12-month keyword list is a stub | Med | Persist `satDescription` for HU-20 |
| Migration breaks GET latest | Med | Backfill `source='PAYROLL'`, `bases=null` |
| Over 400-line review budget | Med | sdd-tasks forecasts chained slices |

## Rollback Plan

Revert the feature branch and run the Prisma down-migration dropping `source`/`bases`. PFAE returns to no snapshot + 6%; SALARIED stays untouched throughout.

## Success Criteria

- [ ] Jest: PFAE analyze persists both `bases` and the default `source`, visible on GET `/cases/:id/income/latest`.
- [ ] Jest: 6- and 12-month smoothing drop max and min; short window ⇒ bank base invalid; fiscal loss invalidates only the tax base.
- [ ] Jest: PFAE liability `factorUsed = 0.07` including UNKNOWN; SALARIED 6% and payroll suites still pass.
