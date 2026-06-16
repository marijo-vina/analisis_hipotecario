# Delta for frontend-ui-shell

Modifies layout shell from `frontend` spec FR-16 and route design (Section 4).

## MODIFIED Requirements

### Requirement: FR-16 — Navegación entre módulos (Previously: simple sidebar with emoji icons, slate palette, no topbar)

The system MUST render an application shell on all `/dashboard/*` routes consisting of: Sidebar (260px width, #111111 bg, brand logo, nav items with active state via #B0002A accent, logout at bottom) and Topbar (72px height, search input, quick actions, "Nuevo expediente" button, notification bell, user avatar/name). Content area SHALL have 32px padding and #FFF7F7 warm background. Layout MUST NOT overflow horizontally at viewport widths ≥1024px.

#### Scenario: Sidebar navigation
- GIVEN asesora autenticada → WHEN on any `/dashboard/*` route → THEN sidebar visible with brand, nav items for Dashboard/Clientes/Expedientes, logout button
- GIVEN asesora on `/dashboard/clientes` → WHEN sidebar renders → THEN "Clientes" nav item highlighted with active state

#### Scenario: Topbar presence
- GIVEN asesora autenticada → WHEN on any `/dashboard/*` route → THEN topbar visible with search, quick actions, "Nuevo expediente" button, notifications, user avatar

#### Scenario: Content area styling
- GIVEN any `/dashboard/*` page → WHEN rendered → THEN content area has 32px padding, background #FFF7F7, white cards with #F0C9CF border

#### Scenario: Responsive at ≥1024px
- GIVEN viewport width ≥1024px → WHEN any `/dashboard/*` page renders → THEN no horizontal scrollbar on the viewport, sidebar and content fit within viewport

### Requirement: Login page visual redesign (Previously: slate background, basic centered card)

The login page (`/login`) MUST render with warm background (#FFF7F7), centered brand logo and platform name ("Gestión Financiera"), login card with white bg, #F0C9CF border, radius 12px. Form fields SHALL use FormField component styling. Error messages SHALL appear inline below fields and as general form banner.

#### Scenario: Login visual identity
- GIVEN user navigates to `/login` → WHEN page renders → THEN warm background, centered brand logo "Gestión Financiera", white card with institutional border
- GIVEN invalid credentials submitted → WHEN error returned → THEN inline error below email/password field, not raw technical message

### Requirement: Dashboard page redesign (Previously: simple module cards with links)

The dashboard (`/dashboard`) MUST render a greeting ("Hola, [nombre]"), operational summary with 4 metric cards (Activos, Pendientes, En revisión, Cerrados), recent cases table (last 5), and pending tasks section. Each metric card SHALL show label, count, and status-colored accent. Empty sections SHALL render EmptyState component with appropriate message.

#### Scenario: Dashboard with data
- GIVEN asesora with active cases → WHEN visits `/dashboard` → THEN sees greeting, metric cards with counts, recent cases table, pending tasks
- GIVEN no cases exist → WHEN visits `/dashboard` → THEN metric cards show zero, empty states with CTAs for "Nuevo expediente"

## ADDED Requirements

### Requirement: AC-11 — Responsive consistency

The shell layout MUST render without horizontal overflow at ≥1024px. Tables with wide content SHALL use internal horizontal scroll, not global page scroll. Forms SHALL switch from 2-column to 1-column layout at breakpoints below 1024px.

#### Scenario: Wide table overflow
- GIVEN a table with 8+ columns → WHEN viewport is 1024px → THEN table has internal horizontal scrollbar, page does NOT have horizontal scrollbar
