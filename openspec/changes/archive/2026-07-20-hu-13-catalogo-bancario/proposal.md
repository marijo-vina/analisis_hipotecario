# Proposal: HU-13 — Catálogo Bancario y Evaluación Preliminar por Producto

## Intent

Create database models for Bank and BankProductPolicy, seed with 5 banks and 15 products from the May 2026 Anaquel Hipotecario, and implement a BankViabilityRule that evaluates which products are viable per case using 7 controls: income selection, debt capacity, LTV, maturity age, minimum applicant age, employment tenure, and maximum application age.

## Scope

### In Scope
- Bank + BankProductPolicy Prisma models + migration
- Seed script: 5 banks + 15 products + CreditType destination update
- Read-only catalog endpoints: GET /catalogs/banks, GET /catalogs/bank-products
- CreditType.destination field: only COMPRA→ACQUISITION, LIQUIDEZ→LIQUIDITY, MEJORA→MORTGAGE_REPLACEMENT
- BankViabilityRule in case-analysis module (7 controls)
- Full audit snapshot in AnalysisRun.detail JSON (inputs, policySnapshot, calculation, checks)
- Backend tests (Strict TDD — Jest)

### Out of Scope
- Payment simulation, amortization tables, rate calculation
- Term/plazo validation per product
- Property type filtering, payment scheme variants
- Full CRUD admin for banks/products
- Frontend UI for match results
- Collateral mode validation, manual review conditions automation
- Income minimums per product, CAT, commissions, insurance
- TERRENO, REMODELACION, CONSTRUCCION destinations (mapped to null → REQUIRES_REVIEW)

## Capabilities

### New Capabilities
- `bank-catalog`: Bank and BankProductPolicy models, seed data, read-only endpoints

### Modified Capabilities
- `case-analysis`: Add BankViabilityRule; extend AnalysisRun.detail with full audit snapshot; outcome mapping unchanged (PASS/PARTIAL/FAIL)

## Approach

1. Prisma migration: add Bank, BankProductPolicy, IncomeCriterion, ProductDestination + CreditType.destination (nullable)
2. Seed: 5 banks + 15 products + update CreditType rows
3. Catalog module: extend existing catalogs controller/service with read-only endpoints
4. Case-analysis: BankViabilityRule reads IncomeCalculation, LiabilitySnapshot, MortgageCase (estimatedTermMonths), and Document.processingResults (OCR). hasPagadoraIncome derived from bankarization/payroll analysis.
5. Match results as full audit snapshot in AnalysisRun.detail JSON

### Model

```
Bank: id, code, name, debtCommitmentFactor, incomeCriterion, isActive, sourceVersion
BankProductPolicy: id, bankId, code, name, destination, personType (reuses PersonType),
  minimumEmploymentTenureMonths?, minimumApplicantAgeMonths?, maximumApplicationAgeMonths?,
  maximumMaturityAgeMonths?, maximumLtv?, isActive, sourceVersion
  — All policy fields nullable; null → NOT_APPLICABLE in matcher
```

CE and incomeCriterion are bank-level only (not duplicated on products).

### Data Sources for Matching

| Field | Source | Precedence |
|-------|--------|------------|
| birthDate | Latest valid identity document extraction (INE) | REQUIRES_REVIEW if missing |
| employmentStartDate | Payroll OCR (hireDate, or computed from explicit tenure) | REQUIRES_REVIEW if missing or conflicting across receipts |
| confirmedGrossIncome | Latest IncomeCalculation snapshot | REQUIRES_REVIEW if not confirmed |
| confirmedNetIncome | Latest IncomeCalculation snapshot | REQUIRES_REVIEW if not confirmed |
| totalMonthlyLiabilities | Latest LiabilitySnapshot.grossCurrentMonthlyDebt | REQUIRES_REVIEW if no snapshot exists |
| destination | CreditType.destination | REQUIRES_REVIEW if null |

### Scotiabank Explicit Rule

If the case has a pagadora document AND `scotiabankExcluded === true` in processingResults: all Scotiabank products are marked `REQUIRES_REVIEW` with reason `SCOTIABANK_PAGADORA_EXCLUSION`. Other banks are evaluated normally.

### Status Precedence (per product)

1. Non-correctable rule fails → `NOT_COMPATIBLE`
2. No non-correctable failures, but data missing → `REQUIRES_REVIEW`
3. No data missing, but correctable rule fails → `CONDITIONED`
4. All applicable rules pass → `PRELIMINARY_VIABLE`

### Aggregate Outcome Mapping

| Product Results | AnalysisOutcome |
|-----------------|-----------------|
| ≥1 PRELIMINARY_VIABLE | PASS |
| No viable, but ≥1 CONDITIONED or REQUIRES_REVIEW | PARTIAL |
| All NOT_COMPATIBLE | FAIL |

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `prisma/schema.prisma` | New | Bank, BankProductPolicy, enums, CreditType.destination |
| `prisma/seed.ts` | Modified | 5 banks + 15 products + CreditType update |
| `src/catalogs/` | Modified | New read-only endpoints |
| `src/case-analysis/rules/` | New | bank-viability.rule.ts |
| `src/case-analysis/types/` | New | bank-viability.types.ts |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Missing OCR data | Med | REQUIRES_REVIEW status; matcher is defensive |
| CreditType migration | Low | Nullable destination, backward-compatible |
| Scotiabank pagadora exclusion | Med | Explicit rule, does not block other banks |
| Decimal arithmetic drift | Low | Prisma.Decimal consistently |
| Birth date / employment date conflicts | Low | REQUIRES_REVIEW on conflict |

## Rollback Plan

1. Restore database backup, OR
2. Create a reverse migration dropping Bank, BankProductPolicy tables and CreditType.destination column, OR
3. `prisma migrate reset` in development only (data loss acceptable for dev)
4. Remove BankViabilityRule from case-analysis rule registry

## Dependencies

None external. Requires existing IncomeCalculation and LiabilitySnapshot modules (already implemented in HU-11 and HU-12).

## Success Criteria

- [ ] Migration applies cleanly against existing dev database
- [ ] Seed inserts 5 banks + 15 products without errors
- [ ] GET /catalogs/banks returns all active banks with CE and incomeCriterion
- [ ] GET /catalogs/bank-products?destination=ACQUISITION returns only acquisition products
- [ ] BankViabilityRule returns PRELIMINARY_VIABLE when all 7 controls pass
- [ ] BankViabilityRule returns CONDITIONED with MATURITY_AGE_EXCEEDED or LTV_EXCEEDED
- [ ] BankViabilityRule returns NOT_COMPATIBLE for negative capacity, max application age exceeded, or insufficient tenure
- [ ] BankViabilityRule returns REQUIRES_REVIEW for missing OCR data, unscoped destination, or Scotiabank pagadora
- [ ] AnalysisRun.detail contains full audit snapshot (inputs + policySnapshot + calculation + checks)
- [ ] Null maximumApplicationAgeMonths → NOT_APPLICABLE (never fails)
- [ ] All tests pass under Strict TDD (Jest)
