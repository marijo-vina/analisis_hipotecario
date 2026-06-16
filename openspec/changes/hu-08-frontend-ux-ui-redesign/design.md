# Design: HU-08 Frontend UX/UI Redesign

## Technical Approach

Component-first refactor: build the UI kit, then re-skin 10 screens without touching backend contracts, data-fetching, or route structure. Visual tokens live in `globals.css` via CSS custom properties + Tailwind 4 `@theme` block (no tailwind.config file exists). Existing server actions (`auth.ts`, `cases.ts`, `clients.ts`, `documents.ts`) remain untouched.

## Architecture Decisions

| Decision | Option A | Option B | Choice | Rationale |
|----------|----------|----------|--------|-----------|
| Token layer | CSS custom props + `@theme` together | Only `@theme` | **CSS + @theme** | CSS vars are the design-token source; `@theme` generates Tailwind utility classes from them. This mirrors existing `globals.css` pattern. |
| StatusBadge split | Keep unified (Case + Document statuses) | Split into CaseStatusBadge / DocumentStatusBadge | **Unified** | Existing component already accepts both via `code`/`name` props. Spec allows split "if public API is clear" but unification avoids redundant code. Extend color map with document status keys. |
| Sidebar/Topbar | 'use client' — Sidebar needs `usePathname` for active nav; Topbar renders search input as visual placeholder (no `useSearchParams`, no real global search in this HU) | Server component | **Client components** | Sidebar must highlight active nav item. Topbar shows search input visually but preserves existing behavior — no Suspense or new search logic introduced. |
| AppShell | Server component wrapping Sidebar+Topbar | Client component | **Server component** | Session check (`getSession`) is server-side. Children render inside the shell. |
| Common components (Button/Card/Badge) | Server components by default | Forced client | **Server components by default** | These are pure presentational. No hooks, no state. Can be used in server pages directly. |
| DataTable | Client component | Server/presentational component | **Server by default** | Use `overflow-x-auto` for internal scroll — no scroll observer needed. Only make client if a specific screen truly requires local interactivity beyond presentational rendering. |
| FormField | Client component | Server/presentational component | **Server by default** | Receives props (`label`, `name`, `error`, `children`, `inputProps`) — no hooks, no state. Can be used inside server components. |
| ConfirmDialog | Client component | Server component | **Client component** | Needs `useState` for open/loading states. |
| DocumentPreviewDialog | — | — | **Client component** | New modal for embedded document preview: `iframe` for PDF, `img` for images. Calls existing signed URL server action. |

## Data Flow

```
Server (layout.tsx) ──→ getSession() ──→ redirect if !token
         │
         └── AppShell (server) ──→ Sidebar (client) + Topbar (client)
                    │
                    └── children (server pages)
                           │
                           ├── PageHeader (server)
                           ├── DataTable (server)  ←── apiFetch() data (server)
                           ├── Card (server)       ←── apiFetch() data (server)
                           ├── Badge (server)      ←── status.code/name from API
                           ├── FormField (server)  ←── props: label, error, children
                           ├── ConfirmDialog (client) ←── useState for open/loading
                           └── DocumentPreviewDialog (client) ←── signed URL + iframe/img
```

Existing server actions unchanged — all pages continue calling `apiFetch()` then `apiMutation()` server-side. Forms use `useActionState` as before, now wrapped in `FormField`.

## Token Strategy

All tokens in `apps/web/app/globals.css`, extending the existing `@theme inline` block:

```css
:root {
  --gf-red: #B0002A;       --gf-red-dark: #8F0022;    --gf-red-soft: #FDE8EC;
  --gf-black: #101010;     --gf-sidebar: #111111;
  --gf-bg: #FFF7F7;        --gf-surface: #FFFFFF;      --gf-border: #F0C9CF;
  --gf-text: #111827;      --gf-text-muted: #6B7280;   --gf-text-soft: #9CA3AF;
  --gf-success: #059669;   --gf-warning: #D97706;      --gf-info: #2563EB;
  --gf-danger: #DC2626;    --gf-neutral: #6B7280;
  --sidebar-width: 260px;  --topbar-height: 72px;
  --content-padding: 32px; --card-padding: 24px;
  --input-height: 42px;    --radius-sm: 8px;           --radius-md: 12px;
}

@theme inline {
  --color-gf-red: var(--gf-red);
  --color-gf-red-dark: var(--gf-red-dark);
  /* ... all tokens mapped to Tailwind utilities ... */
  --color-gf-bg: var(--gf-bg);
  --color-gf-surface: var(--gf-surface);
  --color-gf-border: var(--gf-border);
  /* spacing */
  --spacing-sidebar: var(--sidebar-width);
  --spacing-topbar: var(--topbar-height);
}
```

