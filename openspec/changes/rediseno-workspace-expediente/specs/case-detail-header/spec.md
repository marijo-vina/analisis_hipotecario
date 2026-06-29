# Case Detail Header Specification

## Purpose

Compact header for mortgage case detail page replacing the full PageHeader component. Provides minimal navigation, case identification, status badge, and primary action buttons in a single compact row.

## Requirements

### Requirement: Compact Header Layout

The system MUST render a compact header row containing: back arrow navigation, breadcrumb trail, case ID label, status badge, Edit button, and Change Status button. All elements MUST fit on a single horizontal row at 1440px viewport width.

#### Scenario: Default rendering

- GIVEN a valid mortgage case with status "Pendiente de documentos"
- WHEN the case detail page loads
- THEN header shows back arrow, breadcrumb "Dashboard > Expedientes > EXP-XXXXXXXX", status badge (amber), "Editar" button, and "Cambiar estado" button on one row

#### Scenario: Back navigation

- GIVEN user is on case detail page `/dashboard/expedientes/{id}`
- WHEN user clicks the back arrow
- THEN navigates to `/dashboard/expedientes`

#### Scenario: Breadcrumb navigation

- GIVEN user is on case detail page
- WHEN user clicks "Dashboard" in breadcrumb
- THEN navigates to `/dashboard`
- WHEN user clicks "Expedientes" in breadcrumb
- THEN navigates to `/dashboard/expedientes`

### Requirement: Status Badge Display

The system MUST display the current case status using the shared StatusBadge component with correct color mapping per frontend-status-change spec.

#### Scenario: Status badge renders with correct color

- GIVEN case status code is "IN_REVIEW"
- WHEN header renders
- THEN StatusBadge shows "En revision" in blue

### Requirement: Action Buttons

The system MUST provide two action buttons: "Editar" (navigates to edit page) and "Cambiar estado" (toggles inline status selector). Buttons MUST be compact (reduced padding, smaller text than primary page-level buttons).

#### Scenario: Edit button navigation

- GIVEN user is viewing case detail
- WHEN user clicks "Editar"
- THEN navigates to `/dashboard/expedientes/{id}/editar`

#### Scenario: Change status toggle

- GIVEN user is viewing case detail
- WHEN user clicks "Cambiar estado"
- THEN inline status dropdown appears below the header row (not in a drawer)
- WHEN user clicks "Cambiar estado" again while dropdown is open
- THEN dropdown closes

### Requirement: Mobile Fallback

The system MUST stack header elements vertically on viewports below 768px width. Back arrow and breadcrumb on first row, case ID and status badge on second row, action buttons on third row.

#### Scenario: Mobile stacking

- GIVEN viewport width is 600px
- WHEN header renders
- THEN elements stack in three rows: (1) back arrow + breadcrumb, (2) case ID + status badge, (3) Edit + Change Status buttons
