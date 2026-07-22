# Design: HU-13 — Catálogo Bancario y Evaluación Preliminar

## Technical Approach

Add two Prisma models (`Bank`, `BankProductPolicy`), two enums (`IncomeCriterion`, `ProductDestination`), and the nullable `CreditType.destination` field. Seed 5 banks + 15 products. Extend CatalogsService/Controller with read-only `GET /catalogs/banks` and `GET /catalogs/bank-products?destination=X`. Implement `BankViabilityRule` as a NestJS-injectable rule that queries the database for case financial data and evaluates 7 controls per product. The orchestrator merges the audit snapshot into `AnalysisRun.detail.bankViability` without overwriting existing rule results. All arithmetic uses `Prisma.Decimal` with string serialization in JSON output.

## Architecture Decisions

| # | Decision | Option A (chosen) | Option B (rejected) | Rationale |
|---|----------|-------------------|---------------------|-----------|
| 1 | BankViabilityRule DI | Inject `PrismaService` via NestJS. Pass `caseId` in typed context | Pass all data through `execute()` signature | Rule needs 5+ tables; bloating `execute()` breaks existing interface. Context uses `caseId` (not `_caseId`) — explicit, not private-prefix convention |
| 2 | Null policy fields | Return `NOT_APPLICABLE` for ALL optional fields — never affects verdict | Treat null as required or omit the check | Applies to all 5 nullable fields: minimumEmploymentTenureMonths, minimumApplicantAgeMonths, maximumApplicationAgeMonths, maximumMaturityAgeMonths, maximumLtv |
| 3 | Decimal arithmetic | `Prisma.Decimal` throughout, serialize to string in JSON | JavaScript `number` | IEEE-754 drift on multiplication. Tests assert string output (`expect(...).toBe('34185.80')`) |
| 4 | Audit storage | `AnalysisRun.detail.bankViability` — merged, not replaced | Separate table | Merged via `{ ...existingDetail, ruleResults, bankViability }`. Does not overwrite identity-match or bankarization results |
| 5 | `completeMonthsBetween` | `src/shared/utils/dates.ts` | Inline in rule | Pure utility. Date-only comparison (no time component). Reusable by future rules |
| 6 | Rule registration | Constructor injection + `providers[]` in module | Dynamic registry | Follows existing identity-match/bankarization-validation pattern |
| 7 | CreditType.destination | `ProductDestination?` typed enum, not `String?` | Open string | Prisma enum validation at DB level. Prevents arbitrary text values |
| 8 | Product query | Single `findMany` filtering destination + personType + active | Separate bank + product queries | `where: { destination, personType, bank: { isActive: true } }` with `include: { bank: true }`. One query, no accidental mismatches |
| 9 | Employment date conflicts | Use receipt IDs from latest IncomeCalculation snapshot | Scan all historical payroll docs | Only receipts included in confirmed income are authoritative. Distinct hireDates → CONFLICTING_EMPLOYMENT_DATES. Tenure-only receipts: compute from `payrollPaymentDate - reportedEmploymentTenure` |
| 10 | Scotiabank flags | Exact path in latest AnalysisRun.detail.ruleResults | "bankarization alerts" (ambiguous) | `ruleResults.find(r => r.ruleId === 'bankarization-validation')?.detail?.scotiabankExcluded`. hasPagadoraIncome from same source. Both must be true, AND bank code must be SCOTIABANK |

## Data Flow

