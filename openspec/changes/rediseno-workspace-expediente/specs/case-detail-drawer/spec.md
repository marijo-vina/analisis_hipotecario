# Case Detail Drawer Specification

## Purpose

Right-side drawer displaying all available fields of a mortgage case when triggered from the workspace. Provides complete case information without leaving the page context.

## Requirements

### Requirement: Trigger and Display

The system MUST open the CaseDetailDrawer when the user clicks "Ver expediente" or the case ID in the workspace header. The drawer MUST display ALL fields from the MortgageCase entity.

#### Scenario: Click case ID opens drawer

- GIVEN case detail page with ID ending in "abc12345"
- WHEN user clicks "Ver expediente" link
- THEN CaseDetailDrawer opens from the right with title "Expediente EXP-ABC12345"

#### Scenario: Drawer shows all case fields

- GIVEN a mortgage case with all fields populated
- WHEN CaseDetailDrawer is open
- THEN displays: ID, Cliente, Asesor, Tipo de credito, Tipo de persona, Monto solicitado, Valor propiedad, Ubicacion, Plazo estimado (meses), Estado, Notas, Fecha de creacion, Fecha de actualizacion

#### Scenario: Null fields handling

- GIVEN case has null propertyValue and null estimatedTermMonths
- WHEN CaseDetailDrawer is open
- THEN those fields display as "No especificado" or are omitted

### Requirement: Drawer Independence

The system MUST allow CaseDetailDrawer to open and close independently of ClientDrawer. Both drawers MUST use the shared Drawer component.

#### Scenario: CaseDetailDrawer closes independently

- GIVEN both drawers are open (CaseDetailDrawer below, ClientDrawer on top)
- WHEN user closes CaseDetailDrawer
- THEN CaseDetailDrawer closes, ClientDrawer remains open

### Requirement: Reuse Drawer Component

The system MUST use the shared Drawer component. CaseDetailDrawer MUST only provide case-specific content and title.

#### Scenario: Consistent behavior

- GIVEN CaseDetailDrawer is open
- WHEN user clicks overlay
- THEN drawer closes (inherited from Drawer component)
