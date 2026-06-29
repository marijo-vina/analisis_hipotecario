# Document Browser Specification

## Purpose

Two-column layout for case documentation: left column shows document categories with loaded document counts, right column shows a compact grid of documents for the selected category. Replaces the flat DocumentCardGrid with navigable category-based browsing.

## Requirements

### Requirement: Category List (Left Column)

The system MUST display a list of document categories in the left column. Each category MUST show the category name and the count of documents currently loaded for that category. The system MUST NOT show progress indicators (no "X/Y" or "expected" counts).

#### Scenario: Categories render with document counts

- GIVEN case has 3 ID documents, 2 income documents, 0 property documents
- WHEN DocumentBrowser renders
- THEN left column shows: "Identificacion (3)", "Comprobantes de ingresos (2)", "Documentos de la propiedad (0)"

#### Scenario: Category selection

- GIVEN DocumentBrowser is rendered
- WHEN user clicks a category
- THEN that category is highlighted/active
- AND right column updates to show documents for that category

#### Scenario: No documents in category

- GIVEN category has zero documents
- WHEN user selects that category
- THEN right column shows empty state: "No hay documentos en esta categoria"

### Requirement: Document Grid (Right Column)

The system MUST display documents for the selected category in a compact card grid. Each document card MUST show the same actions as the current DocumentCardGrid (Ver, Procesar, Reprocesar, Reintentar, Eliminar) via the shared DocumentActions component.

#### Scenario: Compact document cards render

- GIVEN selected category has 5 documents
- WHEN category is selected
- THEN right column shows 5 compact document cards in a grid layout

#### Scenario: Document actions work identically

- GIVEN a document with status "PROCESADO"
- WHEN user clicks "Reprocesar" on its card
- THEN the reprocess action executes (same behavior as current DocumentCardGrid)

### Requirement: Contextual Upload Button

The system MUST provide an "Agregar documento" button within the DocumentBrowser section. Clicking it MUST open a modal dialog for document upload. If a category is selected, the modal MUST pre-select the corresponding document type but allow the user to change it.

#### Scenario: Upload button opens modal

- GIVEN user is viewing DocumentBrowser
- WHEN user clicks "Agregar documento"
- THEN a modal dialog opens with the document upload form

#### Scenario: Category pre-selects document type

- GIVEN user has selected "Identificacion" category
- WHEN user clicks "Agregar documento"
- THEN the modal's document type selector is pre-set to the ID document type
- AND user can change the selection to a different type

#### Scenario: No category selected

- GIVEN no category is selected (initial state)
- WHEN user clicks "Agregar documento"
- THEN the modal opens with no pre-selected document type

### Requirement: Default Category Selection

The system MUST select the first category with documents by default on initial render. If no documents exist, no category is selected by default.

#### Scenario: First category with documents auto-selected

- GIVEN case has documents in "Identificacion" and "Comprobantes de ingresos"
- WHEN DocumentBrowser first renders
- THEN "Identificacion" is selected and its documents show in the right column

#### Scenario: No documents, no selection

- GIVEN case has zero documents
- WHEN DocumentBrowser first renders
- THEN no category is highlighted, right column shows "Selecciona una categoria para ver documentos"

### Requirement: Reuse Existing Components

The system MUST reuse DocumentActions for document action buttons. The system MUST NOT modify DocumentActions or ExtractionSection.

#### Scenario: DocumentActions render unchanged

- GIVEN a document card in the browser
- WHEN rendered
- THEN DocumentActions component renders with identical behavior to current implementation
