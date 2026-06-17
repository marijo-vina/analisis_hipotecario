# Tasks: HU-08 Frontend UX/UI Redesign

## Batch 1: Tokens + Layout Shell

- [x] T001 — Add CSS custom properties and Tailwind @theme tokens to globals.css
  Files: `apps/web/app/globals.css`
  Depends on: none
  Acceptance: All tokens defined in `:root` and mapped via `@theme inline`; no build errors; tokens include colors (--gf-red, --gf-red-dark, --gf-red-soft, --gf-black, --gf-sidebar, --gf-bg, --gf-surface, --gf-border, --gf-text, --gf-text-muted, --gf-text-soft, --gf-success, --gf-warning, --gf-info, --gf-danger, --gf-neutral), spacing (--sidebar-width: 260px, --topbar-height: 72px, --content-padding: 32px, --card-padding: 24px, --input-height: 42px), and radii (--radius-sm: 8px, --radius-md: 12px)
  REQ: UI-01, UI-02, UI-07, UI-09, UI-10

- [x] T002 — Create Sidebar client component with nav items and active state
  Files: `apps/web/app/ui/layout/sidebar.tsx` (REWRITE existing)
  Depends on: T001
  Acceptance: Sidebar renders at 260px width, #111111 bg, brand name "Gestión Financiera", nav items (Dashboard, Clientes, Expedientes) with active state via `usePathname`, logout button at bottom; uses `use client` directive
  REQ: UI-10, FR-16

- [x] T003 — Create Topbar client component with visual search placeholder
  Files: `apps/web/app/ui/layout/topbar.tsx` (NEW)
  Depends on: T001
  Acceptance: Topbar renders at 72px height, search input (visual only, NO useSearchParams), "Nuevo expediente" button, notification bell icon, user avatar/name; uses `use client` directive
  REQ: UI-09, FR-16