## Folder Structure

```
apps/web/app/ui/
├── layout/
│   ├── sidebar.tsx          (REWRITE — replaces emoji sidebar)
│   ├── topbar.tsx           (NEW — search, actions, user avatar)
│   └── app-shell.tsx        (NEW — composes Sidebar+Topbar+children)
├── common/
│   ├── button.tsx           (NEW — primary/secondary/destructive variants)
│   ├── card.tsx             (NEW — white card with border)
│   ├── badge.tsx            (REWRITE — extends StatusBadge with doc statuses)
│   ├── page-header.tsx      (NEW — breadcrumb, title, action slot)
│   ├── empty-state.tsx      (NEW — icon, message, optional CTA)
│   ├── confirm-dialog.tsx   (NEW — modal overlay, cancel/confirm)
│   ├── document-preview-dialog.tsx (NEW — embedded viewer: iframe PDF, img images)
│   ├── data-table.tsx       (NEW — column headers, row hover, overflow scroll)
│   └── form-field.tsx       (NEW — label, input, inline error)
└── (existing files kept — client-form, case-form, pagination, etc.
     updated to use new common components)
```

## Key Props Interfaces

```typescript
// Button
interface ButtonProps {
  variant: 'primary' | 'secondary' | 'destructive';
  disabled?: boolean; loading?: boolean;
  type?: 'button' | 'submit'; onClick?: () => void;
  children: ReactNode;
}

// StatusBadge (unified — extends existing)
interface StatusBadgeProps {
  code: string;  // e.g. IN_REVIEW, UPLOADED
  name: string;  // e.g. "En revisión", "Subido"
}

// DataTable
interface DataTableProps<T> {
  columns: { key: string; header: string; render?: (item: T) => ReactNode }[];
  rows: T[]; emptyMessage: string;
}

// ConfirmDialog
interface ConfirmDialogProps {
  open: boolean; onClose: () => void;
  title: string; message: string;
  confirmLabel: string; confirmVariant: 'primary' | 'destructive';
  onConfirm: () => Promise<void>;
}

// DocumentPreviewDialog
interface DocumentPreviewDialogProps {
  open: boolean; onClose: () => void;
  fileName: string;
  signedUrl: string | null;   // null = error/loading
  mimeType: string;           // e.g. application/pdf, image/jpeg
}
```

## Implementation Order (9 batches)

| Batch | What | Files |
|-------|------|-------|
| 1 | Token layer + layout shell | `globals.css`, `ui/layout/*` |
| 2 | Common components | `ui/common/button`, `card`, `badge`, `form-field` |
| 3 | Data components | `ui/common/data-table`, `empty-state`, `page-header`, `confirm-dialog` |
| 4 | Login redesign | `login/page.tsx`, `ui/login-form.tsx` |
| 5 | Dashboard redesign | `dashboard/page.tsx` |
| 6 | Client pages | `dashboard/clientes/**` |
| 7 | Case pages + StatusBadge map | `dashboard/expedientes/**`, `ui/common/badge.tsx` |
| 8 | Document pages + delete modal | `ui/documents/*`, delete via ConfirmDialog |
| 9 | Responsive polish + build | All files |

## Cancel Button Routing

| Context | Cancel destination |
|---------|-------------------|
| Create client | `/dashboard/clientes` |
| Edit client | `/dashboard/clientes/[id]` |
| Create case | `/dashboard/expedientes` |
| Edit case | `/dashboard/expedientes/[id]` |

Handled via `href` prop on Button — no new routes, no redirect logic changes.

## Risk Mitigations

| Risk | Mitigation |
|------|------------|
| Next.js 16 breaking changes | Verify with `next build` after every batch; stay within existing App Router patterns (server components for data fetching, client for interactivity). |
| Tailwind 4 class incompatibilities | Test build per batch. Tailwind 4 drops some v3 utility names — prefer `@theme`-generated classes over arbitrary values. |
| Visual regression | Preserve existing page logic verbatim — only swap JSX and CSS. Compare screenshots before/after per batch. |

## Testing Strategy

| Layer | What | How |
|-------|------|-----|
| Build | Zero TS errors, zero build warnings | `npm run build` in `apps/web` after each batch |
| Lint | Zero lint errors | `npm run lint` in `apps/web` if configured |
| Visual | All 10 screens render with new tokens | Manual walkthrough per batch |
| Functional | Existing flows intact | Manual verification: login, crear/editar cliente, crear/editar expediente, cambio de estado, subir/ver/eliminar documento |

No new unit/integration tests — visual-only change. Existing flows verified manually. **Mandatory**: build + lint must pass before considering any batch complete.

## Open Questions

- None — all decisions resolved from spec + codebase exploration.
