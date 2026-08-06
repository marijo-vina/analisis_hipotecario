# Design: Catálogo Bancario CMA

## Technical Approach

Restructure the bank data model from product-level matching (`BankProductPolicy` with LTV/maturity) to **CMA client profiling** (`BankPolicy` with minimum income/property/age thresholds). Introduce bureau knockout rules as a pre-pass before per-bank viability evaluation. Deliver a new `BanksModule` (NestJS) with CRUD endpoints and a Next.js "Bancos" section with list + detail/inline-edit pages.

The change touches 4 layers: Prisma schema migration, NestJS module extraction, bank-viability rule refactoring, and Next.js frontend pages.

## Architecture Decisions

| Decision | Options Considered | Choice | Rationale |
|----------|-------------------|--------|-----------|
| **Module structure** | Extend `CatalogsModule` vs new `BanksModule` | New `BanksModule` | Bank CRUD (create, patch, toggle) is domain-entity behavior, not a read-only catalog lookup. Separation keeps `CatalogsModule` thin and stable. |
| **Migration strategy** | Destructive drop+create vs additive migration | Two-step: rename model + add columns first, drop old columns second | Safer rollback. First migration is additive; second drops deprecated columns after code migration is verified. |
| **Bureau knockout location** | Separate rule class vs inline in `BankViabilityRule` | Inline pre-pass in `BankViabilityRule.execute()` | Bureau data is already available in the analysis context. A separate rule would require inter-rule data passing. Keeping it inline matches the spec's "pre-pass before per-bank evaluation" and avoids orchestrator changes. |
| **Snapshot shape change** | `productMatches[]` → `bankResults[]` rename | Keep `productMatches` key but change inner shape to `BankResult` | Avoids breaking downstream consumers in a single PR. The `ProductMatch` type is renamed to `BankResult` but the snapshot key remains stable for backward compatibility. Frontend types update in the same change. |
| **Frontend edit pattern** | Client-side form with server action vs inline-edit client island | Inline-edit `"use client"` island in server page | Matches existing pattern (client detail page uses islands). Single-field blur-save is faster than form submission. |
| **`POST /banks` for MVP** | Include create vs defer | Defer POST to post-MVP | Proposal scope doesn't require creating banks from UI — 9 banks are seeded. Adding create endpoint later is trivial. |

## Data Flow

### Analysis Flow (bureau knockout → CMA checks)

```
┌─────────────────────────────────────────────────────────────┐
│  BankViabilityRule.execute(context, documents)               │
│                                                              │
│  1. Resolve inputs (income, propertyValue, bureau data)      │
│  2. BUREAU KNOCKOUT PRE-PASS                                │
│     ├─ Universal: score < 500 → reject ALL banks             │
│     ├─ Universal: quita/quebranto → reject ALL banks         │
│     └─ If universal KO hits → skip per-bank eval entirely    │
│                                                              │
│  3. PER-BANK EVALUATION (for each active Bank + Policy)      │
│     ├─ Bank-specific KO: score < bank.minimumBureauScore     │
│     ├─ Santander MOP: ≥2 PV >$3K or ≥3 PV any amount        │
│     ├─ CMA: minimumPropertyValue vs propertyValue           │
│     ├─ CMA: minimumIncome vs income (per incomeCriterion)    │
│     ├─ CMA: age/tenure/application-age checks                │
│     └─ CMA: capacity (income × CE − liabilities > 0)         │
│                                                              │
│  4. Aggregate outcome (PASS/PARTIAL/FAIL)                    │
└─────────────────────────────────────────────────────────────┘
```

### Bank CRUD Flow (frontend → API)

