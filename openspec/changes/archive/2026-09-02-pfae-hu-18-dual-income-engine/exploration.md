## Exploration: PFAE HU-18 Dual Income Engine

### Current State

**Income engine is payroll-only.** `IncomeCalculationService.calculate(caseId, excludedDocumentIds)` loads `PAYROLL_RECEIPT` documents, maps nested Gemini fields via `mapDocumentToReceipt`, averages included receipts with `Prisma.Decimal` (`computeAverages`), and persists an immutable `IncomeCalculation` row. Empty payroll → `NotFoundException`. Zero included receipts → 400. Snapshots stay `CALCULATED`; there is no `source` column and no JSON `bases`.

`IncomeCalculationResult` today: `receiptResults[]`, `averageGrossIncome`, `averageNetIncome`, confirmed fields, counts, status. GET `/cases/:caseId/income/latest` returns that shape. Toggle (`PATCH .../receipts/:index`) is a salaried checkbox flow.

**Phase B already calls this on every analyze.** `CaseAnalysisService.run()` loads `mortgageCase.personType` (HU-19a) and uses it only for Phase A rule selection. Phase B still does `incomeCalcService.calculate(caseId, [])` with no personType. For PFAE (no payroll) this throws, is swallowed as a console warning, and Phase C proceeds with a missing/stale income snapshot. That is the main functional gap HU-18 must close.

**Prisma (`IncomeCalculation`).** Fields: `receiptResults Json`, `averageGrossIncome/averageNetIncome Decimal`, optional confirmed fields, `status String`, `calculatedAt`. No enum for income source. `PersonType` (`SALARIED | PFAE`) lives on `MortgageCase.personType` (default `SALARIED`). `LiabilitySnapshot` already stores `factorUsed Decimal`. No `ActivityType` / `BankActivityFactor` tables exist.

**Liabilities are 6% only.** `LiabilityCalculationService.defaultFactor = 0.06`. Formula for REVOLVING: `MAX(balance × factor, payment)` in integer cents (`applyFactorCents`). `calculate(caseId, credits, factorUsed?)` already accepts an override, but Phase B and `POST /cases/:caseId/liability/calculate` never pass it and never read `personType`. UNKNOWN credits hardcode 0.06 ("not the parametrized factor"). Existing tests lock SALARIED math: `100000 × 6% = 6000`.

**Bank-statement months live per document, not as a case-level series.** After HU-17, each `BANK_STATEMENT` `extractedData` has:

- `statementPeriod.periodStartDate` / `periodEndDate` / `isCurrentIncompleteMonth` / `isClosedMonth`
- `financialDepuration.depurationSummary.totalValidIncome` (VALID deposits only; TRASH and NEEDS_REVIEW excluded)
- `financialDepuration.cleanedDeposits[]` with `date`, `amount`, `classification`

There is **no** case-level monthly series. HU-18 must assemble months from N statements. `detectedSector` on the cleaner is deposit-keyword heuristics (`FOOD_RESTAURANT`, etc.) — not the CSF activity used for 6 vs 12.

**Tax return already carries the knockout flag.** `TaxReturnExtractionPayload`: `fiscalResult.fiscalProfit`, `fiscalResult.fiscalLoss`, `fiscalResult.accumulableIncomeTotal`, computed `hasTaxLoss` (loss > 0 or `taxResult < 0`), plus alert `PERDIDA_FISCAL_KNOCKOUT_DECLARACION`. Document type code: `TAX_RETURN`. NETO = `fiscalProfit / 12`; BRUTO = `accumulableIncomeTotal / 12`.

**CSF activity facts exist; 6/12 flag does not.** `CsfExtractionPayload.activities[]`: `order`, `description`, `percentage`, `startDate`, `endDate`. Also `activityStartDate`, `tenureMonths`, regime flags. No `requiresTwelveMonths`. No catalog. Selection rule from the phase plan is not implemented: active (`endDate` null), highest `percentage`, tie → lower `order`.

**Phase C is source-blind.** `BankViabilityRule` reads latest `averageGrossIncome` / `averageNetIncome` (confirmed fallback). It does not read `source` or `bases`. HU-18 can keep Phase C working by projecting the **chosen** base into those two Decimal columns. Bank activity factors and Fase C recálculo stay HU-20.

