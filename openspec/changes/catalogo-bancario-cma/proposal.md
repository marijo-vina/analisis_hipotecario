# Proposal: Catálogo Bancario CMA

## Intent

Shift the system from product-level matching to **client profiling with preliminary bank viability**. Current `Bank` + `BankProductPolicy` tables encode product LTV and maturity data that the advisor manages manually. We will restructure them to store per-bank and per-destination Criterios Mínimos de Aceptación (CMA), add bureau knockout rules that run before product evaluation, and give the advisor a UI to review and adjust policies inline.

## Scope

### In Scope
- Restructure `Bank` + `BankProductPolicy` → `Bank` + `BankPolicy` (remove LTV/maturity/personType, add CMA fields: `minimumIncome`, `minimumPropertyValue`, `minimumEmploymentTenureMonths`, `minimumApplicantAgeMonths`, `maximumApplicationAgeMonths`).
- Add `minimumBureauScore` to `Bank` table.
- Add 4 new banks (BX+, Mifel, Banregio, Afirme) and 3 new destinations (Terreno, Construcción, Remodelación).
- Seed 9 banks with collected CMA data (see expanded data in Engram).
- Add bureau knockout rules as binary hard-reject: quita/quebranto, score < 500, Santander score < 542, Banregio score ≤ 629, Santander MOP late-payment rules. No advisor override for MVP. Missing score → skip check (no rejection).
- Simplify `bank-viability.rule.ts`: remove LTV checks, add bureau knockout pre-pass, add `minimumPropertyValue` check, keep capacity/age/tenure/income checks.
- Mifel + Banregio: seed Adquisición/Sustitución/Liquidez as active; mark Terreno/Construcción/Remodelación as inactive.
- HSBC: keep only Acquisition active; mark all other destinations inactive until verified.
- Backend CRUD endpoints for banks and policies.
- Frontend sidebar section "Bancos" with list/detail/inline editing. Design proposal via OpenPencil first.

### Out of Scope
- Product matching (LTV, rates, terms).
- Co-financing variants (Cofinavit, Apoyo Infonavit).
- Role-based access control for bank editing.
- Labor-continuity gap modeling; property/construction restrictions.

## Capabilities

### New Capabilities
- `bank-policy-management`: Advisor-facing CRUD UI + API for bank CMA policies.
- `bureau-knockout-rules`: Hard rejection logic evaluated before bank viability.

### Modified Capabilities
- `bank-catalog`: Rename `BankProductPolicy` → `BankPolicy`, remove product fields, expand enum destinations, add 9 banks, add `minimumBureauScore` to `Bank`.
- `case-analysis`: Simplify `BankViabilityRule`; remove LTV checks; add bureau knockout evaluation.

## Approach

1. Database migration drops `BankProductPolicy` product fields and creates `BankPolicy` CMA columns; preserves bank codes.
2. Seed script populates all banks/policies with collected advisor data.
3. Update `bank-viability.rule.ts` to evaluate bureau knockouts first, then age/tenure/income/capacity per policy.
4. Add NestJS endpoints: `GET /banks`, `GET /banks/:code`, `PATCH /banks/:code/policies/:destination`.
5. Build Next.js "Bancos" page with list, detail panel, and inline-editable policy grid.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/prisma/schema.prisma` | Modified | `BankPolicy` model, expanded `ProductDestination`, `Bank.minimumBureauScore`. |
| `apps/api/prisma/seed.ts` | Modified | Seed 9 banks and destination policies. |
| `apps/api/src/bank-viability/...` | Modified | Knockout rules, simplified viability rule. |
| `apps/api/src/catalogs/...` | Modified + new endpoints | Bank/policy CRUD; replace product-policy reads. |
| `apps/web` | New | Sidebar "Bancos" section, list/detail/edit UI. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Data migration drops LTV fields used by old analysis runs | High | Backup DB before deploy; verify no downstream reads of removed fields. |
| Bureau thresholds reject previously viable cases | Med | Binary rejections are intended; clear rejection reasons in analysis result. |
| Frontend still calls old `/catalogs/bank-products` | Med | Update all callers and add integration test. |

## Rollback Plan

1. Restore PostgreSQL from pre-deploy backup.
2. Revert migration via `npx prisma migrate resolve --rolled-back` if applied.
3. Redeploy previous Docker image / Vercel production build.
4. Verify `/analyze` returns prior bank viability behavior on a staging case.

## Dependencies

- BX+ and Afirme still need destination policies (only CE and incomeCriterion confirmed). Will seed with bank-level data only; destinations remain empty until advisor fills them via UI.

## Success Criteria

- [ ] 9 active banks and all documented CMA policies seeded.
- [ ] `bank-viability.rule.ts` no longer references LTV and passes updated unit tests.
- [ ] Bureau knockout rules produce expected rejections for quita/quebranto, low scores, and Santander late payments.
- [ ] Advisor can open "Bancos", view bank details, and edit a policy inline with immediate save.
- [ ] `npm test` in `apps/api` passes after migration and seed updates.

## Confirmed Decisions

1. **Mifel & Banregio**: Seed Adquisición, Sustitución, Liquidez as active (most common). Mark Terreno, Construcción, Remodelación as inactive.
2. **Missing bureau score**: Skip the score knockout check entirely. No rejection, no `REQUIRES_REVIEW`.
3. **Bureau knockouts**: Absolute, binary, no advisor override for MVP. Quita/quebranto and score thresholds are hard rejections.
4. **HSBC**: Only Acquisition active. Liquidity and Replacement marked inactive until verified.
5. **`minimumPropertyValue`**: Added as CMA field. Varies by bank and destination (see Engram for full table). Validated against `propertyValue` from expediente.

### `minimumPropertyValue` per bank (seed data)

| Bank | Acquisition | Liquidity | Replacement | Terreno | Construcción | Remodelación |
|------|------------|-----------|-------------|---------|--------------|--------------|
| Santander | 250,000 | — | — | 250,000 | 700,000 | — |
| Banorte | 350,000 | 350,000 | 350,000 | 350,000 | 350,000 | 350,000 |
| Citibanamex | 750,000/1,000,000 | 750,000/1,000,000 | 750,000/1,000,000 | N/A | N/A | N/A |
| Scotiabank | 400,000 | — | — | N/A | — | — |
| HSBC | — | N/A | N/A | N/A | N/A | N/A |
