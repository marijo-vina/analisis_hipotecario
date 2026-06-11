# Exploration: HU-05 — Implementar Estados del Expediente

## Current State

### 1. CaseStatus Model (Prisma Schema)

**File**: `apps/api/prisma/schema.prisma` (lines 98-104)

```prisma
model CaseStatus {
  id    Int            @id @default(autoincrement())
  code  String         @unique
  name  String
  order Int            @default(0)
  cases MortgageCase[]
}
```

- Simple lookup table. **No `isActive` field** — unlike `CreditType` which has `isActive`
- `order` field exists for display ordering (already used by catalogs endpoint)
- `code` is the unique business key (used in service to look up statuses like `PENDING_DOCUMENTS`)
- Generated model at `apps/api/src/generated/prisma/models/CaseStatus.ts`

### 2. CaseStatus Seed Data

**File**: `apps/api/prisma/seed.ts` (lines 16-22)

```ts
const CASE_STATUSES = [
  { code: 'PENDING_DOCUMENTS', name: 'Pendiente de documentos', order: 1 },
  { code: 'INTEGRATION',        name: 'Integración',          order: 2 },
  { code: 'ANALYSIS',           name: 'Análisis',             order: 3 },
  { code: 'COMPLETED',          name: 'Completado',           order: 4 },
  { code: 'REJECTED',           name: 'Rechazado',            order: 5 },
];
```

Seeding uses `upsert` with `where: { code }` — safe to re-run, won't duplicate.

**Mismatch with HU-05 target statuses**: Only `PENDING_DOCUMENTS` exists in both sets. The old statuses (INTEGRATION, ANALYSIS, COMPLETED, REJECTED) must be **replaced** with the 8 new ones:

| Target Status Code | Display Name | Suggested Order |
|---|---|---|
| PENDING_DOCUMENTS | Pendiente de documentos | 1 |
| DOCUMENTS_UPLOADED | Documentos cargados | 2 |
| PROCESSING | En procesamiento | 3 |
| DATA_EXTRACTED | Datos extraídos | 4 |
| IN_REVIEW | En revisión | 5 |
| REPORT_GENERATED | Reporte generado | 6 |
| OBSERVED | Observado | 7 |
| CLOSED | Cerrado | 8 |

### 3. MortgageCase Model — statusId Usage

**File**: `apps/api/prisma/schema.prisma` (lines 45-64)

```prisma
statusId   Int
status     CaseStatus   @relation(fields: [statusId], references: [id])
```

- `statusId` is **required** (`Int`, non-nullable) — a mortgage case MUST always have a status
- The include pattern `MORTGAGE_CASE_INCLUDE` already includes `status: true` in all queries

### 4. MortgageCases Module — Existing Code

#### Controller (`mortgage-cases.controller.ts`)
- `@UseGuards(JwtAuthGuard)` at class level
- Endpoints: `POST /mortgage-cases`, `GET /mortgage-cases?page=&limit=`, `GET /mortgage-cases/:id`
- **No PATCH or PUT endpoint exists** — status cannot be changed via API
- Advisor ID is extracted from JWT via `@Req() req: { user: { id: string } }`

#### Service (`mortgage-cases.service.ts`)
- Methods: `create()`, `findAll()`, `findOne()`
- `create()` looks up `PENDING_DOCUMENTS` by code, validates client and creditType existence, sets `personType` default to `SALARIED`
- `findAll()` returns paginated `{ data, meta }` with includes
- `findOne()` finds by id with includes, throws `NotFoundException` if missing
- **No `update()` method exists**

#### DTOs
- `CreateMortgageCaseDto`: Validates `clientId` (UUID), `creditTypeId` (Int, min 1), optional fields
- `QueryMortgageCaseDto`: Pagination only (`page`, `limit`), **no status filter parameter**
- **No `UpdateMortgageCaseDto` exists**