- [x] T004 — Create AppShell server component composing Sidebar + Topbar + children
  Files: `apps/web/app/ui/layout/app-shell.tsx` (NEW)
  Depends on: T002, T003
  Acceptance: Server component (NO `use client`), receives session from props, renders Sidebar + Topbar + children slot; content area has 32px padding and warm background (#FFF7F7)
  REQ: FR-16

- [x] T005 — Update dashboard/layout.tsx to use AppShell
  Files: `apps/web/app/dashboard/layout.tsx`
  Depends on: T004
  Acceptance: Existing `getSession()` check preserved; replaces current layout JSX with `<AppShell>` wrapping `{children}`; no horizontal overflow at ≥1024px
  REQ: FR-16, AC-11

## Batch 2: Common Components

- [ ] T006 — Create Button component with primary/secondary/destructive variants
  Files: `apps/web/app/ui/common/button.tsx` (NEW)
  Depends on: T001
  Acceptance: Server component; props: `variant` (primary|secondary|destructive), `disabled?`, `loading?`, `type?`, `onClick?`, `children`; primary: #B0002A bg, white text; secondary: white bg, #111827 text, #F0C9CF border; destructive: #DC2626 bg, white text; all: radius 8px, hover states, disabled opacity + cursor-not-allowed; loading shows spinner or text
  REQ: UI-01

- [ ] T007 — Create Card component with institutional styling
  Files: `apps/web/app/ui/common/card.tsx` (NEW)
  Depends on: T001
  Acceptance: Server component; props: `children`, `className?`; renders with white bg, #F0C9CF border, radius 12px, shadow 0 2px 8px rgba(0,0,0,0.04), padding 24px
  REQ: UI-02

- [ ] T008 — Rewrite StatusBadge (badge.tsx) with unified case + document status map
  Files: `apps/web/app/ui/common/badge.tsx` (REWRITE existing; FIRST check current location — may be at `apps/web/app/ui/status-badge.tsx` or similar. If widely imported from current path, reuse that file or create a compatibility re-export to avoid breaking existing imports)
  Depends on: T001
  Acceptance: Server component; props: `code` (string), `name` (string); maps case statuses (Pendiente de documentos→amber, Documentos cargados→sky, En procesamiento→indigo, En revisión→blue, Observado→red, Cerrado→slate, Rechazado→red) and document statuses (Subido→sky, Validado→green, Rechazado→red, Procesado→teal, Error→red); neutral gray fallback for unknown codes; displays human-readable Spanish name, never technical code; existing imports across the codebase must not break
  REQ: UI-03, FR-0511

- [ ] T009 — Create FormField server component
  Files: `apps/web/app/ui/common/form-field.tsx` (NEW)
  Depends on: T001, T006
  Acceptance: Server component (NO `use client`); props: `label`, `name`, `error?`, `children`, `inputProps?`; renders label + input wrapper (height 42px, border #F0C9CF, radius 8px, focus border #B0002A) + inline error message in red text below field when `error` prop present
  REQ: UI-07

## Batch 3: Data Components

- [x] T010 — Create DataTable server component
  Files: `apps/web/app/ui/common/data-table.tsx` (NEW)
  Depends on: T001, T007
  Acceptance: Server component by default; generic props: `columns` ({key, header, render?}[]), `rows` (T[]), `emptyMessage` (string); renders column headers, row hover states, text ≥14px; wraps content in `overflow-x-auto` div for internal horizontal scroll (not global page scroll)
  REQ: UI-04

- [x] T011 — Create EmptyState server component
  Files: `apps/web/app/ui/common/empty-state.tsx` (NEW)
  Depends on: T001, T006
  Acceptance: Server component; props: `icon` (ReactNode), `message` (string), `ctaLabel?` (string), `ctaHref?` (string); renders centered icon, Spanish message, optional primary CTA button
  REQ: UI-05

- [x] T012 — Create PageHeader server component
  Files: `apps/web/app/ui/common/page-header.tsx` (NEW)
  Depends on: T001, T006, T008
  Acceptance: Server component; props: `breadcrumbs` ({label, href?}[]), `title` (string), `action?` (ReactNode), `statusBadge?` (ReactNode); renders breadcrumb navigation, title, optional action button slot, optional status badge
  REQ: UI-08

- [x] T013 — Create ConfirmDialog client component
  Files: `apps/web/app/ui/common/confirm-dialog.tsx` (NEW)
  Depends on: T001, T006
  Acceptance: Client component (`use client`); props: `open`, `onClose`, `title`, `message`, `confirmLabel`, `confirmVariant` (primary|destructive), `onConfirm` (() => Promise<void>); renders centered modal with dark overlay (bg-black/40), Cancelar (secondary) and Confirmar buttons; shows loading state during async action; clicking backdrop closes dialog
  REQ: UI-06

## Batch 4: Login Page

- [x] T014 — Redesign login page layout with warm background and centered card
  Files: `apps/web/app/login/page.tsx`
  Depends on: T001, T007
  Acceptance: Warm background (#FFF7F7), centered brand logo "Gestión Financiera", white Card with #F0C9CF border and radius 12px wrapping the login form; existing server action imports preserved
  REQ: Login page visual redesign (frontend-ui-shell spec)

- [x] T015 — Update login-form.tsx to use FormField and Button components
  Files: `apps/web/app/ui/login-form.tsx`
  Depends on: T009, T006, T014
  Acceptance: Email and password fields wrapped in FormField with inline error display; submit button uses Button primary variant with loading state; error messages in Spanish (not raw technical); existing `useActionState` and server action call preserved verbatim
  REQ: UI-07, UI-01, Login page visual redesign

## Batch 5: Dashboard Page

- [ ] T016 — Redesign dashboard page with greeting, metric cards, and recent activity
  Files: `apps/web/app/dashboard/page.tsx`
  Depends on: T005, T007, T010, T011
  Acceptance: Renders greeting "Hola, [nombre]", 4 metric cards (Activos, Pendientes, En revisión, Cerrados) using Card component with status-colored accents; recent cases table (last 5) using DataTable; pending tasks section; empty states use EmptyState with CTA; existing data fetching (apiFetch) preserved
  REQ: Dashboard page redesign (frontend-ui-shell spec)

## Batch 6: Client Pages

- [x] T017 — Redesign client list page with PageHeader, DataTable, and search
  Files: `apps/web/app/dashboard/clientes/page.tsx`
  Depends on: T005, T010, T011, T012
  Acceptance: PageHeader with breadcrumb + "Nuevo cliente" primary button; search input filtering by name/email (preserve existing behavior); DataTable with columns (Nombre completo, Email, Teléfono, RFC, Acciones); pagination preserved; EmptyState with "No hay clientes registrados" + "Crear primer cliente" CTA when zero clients; text ≥14px
  REQ: FR-06

- [x] T018 — Redesign client detail page with personal info card and associated cases
  Files: `apps/web/app/dashboard/clientes/[id]/page.tsx`
  Depends on: T005, T007, T010, T012, T008
  Acceptance: PageHeader with breadcrumb (Dashboard > Clientes > [Nombre]); Card with personal info (full name, RFC, CURP, email, phone, dates); associated cases DataTable with columns (expediente ID, credit type, StatusBadge, amount, "Ver" link); "Sin expedientes vinculados" when no cases; "Cliente no encontrado" for non-existent ID
  REQ: FR-08

- [x] T019 — Redesign client create form with FormField components
  Files: `apps/web/app/dashboard/clientes/nuevo/page.tsx`, `apps/web/app/ui/client-form.tsx`
  Depends on: T009, T006, T012
  Acceptance: Two sections (Datos personales: Nombre, Apellido paterno, Apellido materno, Correo, Teléfono; Identificación: RFC, CURP); each field uses FormField; submit button is primary; Cancel button routes to `/dashboard/clientes` via href prop; existing `useActionState` and server action preserved; validation errors display inline via FormField error prop
  REQ: FR-07

- [x] T020 — Redesign client edit form with FormField components
  Files: `apps/web/app/dashboard/clientes/[id]/editar/page.tsx`, `apps/web/app/ui/client-edit-form.tsx`
  Depends on: T009, T006, T012, T019
  Acceptance: Same structure as T019; fields pre-filled with existing client values; title shows "Editar cliente"; Cancel button routes to `/dashboard/clientes/[id]` via href prop; existing pre-fill logic and server action preserved
  REQ: FR-07

## Batch 7: Case Pages + StatusBadge

- [x] T021 — Redesign case list page with filters, DataTable, and StatusBadge
  Files: `apps/web/app/dashboard/expedientes/page.tsx`
  Depends on: T005, T010, T011, T012, T008
  Acceptance: PageHeader with "Nuevo expediente" primary button; filter bar with dropdowns (Cliente, Estatus, Tipo de crédito); DataTable with columns (Cliente, Tipo crédito, Estado with StatusBadge, Monto, Avance docs, Fecha, Acciones); StatusBadge shows Spanish labels (never technical codes); EmptyState with "No hay expedientes" + "Crear primer expediente" CTA; existing filter/pagination behavior preserved
  REQ: FR-09, FR-0511

- [x] T022 — Redesign case detail page with 2-column layout
  Files: `apps/web/app/dashboard/expedientes/[id]/page.tsx`
  Depends on: T005, T007, T010, T012, T008, T013
  Acceptance: PageHeader with breadcrumb, title, status badge; 2-column layout: left column has summary Card (monto, tipo crédito, ubicación, plazo) + client Card (name, email, phone); right column has documents section + observations Card + "Análisis financiero próximamente" placeholder; status change dropdown + "Cambiar" button functional with new Button styling; existing status change logic preserved
  REQ: FR-11, FR-0513, FR-0514

- [x] T023 — Redesign case create form with FormField and human-readable labels
  Files: `apps/web/app/dashboard/expedientes/nuevo/page.tsx`, `apps/web/app/ui/case-form.tsx`
  Depends on: T009, T006, T012, T021
  Acceptance: Fields: Cliente (searchable selector), Tipo de crédito (dropdown: "Crédito Hipotecario", "Mejora de Hipoteca", etc.), Tipo de persona (default "Asalariado", human labels), Ubicación de la propiedad, Monto solicitado, Valor de la propiedad, Plazo estimado (meses), Observaciones; all labels in Spanish with business meaning (no technical codes); FormField for each field; submit primary button; Cancel routes to `/dashboard/expedientes`; existing `useActionState` and server action preserved
  REQ: FR-10

- [x] T024 — Redesign case edit form with FormField and human-readable labels
  Files: `apps/web/app/dashboard/expedientes/[id]/editar/page.tsx`, `apps/web/app/ui/case-edit-form.tsx`
  Depends on: T009, T006, T012, T023
  Acceptance: Same structure as T023; fields pre-filled with existing case values; title shows "Editar expediente"; Cancel button routes to `/dashboard/expedientes/[id]` via href prop; existing pre-fill logic and server action preserved
  REQ: FR-10

## Batch 8: Document Pages + Delete Modal

- [ ] T025 — Create DocumentPreviewDialog client component
  Files: `apps/web/app/ui/common/document-preview-dialog.tsx` (NEW)
  Depends on: T001, T006
  Acceptance: Client component (`use client`); props: `open`, `onClose`, `fileName`, `signedUrl` (string | null), `mimeType`; renders centered modal with dark overlay, title "Vista previa del documento", file name display; `iframe` for PDF (application/pdf), `img` for images (image/jpeg, image/png); loading state while fetching; error state "El documento no está disponible" if signedUrl null; unsupported type message with "Abrir en nueva pestaña" secondary button always available; "Cerrar" secondary button; "Abrir en nueva pestaña" button MUST be disabled or hidden until a valid signedUrl is available — never attempt to open null
  REQ: UI-11, DOC-03, DOC-08

- [ ] T026 — Redesign document upload zone with drag-and-drop
  Files: `apps/web/app/ui/documents/document-upload.tsx`
  Depends on: T009, T006, T007
  Acceptance: Drag-and-drop zone or browse file selection; document type selector dropdown; file info display (name, size); upload progress/loading state; accepted formats: PDF, JPEG, PNG; max 10 MB validation; error messages in Spanish ("Selecciona un archivo", "Selecciona un un tipo de documento"); existing server action preserved; on success: form resets, list refreshes via router.refresh()
  REQ: DOC-01, DOC-07

- [ ] T027 — Redesign document list table with StatusBadge and actions
  Files: `apps/web/app/ui/documents/document-list.tsx`
  Depends on: T010, T008, T025, T013
  Acceptance: DataTable columns: Tipo, Archivo (original name), Estatus (StatusBadge with Spanish labels: Subido→sky, Validado→green, Rechazado→red, Procesado→teal, Error→red), Fecha de carga, Acciones (Ver, Eliminar); "Eliminar" button only visible for "Subido" status; "No hay documentos cargados" when zero documents; dates formatted in Spanish locale
  REQ: DOC-02

- [ ] T028 — Wire up delete confirmation flow with ConfirmDialog
  Files: `apps/web/app/ui/documents/document-actions.tsx`
  Depends on: T013, T027
  Acceptance: "Eliminar" button opens ConfirmDialog with file name in highlighted box, message "¿Estás segura de que deseas eliminar este documento?"; Cancelar (secondary) closes modal; Eliminar (destructive) shows loading state, calls existing delete server action, closes modal on success, triggers list refresh; both buttons disabled during execution
  REQ: DOC-04, DOC-05, DOC-06

- [ ] T029 — Wire up document preview flow with DocumentPreviewDialog
  Files: `apps/web/app/ui/documents/document-actions.tsx`, `apps/web/app/ui/documents/documents-client-section.tsx`
  Depends on: T025, T027
  Acceptance: "Ver" button calls existing signed URL server action, opens DocumentPreviewDialog with loading state; on success: modal shows iframe (PDF) or img (image); on failure: error message displayed; "Abrir en nueva pestaña" secondary button enabled only after valid signedUrl resolves; "Cerrar" closes modal
  REQ: DOC-03, DOC-08

## Batch 9: Responsive Polish + Build Verification

- [ ] T030 — Apply responsive fixes across all pages
  Files: All modified page and component files
  Depends on: T001–T029 (all previous batches)
  Acceptance: Forms switch from 2-column to 1-column below 1024px; tables use internal horizontal scroll (overflow-x-auto), not global page scroll; no horizontal scrollbar on viewport at ≥1024px; sidebar and content fit within viewport; topbar does not overflow
  REQ: AC-11, FR-16 responsive scenario

- [ ] T031 — Build verification
  Files: N/A (verification task)
  Depends on: T030
  Acceptance: `npm run build` in `apps/web` completes successfully with zero TypeScript errors and no new critical warnings introduced by HU-08.
  REQ: Testing strategy (build layer)

- [ ] T032 — Lint verification
  Files: N/A (verification task)
  Depends on: T031
  Acceptance: `npm run lint` in `apps/web` completes with zero lint errors. If no lint script is configured in `package.json`, document as N/A and continue — this must NOT block verification.
  REQ: Testing strategy (lint layer)

- [ ] T033 — Manual functional flow verification
  Files: N/A (verification task)
  Depends on: T032
  Acceptance: All flows verified manually:
  - ✅ Login with valid/invalid credentials
  - ✅ Dashboard renders with metrics and recent cases
  - ✅ Create client → redirects to list with success feedback
  - ✅ Edit client → pre-filled fields, save updates
  - ✅ Client detail → personal info + associated cases table
  - ✅ Create case → redirects to list
  - ✅ Edit case → pre-filled fields, save updates
  - ✅ Case detail → 2-column layout, status change functional
  - ✅ Status badges show Spanish labels with correct colors
  - ✅ Upload document → drag-and-drop, type selector, success refresh
  - ✅ Preview document → embedded modal (iframe/img), "Abrir en nueva pestaña"
  - ✅ Delete document → ConfirmDialog, only for "Subido" status, refresh after delete
  REQ: Testing strategy (functional layer), all spec scenarios

---

## Summary

| Metric | Value |
|--------|-------|
| Total tasks | 33 |
| Batches | 9 |
| New or rewritten UI files | 12 (button, card, form-field, data-table, empty-state, page-header, confirm-dialog, document-preview-dialog, topbar, app-shell, sidebar rewrite, badge rewrite) |
| Modified files | 15 (globals.css, layout.tsx, login/page, login-form, dashboard/page, 6 client pages, 4 case pages, 4 document files) |
| Backend changes | 0 (explicitly out of scope) |

## Dependency Graph

```
Batch 1: T001 → T002,T003 → T004 → T005
Batch 2: T001 → T006,T007,T008,T009
Batch 3: T001,T006,T007 → T010,T011,T012,T013
Batch 4: T001,T006,T007,T009,T014 → T015
Batch 5: T005,T007,T010,T011 → T016
Batch 6: T005,T006,T007,T008,T009,T010,T011,T012 → T017,T018,T019,T020
Batch 7: T005,T006,T007,T008,T009,T010,T011,T012,T013 → T021,T022,T023,T024
Batch 8: T001,T006,T009,T010,T013 → T025,T026,T027,T028,T029
Batch 9: T030 (all) → T031 → T032 → T033
```
