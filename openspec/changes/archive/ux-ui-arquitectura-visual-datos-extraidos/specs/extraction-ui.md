# Delta Spec: Extraction UI Architecture

## ADDED Requirements

### Requirement: frontend-extraction-section

The system MUST render a tabbed "Datos extraídos" section below the documents area on the case detail page. The section SHALL only appear when at least one document has `PROCESSED` status. It MUST include an operational summary bar, tab navigation, and a global AlertBanner (visible only when alerts exist).

#### Scenario: Section renders with processed documents
- GIVEN a case with at least 1 document in `PROCESSED` status
- WHEN the asesora views the case detail page
- THEN the "Datos extraídos" section renders below documents with summary bar, tabs, and content

#### Scenario: Section hidden with no processed documents
- GIVEN a case with 0 documents in `PROCESSED` status
- WHEN the asesora views the case detail page
- THEN the "Datos extraídos" section is NOT rendered

#### Scenario: Summary bar shows operational counts
- GIVEN a case with 2 identity docs processed, 3 payroll docs (2 processed), 3 bank statements (0 processed), 0 bureau docs
- WHEN the section renders
- THEN the summary bar displays: `Identidad ✓ | Nómina 2/3 ⚠ | Estados de cuenta 0/3 | Buró pendiente`

#### Scenario: AlertBanner visible only with alerts
- GIVEN 1 critical and 1 warning alert across extraction data
- WHEN the section renders
- THEN AlertBanner shows severity counts with links to affected tab/card
- GIVEN 0 alerts exist
- THEN AlertBanner is NOT rendered

### Requirement: frontend-extraction-identidad

The system MUST display identity extraction data per document using a FieldGrid with: Tipo de documento, Nombre completo, Fecha de nacimiento, CURP, Clave de elector (INE only), Número de documento, Vigencia. A manual validation card SHALL show CIC and Identificador del ciudadano with CopyButton.

#### Scenario: INE fields render with all detected values
- GIVEN an INE document processed with all fields detected
- WHEN the Identidad tab is active
- THEN FieldGrid shows all 7 fields with extracted values

#### Scenario: Expired document shows badge
- GIVEN an INE document with `vigencia` in the past
- WHEN the Identidad tab renders
- THEN a "Documento vencido" badge appears on the document card

#### Scenario: Manual validation card renders
- GIVEN an INE document with CIC and citizen identifier
- WHEN the Identidad tab is active
- THEN a card shows CIC and Identificador del ciudadano, each with a CopyButton

### Requirement: frontend-extraction-nomina

The system MUST render a consolidated summary card at the top of the Nómina tab, followed by an expandable DataTable of individual receipts. The summary card SHALL show: recibos procesados, periodos, empleado, RFC, empleador, ingreso bruto/neto promedio, timbrado status, alertas.

#### Scenario: Consolidated summary renders at tab top
- GIVEN 3 processed payroll receipts
- WHEN the Nómina tab is active
- THEN a summary card shows counts, employee name, RFC, employer, average gross/net income, timbrado status, and alert count

#### Scenario: Expandable table shows receipt rows
- GIVEN 2+ payroll receipts
- WHEN the Nómina tab renders
- THEN a DataTable shows columns: Periodo, Fecha de pago, Periodicidad, Ingreso bruto, Deducciones, Ingreso neto, Timbrado/QR, Alertas, Acción "Ver detalle"

#### Scenario: Expanded row shows detailed data
- GIVEN a receipt row is expanded
- WHEN the row expands
- THEN it reveals: Datos del empleado, Datos del empleador, Percepciones, Deducciones, Percepciones variables, Alertas del recibo, and contextual access to the original document

### Requirement: frontend-extraction-shells

The system MUST render Estados de cuenta and Buró tabs with EmptyState components when no extraction data is available, using meaningful Spanish messages.

#### Scenario: Estados de cuenta shows empty state
- GIVEN no bank statement extraction data exists
- WHEN the Estados de cuenta tab is active
- THEN an EmptyState displays: "Los datos de estados de cuenta se mostrarán aquí una vez procesados"

#### Scenario: Buró shows empty state
- GIVEN no credit bureau extraction data exists
- WHEN the Buró tab is active
- THEN an EmptyState displays a meaningful message indicating data will appear once processed

### Requirement: frontend-extraction-alerts

The system MUST provide a two-tier alert architecture: a global AlertBanner (aggregate counts with deep links) and per-document alerts inside cards. Alerts SHALL be deduplicated by alert code. Only WARNING and CRITICAL severities SHALL be displayed; INFO SHALL be hidden.

#### Scenario: Global banner aggregates alerts
- GIVEN 2 critical alerts in Identidad and 1 warning in Nómina
- WHEN the section renders
- THEN AlertBanner shows "2 críticas · 1 advertencia" with links to respective tabs

