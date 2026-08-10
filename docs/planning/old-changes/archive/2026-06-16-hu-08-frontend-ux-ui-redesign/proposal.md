# Proposal: HU-08 Frontend UX/UI Redesign

## Intent

The current frontend is functional but visually basic (slate palette, emoji icons, minimal layout). As the platform matures, the UI must project professionalism and operational clarity for internal mortgage advisors. This change delivers a cohesive visual identity using the institutional red palette, improves readability, and standardizes interactions across all 10 core screens — without touching any backend contract or functional logic.

## Scope

### In Scope
- New reusable UI component library (Button, Card, Badge, DataTable, EmptyState, ConfirmDialog, FormField, PageHeader, Topbar, Sidebar)
- Shell layout redesign: black carbon sidebar, warm background, content area with topbar
- Visual redesign of 10 screens: Login, Dashboard, Client list/detail/form, Case list/detail/form, Document management, Delete modal
- Loading, empty, and error state improvements
- Responsive polish for laptop/desktop ≥1024px

### Out of Scope
- Backend changes (NestJS, Prisma, DTOs, endpoints, auth flow)
- New modules (OCR, financial engine, advanced reports)
- Route changes or API contract modifications
- Validation rule changes

## Capabilities

### New Capabilities
- `frontend-ui-components`: Reusable UI component library with institutional styling

### Modified Capabilities
- `frontend-ui-shell`: Application shell layout (Sidebar, Topbar, content area)
- `frontend-client-pages`: Client list, detail, and create/edit forms
- `frontend-case-pages`: Case (expediente) list, detail, create/edit forms, and document management
- `frontend-document-pages`: Document upload, list, preview, and delete modal

## Approach

Component-first: build the reusable UI kit (10 components) before touching any page. Then refactor pages top-down: layout shell → login → dashboard → clients → cases → documents. Each page keeps existing data-fetching and form logic; only JSX structure, CSS classes, and sub-component composition change. Definir tokens visuales donde corresponda según la configuración actual del proyecto: Tailwind config, globals.css o variables CSS existentes.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/web/app/ui/` | Modified | New/updated reusable components |
| `apps/web/app/dashboard/layout.tsx` | Modified | New shell with topbar + restyled sidebar |
| `apps/web/app/login/page.tsx` | Modified | Professional centered layout |
| `apps/web/app/dashboard/page.tsx` | Modified | Metrics cards, recent activity |
| `apps/web/app/dashboard/clientes/**` | Modified | Table, detail, forms restyled |
| `apps/web/app/dashboard/expedientes/**` | Modified | Table, detail, forms, documents restyled |
| `apps/web/tailwind.config.*` | Modified | Custom color tokens |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|-------------|
| Next.js 16 breaking changes | Med | Verify every new component against `node_modules/next/dist/docs/` |
| Tailwind v4 class incompatibilities | Low | Test build after each component batch |
| Visual regression on existing flows | Med | Verify login, CRUD, status change, documents E2E |

## Rollback Plan

Revert all file changes in `apps/web/app/ui/`, `apps/web/app/dashboard/`, `apps/web/app/login/` and restore previous Tailwind config. No database or backend changes involved — pure frontend revert.

## Dependencies

- None (frontend-only, uses existing API contracts)

## Success Criteria

- [ ] All 10 screens render with new visual identity
- [ ] Reusable components used consistently across pages
- [ ] No TypeScript or build errors
- [ ] Existing functional flows (login, CRUD, status change, upload, preview, delete) remain intact
- [ ] Responsive at ≥1024px
