# Tasks: HU-13 — Catálogo Bancario y Evaluación Preliminar

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 500–600 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR #1 (Phases 1–3): Schema + seed + catalog | PR #2 (Phases 4–5): Rule + tests |
| Delivery strategy | force-chained |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | PR | Base |
|------|------|-----|------|
| 1 | Schema, migration, seed, catalog endpoints + tests | PR #1 | feature/hu-13-catalogo-bancario (tracker) |
| 2 | BankViabilityRule, orchestrator merge, full test suite | PR #2 | PR #1 branch |

---

## Phase 1: Foundation

- [x] 1.1 Add `IncomeCriterion`, `ProductDestination` enums + `Bank`, `BankProductPolicy` models to `prisma/schema.prisma` (with `@db.Decimal(5,4)`, indexes on `[destination, personType, isActive]` and `[bankId]`)
- [x] 1.2 Add `destination ProductDestination?` to `CreditType` model in `prisma/schema.prisma`
- [x] 1.3 Run `npx prisma migrate dev --name add_bank_catalog` (workdir: `apps/api`)
- [x] 1.4 Create `apps/api/src/shared/utils/dates.ts` — `completeMonthsBetween(dateStr: string, refDate: Date): number` (date-only, no time component)
- [x] 1.5 Create `apps/api/src/case-analysis/types/bank-viability.types.ts` — typed interfaces: `BankViabilityInputs`, `ProductMatch`, `ProductMatchCalculation`, `CheckResult`, `ProductMatchStatus`, `CheckStatus` (4 values including REQUIRES_REVIEW), `BankViabilitySnapshot`

## Phase 2: Seed Data

- [x] 2.1 Update `prisma/seed.ts` — upsert 5 banks (BANORTE 0.60 NET, SCOTIABANK 0.55 GROSS, SANTANDER 0.50 NET, HSBC 0.50 NET, CITIBANAMEX 0.50 GROSS) with sourceVersion ANAQUEL_MAYO_2026
- [x] 2.2 Add 15 products to seed (3 per bank × ACQUISITION/LIQUIDITY/MORTGAGE_REPLACEMENT) with destination-specific LTV, employment tenure, and age limits from proposal
- [x] 2.3 Update CreditType rows: COMPRA→ACQUISITION, LIQUIDEZ→LIQUIDITY, MEJORA→MORTGAGE_REPLACEMENT in seed
- [x] 2.4 Run `npx prisma db seed` and verify 5 banks, 15 products, 3 updated CreditTypes

## Phase 3: Catalog Endpoints

- [x] 3.1 Add `getBanks()` and `getBankProducts(destination?: ProductDestination)` to `catalogs.service.ts` — filter isActive, include bank relation
- [x] 3.2 Add `GET /catalogs/banks` and `GET /catalogs/bank-products?destination=X` to `catalogs.controller.ts`
- [x] 3.3 Write tests for new endpoints in `catalogs.service.spec.ts` and `catalogs.controller.spec.ts` — verify filtering by destination, inactive exclusion

## Phase 4: Core Rule (PR #2 base)

- [x] 4.1 Create `apps/api/src/case-analysis/rules/bank-viability.rule.ts` — `@Injectable()` class implementing `AnalysisRule`, inject `PrismaService`. Extract context via `CaseAnalysisContext` (`caseId`, not `_caseId`)
- [x] 4.2 Implement input resolution: read MortgageCase (requestedAmount, propertyValue, estimatedTermMonths, personType), latest IncomeCalculation, latest LiabilitySnapshot, CreditType.destination. Derive birthDate (INE), employmentStartDate (payroll receipts from IncomeCalculation snapshot — handle hireDate vs tenure-only, detect conflicts), hasPagadoraIncome + scotiabankExcluded (exact path: `latestAnalysisRun.detail.ruleResults.find(r => r.ruleId === 'bankarization-validation')?.detail`)
- [x] 4.3 Implement product query: single `findMany` filtering `{ isActive: true, destination, personType, bank: { isActive: true } }` with `include: { bank: true }`
- [x] 4.4 Implement 7 controls per product: income selection (NET/GROSS), capacity, LTV (with null/zero guards → REQUIRES_REVIEW), maturity age (theoretical term ≤ 0 → NOT_COMPATIBLE), min applicant age, employment tenure, max application age. All null policies → NOT_APPLICABLE. Scotiabank + hasPagadoraIncome + scotiabankExcluded → REQUIRES_REVIEW
- [x] 4.5 Implement status precedence per product: NOT_COMPATIBLE > REQUIRES_REVIEW > CONDITIONED > PRELIMINARY_VIABLE
- [x] 4.6 Implement aggregate outcome: ≥1 viable → PASS, no viable + conditioned/review → PARTIAL, all not compatible → FAIL, null destination → PARTIAL
- [x] 4.7 Build `BankViabilitySnapshot`: sourceVersion, creditTypeCode, destination, calculatedAt, warningLegend, reasons (global), inputs, productMatches (with reasons per product). All Decimal values serialized as strings
- [x] 4.8 Register `BankViabilityRule` in `case-analysis.module.ts` providers and `case-analysis.service.ts` constructor. Pass `caseId` in context
- [x] 4.9 Update orchestrator merge in `case-analysis.service.ts`: `detail = { ...existingDetail, ruleResults, bankViability: result.detail.bankViability }` — does not overwrite identity-match or bankarization results

## Phase 5: Testing

- [x] 5.1 Create `apps/api/src/shared/utils/dates.spec.ts` — date-only, leap year, boundary cases
- [x] 5.2 Create `apps/api/src/case-analysis/rules/bank-viability.rule.spec.ts` with 12 describe groups: input resolution, income selection, capacity control, LTV control, minimum age, max application age, maturity age, employment tenure, Scotiabank pagadora, status precedence, aggregate outcome, audit snapshot
- [x] 5.3 Verify Decimal serialization: `expect(calculation.maximumDebt).toBe('34185.80')` (string, not number)
- [x] 5.4 Run full test suite: `npm test` (workdir: `apps/api`) — all tests pass under Strict TDD
- [x] 5.5 Verify end-to-end: seed + migration apply cleanly, catalog endpoints return correct data, BankViabilityRule produces expected snapshot structure