```
Browser (Server Component) ──GET /banks──→ BanksController ──→ BanksService ──→ Prisma
         │                                                        │
         └─── /dashboard/bancos ──────────────────────────────────┘
         │
Browser (Client Island) ──PATCH /banks/:code/policies/:dest──→ BanksController
         │                                                        │
         └─── /dashboard/bancos/[code] ───────────────────────────┘
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/api/prisma/schema.prisma` | Modify | Rename `BankProductPolicy` → `BankPolicy`; add `minimumIncome`, `minimumPropertyValue` (Decimal?); remove `code`, `name`, `personType`, `maximumLtv`, `maximumMaturityAgeMonths`, `sourceVersion`; add `minimumBureauScore Int?` to `Bank`; remove `Bank.sourceVersion`; add `TERRENO`, `CONSTRUCCION`, `REMODELACION` to `ProductDestination` enum; add `@@unique([bankId, destination])` on `BankPolicy`; update `CreditType.destination` to non-nullable |
| `apps/api/prisma/seed.ts` | Modify | Replace `BANK_PRODUCTS` with `BANK_POLICIES` seed data (9 banks, CMA values per proposal table); update `CREDIT_TYPES` destination mapping for all 6 types; remove `SOURCE_VERSION` references |
| `apps/api/prisma/migrations/.../migration.sql` | Create | Prisma-generated migration: rename table, add/drop columns, add enum values, add unique constraint |
| `apps/api/src/banks/banks.module.ts` | Create | New NestJS module: `BanksModule` with `BanksController`, `BanksService`, `PrismaModule` import |
| `apps/api/src/banks/banks.controller.ts` | Create | `GET /banks`, `GET /banks/:code`, `PATCH /banks/:code`, `PATCH /banks/:code/policies/:destination` |
| `apps/api/src/banks/banks.service.ts` | Create | Prisma queries for bank list (no policies), bank detail (with policies), bank update, policy update |
| `apps/api/src/banks/dto/update-bank.dto.ts` | Create | DTO with optional `minimumBureauScore`, `debtCommitmentFactor`, `incomeCriterion`, `isActive` |
| `apps/api/src/banks/dto/update-policy.dto.ts` | Create | DTO with optional `minimumIncome`, `minimumPropertyValue`, `minimumEmploymentTenureMonths`, `minimumApplicantAgeMonths`, `maximumApplicationAgeMonths`, `isActive` |
| `apps/api/src/app.module.ts` | Modify | Register `BanksModule` in imports |
| `apps/api/src/catalogs/catalogs.service.ts` | Modify | Replace `bankProductPolicy` reads with `bankPolicy` reads; update `getBanks()` to include `minimumBureauScore` |
| `apps/api/src/catalogs/catalogs.controller.ts` | Modify | Remove `GET /bank-products` endpoint (replaced by `BanksModule`); update `GET /banks` to include `minimumBureauScore` |
| `apps/api/src/case-analysis/rules/bank-viability.rule.ts` | Modify | Major refactor: remove LTV check block (lines 345-376), remove maturity-age check block (lines 378-416), add bureau knockout pre-pass method, add `minimumPropertyValue` check, add `minimumIncome` check against policy, rename `productMatches` → `bankResults`, rename `evaluateProduct` → `evaluateBank` |
| `apps/api/src/case-analysis/types/bank-viability.types.ts` | Modify | Add `BureauKnockoutResult` type; rename `ProductMatch` → `BankResult`; rename `ProductPolicySnapshot` → `BankPolicySnapshot`; add `knockoutReasons` field; remove LTV-related calculation fields |
| `apps/web/app/lib/definitions.ts` | Modify | Add `Bank`, `BankPolicy` interfaces; update `BankViabilitySnapshot` to use `bankResults`; update `DESTINATION_LABELS` with new destinations |
| `apps/web/app/ui/layout/sidebar.tsx` | Modify | Add `{ href: "/dashboard/bancos", label: "Bancos", icon: Landmark }` to `NAV_ITEMS` |
| `apps/web/app/dashboard/bancos/page.tsx` | Create | Server component: fetches `GET /banks`, renders `BanksTable` |
| `apps/web/app/dashboard/bancos/[code]/page.tsx` | Create | Server component: fetches `GET /banks/:code`, renders bank info card + policies table |
| `apps/web/app/ui/banks/banks-table.tsx` | Create | Server-side table component with columns: Banco, Tipo Ingreso, CE, Score Mínimo, Destinos, Estado |
| `apps/web/app/ui/banks/bank-detail-card.tsx` | Create | Server component: bank info card (white, `#D7DCE2` border, 12px radius) |
| `apps/web/app/ui/banks/policy-editor.tsx` | Create | Client island (`"use client"`): inline-editable policies table with blur-save via PATCH |
| `apps/web/app/actions/banks.ts` | Create | Server actions: `updateBankPolicy(code, destination, data)` for client island mutations |

## Interfaces / Contracts

### Prisma Schema (key changes)

