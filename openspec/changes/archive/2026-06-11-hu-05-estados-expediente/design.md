# Design: HU-05 — Estados del Expediente

## Technical Approach

Add `PATCH /mortgage-cases/:id` at the API layer with double validation (DTO `@IsIn` + service DB lookup), seed 8 new statuses with migration of old→new codes, extract a shared `StatusBadge` component with explicit color map, and add an inline status-change dropdown on the detail page via a client component + server action. No state machine — any→any transitions allowed.

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| DTO validation scope | `@IsIn([...8 codes])` on DTO + `caseStatus.findUnique` in service | Defense-in-depth: DTO rejects garbage early; service catches codes removed from DB post-migration |
| StatusBadge color strategy | Explicit `Record<string, string>` map | Substring matching in current code breaks for codes like `DOCUMENTS_UPLOADED` (contains "pending"? no — but brittle). Map is O(1), exact, and tailwind-purge-safe |
| Detail page status UI | Client component `CaseStatusDropdown` imported into server page | Next.js App Router pattern: server fetches case + catalog, passes to client wrapper that handles interactivity |
| Migration ordering | Upsert → remap → delete | FK safety: new codes must exist before remapping; old codes deleted only after no rows reference them |
| Server action success | `revalidatePath()` instead of `redirect()` | Keep user on detail page with updated data; redirect would lose scroll position and UX |

## Data Flow

```
┌─ Detail Page (server) ───────────────────────────────────┐
│  1. fetch case + GET /case-statuses                       │
│  2. render <StatusBadge> + <CaseStatusDropdown>           │
│                           │                               │
│              ┌────────────┘                               │
│              ▼ (client component)                         │
│   <CaseStatusDropdown>                                    │
│    - dropdown pre-selected to current status              │
│    - "Cambiar" button → updateCaseStatus(id, code)        │
│                           │                               │
│              ┌────────────┘                               │
│              ▼ (server action boundary)                   │
│   updateCaseStatus():                                     │
│    PATCH /mortgage-cases/:id { statusCode } ──────────┐   │
│    on ok → revalidatePath(`/dashboard/expedientes/${id}`)│
│    on err → return { errors: { _form: msg } }        │   │
└──────────────────────────────────────────────────────────┘
                                                         │
               ┌─────────────────────────────────────────┘
               ▼
┌─ NestJS API ──────────────────────────────────────────────┐
│  @Patch(':id')                                            │
│   → DTO validates @IsIn([...8])                           │
│   → Service: findUnique status by code → BadRequestException │
│   → Service: findUnique case by id → NotFoundException      │
│   → Service: prisma.mortgageCase.update({ statusId })     │
│   → Return full case with MORTGAGE_CASE_INCLUDE           │
└──────────────────────────────────────────────────────────┘
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/api/prisma/migrations/{timestamp}_migrate_case_statuses/migration.sql` | Create | Raw SQL: upsert 8 new → remap old→new FK → delete old codes |
| `apps/api/prisma/seed.ts` | Modify | Replace `CASE_STATUSES` array with 8 new statuses |
| `apps/api/src/mortgage-cases/dto/update-mortgage-case-status.dto.ts` | Create | `UpdateMortgageCaseStatusDto` with `@IsString()` + `@IsIn([...8 codes])` |
| `apps/api/src/mortgage-cases/mortgage-cases.service.ts` | Modify | Add `async updateStatus(id, statusCode)` method |
| `apps/api/src/mortgage-cases/mortgage-cases.controller.ts` | Modify | Add `@Patch(':id')` handler `updateStatus()`, import `Patch` from `@nestjs/common` |
| `apps/api/src/mortgage-cases/mortgage-cases.service.spec.ts` | Modify | Add 4 test blocks for `updateStatus()` |
| `apps/web/app/ui/status-badge.tsx` | Create | Shared `StatusBadge` with explicit color `Record` |
| `apps/web/app/dashboard/expedientes/page.tsx` | Modify | Remove inline `StatusBadge`/`getStatusColor`, import shared |
| `apps/web/app/dashboard/expedientes/[id]/page.tsx` | Modify | Remove inline helpers, import shared `StatusBadge`, add `CaseStatusDropdown` |
| `apps/web/app/ui/case-status-dropdown.tsx` | Create | Client component: `<select>` + "Cambiar" button calling server action |
| `apps/web/app/actions/cases.ts` | Modify | Add `updateCaseStatus(caseId, statusCode)` server action |

## Interfaces / Contracts

```typescript
// DTO
export class UpdateMortgageCaseStatusDto {
  @IsString()
  @IsIn([
    'PENDING_DOCUMENTS', 'DOCUMENTS_UPLOADED', 'PROCESSING',
    'DATA_EXTRACTED', 'IN_REVIEW', 'REPORT_GENERATED',
    'OBSERVED', 'CLOSED',
  ])
  statusCode!: string;
}

// StatusBadge props (shared component)
interface StatusBadgeProps {
  code: string;
  name: string;
}

// Color map (explicit, exhaustive)
const STATUS_COLOR_MAP: Record<string, string> = {
  PENDING_DOCUMENTS:  'bg-amber-50 text-amber-700 ring-amber-600/20',
  DOCUMENTS_UPLOADED: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  PROCESSING:         'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  DATA_EXTRACTED:     'bg-violet-50 text-violet-700 ring-violet-600/20',
  IN_REVIEW:          'bg-blue-50 text-blue-700 ring-blue-600/20',
  REPORT_GENERATED:   'bg-teal-50 text-teal-700 ring-teal-600/20',
  OBSERVED:           'bg-red-50 text-red-700 ring-red-600/20',
  CLOSED:             'bg-slate-100 text-slate-700 ring-slate-600/20',
};
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Service unit | Valid status change → 200 | Mock `findUnique` for status + case, `update` returns case with includes |
| Service unit | Invalid code (passes DTO but not in DB) → 400 | `findUnique` for status returns `null`, expect `BadRequestException` |
| Service unit | Missing case → 404 | `findUnique` for case returns `null`, expect `NotFoundException` |
| Service unit | DTO rejects unknown code → 400 | Tested at NestJS pipe level — not in service spec |
| Controller | Guard + delegation | Existing pattern: verify `@Patch` delegates to `service.updateStatus` |
| Frontend | Manual verification | No test infra; verify dropdown renders, action calls, page revalidates |

## Migration SQL

Three ordered steps: (1) `INSERT ... ON CONFLICT UPDATE` for all 8 new codes, (2) 4× `UPDATE "MortgageCase" SET "statusId"=...` subqueries mapping old→new code IDs, (3) `DELETE FROM "CaseStatus" WHERE code IN ('INTEGRATION','ANALYSIS','COMPLETED','REJECTED')`. Raw SQL file lives at `apps/api/prisma/migrations/{timestamp}_migrate_case_statuses/migration.sql`.

## Open Questions

None — all decisions covered by spec and proposal.
