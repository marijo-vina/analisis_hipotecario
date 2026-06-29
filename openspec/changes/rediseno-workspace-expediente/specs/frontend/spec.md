# Delta for Frontend

## MODIFIED Requirements

### Requirement: FR-11: Detalle de expediente

The system MUST render the case detail page at `/dashboard/expedientes/[id]` as a compact workspace with progressive disclosure. The layout MUST include: compact header with back arrow, breadcrumb, status badge, Edit and Change Status buttons; reduced summary card with client name (clickable), person type, credit type, and amount; editable observations below summary; two-column document browser (categories left, document grid right); extracted data full-width below; and NO financial analysis card.

#### Scenario: Workspace layout renders correctly
(Previously: 3-column grid with static cards for summary, client, observations, and financial analysis)

- GIVEN a valid mortgage case with documents
- WHEN user navigates to `/dashboard/expedientes/{id}`
- THEN page shows: compact header, summary card (4 fields), observations editor, document browser (2 columns), extraction section full-width
- AND no "Analisis financiero" card is present

#### Scenario: Client name opens drawer
(Previously: client info displayed inline in a static card)

- GIVEN case detail page with associated client
- WHEN user clicks the client name in the summary card
- THEN ClientDrawer opens from the right with full client details

#### Scenario: Case detail opens drawer
(Previously: all case fields displayed inline in FieldGrid)

- GIVEN case detail page
- WHEN user clicks "Ver expediente" or the case ID
- THEN CaseDetailDrawer opens from the right with all MortgageCase fields

#### Scenario: Status change via header button
(Previously: CaseStatusDropdown rendered in a Card in the right sidebar)

- GIVEN case detail page
- WHEN user clicks "Cambiar estado" in the compact header
- THEN inline status dropdown appears
- WHEN user selects a status and clicks "Cambiar"
- THEN status updates, page revalidates, badge reflects new status

#### Scenario: Non-existent case
(Previously: same behavior)

- GIVEN id inexistente
- WHEN user accesses the page
- THEN 404, shows "Expediente no encontrado"

### Requirement: FR-08: Detalle de cliente

The system MUST display client details in `/dashboard/clientes/[id]` AND provide a ClientDrawer accessible from the case detail workspace when the client name is clicked.

#### Scenario: Client name is clickable from case detail
(Previously: client name was static text, no navigation from case detail)

- GIVEN case detail page with client "Juan Perez"
- WHEN user clicks the client name
- THEN ClientDrawer opens showing full client details (name, RFC, CURP, email, phone, dates)

## REMOVED Requirements

### Requirement: FR-11 original layout (3-column grid with static cards)

(Reason: Replaced by compact workspace layout with progressive disclosure via drawers)
(Migration: None — the old layout components (PageHeader with full title, FieldGrid with all case fields, separate client card, financial analysis card) are superseded by the new workspace components)
