# Tasks: Bureau Credit Utilization

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~380–520 |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes |
| Suggested split | PR1 API accountNumber → PR2 Web utilization UI |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | API: parse + persist `accountNumber` | PR1 → `feature/bureau-credit-utilization` | Jest RED→GREEN; schema contract unchanged |
| 2 | Web: helper + vitest + BuroTab UI | PR2 → PR1 branch | vitest RED→GREEN; column/KPI/legend/last-4 |

## Phase 1: API — Account Number Extract & Persist (Work Unit 1)

- [x] 1.1 RED: `layout-lines-extractor.spec.ts` — export `parseInstitutionAndAccount` parses ≥6-digit runs
- [x] 1.2 GREEN: `layout-lines-extractor.ts` — export parser; line helper delegates to it
- [x] 1.3 RED: `coordinate-grid.extractor.spec.ts` — `creditorInfo` digits → `accountNumber`; no digits → null
- [x] 1.4 GREEN: `coordinate-grid.extractor.ts` — shared parser on `creditorInfo`; strip digits from `institution`
- [x] 1.5 RED: `credit-bureau-extraction.service.spec.ts` — layout copy; coordinate fill-if-empty; no utilization field
- [x] 1.6 GREEN: `credit-bureau-extraction.service.ts` — copy `accountNumber` (layout first, coordinate if empty)
- [x] 1.7 Verify: existing schema/contract specs — Gemini output still omits `accountNumber` and utilization

## Phase 2: Web — Utilization Helper & BuroTab (Work Unit 2)

- [x] 2.1 Add vitest devDep + `test` script in `apps/web/package.json`
- [x] 2.2 RED: `bureau-utilization.spec.ts` — in-scope predicate, per-row rate, closed/null dashes, global weighted sum, six bands, last-4 fallback chain
- [x] 2.3 GREEN: `bureau-utilization.ts` — `isInScope`, `computeRowUtilization`, `computeGlobalUtilization`, `getUtilizationBand`, `maskLastFour`
- [x] 2.4 GREEN: `extraction.ts` — add optional `accountNumber` on credit type; `parseBuro` reads stored field
- [x] 2.5 GREEN: `buro-tab.tsx` — Utilización column on all rows (both tables); fifth KPI; six-band legend beside MOP; `****`+last4 under Institución

## Phase 3: Verification

- [x] 3.1 Run API Jest (`apps/api`) and web vitest; all pass
- [x] 3.2 Manual: stored bureau shows utilization without re-extract; last-4 best-effort; SALARIED/PFAE share same Buro layout