#### Test patterns (`mortgage-cases.service.spec.ts`)
- Uses Jest mocks for PrismaService
- Tests cover create (with advisorId injection, defaults, NotFound exceptions), findAll (pagination), findOne (includes, NotFound)
- **No tests for update** (doesn't exist yet)
- Follows AAA pattern (Arrange-Act-Assert)

### 5. Frontend — Mortgage Cases

#### List Page (`/dashboard/expedientes/page.tsx`)
- Server component, fetches paginated data via `apiFetch`
- Displays table with columns: Cliente, Tipo (hidden md-), Estado, Monto (hidden sm-), Fecha (hidden lg-), Acción
- Status rendered via `StatusBadge` component with color-coded pills
- `getStatusColor()` uses **substring matching** on lowercased code:
  - `"pending"/"pendiente"` → amber
  - `"approved"/"aprobado"` → emerald
  - `"rejected"/"rechazado"` → red
  - `"review"/"revisión"/"revision"` → blue
  - `"closed"/"cerrado"` → slate
  - Fallback → grey
- Several HU-05 statuses would hit the **fallback** grey: DOCUMENTS_UPLOADED, PROCESSING, DATA_EXTRACTED, REPORT_GENERATED, OBSERVED

#### Detail Page (`/dashboard/expedientes/[id]/page.tsx`)
- Server component, fetches single case by id
- Renders a `<dl>` card with all fields including status
- Same `StatusBadge` / `getStatusColor()` pattern (duplicated code)
- Status is **read-only** — no dropdown, button, or form to change it

#### New Case Page (`/dashboard/expedientes/nuevo/page.tsx`)
- Fetches credit types and clients for form selectors
- Does NOT fetch case statuses (status is assigned server-side, no client choice)

#### Case Form (`ui/case-form.tsx`)
- Client component using `useActionState` + `createCase` server action
- Collects `clientId`, `creditTypeId`, optional fields
- **No status selector** — status starts as PENDING_DOCUMENTS automatically

#### Actions (`actions/cases.ts`)
- Only `createCase()` exists
- **No `updateStatus` or `updateCase` action**

### 6. API Contracts (from `specs/frontend/spec.md`)

The current spec (HU-04) documents these mortgage-case endpoints:
- `GET /mortgage-cases?page=&limit=` (list)
- `POST /mortgage-cases` (create)
- `GET /mortgage-cases/:id` (detail)
- `GET /case-statuses` (catalog, for dropdowns)

**No PATCH contract exists.** A new contract must be defined for HU-05.

### 7. Auth Guard Pattern

```ts
// JwtAuthGuard
@UseGuards(JwtAuthGuard)  // at class level in controller
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

- Applied via decorator at class level (all endpoints protected)
- Advisor ID extracted from `req.user.id` (JWT payload)
- Same pattern used in both `mortgage-cases` and `clients` controllers

### 8. Validation Patterns (from Clients Module)

**File**: `apps/api/src/clients/clients.controller.ts`

```ts
@Patch(':id')
update(@Param('id') id: string, @Body() updateClientDto: UpdateClientDto) {
  return this.clientsService.update(id, updateClientDto);
}
```

- `UpdateClientDto` extends `PartialType(CreateClientDto)` — all fields optional
- Service validates entity existence via `findOne()` before updating
- Catches Prisma `P2002` for unique constraint violations → `ConflictException`
- UUID params are validated by class-validator via global `ValidationPipe` (needs confirmation of pipe config)

### 9. Catalogs Module — Case Statuses Endpoint

**Files**: `catalogs.controller.ts`, `catalogs.service.ts`

```ts
@Get('case-statuses')
async findCaseStatuses() {
  const data = await this.catalogsService.getCaseStatuses();
  return { data };
}

// Service
getCaseStatuses() {
  return this.prisma.caseStatus.findMany({
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
  });
}
```

- Already returns all case statuses ordered by `order` field
- No `isActive` filtering (field doesn't exist on CaseStatus)
- Frontend can already fetch statuses for dropdowns via this endpoint

---

## Gaps

| # | Gap | Severity | Details |
|---|---|---|---|
| 1 | **Seed statuses need replacement** | High | Current seeds (INTEGRATION, ANALYSIS, COMPLETED, REJECTED) must be replaced with 8 new statuses. Existing cases may reference old status IDs — migration strategy needed. |
| 2 | **No PATCH endpoint** | High | `PATCH /mortgage-cases/:id` does not exist. Must be created following the same pattern as `PATCH /clients/:id`. |
| 3 | **No UpdateMortgageCaseDto** | High | Need a DTO with `statusId` validation (must be an existing CaseStatus id or code). |
| 4 | **No update/changeStatus method in service** | High | Service must validate: case existence, new status existence, and optionally enforce transition rules. |
| 5 | **No status change UI** | High | Detail page must show a dropdown/select with available statuses and a "Cambiar estado" button. |
| 6 | **No frontend update action** | High | `actions/cases.ts` only has `createCase`. Need `updateCaseStatus(caseId, statusId)`. |
| 7 | **StatusBadge color mapping incomplete** | Medium | `getStatusColor()` uses substring matching. New statuses: DOCUMENTS_UPLOADED, PROCESSING, DATA_EXTRACTED, REPORT_GENERATED, OBSERVED won't match any color — fall to grey. Need explicit mapping. |
| 8 | **StatusBadge code duplicated** | Low | Same `getStatusColor` + `StatusBadge` exists in both list and detail pages. Should be extracted to shared component. |
| 9 | **No status filter in list endpoint** | Low | `QueryMortgageCaseDto` has no status filter. Advisors may want to filter by status in future. Not required for HU-05 but worth noting. |
| 10 | **No isActive on CaseStatus** | Low | Unlike CreditType, CaseStatus has no soft-delete/active flag. Old statuses must be replaced in seed rather than deactivated. |

---

## Design Decisions Needed

These questions must be answered in the proposal/design phase:

1. **PATCH endpoint shape**: Send `statusId` (integer) or `statusCode` (string "PENDING_DOCUMENTS")? Or both? Recommendation: accept `statusCode` (string) — more readable and matches the pattern already used in `create()` which looks up by code. The DTO should validate against the known set of valid codes.

2. **Migration strategy for old statuses**: What happens to cases currently in INTEGRATION, ANALYSIS, COMPLETED, REJECTED? Options:
   - (A) Run a migration SQL to remap old statuses to the closest new ones
   - (B) Keep old statuses in DB but don't show them in UI (add `isActive`)
   - (C) Simply update the seed and let DB constraints fail for existing cases (worst)
   - Recommendation: **(A)** — a Prisma migration that remaps old status IDs. Since the old seeds are dev-only (no production data), this is safe.

3. **Should the seed delete old statuses?** The current `upsert` pattern won't remove old statuses. Options:
   - (A) Add an explicit `deleteMany` in the seed for old codes
   - (B) Add `isActive` field to CaseStatus and deactivate old ones
   - Recommendation: **(B) is cleaner long-term**, but for HU-05 MVP where we control seeds and no production data exists, **(A) is simpler**. If we choose (A), a migration to remap existing cases must run BEFORE the seed deletes the old statuses.

4. **Transition rules**: Should any status → any status be allowed? Or enforce a workflow (e.g., can't go back from CLOSED to PENDING_DOCUMENTS)?
   - HU-05 is explicitly MANUAL and doesn't mention restrictions → allow all transitions for now. Can add rules later.

5. **UI interaction pattern**: Where does the status change go?
   - Inline dropdown on the detail page? Modal? Separate edit page?
   - Recommendation: inline dropdown on the detail page with a confirm button — minimal friction, consistent with read-only detail view.

6. **Response after PATCH**: Return full updated MortgageCase (with includes) or just success confirmation? Recommendation: return full MortgageCase (same include pattern) so frontend can update UI immediately without re-fetching.

7. **Seed order**: Should new statuses be re-seeded in a new migration or just updated in `seed.ts`? Recommendation: update `seed.ts` directly + add a migration to handle existing data remapping.

---

## Risks

- **Risk 1 — Foreign key constraint on seed cleanup**: If we delete old status codes from seed, any MortgageCase referencing the old `statusId` will break the FK. Must run a data migration BEFORE deleting old statuses. This is manageable since there's no production data yet.

- **Risk 2 — Color mapping fragility**: `getStatusColor()` uses substring matching which is fragile and gives false positives (e.g., "PENDING_DOCUMENTS" matches the "pending" substring). The new statuses would need explicit color mapping. Consider replacing the substring approach with a direct map.

- **Risk 3 — StatusBadge duplication**: Same component/logic exists in both `page.tsx` files. Extract to `ui/status-badge.tsx` to avoid divergence.

- **Risk 4 — Concurrent status changes**: Two advisors could change status simultaneously. Prisma's optimistic concurrency handles this at write level (last write wins), but there's no versioning. Acceptable for MVP.

- **Risk 5 — No PATCH test infrastructure exists**: The mortgage-cases service spec doesn't test update. Need to add `mockPrismaService.mortgageCase.update` to the mock and write update tests.

---

## Recommendation

### Approach: Single `PATCH /mortgage-cases/:id` endpoint accepting `statusCode`

**Backend changes** (in order of dependency):

1. **Update seed data** — Replace old CASE_STATUSES with the 8 new ones. Add a migration to remap any existing MortgageCase records (if any) from old status IDs to new ones before the seed upserts/deletes old codes.

2. **Create `UpdateMortgageCaseDto`** — Accept `statusCode` (string, validated with `@IsIn([...valid codes...])`). Keep it minimal — only status change for now.

3. **Add `changeStatus()` to service** — Look up new status by code (throw `NotFoundException` if missing), look up mortgage case by id (throw `NotFoundException`), update `statusId`, return full included result. No transition restrictions initially.

4. **Add `PATCH /mortgage-cases/:id` to controller** — Follow `clients` module pattern. JWT already applied at class level.

5. **Add service tests** — Test: success case, invalid status code, non-existent case.

**Frontend changes**:

6. **Extract `StatusBadge` + `getStatusColor` to `ui/status-badge.tsx`** — Shared component. Replace substring matching with explicit `Record<string, string>` mapping for the 8 new statuses.

7. **Add `updateCaseStatus` server action to `actions/cases.ts`** — Calls `PATCH /mortgage-cases/:id` with `{ statusCode }`, handles errors.

8. **Add status change UI to detail page** — Convert detail page to partial client component (or use a Server Action pattern): dropdown with available statuses + "Cambiar" button. Fetch available statuses from `GET /case-statuses` (already exists). Highlight current status.

9. **Update list and detail pages** — Replace inline StatusBadge with imported shared component.

**Effort**: Medium (3-4 backend tasks + 3-4 frontend tasks)

**Alternative considered**: `PATCH /mortgage-cases/:id/status` as a dedicated sub-resource endpoint. Simpler semantically but adds a non-standard route pattern. Rejected in favor of the general PATCH approach used by clients module — consistency > semantic purity.

### Ready for Proposal
Yes — the investigation is complete. All current state is documented, all gaps are identified, and design decisions are clearly scoped. The proposal phase can proceed immediately.