#### Scenario: Per-document alerts render inside cards
- GIVEN a document card has 2 alerts
- WHEN the card is expanded
- THEN alerts render inside the card body with severity indicators

#### Scenario: INFO alerts are hidden
- GIVEN an alert with INFO severity
- WHEN alerts are rendered
- THEN the INFO alert does NOT appear in the banner or per-document list

### Requirement: frontend-extraction-correction

The system MUST provide per-field manual correction UX with three visual states: **IA extraído** (default), **Pendiente/No detectado** (missing/null), and **Editado manualmente** (corrected). A "Completar" button SHALL appear on missing fields; an "Editar" (pencil) button SHALL appear on existing fields. Editing SHALL be contextual and per-field via inline input or popover. After save, the field SHALL show an "Editado manualmente" chip. No raw JSON SHALL be displayed. Persistence is NOT in scope.

#### Scenario: Missing field shows Completar
- GIVEN a field with null or undetected value
- WHEN the field renders
- THEN it shows "—" with an amber dot and a "Completar" button

#### Scenario: Existing field shows Editar
- GIVEN a field with an extracted value
- WHEN the field renders
- THEN it shows the value with a pencil icon for "Editar"

#### Scenario: Inline editor opens and saves
- GIVEN the asesora clicks "Completar" on a missing field
- WHEN they type a value and click "Guardar"
- THEN the field transitions to "Editado manualmente" state with a chip indicator

#### Scenario: Only one field editable at a time
- GIVEN a card with multiple fields
- WHEN the asesora opens the inline editor on one field
- THEN other fields remain non-editable

### Requirement: frontend-document-consultation

The system MUST provide a right-side document consultation drawer. On desktop (≥1024px) it SHALL be 480px-560px wide; on mobile/tablet (<1024px) it SHALL be full-screen. It SHALL load PDF/image via iframe or img. It SHALL be triggered from "Validar manualmente" actions. It SHALL NOT replace the existing "Ver" button on the document table. It SHALL close via backdrop click, Escape key, or Cerrar button.

#### Scenario: Drawer opens on desktop
- GIVEN desktop viewport (≥1024px)
- WHEN the asesora clicks "Validar manualmente"
- THEN a 480-560px drawer slides from the right with the document preview

#### Scenario: Drawer is full-screen on mobile
- GIVEN mobile/tablet viewport (<1024px)
- WHEN the drawer opens
- THEN it covers the full screen

#### Scenario: Drawer closes via multiple methods
- GIVEN the drawer is open
- WHEN the asesora clicks the backdrop, presses Escape, or clicks "Cerrar"
- THEN the drawer closes and the extraction section is fully visible

### Requirement: frontend-extraction-components

The system MUST provide the following reusable components: `FieldGrid` (dl/grid for key-value pairs), `ExtractionSection` (section container), `ExtractionCategoryTabs` (tab navigation), `ExtractionDocumentCard` (collapsible card per document), `ExtractionSummaryBar` (operational summary), `AlertBanner` (global alert aggregation), `DocumentConsultationDrawer` (document viewer), `InlineFieldEditor` (inline correction input), `ManualCorrectionIndicator` (chip/badge for correction state).

#### Scenario: Components are independently importable
- GIVEN any component from the inventory
- WHEN imported from its module path
- THEN it renders without requiring sibling components

### Requirement: frontend-extraction-page-integration

The system MUST integrate the extraction section into the case detail page by removing the monolithic `ExtractionResults` and `getExtraction` logic from `page.tsx`, replacing them with a new `ExtractionSection` client component import. The section SHALL render below the documents section. The page SHALL be responsive at ≥1024px. No raw JSON SHALL appear anywhere.

#### Scenario: Page uses new ExtractionSection
- GIVEN the case detail page is loaded
- WHEN the page renders
- THEN it imports and renders `ExtractionSection` as a client component below documents

#### Scenario: Old extraction logic removed
- GIVEN the previous `page.tsx` with `ExtractionResults` and `getExtraction`
- WHEN the change is applied
- THEN those functions are removed from `page.tsx`

## Non-Functional

| ID | Requirement |
|----|-------------|
| NFR-EXT-01 | All user-facing text MUST be in Spanish (Mexico) |
| NFR-EXT-02 | The extraction section MUST be responsive at viewports ≥1024px |
| NFR-EXT-03 | Document consultation drawer MUST be full-screen at viewports <1024px |
| NFR-EXT-04 | No raw JSON SHALL be displayed to the user anywhere in the interface |
| NFR-EXT-05 | Components MUST use existing HU-08 design tokens (--gf-red, --gf-bg, --gf-surface, --gf-border, --gf-text, --gf-text-muted) |
| NFR-EXT-06 | Tab state SHOULD be restorable via URL hash (#extraccion) |
| NFR-EXT-07 | AlertBanner deep links SHOULD use smooth scroll to the affected card |
| NFR-EXT-08 | The drawer SHALL lazy-load document content on first open (performance) |
