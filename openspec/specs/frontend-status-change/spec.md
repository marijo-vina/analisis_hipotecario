# Spec: Frontend Status Change

## Purpose

Shared frontend components and server actions for mortgage case status visualization and inline status changes. Provides a reusable `StatusBadge` with explicit color mapping, a `CaseStatusDropdown` client component for status selection, and the `updateCaseStatus` server action that communicates with the backend PATCH endpoint.

## Capabilities

| Capability | Type | Description |
|---|---|---|
| `frontend-status-change` | New | Shared StatusBadge component, CaseStatusDropdown client component, updateCaseStatus server action |

---

## 1. Requirements

### Functional

| ID | Priority | Requirement |
|----|----------|-------------|
| FR-0511 | P0 | Shared `StatusBadge` component MUST use explicit `Record<string, string>` color map covering all 8 statuses — no substring matching. Defensive fallback (neutral grey) allowed ONLY for unexpected codes not in the 8-code map, never for any of the 8 valid statuses |
| FR-0513 | P0 | Detail page MUST show dropdown populated from `GET /case-statuses` with all 8 statuses, pre-selecting current |
| FR-0514 | P0 | "Cambiar" button MUST call `updateCaseStatus` server action, revalidate detail page on success, show inline error on failure |

### Scenarios

**FR-0511 — StatusBadge colors (explicit map):**

| Status Code | Badge Color |
|-------------|-------------|
| PENDING_DOCUMENTS | amber |
| DOCUMENTS_UPLOADED | sky |
| PROCESSING | indigo |
| DATA_EXTRACTED | violet |
| IN_REVIEW | blue |
| REPORT_GENERATED | teal |
| OBSERVED | red |
| CLOSED | slate |

**FR-0513 + FR-0514 — Status change UI flow:**

- GIVEN case detail page → WHEN advisor selects `IN_REVIEW` in dropdown AND clicks "Cambiar" → THEN `updateCaseStatus(caseId, "IN_REVIEW")` called, page revalidates, badge shows new status in blue
- GIVEN status change → WHEN backend returns 400/404 → THEN error message shown inline, page not reloaded

---

## 2. Component Contracts

### StatusBadge

```typescript
interface StatusBadgeProps {
  code: string;
  name: string;
}
```

- Server Component (no `'use client'` directive)
- Tailwind classes: rounded-full pill badge, `ring-1 ring-inset`
- Explicit color map — no substring matching, O(1) lookup
- Defensive fallback: `bg-gray-50` for unexpected codes only

### CaseStatusDropdown

```typescript
interface CaseStatusDropdownProps {
  caseId: string;
  currentCode: string;
  statuses: CaseStatus[];
}
```

- Client Component (`'use client'` directive)
- Pre-selects current status in `<select>` via `useState(currentCode)`
- "Cambiar" button disabled when `selectedCode === currentCode` or during pending
- Shows inline error message (`text-red-600`) on `result.errors._form`
- Calls `updateCaseStatus(caseId, selectedCode)` from server actions

### updateCaseStatus

```typescript
async function updateCaseStatus(
  caseId: string,
  statusCode: string
): Promise<ActionState>
```

- Server Action (file-level `"use server"` directive)
- Uses `apiFetch<MortgageCase>(path, { method: 'PATCH', body: { statusCode } })`
- Auth handled internally by `apiFetch` via `getSession()`
- On success: `revalidatePath(\`/dashboard/expedientes/${caseId}\`)` → returns `{}`
- On failure: returns `{ errors: result.errors ?? { _form: 'Error al cambiar estado' } }`