```
Orchestrator (CaseAnalysisService.run)
  │
  ├─► loads MortgageCase + client + documents
  ├─► builds context: { client, caseId }
  │
  └─► BankViabilityRule.execute(context, documents)
        │
        ├─► Prisma: MortgageCase → requestedAmount, propertyValue, estimatedTermMonths, personType
        ├─► Prisma: IncomeCalculation (latest by calculatedAt) → confirmedGrossIncome, confirmedNetIncome
        ├─► Prisma: LiabilitySnapshot (latest by calculatedAt) → grossCurrentMonthlyDebt
        ├─► Prisma: CreditType → destination (null if unsupported)
        ├─► Prisma: BankProductPolicy.findMany({
        │      where: { isActive, destination, personType, bank: { isActive } },
        │      include: { bank: true }
        │    })
        │
        ├─► Derive from documents & prior runs:
        │    - birthDate: INE extraction (processingResults.identity)
        │    - employmentStartDate: from receipt IDs in IncomeCalculation snapshot
        │      (hireDate, or compute from paymentDate - tenure if only tenure available)
        │      Distinct dates across receipts → CONFLICTING_EMPLOYMENT_DATES
        │    - hasPagadoraIncome + scotiabankExcluded:
        │      latest AnalysisRun.detail.ruleResults
        │        .find(r => r.ruleId === 'bankarization-validation')
        │        ?.detail
        │
        ├─► LTV guard: validate requestedAmount > 0, propertyValue > 0 before division
        │    Invalid → REQUIRES_REVIEW / INVALID_REQUESTED_AMOUNT or INVALID_PROPERTY_VALUE
        │
        ├─► For each product: 7 controls → ProductMatch
        │    - All null policy fields → NOT_APPLICABLE (never affects verdict)
        │    - maximumTheoreticalTermMonths ≤ 0 → NOT_COMPATIBLE / NO_VALID_TERM_AVAILABLE
        │
        ├─► Compute aggregate outcome (PASS/PARTIAL/FAIL)
        │    - destination null → PARTIAL, empty productMatches, bankViability.reasons: UNSUPPORTED_DESTINATION
        │
        └─► Return RuleResult with detail.bankViability snapshot

Orchestrator merges into AnalysisRun:
  detail = { ...existingDetail, ruleResults, bankViability: result.detail.bankViability }
  (preserves identity-match and bankarization-validation results)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `prisma/schema.prisma` | Modify | Bank, BankProductPolicy models; IncomeCriterion, ProductDestination enums; CreditType.destination (ProductDestination?) |
| `prisma/seed.ts` | Modify | 5 banks + 15 products + CreditType destination updates |
| `apps/api/src/catalogs/catalogs.service.ts` | Modify | `getBanks()`, `getBankProducts(destination?)` |
| `apps/api/src/catalogs/catalogs.controller.ts` | Modify | `GET /banks`, `GET /bank-products?destination=X` |
| `apps/api/src/catalogs/catalogs.controller.spec.ts` | Modify | Tests for new endpoints |
| `apps/api/src/catalogs/catalogs.service.spec.ts` | Modify | Tests for new service methods |
| `apps/api/src/case-analysis/rules/bank-viability.rule.ts` | Create | BankViabilityRule — `@Injectable()`, injected PrismaService |
| `apps/api/src/case-analysis/rules/bank-viability.rule.spec.ts` | Create | Jest — test groups: input resolution, 7 controls, Scotiabank, precedence, aggregate, snapshot, Decimal serialization |
| `apps/api/src/case-analysis/types/bank-viability.types.ts` | Create | Typed interfaces (see below) |
| `apps/api/src/case-analysis/case-analysis.module.ts` | Modify | Register BankViabilityRule in providers |
| `apps/api/src/case-analysis/case-analysis.service.ts` | Modify | Pass `caseId` in context; merge `bankViability` into `AnalysisRun.detail` without overwriting |
| `apps/api/src/shared/utils/dates.ts` | Create | `completeMonthsBetween(dateStr, refDate): number` |
| `apps/api/src/shared/utils/dates.spec.ts` | Create | Date-only, leap year, edge cases |

## Prisma Schema (excerpt)

```prisma
enum IncomeCriterion { GROSS NET }
enum ProductDestination { ACQUISITION LIQUIDITY MORTGAGE_REPLACEMENT }

model Bank {
  id                   String              @id @default(uuid())
  code                 String              @unique
  name                 String
  debtCommitmentFactor Decimal             @db.Decimal(5, 4)
  incomeCriterion      IncomeCriterion
  isActive             Boolean             @default(true)
  sourceVersion        String
  products             BankProductPolicy[]
  createdAt            DateTime            @default(now())
  updatedAt            DateTime            @updatedAt
}

model BankProductPolicy {
  id                            String             @id @default(uuid())
  bankId                        String
  code                          String             @unique
  name                          String
  destination                   ProductDestination
  personType                    PersonType
  minimumEmploymentTenureMonths Int?
  minimumApplicantAgeMonths     Int?
  maximumApplicationAgeMonths   Int?
  maximumMaturityAgeMonths      Int?
  maximumLtv                    Decimal?           @db.Decimal(5, 4)
  isActive                      Boolean            @default(true)
  sourceVersion                 String
  createdAt                     DateTime           @default(now())
  updatedAt                     DateTime           @updatedAt

  bank Bank @relation(fields: [bankId], references: [id])

  @@index([destination, personType, isActive])
  @@index([bankId])
}

