# Delta for frontend-client-pages

Modifies client pages from `frontend` spec: FR-06 (list), FR-07 (create), FR-08 (detail).

## MODIFIED Requirements

### Requirement: FR-06 — Client list (Previously: basic table, "No hay clientes registrados" empty message)

The client list at `/dashboard/clientes` MUST render: PageHeader with breadcrumb and "Nuevo cliente" primary button, search input filtering by name/email, DataTable with columns (Nombre completo, Email, Teléfono, RFC, Acciones), pagination controls. Empty state SHALL render EmptyState component with icon, "No hay clientes registrados" message, and "Crear primer cliente" CTA button linking to `/dashboard/clientes/nuevo`. Text size in table SHALL be ≥14px.

Búsqueda, filtros y paginación deben preservar el comportamiento existente. No agregar nuevos contratos de API ni backend. Si alguna búsqueda/filtro/paginación no existe actualmente, solo implementar si puede hacerse en frontend con datos ya disponibles; de lo contrario, dejarlo como visual placeholder o diferirlo.

#### Scenario: Client list with data
- GIVEN registered clients → WHEN accesses `/dashboard/clientes` → THEN table shows name, email, phone, RFC, "Ver" action link
- GIVEN search term entered → WHEN types in search field → THEN table filters to matching clients by name or email

#### Scenario: Empty client list
- GIVEN zero clients → WHEN accesses `/dashboard/clientes` → THEN EmptyState with icon, message "No hay clientes registrados", CTA "Crear primer cliente"

#### Scenario: Pagination
- GIVEN more than 10 clients → WHEN navigates to page 2 → THEN `GET /clients?page=2&limit=10`, table updates

### Requirement: FR-07 — Create/Edit client form (Previously: basic form with slate styling)

The client form at `/dashboard/clientes/nuevo` and `/dashboard/clientes/[id]/editar` MUST render with two sections: (A) Datos personales — Nombre, Apellido paterno, Apellido materno, Correo, Teléfono (10 dígitos); (B) Identificación oficial — RFC (12-13 chars), CURP (18 chars). Each field SHALL use FormField component with label, input, and inline validation error. Phone MUST accept exactly 10 digits. RFC format: 12-13 alphanumeric characters. CURP format: exactly 18 alphanumeric characters. Submit button SHALL be primary variant. Cancel button SHALL return to client list.

#### Scenario: Create client success
- GIVEN valid fields (firstName, paternalLastName, email, phone) → WHEN submits form → THEN `POST /clients`, redirects to list with success feedback

#### Scenario: Validation errors inline
- GIVEN email with invalid format → WHEN submits → THEN error "Debe ser un email válido" displayed inline below email field in red

#### Scenario: Edit client pre-fill
- GIVEN existing client → WHEN accesses edit form → THEN all fields pre-filled with current values, title shows "Editar cliente"

### Requirement: FR-08 — Client detail (Previously: basic detail, no associated cases)

The client detail at `/dashboard/clientes/[id]` MUST render: PageHeader with breadcrumb (Dashboard > Clientes > [Nombre]), personal info Card showing full name, RFC, CURP, email, phone, dates, and associated cases section with DataTable. Associated cases table SHALL show expediente ID, credit type, status badge, amount, and "Ver" action link. If no associated cases, SHALL render "Sin expedientes vinculados".

#### Scenario: Client detail with cases
- GIVEN client with linked cases → WHEN accesses detail → THEN personal info card above, associated cases table below with status badges

#### Scenario: Client not found
- GIVEN non-existent client ID → WHEN accesses detail → THEN centered "Cliente no encontrado" with link to return
