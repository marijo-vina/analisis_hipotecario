# Exploration: HU-11 Catálogo de Bancos y Parámetros Financieros

## Current State

The backend (`apps/api`) is a NestJS + Prisma application with the following relevant modules:

- **MortgageCase** (`mortgage-cases/`): Core case entity with `clientId`, `advisorId`, `creditTypeId`, `statusId`, `personType` (`SALARIED`), `propertyLocation`, `estimatedTermMonths`, `requestedAmount`, `propertyValue`, `notes`. **No `birthDate`, `employmentStartDate`, or `propertyType` fields exist** on `MortgageCase` or `Client`.
- **Client** (`clients/`): Has `firstName`, `paternalLastName`, `maternalLastName`, `fullName`, `rfc`, `curp`, `email`, `phone`. **No `birthDate` or `employmentStartDate`**.
- **IncomeCalculation** (`income-calculation/`): Immutable snapshots of per-receipt gross/net averages. Latest snapshot stores `confirmedGrossIncome` and `confirmedNetIncome` (nullable).
- **LiabilitySnapshot** (`liability/`): Immutable snapshots of bureau credit debt. Stores `grossCurrentMonthlyDebt` (sum of monthly contributions) and `totalCurrentBalance`.
- **CaseAnalysis** (`case-analysis/`): Orchestrates cross-document rules (`identity-match`, `bankarization-validation`). Uses a rule registry pattern where rules implement `AnalysisRule` and are injected into `CaseAnalysisService`. Outcomes: `PASS` | `PARTIAL` | `FAIL`.
- **Catalogs** (`catalogs/`): Read-only endpoints for `CreditType`, `CaseStatus`, `DocumentType`, `DocumentStatus`.
- **Prisma schema**: No `Bank`, `BankProductPolicy`, or related enums exist. `PersonType.SALARIED` is the only applicant type.

### Data Gaps for the Matching Algorithm

The proposed matching algorithm requires fields that do **not** currently exist in the schema:

| Field Needed | Where It Should Live | Current Status |
|--------------|----------------------|----------------|
| `birthDate` | `Client` or `MortgageCase` | **Missing entirely** — exists only in extracted OCR data (bureau, INE) |
| `employmentStartDate` | `MortgageCase` or `Client` | **Missing entirely** — exists only in payroll extraction (`employment.hireDate`) |
| `propertyType` (HOUSE/APARTMENT) | `MortgageCase` | **Missing entirely** |
| `destination` (ACQUISITION/LIQUIDITY/MORTGAGE_REPLACEMENT) | Maps from `CreditType.code` | **No mapping exists** — `CreditType` has codes like `COMPRA`, `MEJORA`, `LIQUIDEZ` |
| `currentAgeMonths` | Computed from `birthDate` | **Blocked by missing `birthDate`** |
| `totalMonthlyLiabilities` | From latest `LiabilitySnapshot.grossCurrentMonthlyDebt` | **Available** |
| `confirmedNetIncome` / `confirmedGrossIncome` | From latest `IncomeCalculation` snapshot | **Available** (nullable until confirmed) |

### Existing Enum Overlap

- `PersonType.SALARIED` (Prisma enum) already exists. The proposed `ApplicantProfile.SALARIED` would be a duplicate concept. **Decision needed**: either rename `PersonType` to `ApplicantProfile` or keep both and assert they stay in sync.

---

## Affected Areas