**Tests that must keep passing.** `income-calculation.service.spec.ts` (payroll averages, Decimal rounding, toggle, 404/400). Controller + integration specs for GET latest / POST calculate. `liability.service.spec.ts` REVOLVING 6% cases. `case-analysis.service.spec.ts` Phase B order and “income failure does not block Phase C”. `bank-viability.rule.spec.ts` still consumes averages. UI (`income-calculation-section.tsx`, `apps/web/app/actions/income.ts`) is out of scope; extra JSON fields are ignorable until HU-21.

**Closed product decisions (not reopened):** `personType` is the only discriminator; compute both PFAE bases on analyze; smoothing always drops max+min (6→avg 4, 12→avg 10); months = VALID post-cleaner deposits grouped by statement period; tax-loss knocks out tax-return base only; persist `source` + `bases`; default source bank-if-valid else tax return; PFAE revolving 0.07; CSF activity resolver without bank factors; no UI / no HU-20 recálculo / no HU-19b gates; acceptance = Jest on persisted snapshot.

### Affected Areas

- `apps/api/prisma/schema.prisma` — add `IncomeCalculation.source` (`PAYROLL | BANK_STATEMENTS | TAX_RETURN`) and JSON `bases`; existing rows default `source = PAYROLL`, `bases = null`.
- `apps/api/src/income-calculation/income-calculation.service.ts` — branch `calculate()` on `MortgageCase.personType`; SALARIED path unchanged; PFAE path builds dual bases + default `source`.
- `apps/api/src/income-calculation/income-calculation.types.ts` — extend result with `source`, `bases`; keep `receiptResults` for SALARIED.
- New pure helpers (same module or `income-calculation/` siblings) — smoothed average; CSF activity resolution; tax-return monthly; bank-month assembly from HU-17 payload.
- `apps/api/src/income-calculation/income-calculation.controller.ts` — GET latest already returns the snapshot; no new PATCH in this HU. `calculate` must not 404 PFAE for missing payroll.
- `apps/api/src/income-calculation/*.spec.ts` (+ new PFAE unit tests) — preserve SALARIED; add 6/12 smoothing, tax-loss, default source, GET-latest JSON.
- `apps/api/src/case-analysis/case-analysis.service.ts` — Phase B keeps calling `calculate(caseId)`; service loads `personType`. Optionally stop treating PFAE missing-payroll as a warning once PFAE calculate succeeds.
- `apps/api/src/liability/liability.service.ts` — when `factorUsed` omitted, resolve 0.07 if case `personType === PFAE`, else 0.06. REVOLVING formula unchanged. UNKNOWN stays hardcoded 0.06.
- `apps/api/src/liability/liability.controller.ts` — standalone POST calculate inherits personType via the service (no DTO change required).
- `apps/api/src/liability/liability.service.spec.ts` — keep 6% defaults; add PFAE 7% cases (`100000 × 0.07 = 7000`).
- `apps/api/src/documents/bank-statement-extraction.service.ts` / cleaner output — **read-only** consumers of `financialDepuration` + `statementPeriod`.
- `apps/api/src/documents/tax-return-extraction.service.ts` — **read-only** `fiscalResult` + `hasTaxLoss`.
- `apps/api/src/documents/csf-extraction.service.ts` — **read-only** `activities[]` for the resolver.
- `apps/api/src/case-analysis/rules/bank-viability.rule.ts` — **no behavior change** if chosen base is projected into averages. Do not select `source`/`bases` in this HU.
- `openspec/specs/income-calculation/spec.md` — delta in sdd-spec: PFAE dual engine; SALARIED requirements stay.

**Out of scope (do not touch):** picker / dual-base panel / comparativa columns (HU-21); `ActivityType` / `BankActivityFactor` / bank-viability branch / PATCH income-source + Phase C re-run (HU-20); CSF régimen/arraigo/vigencia/coherence gates (HU-19b); web UI types except accidental breakage from extra JSON.

### Approaches

#### A. Persistence: extend `IncomeCalculation` vs a parallel PFAE table

1. **Extend `IncomeCalculation` (recommended)** — nullable `source` + JSON `bases`; project chosen figures into existing `averageGrossIncome` / `averageNetIncome`.
   - Pros: Phase C and GET latest keep working; matches PLAN §2.2; one immutable snapshot pattern; SALARIED rows unchanged (`source=PAYROLL`, `bases=null`, `receiptResults` intact).
   - Cons: JSON `bases` is schemaless (must type in TS + tests); PFAE `receiptResults` is an empty/unused array unless we store monthly rows there.
   - Effort: Medium