```prisma
model Bank {
  id                   String         @id @default(uuid())
  code                 String         @unique
  name                 String
  debtCommitmentFactor Decimal?       @db.Decimal(5, 4)
  incomeCriterion      IncomeCriterion?
  minimumBureauScore   Int?
  isActive             Boolean        @default(true)
  policies             BankPolicy[]
  createdAt            DateTime       @default(now())
  updatedAt            DateTime       @updatedAt
}

model BankPolicy {
  id                            String             @id @default(uuid())
  bankId                        String
  destination                   ProductDestination
  minimumIncome                 Decimal?           @db.Decimal(12, 2)
  minimumPropertyValue          Decimal?           @db.Decimal(12, 2)
  minimumEmploymentTenureMonths Int?
  minimumApplicantAgeMonths     Int?
  maximumApplicationAgeMonths   Int?
  isActive                      Boolean            @default(true)
  createdAt                     DateTime           @default(now())
  updatedAt                     DateTime           @updatedAt

  bank Bank @relation(fields: [bankId], references: [id])

  @@unique([bankId, destination])
  @@index([destination, isActive])
}

enum ProductDestination {
  ACQUISITION
  LIQUIDITY
  MORTGAGE_REPLACEMENT
  TERRENO
  CONSTRUCCION
  REMODELACION
}
```

### API Endpoints

| Method | Path | Request | Response |
|--------|------|---------|----------|
| GET | `/banks` | — | `{ data: BankSummary[] }` (no policies) |
| GET | `/banks/:code` | — | `{ data: BankDetail }` (with policies array) |
| PATCH | `/banks/:code` | `{ minimumBureauScore?, debtCommitmentFactor?, incomeCriterion?, isActive? }` | `{ data: BankDetail }` |
| PATCH | `/banks/:code/policies/:destination` | `{ minimumIncome?, minimumPropertyValue?, minimumEmploymentTenureMonths?, minimumApplicantAgeMonths?, maximumApplicationAgeMonths?, isActive? }` | `{ data: BankPolicy }` |

### Frontend Types

```typescript
interface BankSummary {
  id: string;
  code: string;
  name: string;
  debtCommitmentFactor: number | null;
  incomeCriterion: "NET" | "GROSS" | null;
  minimumBureauScore: number | null;
  isActive: boolean;
}

interface BankPolicy {
  id: string;
  destination: ProductDestination;
  minimumIncome: number | null;
  minimumPropertyValue: number | null;
  minimumEmploymentTenureMonths: number | null;
  minimumApplicantAgeMonths: number | null;
  maximumApplicationAgeMonths: number | null;
  isActive: boolean;
}

interface BankDetail extends BankSummary {
  policies: BankPolicy[];
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `BanksService` CRUD methods | Mock `PrismaService`, verify query shapes and return shapes |
| Unit | Bureau knockout logic in `BankViabilityRule` | Test each knockout scenario from spec (score < 500, quita/quebranto, Santander MOP, bank-specific scores) |
| Unit | Bank viability CMA checks | Test minimumPropertyValue, minimumIncome, age/tenure checks against mock policies |
| Integration | `GET /banks` and `GET /banks/:code` | Supertest against seeded DB, verify 9 banks returned with correct fields |
| Integration | `PATCH /banks/:code/policies/:destination` | Verify partial update persists and returns updated policy |
| E2E | Bank list page renders 9 rows | Playwright/Cypress: navigate to `/dashboard/bancos`, assert table rows |
| E2E | Inline edit saves | Edit minimumIncome field, blur, verify PATCH called and UI updates |

## Migration / Rollout

### Migration Plan (ordered)

1. **Prisma schema change**: Rename model, add new columns, add enum values, add unique constraint. Generate migration with `prisma migrate dev --create-only` to review SQL.
2. **Manual migration verification**: Inspect generated SQL for destructive drops. If Prisma generates column drops, split into two migrations: (a) add new columns as nullable, (b) backfill + drop old columns.
3. **Seed script update**: Rewrite `BANKS` array with 9 entries including `minimumBureauScore`. Replace `BANK_PRODUCTS` with `BANK_POLICIES` using CMA field values.
4. **Deploy**: Run migration → deploy API → deploy frontend.

### Rollback

1. `npx prisma migrate resolve --rolled-back <migration-name>`
2. Restore PostgreSQL from backup if seed data was modified
3. Redeploy previous Docker image

## Resolved Questions

- [x] **Bureau data source**: Bureau data (score, quita/quebranto, MOP) enters via the `documents` array already passed to `BankViabilityRule.execute()`. Filter by `documentType` = credit bureau extraction; data is in `extractedData` / `processingResults`.
- [x] **BX+ and Afirme policies**: Seed only bank-level data. Viability rule returns `NOT_APPLICABLE` for banks with zero active policies. Advisor adds policies via UI.
- [x] **`debtCommitmentFactor`**: All 9 banks have confirmed CE values (BX+ 0.50, Mifel 0.50, Banregio 0.50, Afirme 0.60). No nullable CE. All 4 are GROSS.