- `apps/api/prisma/schema.prisma` — Add `Bank`, `BankProductPolicy`, new enums (`IncomeCriterion`, `ProductDestination`, `ApplicantProfile`, `PaymentScheme`, `PropertyType`, `CollateralMode`), and possibly `Client.birthDate`, `MortgageCase.employmentStartDate`, `MortgageCase.propertyType`.
- `apps/api/src/catalogs/catalogs.controller.ts` — Add `GET /banks` and `GET /bank-products` (or similar) endpoints.
- `apps/api/src/catalogs/catalogs.service.ts` — Add read queries for `Bank` and `BankProductPolicy`.
- **New module** `apps/api/src/bank-products/` (or name TBD) — If full CRUD for bank catalogs is needed beyond read-only.
- `apps/api/src/case-analysis/case-analysis.service.ts` — Register the new bank-viability rule in the rule registry.
- **New file** `apps/api/src/case-analysis/rules/bank-viability.rule.ts` — The matching algorithm as an `AnalysisRule`.
- **New types** `apps/api/src/case-analysis/types/bank-viability.types.ts` — Result types for the matcher.
- `apps/api/src/mortgage-cases/dto/create-mortgage-case.dto.ts` — May need `propertyType` and `employmentStartDate`.
- `apps/api/src/mortgage-cases/dto/update-mortgage-case.dto.ts` — Same as above.
- `apps/api/src/clients/dto/create-client.dto.ts` — May need `birthDate` (or derive from RFC/INE/bureau).
- `apps/web/` — Frontend will need new catalog display and a "Match Products" button in the case detail.

---

## Approaches

### 1. Extend `case-analysis` with a `BankViabilityRule`

Register the matching algorithm as a new `AnalysisRule` inside the existing `case-analysis` module. The rule reads `BankProductPolicy` rows, filters by destination (mapped from `CreditType`), and computes viability using `IncomeCalculation` + `LiabilitySnapshot` + case fields.

- **Pros:**
  - Leverages existing rule registry pattern (identity-match, bankarization-validation).
  - Reuses `AnalysisRun` / `AnalysisAlert` persistence for audit trail.
  - Consistent with current architecture — no new orchestrator needed.
  - Outcome maps naturally to `PASS` | `PARTIAL` | `FAIL` (or we extend outcomes).
- **Cons:**
  - Matching is not strictly "cross-document analysis" — it's policy evaluation. Semantic stretch.
  - `AnalysisRule` interface expects `client` + `documents[]`; the matcher needs `income`, `liability`, `case` data, requiring the rule to fetch extra data itself (violates pure-function ideal slightly).
  - `AnalysisOutcome` enum (`PASS`/`PARTIAL`/`FAIL`) does not cleanly map to `PRELIMINARY_VIABLE` | `CONDITIONED` | `PRELIMINARY_NOT_COMPATIBLE` | `REQUIRES_REVIEW`.
- **Effort:** Medium

### 2. Separate `bank-product-matching` Module

Create a standalone NestJS module (`bank-product-matching/` or `product-matching/`) with its own controller (`POST /mortgage-cases/:caseId/match-products`), service, and DTOs. Triggered independently from case analysis.

- **Pros:**
  - Clean separation: catalog data + matching logic live in one dedicated module.
  - Can define its own outcome enum (`ProductMatchOutcome`) without overloading `AnalysisOutcome`.
  - Easier to evolve into a full financial engine later (payment simulation, rate tables, etc.).
  - Controller can return rich per-product results directly to the frontend.
- **Cons:**
  - New module = more boilerplate (controller, service, module, tests).
  - Persistence model unclear: where do match results live? New table `ProductMatchResult`? Or ephemeral computation?
  - Loses automatic integration with `AnalysisRun` audit trail unless explicitly bridged.
- **Effort:** Medium-High

### 3. Hybrid — Catalog Module + Matching Rule + Bridge Table

- Create a lightweight `bank-products` module for catalog CRUD (`Bank`, `BankProductPolicy`).
- Implement the matcher as a service inside `bank-products` (or `case-analysis`) that returns a structured result.
- Persist match results in a **new** `ProductMatchResult` table linked to `AnalysisRun` (or directly to `MortgageCase`), storing per-product verdicts.
- Expose via `GET /mortgage-cases/:caseId/product-matches`.

- **Pros:**
  - Catalogs are reusable by other features (e.g., advisor-facing product browser).
  - Match results are persisted and auditable.
  - Outcome enum stays dedicated to the matcher (`PRELIMINARY_VIABLE`, etc.).
- **Cons:**
  - Most complex — new schema + new module + bridge table + API.
  - Requires upfront design of `ProductMatchResult` schema.
- **Effort:** High

---

## Recommendation

**Go with Approach 1 (Extend `case-analysis` with `BankViabilityRule`) for the MVP**, but with an architectural escape hatch:

