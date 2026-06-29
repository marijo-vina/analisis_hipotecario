# Client Drawer Specification

## Purpose

Right-side drawer displaying complete client details when the client name is clicked from the case detail workspace. Provides progressive disclosure of client information without leaving the case context.

## Requirements

### Requirement: Trigger and Display

The system MUST open the ClientDrawer when the client name in the case summary card is clicked. The drawer MUST display all available client fields.

#### Scenario: Click client name opens drawer

- GIVEN case detail page with client "Juan Perez Garcia"
- WHEN user clicks the client name
- THEN ClientDrawer opens from the right with title "Cliente: Juan Perez Garcia"

#### Scenario: Drawer shows all client fields

- GIVEN client with full data (name, RFC, CURP, email, phone, createdAt, updatedAt)
- WHEN ClientDrawer is open
- THEN displays: Nombre completo, RFC, CURP, Email, Telefono, Fecha de creacion, Fecha de actualizacion

#### Scenario: Missing client data

- GIVEN client record exists but some fields are null
- WHEN ClientDrawer is open
- THEN null fields display as "No disponible" or are omitted from display

### Requirement: Drawer Independence

The system MUST allow ClientDrawer to open and close independently of CaseDetailDrawer. Both drawers MUST NOT interfere with each other's state.

#### Scenario: ClientDrawer closes without affecting CaseDetailDrawer

- GIVEN CaseDetailDrawer is open
- WHEN user opens ClientDrawer
- THEN ClientDrawer overlays on top
- WHEN user closes ClientDrawer
- THEN CaseDetailDrawer remains open underneath

### Requirement: Reuse Drawer Component

The system MUST use the shared Drawer component for rendering. ClientDrawer MUST only provide content and title, not drawer mechanics.

#### Scenario: Consistent close behavior

- GIVEN ClientDrawer is open
- WHEN user presses Escape
- THEN ClientDrawer closes (inherited from Drawer component)
