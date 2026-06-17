# Delta for frontend-case-pages

Modifies case pages from `frontend` spec (FR-09, FR-10, FR-11) and `frontend-status-change` spec (FR-0511, FR-0513, FR-0514).

## MODIFIED Requirements

### Requirement: FR-09 — Case list (Previously: basic table, no filters, StatusBadge with technical codes)

The case list at `/dashboard/expedientes` MUST render: PageHeader with "Nuevo expediente" primary button, filter bar with dropdowns for Cliente, Estatus, Tipo de crédito, DataTable with columns (Cliente, Tipo crédito, Estado, Monto, Avance docs, Fecha, Acciones). Status column SHALL use StatusBadge with human-readable Spanish names. Document progress column SHALL show percentage or count indicator. Empty state SHALL render EmptyState with "No hay expedientes" and "Crear primer expediente" CTA.

Búsqueda, filtros y paginación deben preservar el comportamiento existente. No agregar nuevos contratos de API ni backend. Si alguna búsqueda/filtro/paginación no existe actualmente, solo implementar si puede hacerse en frontend con datos ya disponibles; de lo contrario, dejarlo como visual placeholder o diferirlo.

#### Scenario: Case list with filters
- GIVEN expedientes exist → WHEN selects filter "En revisión" → THEN table shows only cases with that status
- GIVEN expedientes exist → WHEN types client name in search → THEN table filters to matching records

#### Scenario: Status badges use Spanish labels
- GIVEN case with status `IN_REVIEW` → WHEN rendered in table → THEN badge shows "En revisión" in blue, never "IN_REVIEW"

#### Scenario: Empty case list
- GIVEN zero expedientes → WHEN accesses list → THEN EmptyState with CTA "Crear primer expediente"

### Requirement: FR-10 — Create/Edit case form (Previously: basic form, technical codes in labels)

The case form at `/dashboard/expedientes/nuevo` and `/dashboard/expedientes/[id]/editar` MUST render with fields: Cliente (searchable selector), Tipo de crédito (dropdown with human-readable names, e.g. "Crédito Hipotecario" not "HIPOTECARIO"), Tipo de persona: usar etiquetas humanas del catálogo actual. Para el MVP principal, mostrar "Asalariado". No mostrar códigos técnicos ni valores entre paréntesis., Ubicación de la propiedad, Monto solicitado, Valor de la propiedad, Plazo estimado (meses), Observaciones. All labels SHALL be in Spanish with clear business meaning. Fields SHALL use FormField component. Submit saves to `POST /mortgage-cases`. Cancelar: en crear expediente vuelve a `/dashboard/expedientes`; en editar expediente vuelve a `/dashboard/expedientes/[id]`.

#### Scenario: Create case with human-readable labels
- GIVEN form rendered → WHEN advisor views credit type dropdown → THEN options show "Crédito Hipotecario", "Mejora de Hipoteca", etc. — never technical codes
- GIVEN valid fields → WHEN submits → THEN redirects to case list

### Requirement: FR-11 — Case detail (Previously: basic layout, no document section)

The case detail at `/dashboard/expedientes/[id]` MUST render: PageHeader with breadcrumb, title, and status badge; 2-column layout — left column: summary card (monto, tipo crédito, ubicación, plazo) + client card (name, email, phone); right column: documents section (DocumentList component) + observations card + financial analysis placeholder ("Análisis financiero próximamente"). Status change dropdown and "Cambiar" button SHALL remain functional and use new Button styling.

#### Scenario: Case detail layout
- GIVEN case with documents → WHEN accesses detail → THEN left column shows summary+client, right column shows documents+observations+placeholder

#### Scenario: Status change preserved
- GIVEN case detail → WHEN advisor selects new status in dropdown and clicks "Cambiar" → THEN status updates, page revalidates, badge shows new color

### Requirement: FR-0511 — StatusBadge mapping (Previously: technical status codes like PENDING_DOCUMENTS, DOCUMENTS_UPLOADED)

StatusBadge MUST map to human-readable Spanish names with institutional color scheme:
| Status Code | Spanish Label | Color |
|---|---|---|
| PENDING_DOCUMENTS | Pendiente de documentos | amber |
| DOCUMENTS_UPLOADED | Documentos cargados | sky |
| PROCESSING | En procesamiento | indigo |
| IN_REVIEW | En revisión | blue |
| OBSERVED | Observado | red |
| CLOSED | Cerrado | slate |
| REJECTED | Rechazado | red |

Defensive fallback (neutral gray) allowed ONLY for unexpected codes not in the 7-code map.

#### Scenario: Badge renders Spanish label
- GIVEN case status OBSERVED → WHEN badge renders → THEN displays "Observado" with red background, never "OBSERVED"