1. **Add `Bank` and `BankProductPolicy` to Prisma schema** as proposed. Seed the 5 banks + 15 products.
2. **Create `BankViabilityRule`** implementing `AnalysisRule`. It will internally call `PrismaService` to fetch the latest `IncomeCalculation` and `LiabilitySnapshot` for the case (the rule already has access to `prisma` via DI if we inject it).
3. **Map `CreditType.code` → `ProductDestination`** via a lightweight lookup table or hardcoded mapping in the rule for MVP:
   - `COMPRA`, `TERRENO` → `ACQUISITION`
   - `LIQUIDEZ` → `LIQUIDITY`
   - `MEJORA`, `REMODELACION`, `CONSTRUCCION` → `MORTGAGE_REPLACEMENT` (or require explicit `destination` field on `CreditType`)
4. **Extend `MortgageCase` with `propertyType`** (enum `HOUSE` | `APARTMENT`) and add to DTOs.
5. **For `birthDate` and `employmentStartDate`**: The matcher should accept these as computed inputs. In MVP, the frontend passes them to the `POST /mortgage-cases/:caseId/analyze` endpoint (or the rule reads them from the latest document extractions). **Do NOT add them to `Client`/`MortgageCase` yet** — they are volatile OCR-derived fields. When the document pipeline stabilizes, we can promote them to case fields.
6. **Outcome mapping**: Extend `AnalysisOutcome` or use `detail` JSON to store the 4 matcher-specific verdicts while keeping the aggregate `PASS`/`PARTIAL`/`FAIL` for the case status gate.

**Why Approach 1:** The rule registry already exists, is tested, and has a controller endpoint (`POST /mortgage-cases/:caseId/analyze`). Adding a rule is the smallest delta that delivers value. When the financial engine grows beyond simple policy matching (e.g., rate simulation, amortization), we graduate to Approach 3.

---

## Risks

1. **Missing Schema Fields**: `birthDate`, `employmentStartDate`, and `propertyType` are required by the matcher but absent from the schema. If we rely on OCR extractions, the matcher becomes dependent on the document pipeline being complete. If we add them to the schema, we need UI for capture/editing.
2. **CreditType → Destination Mapping**: The current `CreditType` catalog does not map cleanly to `ProductDestination`. Adding a `destination` field to `CreditType` is a schema migration that affects existing seeds and UI.
3. **Duplicate Enum Concept**: `PersonType.SALARIED` and `ApplicantProfile.SALARIED` are semantically identical. If they diverge in the future (e.g., `INDEPENDENT`), the matcher must handle both. Aligning them now reduces confusion.
4. **TermRule as Json**: The `termRule` JSON blob is flexible but loses Prisma type safety. We should validate its shape at runtime (Zod or class-validator) when reading from DB.
5. **Scotiabank Exclusion Complexity**: The existing bankarization pipeline already has `scotiabankExcluded` logic (pagadora detection). The matcher must respect this flag when evaluating Scotiabank products — otherwise the income used for capacity calculation will be wrong. The matcher must coordinate with `IncomeCalculationService` or read `processingResults` directly.
6. **Decimal Arithmetic**: The matcher will compute `incomeUsed × debtCommitmentFactor - totalMonthlyLiabilities`. This must use `Prisma.Decimal` (or integer cents) to avoid floating-point drift, consistent with `IncomeCalculationService` and `LiabilityCalculationService`.

---

## Ready for Proposal

**Yes** — with the following clarifications needed from the user / product owner before `sdd-propose`:

1. **Should `CreditType` gain a `destination` field** (ACQUISITION, LIQUIDITY, MORTGAGE_REPLACEMENT), or do we map from existing codes?
2. **Where do `birthDate` and `employmentStartDate` live?** Add to `Client`/`MortgageCase` schema, or pass as runtime parameters from document extractions?
3. **Should the matcher results be persisted** (new `ProductMatchResult` table), or computed on-the-fly inside `AnalysisRun.detail`?
4. **Is full CRUD for `Bank` and `BankProductPolicy` needed**, or read-only seeded catalogs for MVP?
5. **Should `PersonType` be renamed/aligned with `ApplicantProfile`**?
