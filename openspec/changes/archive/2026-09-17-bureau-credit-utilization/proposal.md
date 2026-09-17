# Proposal: Bureau Credit Utilization

## Intent

Advisors need per-card and global utilization plus masked last-4 on the shared Buro tab, from stored balance/limit, without re-extracting old bureaus.

## Scope

### In Scope
- Shared Buro tab (all profiles): Utilización on **all** rows of both tables; in-scope cards get rate + traffic light; others `"—"`
- Extra KPI (keep Score / activos / cerrados / consultas) + six-band legend beside MOP
- Persist full `accountNumber` on extract; UI shows `****` + last 4 under Institución
- UI-derived utilization; parser reads stored `accountNumber`; coordinate parses digits from `creditorInfo`; merge copies `accountNumber`

### Out of Scope
- Silent re-extract / OCR replay of stored bureaus
- Gemini `accountNumber` or utilization (`credit-bureau.schema.md` unchanged)
- Persist utilization or a dedicated last4 field
- personType-forked Buro; third table; `liability-calculation`; knockout rules

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `bureau-extraction`: persist `accountNumber` from layout/coordinate merge; Gemini schema unchanged; do not persist utilization
- `frontend`: Utilización column, extra KPI, MOP-adjacent legend, last-4 mask, UI-derived rates on shared Buro tab
- `coordinate-extraction`: parse `accountNumber` from `creditorInfo` (stop always-null)

## Approach

**Approach 1** (explore): UI-derived utilization; persist `accountNumber` on extract.

| Rule | Contract |
|------|----------|
| Predicate | `classification === 'REVOLVING'`; `DEPARTMENT_STORE` iff `creditLimit > 0`; `creditType` `/tarjeta/i` for other classifications (includes NON_BANK_SERVICE AMEX in créditos no bancarios). Exclude MORTGAGE, AUTO always; PERSONAL_LOAN, FIXED_PAYMENT, NON_BANK_SERVICE only when creditType is not tarjeta |
| Rate | `currentBalance / creditLimit` if limit > 0. Null/0 limit → `"—"`, omit global. Null balance → `"—"` (not 0). Over-limit allowed, band 91+ |
| Closed | Per-row `"—"`; excluded from global |
| Global | `sum(balances)/sum(limits)` of in-scope active cards with limit > 0 and non-null balance. Denom 0 → `"—"` |
| Bands | Round display % then band: 0–10 Excelente; 11–30 Muy buena; 31–50 Aceptable; 51–70 Atención; 71–90 Crítico; 91+ Muy crítico |
| Last-4 | `accountNumber` → ≥4 digits in `institution` → `rawTextReference` → `"—"`. Existing JSONB best-effort |

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/web/app/ui/extraction/buro-tab.tsx` | Modified | Column, extra KPI, legend, last-4 |
| `apps/web/app/lib/extraction.ts` | Modified | Parse `accountNumber`; utilization helper |
| `apps/api/src/documents/credit-bureau-extraction.service.ts` | Modified | Copy layout/coordinate `accountNumber` |
| `apps/api/src/documents/coordinate-grid.extractor.ts` | Modified | Parse `creditorInfo` digits |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Last-4 missing on stored JSONB | High | Best-effort parse; no silent re-OCR |
| Null `creditLimit` on revolvers | Med | `"—"`; omit from global |
| 9th column + fifth KPI wrap | Med | Compact KPI; two-line Institución |

## Rollback Plan

Revert `feature/bureau-credit-utilization`. `accountNumber` is additive JSONB; no utilization field to unwind.

## Dependencies

- Stored bureau JSONB already has `currentBalance` and `creditLimit`

## Success Criteria

- [ ] Stored bureaus show utilization without re-extract; last-4 best-effort until new extract
- [ ] Locked predicate, formula, closed-row, global, bands, extra KPI, MOP-adjacent legend
- [ ] Gemini schema unchanged; utilization not persisted; no third table; Buro not forked by personType