2. **Parallel `PfaeIncomeCalculation` table** — new model, income service writes both or switches by personType.
   - Pros: Cleaner salaried table.
   - Cons: Phase C / GET latest / analyze wiring fork; two “latest snapshot” queries; contradicts the closed plan; higher migration and test cost.
   - Effort: High

#### B. Smoother location

1. **Pure helper next to `computeAverages` (recommended)** — e.g. `computeSmoothedAverage(monthlyTotals: Decimal[]): Decimal` that drops one max and one min, then averages the rest with `Prisma.Decimal` + 2 dp. Service only assembles the month list.
   - Pros: Same HU-12 pattern; trivial Jest without Prisma; deterministic ties (drop first max, first min after stable sort by amount then period).
   - Cons: None material.
   - Effort: Low

2. **Inline in the service** — harder to unit-test; mixes I/O with arithmetic.
   - Pros: Fewer files.
   - Cons: Fights existing style; smoothing rules are easy to get wrong (12 ≠ mean of 12).
   - Effort: Low–Medium (hidden in tests)

#### C. 6 vs 12 months without `ActivityType` / bank-factor tables

1. **CSF activity resolver + frozen keyword flag (recommended)** — pure `resolveCsfActivity(activities)`: filter `endDate == null`; max `percentage` (null percentage sorts last); tie → lower `order` (null order last); then `requiresTwelveMonths` from a small frozen SAT-description keyword list (primaria / restaurante / restaurantero / alimentos-y-bebidas class). Default **6**. Persist `{ satDescription, percentage, order, requiresTwelveMonths, coverageMonths }` inside `bases.activityResolution`. HU-20 may replace the keyword list with a catalog **without** changing the snapshot field names.
   - Pros: Implements closed decision 8; no HU-20 schema; auditable in JSON; default-6 is safe.
   - Cons: Keyword list is a product stub until the catalog exists; unmatched primaria wording → 6 months (document the list in spec).
   - Effort: Low

2. **Always 6 months until HU-20** — skip 12-month path now.
   - Pros: Smaller HU.
   - Cons: Violates HU-18 original + closed “6 vs 12 months flag”; restaurantero cases would be wrong until HU-20.
   - Effort: Low (wrong)

3. **Introduce `ActivityType` now** — catalog + `requiresTwelveMonths` column, empty factor table.
   - Pros: Matches long-term PLAN §2.1 helper signature (`activityTypeId`).
   - Cons: HU-20 owns factors/catalog; premature schema; no seed data yet.
   - Effort: High

**Window assembly (lock in propose):** one month = unique calendar `YYYY-MM` of `statementPeriod.periodStartDate` (fallback `periodEndDate`). Sum `financialDepuration` VALID income across all `BANK_STATEMENT` docs in that month (multi-account). Exclude docs with `isCurrentIncompleteMonth === true`. If unique months ≥ required N, take the **most recent N** by period end; then drop max+min. If unique months < N, bank base `valid = false` (do not smooth a short window as if it were 6 or 12). Only `classification === 'VALID'` counts (not NEEDS_REVIEW).

#### D. PATCH income-source / Phase C re-run

1. **Out of scope for HU-18 (recommended)** — analyze computes both bases, persists default `source`, projects chosen averages. No `PATCH /income-source`. No new `AnalysisRun`. Advisors cannot switch base until HU-20/HU-21. Tests assert default source + both `bases` on GET latest / analyze JSON.
   - Pros: Matches closed decision 9 (“NO UI… NO … Fase C recálculo → HU-20”); keeps this HU reviewable; Phase C still runs once with the default source.
   - Cons: Switching base is impossible until later HUs (acceptable: no picker).
   - Effort: None here

2. **Implement PATCH + Phase C re-run now without UI** — new endpoint + new AnalysisRun reusing snapshots.
   - Pros: Unblocks HU-21 slightly earlier.
   - Cons: PLAN §2.4 is the UI contract; HU-20 owns comparativa recálculo; extra surface with no consumer; inflates the PR past the dual-engine core.
   - Effort: Medium–High (out of slice)

### Recommendation

Implement **Approach A1 + B1 + C1 + D1**.

1. **One `IncomeCalculation` model.** Add `source String` and `bases Json?`. SALARIED: `source=PAYROLL`, `bases=null`, current `receiptResults` + averages. PFAE: `receiptResults=[]` (or omit unused), `bases` holds:

   ```
   bankStatements: { valid, coverageMonths, monthsUsed, droppedHigh, droppedLow, smoothedAverage, monthlyTotals[] }
   taxReturn: { valid, hasTaxLoss, taxYear, monthlyNet, monthlyGross, fiscalProfit, accumulableIncomeTotal }
   activityResolution: { satDescription, percentage, order, requiresTwelveMonths, coverageMonths }
   ```