// CreditType modification:
model CreditType {
  // ... existing fields
  destination ProductDestination? // nullable — only COMPRA, LIQUIDEZ, MEJORA have values
}
```

## Interfaces / Contracts

```typescript
// Check status includes REQUIRES_REVIEW for missing data
type CheckStatus = 'PASS' | 'FAIL' | 'REQUIRES_REVIEW' | 'NOT_APPLICABLE';
type ProductMatchStatus = 'PRELIMINARY_VIABLE' | 'CONDITIONED' | 'NOT_COMPATIBLE' | 'REQUIRES_REVIEW';

interface BankViabilityInputs {
  confirmedGrossIncome: string | null;
  confirmedNetIncome: string | null;
  totalMonthlyLiabilities: string | null;
  requestedAmount: string | null;
  propertyValue: string | null;
  estimatedTermMonths: number | null;
  birthDate: string | null;
  employmentStartDate: string | null;
  hasPagadoraIncome: boolean;
  scotiabankExcluded: boolean;
}

interface ProductMatchCalculation {
  incomeUsed: string | null;
  maximumDebt: string | null;
  totalMonthlyLiabilities: string | null;
  availableCapacity: string | null;
  requestedLtv: string | null;
  maximumAmountByLtv: string | null;
  requiredReduction: string | null;
  currentAgeMonths: number | null;
  ageAtMaturityMonths: number | null;
  employmentTenureMonths: number | null;
  maximumTheoreticalTermMonths: number | null;
}

interface CheckResult {
  status: CheckStatus;
  actualValue?: string | number | null;
  minimumValue?: string | number | null;
  maximumValue?: string | number | null;
  reason?: string;
}

interface ProductMatch {
  bankCode: string;
  productCode: string;
  status: ProductMatchStatus;
  reasons: string[];           // per-product: LTV_EXCEEDED, MATURITY_AGE_EXCEEDED, etc.
  policySnapshot: Record<string, unknown>;
  calculation: ProductMatchCalculation;
  checks: Record<string, CheckResult>;
}

// Rule context passed by orchestrator
interface CaseAnalysisContext {
  client: Record<string, unknown>;
  caseId: string;
}

// Stored in AnalysisRun.detail.bankViability (merged by orchestrator)
interface BankViabilitySnapshot {
  sourceVersion: string;
  creditTypeCode: string;
  destination: string | null;
  calculatedAt: string;
  warningLegend: string;
  reasons: string[];           // global: UNSUPPORTED_DESTINATION, MISSING_BIRTH_DATE
  inputs: BankViabilityInputs;
  productMatches: ProductMatch[];
}
```

## Testing Strategy

| Layer | Target | Approach |
|-------|--------|----------|
| Unit | `completeMonthsBetween` | Jest — date-only, leap year, boundary cases (`dates.spec.ts`) |
| Unit | `BankViabilityRule` (input resolution) | Jest — mock PrismaService; verify OCR extraction, employment date resolution, Scotiabank flag paths |
| Unit | 7 controls individually | Jest — test each control's PASS/FAIL/REQUIRES_REVIEW/NOT_APPLICABLE branches |
| Unit | Status precedence | Jest — NOT_COMPATIBLE > REQUIRES_REVIEW > CONDITIONED > PRELIMINARY_VIABLE |
| Unit | Aggregate outcome | Jest — PASS (≥1 viable), PARTIAL (no viable + conditioned/review), FAIL (all not compatible), null destination → PARTIAL |
| Unit | Audit snapshot | Jest — verify structure, Decimal serialization as strings, warningLegend at bankViability level, reasons at both levels |
| Unit | Catalog endpoints | Jest — mock service, verify destination filtering (`catalogs.service.spec.ts`, `catalogs.controller.spec.ts`) |
| Integration | Prisma models | Test migration + seed + queries on test DB |

Test groups in `bank-viability.rule.spec.ts`:
```
describe('input resolution')
describe('income selection')
describe('capacity control')
describe('ltv control')
describe('minimum age control')
describe('maximum application age control')
describe('maturity age control')
describe('employment tenure control')
describe('Scotiabank pagadora rule')
describe('status precedence')
describe('aggregate outcome')
describe('audit snapshot')
```

Decimal serialization assertion pattern:
```typescript
expect(result.calculation.maximumDebt).toBe('34185.80');
```

## Migration

1. Add models + enums + `CreditType.destination ProductDestination?` to `schema.prisma`
2. `npx prisma migrate dev --name add_bank_catalog` — nullable field is backward-compatible with existing rows
3. Update `seed.ts` with 5 banks, 15 products, 3 CreditType destination updates
4. `npx prisma db seed`
5. **Rollback (development)**: `prisma migrate reset` (accepts data loss)
6. **Rollback (production)**: reverse migration dropping tables/column, or restore database backup. `migrate resolve --rolled-back` does NOT physically remove tables or columns
