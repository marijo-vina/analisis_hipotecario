# Archive Report: Catálogo Bancario CMA

**Change**: catalogo-bancario-cma  
**Archived**: 2026-08-05  
**Branch**: feature/catalogo-bancario-cma  
**Status**: Complete — all 8 PRs implemented, verified, and approved

## Deliverables

| Layer | What |
|-------|------|
| Database | 9 banks, 38 CMA policies, 6 credit destinations, expanded ProductDestination enum |
| API | BanksModule with CRUD endpoints (GET list/detail, PATCH bank/policy) |
| Business logic | Bureau knockout rules (universal + bank-specific), CMA checks (income, property, age, tenure, capacity) |
| Frontend | Sidebar "Bancos", list page with table, detail page with inline editing + save button |

## Specs Synced

- `bank-policy-management` — new full spec (5 requirements, 11 scenarios)
- `bureau-knockout-rules` — new full spec (5 requirements, 15 scenarios)  
- `bank-catalog` — delta applied (rename BankProductPolicy→BankPolicy, CMA fields, 9 banks)
- `case-analysis` — delta applied (BankViabilityRule refactor, knockouts, CMA checks)

## Test Evidence

- Backend: 965/967 tests passing (2 pre-existing failures unrelated)
- 60 seed-data tests, 58 bank service/controller tests, 18 knockout tests, 131 bank-viability tests
- 16 e2e integration tests
- Frontend: TypeScript compiles clean (0 errors)

## Known Warnings (accepted)

- Santander minimumBureauScore = 541 (not 542) — uses `<=` comparison, equivalent to `score < 542`
- Sidebar uses Building2 icon instead of Landmark — cosmetic

## Commits

12 commits on feature/catalogo-bancario-cma, see git log for details.