2. **Chosen projection (keeps Phase C intact):** if `source=BANK_STATEMENTS`, set both averages to the smoothed number. If `source=TAX_RETURN`, `averageNetIncome = fiscalProfit/12`, `averageGrossIncome = accumulableIncomeTotal/12`. Default source: bank if `valid`, else tax return if `valid` (`hasTaxLoss` ⇒ tax `valid=false`). If both invalid, persist `status=REQUIRES_REVIEW`, `source` still the preferred valid-path default (bank if any months exist, else `TAX_RETURN`), averages null-safe 0 — do not throw; GET latest must succeed for tests.

3. **`calculate()` loads `personType` from `MortgageCase`.** Phase B signature stays `calculate(caseId, [])`. PFAE does not query payroll and does not 404. Toggle-receipt remains SALARIED-only (400/404 if PFAE).

4. **Smoother is a pure Decimal helper.** 6 months → drop max+min, mean of 4. 12 months → drop max+min, mean of 10. Never a simple mean of 6 or 12.

5. **Liabilities:** if `factorUsed` omitted, `PFAE → 0.07` else `0.06`. Persist `factorUsed` as today. UNKNOWN path stays 0.06. Existing 6% tests keep calling `calculate` without a PFAE case row (or with SALARIED).

6. **No PATCH, no UI, no bank factors, no Phase C branch.** Acceptance: Jest on GET `/cases/:id/income/latest` (and/or analyze `IncomeCalculation` row) for dual bases, tax-loss invalidation, default `source`, 6- and 12-month smoothing, and PFAE `factorUsed=0.07`.

PLAN §7.4 (“does tax loss block the whole case?”) is already closed: **tax-return path only**.

### Risks

- **PFAE analyze currently has no income snapshot** (payroll 404 swallowed). After this HU, Phase C will start seeing real PFAE averages; bank viability still treats them as salaried payroll income (no giro factor). That is intended until HU-20, but comparativa numbers will change vs today’s null income — tests/fixtures that assumed missing income on PFAE must be updated.
- **Month grouping is not implemented.** Document-count ≠ unique months (2 accounts × 6 months ≠ 12). Propose must lock calendar-month grouping + incomplete-month exclusion.
- **Short windows.** Fewer unique months than required N ⇒ bank base invalid; do not invent a 4-month “smoothed 6”.
- **Keyword 12-month list is a stub** until HU-20 catalog. Wrong SAT wording → 6 months. Persist `satDescription` so HU-20 can re-resolve.
- **UNKNOWN liabilities stay at 6% for PFAE.** If product later wants 7% there too, that is a separate call; current code comments say UNKNOWN is not the parametrized factor.
- **Prisma migration** must backfill `source='PAYROLL'` on existing snapshots so GET latest / Phase C do not break.
- **Tax payload gaps:** `fiscalProfit` null with `hasTaxLoss=false` and only `accumulableIncomeTotal` → NET invalid, GROSS maybe valid; spec should say tax base `valid` requires the figure needed for the chosen criterion, or both figures present.
- **NEEDS_REVIEW deposits** are excluded from `totalValidIncome`. If the advisor never confirms outliers, the month is understated. HU-17 already allows manual VALID; HU-18 should not auto-include NEEDS_REVIEW.
- **Web types** omit `source`/`bases` until HU-21; extra fields are JSON-forward-compatible if the UI ignores unknowns (verify `fetchIncomeLatest` does not strip them).
- **Delivery size:** schema + income branch + helpers + liability factor + tests can exceed a 400-line review budget. sdd-tasks should forecast chained PRs (schema/helpers → PFAE calculate → liabilities).

### Ready for Proposal

Yes. Orchestrator should tell the user: HU-18 is a **backend-only** extension of `IncomeCalculation` (not a new table). Analyze will compute both PFAE bases, persist `source` + JSON `bases`, project the default base into the existing average columns so comparativa keeps working, apply 7% revolving for PFAE, and resolve 6 vs 12 from CSF with a small keyword list (no bank-factor tables). Smoothing always drops max and min. No picker, no PATCH, no Phase C recálculo — those stay HU-20/HU-21. Acceptance is Jest on GET income latest / the persisted snapshot. SALARIED payroll averages and 6% liabilities stay as they are.
