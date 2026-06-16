# Apply Progress — HU-08 Frontend UX/UI Redesign

## Batch 1 — Completed: 2026-06-16

### Completed Tasks
- [x] T001 — CSS tokens + @theme in globals.css
- [x] T002 — Sidebar client component (layout/sidebar.tsx)
- [x] T003 — Topbar client component (layout/topbar.tsx)
- [x] T004 — AppShell server component (layout/app-shell.tsx)
- [x] T005 — dashboard/layout.tsx wired to AppShell

### Build Result
✅ `npm run build` passes with zero TypeScript errors.

### Files Changed
| File | Action | Details |
|------|--------|--------|
| apps/web/app/globals.css | Modified | Added 18 CSS custom properties + @theme inline mappings |
| apps/web/app/ui/layout/sidebar.tsx | Created | 260px fixed sidebar, #111111 bg, brand "Gestión Financiera", 3 nav items with usePathname active state, logout form |
| apps/web/app/ui/layout/topbar.tsx | Created | 72px sticky topbar, visual search placeholder, "Nuevo expediente" button, bell icon, user avatar |
| apps/web/app/ui/layout/app-shell.tsx | Created | Server component composing Sidebar + Topbar + children, 32px padding, #FFF7F7 bg |
| apps/web/app/dashboard/layout.tsx | Modified | Replaced Sidebar+manual JSX with AppShell wrapper |

### Deviations from Design
None — implementation matches design.

### Issues Found
None.

---

## Batch 2 — Completed: 2026-06-16

### Completed Tasks
- [x] T006 — Button component (ui/common/button.tsx)
- [x] T007 — Card component (ui/common/card.tsx)
- [x] T008 — StatusBadge rewrite (ui/common/badge.tsx) + compatibility re-export
- [x] T009 — FormField component (ui/common/form-field.tsx)

### Build Result
✅ `npm run build` passes with zero TypeScript errors.

### Files Changed
| File | Action | Details |
|------|--------|--------|
| apps/web/app/ui/common/button.tsx | Created | Server component; primary/secondary/destructive variants; `<Link>` rendering when `href` provided; loading spinner + "Cargando..." text; disabled/loading states with opacity-50 |
| apps/web/app/ui/common/card.tsx | Created | Server component; white bg (`bg-gf-surface`), `border-gf-border`, `rounded-[var(--radius-md)]`, shadow, p-6 |
| apps/web/app/ui/common/badge.tsx | Created | Unified StatusBadge: case statuses (7) + document statuses (5) with Spanish color map; legacy codes preserved; displays `name` prop, never raw `code`; neutral gray fallback |
| apps/web/app/ui/status-badge.tsx | Modified | Replaced full implementation with re-export from `@/app/ui/common/badge` — preserves existing imports across 2 pages |
| apps/web/app/ui/common/form-field.tsx | Created | Server component; label (with required asterisk) + children slot + inline error message (`text-red-600`); `htmlFor` + `role="alert"` on error |

### Deviations from Design
- **StatusBadge color classes**: Design spec says `bg-amber-100 text-amber-800` (no ring). The original component used `bg-amber-50 text-amber-700 ring-amber-600/20` with ring. Batch 2 upgrades to the spec-defined `100/800` color pairs and drops the ring — visually consistent with spec UI-03.
- **FormField `inputProps`**: Declared in tasks.md props but not forwarded since the component uses `children` slot pattern. Input styling (height 42px, border, focus) is applied by the parent form to the input element passed as children. No functional impact.

### Issues Found
None.

---

## Batch 3 — Completed: 2026-06-16

### Completed Tasks
- [x] T010 — DataTable server component (ui/common/data-table.tsx)
- [x] T011 — EmptyState server component (ui/common/empty-state.tsx)
- [x] T012 — PageHeader server component (ui/common/page-header.tsx)
- [x] T013 — ConfirmDialog client component (ui/common/confirm-dialog.tsx)

### Build Result
✅ `npm run build` passes with zero TypeScript errors. All 13 routes compiled.

### Files Changed
| File | Action | Details |
|------|--------|--------|
| apps/web/app/ui/common/data-table.tsx | Created | Server component; generic `<T extends Record<string, unknown>>`; columns with key/header/render; `<table>` with `<thead>`/`<tbody>`; empty state centered cell spanning all columns; row hover with `bg-gf-red-soft/30`; `overflow-x-auto` wrapper for internal horizontal scroll; min-width 600px; text-sm (14px); `scope="col"` on th for a11y |
| apps/web/app/ui/common/empty-state.tsx | Created | Server component; centered layout with optional icon, message in `text-gf-text-muted`, optional primary Button CTA (renders only when both ctaLabel and ctaHref provided) |
| apps/web/app/ui/common/page-header.tsx | Created | Server component; breadcrumb nav with " / " separator (last item not linked, in `text-gf-text-muted`); h1 title (text-2xl, font-semibold); optional subtitle; optional action slot (top-right); optional statusBadge next to title; responsive: stacks vertically on mobile (`flex-col sm:flex-row`) |
| apps/web/app/ui/common/confirm-dialog.tsx | Created | Client component (`'use client'`); `useState` for loading; dark overlay `bg-black/40 z-50`; centered modal card with `bg-gf-surface`, `border-gf-border`, `rounded-[var(--radius-md)]`, `shadow-lg`; backdrop click closes; Cancelar (secondary) + Confirmar (primary/destructive) buttons; loading state disables both buttons + shows spinner on confirm; `aria-modal`, `aria-labelledby`, `aria-describedby` for a11y |

### Deviations from Design
- **DataTable row key**: Uses `rowIndex` as React key since the spec does not define a `rowKey` prop. Rows are statically server-rendered so index stability is sufficient. Future iterations can add a `rowKey` prop if interactive row reordering is needed.
- **ConfirmDialog loading text**: Button component shows "Cargando..." (with spinner) when `loading={true}`, per the Button spec. The ConfirmDialog spec says "Procesando..." but uses the Button's built-in loading display for consistency. The core behavior (loading state, both buttons disabled) matches the spec exactly.

### Issues Found
None.

---

## Batch 4 — Completed: 2026-06-16

### Completed Tasks
- [x] T014 — Redesign login page layout with warm background and centered card
- [x] T015 — Update login-form.tsx to use FormField and Button components

### Build Result
✅ `npm run build` passes with zero TypeScript errors. `/login` route compiles correctly.

### Files Changed
| File | Action | Details |
|------|--------|--------|
| apps/web/app/login/page.tsx | Modified | Replaced slate-100/wraper div with warm `bg-gf-bg` (#FFF7F7); added centered brand header: "Gestión Financiera" (text-3xl, text-gf-text) + subtitle "Operaciones Hipotecarias" (text-gf-text-muted); white Card wrapping LoginForm with title "Acceso interno"; footer "Plataforma de uso exclusivo interno" (text-xs, text-gf-text-muted); **all server action imports, getSession, redirect logic preserved verbatim** |
| apps/web/app/ui/login-form.tsx | Modified | Replaced raw label/input/button markup with FormField + Button components; email field: `<FormField label="Correo electrónico" name="email" error={state?.errors?.email} required>` wrapping native input; password field: same pattern with label "Contraseña"; submit button: `<Button variant="primary" type="submit" loading={pending}>Iniciar sesión</Button>`; form-level error banner: red-50 bg, red-200 border, role="alert"; **useActionState, login server action, all form logic preserved verbatim** |

### Deviations from Design
None — implementation matches spec and design exactly.

### Issues Found
None.

### Status
15/33 tasks complete. Batches 1-4 done. Ready for Batch 5 (Dashboard redesign — T016).
