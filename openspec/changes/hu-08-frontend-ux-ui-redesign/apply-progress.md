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

### Status
9/33 tasks complete. Ready for Batch 3.
