# Tasks: Catálogo Bancario CMA

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~2,300 across 8 PRs |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Delivery strategy | force-chained |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| PR | Scope | Base |
|----|-------|------|
| 1 | Schema: rename to BankPolicy, additive CMA columns, enum, unique; mechanical call-site renames | feature/catalogo-bancario-cma |
| 2 | Seed: 9 banks, CMA policies, 6 CreditType destinations | PR 1 branch |
| 3 | BanksModule CRUD API + integration tests | PR 2 branch |
| 4 | Rule refactor: drop LTV/maturity, BankResult/bankResults, types | PR 3 branch |
| 5 | Bureau knockouts + CMA checks (TDD) + drop-migration | PR 4 branch |
| 6 | Bancos list UI (sidebar, page, table) | PR 5 branch |
| 7 | Detail page + inline policy editor | PR 6 branch |
| 8 | Snapshot consumers (comparison tab, analysis section) | PR 7 branch |

## Phase 1: Schema & Data Model (PR 1)

- [x] 1.1 `schema.prisma`: rename BankProductPolicy→BankPolicy; add CMA fields, `Bank.minimumBureauScore`, 3 enum values, `@@unique(bankId,destination)`; keep old columns additive
- [x] 1.2 Generate additive migration (`migrate dev --create-only`), review SQL, apply
- [x] 1.3 Mechanical renames: catalogs.service/controller, seed.ts, rule query + spec mock keys
- [x] 1.4 Resolve GET /banks ownership: BanksModule takes `/banks`; remove from CatalogsController + spec
- [x] 1.5 `npm test` green (schema-dependent suites compile)

## Phase 2: Seed Data (PR 2)

- [x] 2.1 `seed.ts`: 9-bank BANKS array (add BX+, Mifel, Banregio, Afirme) with minimumBureauScore; BANK_POLICIES with CMA values per proposal tables
- [x] 2.2 Policy states: Mifel/Banregio 3 active (ACQUISITION, LIQUIDITY, MORTGAGE_REPLACEMENT) + 3 inactive; HSBC only ACQUISITION; BX+/Afirme bank-level only
- [x] 2.3 CreditType: all 6 rows get non-null destination
- [x] 2.4 Test: reseed idempotent; 9 banks, correct policy states, all destinations mapped

## Phase 3: Banks CRUD API (PR 3)

- [ ] 3.1 Create `src/banks/` (module, controller, service, update-bank.dto, update-policy.dto); register in app.module
- [ ] 3.2 Endpoints: GET /banks, GET /banks/:code, PATCH /banks/:code, PATCH /banks/:code/policies/:destination
- [ ] 3.3 Unit: BanksService with mocked Prisma (query + return shapes)
- [ ] 3.4 Integration: supertest GET list/detail, PATCH policy persists (seeded DB)

## Phase 4: Viability Rule Refactor (PR 4)

- [ ] 4.1 `bank-viability.types.ts`: BankResult, BankPolicySnapshot, BureauKnockoutResult, knockoutReasons; snapshot key → bankResults
- [ ] 4.2 `bank-viability.rule.ts`: remove LTV + maturity-age blocks; rename evaluateProduct→evaluateBank; query BankPolicy; NOT_APPLICABLE when 0 active policies
- [ ] 4.3 Rule spec: delete LTV/maturity tests, rename productMatches→bankResults, adapt factory
- [ ] 4.4 `npm test` green

## Phase 5: Bureau Knockouts & CMA (PR 5)

- [ ] 5.1 RED: spec scenarios — score < 500, missing score skips, quita/quebranto, Santander < 542, Banregio ≤ 629, Santander MOP (2 PV >$3K / 3 PV)
- [ ] 5.2 Rule: knockout pre-pass (universal short-circuit; bank-specific via minimumBureauScore; MOP from bureau documents)
- [ ] 5.3 Rule: minimumPropertyValue + minimumIncome CMA checks; knockout reasons in result
- [ ] 5.4 Drop-migration: remove deprecated columns (maxLtv, maturity, personType, sourceVersion)
- [ ] 5.5 GREEN: full suite + case-analysis delta scenarios (POST/GET snapshot parity)

## Phase 6: Bancos List UI (PR 6)

- [ ] 6.1 `definitions.ts`: Bank/BankPolicy/BankDetail interfaces, updated DESTINATION_LABELS + REASON_LABELS
- [ ] 6.2 Sidebar: "Bancos" NAV_ITEMS entry (Landmark icon, active #9C001F)
- [ ] 6.3 `/dashboard/bancos/page.tsx` + `ui/banks/banks-table.tsx`: 9 rows, columns per spec, row links to detail

## Phase 7: Detail & Inline Edit (PR 7)

- [ ] 7.1 `/dashboard/bancos/[code]/page.tsx` + `ui/banks/bank-detail-card.tsx` (Inter, white, #D7DCE2 border, 12px radius)
- [ ] 7.2 `ui/banks/policy-editor.tsx` client island: blur-save PATCH per field + destination toggle
- [ ] 7.3 `app/actions/banks.ts` server action; optimistic UI update
- [ ] 7.4 Verify inline edit persists without page reload

## Phase 8: Snapshot Consumers (PR 8)

- [ ] 8.1 `ui/expedientes/bank-comparison-tab.tsx`, `ui/expedientes/analysis-section.tsx`: bankResults, BankResult, knockout reason labels
- [ ] 8.2 Verify POST /analyze ↔ GET /analysis/latest expose identical BankViabilitySnapshot
