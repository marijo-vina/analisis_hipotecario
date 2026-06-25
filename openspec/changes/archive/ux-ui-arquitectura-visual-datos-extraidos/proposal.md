# Proposal: UX/UI Architecture for Extracted Data Section

## Intent

The current case detail page renders extracted data as a hardcoded, vertical 2-column card grid tied exclusively to INE identity fields. As the platform adds payroll (nómina), bank statements, and credit bureau extraction, this pattern will produce an extremely long, unmanageable page with no information hierarchy. This change delivers a scalable, tabbed extraction section—"Datos extraídos"—below the documents area, organized by domain category (Identidad, Nómina, Estados de cuenta, Buró). It also introduces a manual data correction pattern so the asesora can complete or edit fields when OCR/AI extraction is incomplete or incorrect, without losing context of the original document.

## Scope

### In Scope
- New tabbed "Datos extraídos" section container and category tabs
- Operational summary bar (category-level counts and alert status only)
- Global AlertBanner with severity aggregation and tab/card deep links
- Collapsible `ExtractionDocumentCard` per document instance
- **Identidad tab**: INE/passport FieldGrid + manual validation card (CIC, Identificador ciudadano)
- **Nómina tab**: Consolidated summary card + individual receipt cards/rows with field-level correction actions
- **Estados de cuenta tab**: UI shell with empty state / placeholder (full extraction deferred)
- **Buró tab**: UI shell with empty state / placeholder (full extraction deferred)
- Manual correction UX per field: "Completar", "Editar", "Editado manualmente" indicator
- Document consultation drawer/side viewer to validate against original document without leaving the page
- Reusable `FieldGrid` extracted from current `page.tsx` helper
- Visual differentiation of IA-extracted vs manually corrected vs pending-review data
- Proposed traceability schema (DB/API) for original vs corrected values

### Out of Scope
- Backend OCR/AI engine improvements
- New extraction endpoints for Nómina, Estados de cuenta, or Buró (UI shells only in MVP)
- Full financial calculations or mixed-income logic (CSF, independent activity)
- Cross-category validation tab ("Resumen") — deferred to Sprint 3
- Financial amounts in the summary bar (by design)
- Full audit log UI for traceability (schema designed, UI deferred)
- Raw JSON display anywhere in the interface
- Changes to the HU-08 visual identity (colors, typography, shell layout)

## Capabilities

### New Capabilities
- `frontend-extraction-section`: Tabbed container for extracted data with summary bar and alert banner
- `frontend-extraction-correction`: Per-field manual completion/editing with source indication
- `frontend-document-consultation`: Inline document viewer drawer for validation context

### Modified Capabilities
- `frontend-case-pages`: Case detail page gains extraction section below documents; `getExtraction` logic decoupled from page component
- `frontend-ui-components`: `FieldGrid` promoted to reusable component; `DataTable` reused for tabular extraction data

## Approach

1. **Component-first**: Build `FieldGrid`, `ExtractionSummaryBar`, `AlertBanner`, `ExtractionCategoryTabs`, `ExtractionDocumentCard`, and `DocumentConsultationDrawer` before touching the page.
2. **Decouple extraction logic**: Move `getExtraction` and `ExtractionResults` out of `page.tsx` into a dedicated `app/dashboard/expedientes/[id]/extraction/` directory with category-specific renderers.
3. **Tabbed section**: Render the extraction section as a client component (to manage tab state, collapsed cards, and drawer) inside the server page. Use URL hash (`#extraccion`) for direct navigation to the section; optional query param for active tab if state persistence is needed.
4. **Correction pattern**: Each extracted field is rendered via `FieldGrid` with an optional action slot. Missing or null values show "Completar"; existing values show "Editar" (pencil). After save, the field shows a "Editado manualmente" chip. State is managed locally per card; corrections are persisted through a lightweight API contract.
5. **Document viewer**: A right-side drawer (fixed width ~480px on desktop) slides over the page. It loads the original document file (PDF/image) via existing document preview endpoints. The asesora can scroll the document while the extraction card remains visible behind a backdrop.
6. **Design tokens**: Use existing HU-08 CSS custom properties (`--gf-red`, `--gf-bg`, `--gf-surface`, `--gf-border`, `--gf-text`, `--gf-text-muted`) and Tailwind `@theme` utilities. No new palette introduction.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/web/app/dashboard/expedientes/[id]/page.tsx` | Modified | Remove monolithic `ExtractionResults` and `getExtraction`; import new `ExtractionSection` client component |
| `apps/web/app/dashboard/expedientes/[id]/extraction/` | Created | Category renderers, tab container, document cards, and correction logic |
| `apps/web/app/ui/common/field-grid.tsx` | Created | Reusable `FieldGrid` extracted from current `Field` helper |
| `apps/web/app/ui/extraction/` | Created | `ExtractionSection`, `ExtractionCategoryTabs`, `ExtractionDocumentCard`, `ExtractionSummaryBar`, `AlertBanner` |
| `apps/web/app/ui/documents/document-consultation-drawer.tsx` | Created | Drawer component for original document preview during validation |
| `apps/web/app/ui/common/data-table.tsx` | Reused | Payroll receipts, bank movements, credit bureau lists |
| `apps/web/app/ui/common/card.tsx` | Reused | Extraction document cards and summary containers |
| `apps/web/app/ui/common/badge.tsx` | Reused | Status and severity chips inside extraction cards |
| `apps/web/app/ui/common/button.tsx` | Reused | "Completar", "Editar", and drawer trigger actions |
| `apps/web/app/ui/common/copy-button.tsx` | Reused | CIC, citizen identifier, CURP, account numbers |
| `apps/web/app/ui/common/empty-state.tsx` | Reused | Tabs with no processed documents yet |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|-------------|
| Manual correction state becomes complex across many cards | Med | Keep state local to each card; use React `useReducer` per card. Lift only when URL persistence is required. |
| Document viewer drawer performs poorly with large PDFs | Med | Use native `<iframe src>` or browser PDF viewer; lazy-load drawer content on first open. |
| Scope creep into full financial engine or mixed-income logic | Med | Enforce strict MVP table; financial amounts stay inside modules. |
| Tab switching causes scroll position loss on long pages | Low | Keep tab state in query param or hash so refresh restores position; use `scroll-behavior: smooth` for banner deep links. |
| Backend contracts for Nómina/Buró extraction not ready | Med | Build UI shells with `EmptyState` and mock data shapes; align DTOs in parallel. |

## Rollback Plan

Revert changes in `apps/web/app/dashboard/expedientes/[id]/page.tsx`, delete the new `extraction/` and `ui/extraction/` directories, and restore the previous `ExtractionResults` block from git history. No database migrations are required for the MVP UI. If the traceability schema was added to Prisma, a follow-up migration rollback would be needed.

## Dependencies

- HU-08 reusable components (`Card`, `DataTable`, `Badge`, `Button`, `CopyButton`, `EmptyState`) must be present and stable.
- Existing document preview endpoint (or file URL) must be accessible for the consultation drawer.
- Backend extraction response shape for INE is already defined; shapes for Nómina, Estados de cuenta, and Buró should be agreed upon before full tab implementation (UI shells can proceed without them).

## Success Criteria

- [ ] Tabbed extraction section renders below documents on the case detail page
- [ ] Summary bar shows operational counts per category (e.g., `Identidad ✓ | Nómina 2/3 ⚠ | Estados de cuenta 0/3 | Buró pendiente`)
- [ ] AlertBanner appears only when alerts exist and links to the affected tab/card
- [ ] Identidad tab displays INE/passport fields and the manual validation card (CIC, Identificador ciudadano)
- [ ] Nómina tab shows a consolidated summary card plus collapsible receipt cards/rows
- [ ] Estados de cuenta and Buró tabs render with an appropriate empty state or placeholder
- [ ] "Completar" action appears on missing fields; "Editar" appears on existing fields
- [ ] After saving a correction, the field shows an "Editado manualmente" indicator
- [ ] Document consultation drawer opens without navigating away from the page
- [ ] No raw JSON is displayed; all data is rendered via components
- [ ] No TypeScript or build errors
- [ ] Responsive at ≥1024px

---

## Visual Architecture

```
+-------------------------------------------------------------------+
| PageHeader (breadcrumbs, title, actions, status badge)            |
+-------------------------------------------------------------------+
| 2-col grid                                                        |
|  +------------------------------+  +---------------------------+  |
|  | Resumen del expediente       |  | Observaciones             |  |
|  | Cliente asociado             |  | Análisis financiero       |  |
|  +------------------------------+  +---------------------------+  |
+-------------------------------------------------------------------+
| Documents section (upload + document table)                       |
+-------------------------------------------------------------------+
| DATOS EXTRAÍDOS                                                   |
| +---------------------------------------------------------------+ |
| | SummaryBar                                                    | |
| | Identidad ✓ | Nómina 2/3 ⚠ | Estados de cuenta 0/3 | Buró …  | |
| +---------------------------------------------------------------+ |
| | [AlertBanner] 2 críticas · 1 advertencia  [Ver →]             | |
| +---------------------------------------------------------------+ |
| | [Tabs] Identidad | Nómina | Estados de cuenta | Buró          | |
| +---------------------------------------------------------------+ |
| | +-----------------------------------------------------------+ | |
| | | ExtractionDocumentCard  ▼ (expanded because alerts)       | | |
| | | header: INE · PROCESSED · 2 alertas                       | | |
| | | body: FieldGrid (CURP, Nombre, Vigencia…)                 | | |
| | |       [Completar] [Editar] [Validar manualmente]          | | |
| | +-----------------------------------------------------------+ | |
| | +-----------------------------------------------------------+ | |
| | | ExtractionDocumentCard  ▶ (collapsed, clean)              | | |
| | | header: INE · PROCESSED · 0 alertas                       | | |
| | +-----------------------------------------------------------+ | |
| +---------------------------------------------------------------+ |
+-------------------------------------------------------------------+
| [DocumentConsultationDrawer] slides from right (480px)           |
|  +-------------------------------------------------------------+ |
|  | Original document (PDF/image preview)                       | |
|  +-------------------------------------------------------------+ |
+-------------------------------------------------------------------+
```

## Tab Structure

### Identidad
- **Content per document**: `FieldGrid` with Tipo de documento, Nombre completo, Fecha de nacimiento, CURP, Clave de elector (INE only), Número de documento, Vigencia/Expiración.
- **Manual validation card**: CIC, Identificador del ciudadano, with `CopyButton` and link to Lista Nominal.
- **Correction actions**: `Completar` on missing fields (e.g., CURP not detected), `Editar` on any field, `Validar manualmente` to open the document drawer.
- **Alerts**: Embedded per-document; vencido badge if `isExpired`.

### Nómina
- **Level A — Consolidated summary card** (always visible at top of tab):
  - Recibos procesados (count)
  - Periodos detectados
  - Nombre del empleado
  - RFC del empleado
  - Empleador(es) detectado(s)
  - Ingreso bruto promedio
  - Ingreso neto promedio
  - Timbrado detectado (yes/no per receipt)
  - Alertas principales
- **Level B — Individual receipt cards/rows**:
  - Collapsible card per receipt (or row in a summary table, expandable to card)
  - Periodo, Fecha de pago, Periodicidad, Ingreso bruto, Deducciones, Ingreso neto, Timbrado/QR status, Alertas
  - Action to open detail view if needed
- **Correction actions**: Apply to employee RFC, net income, gross income, period, payment date, timbrado.

### Estados de cuenta
- **MVP**: UI shell with `EmptyState` ("Los datos de estados de cuenta se mostrarán aquí una vez procesados").
- **Future**: Per-statement card with account info (`FieldGrid`) + `DataTable` of movements (Fecha, Concepto, Depósito/Retiro, Saldo). Correction actions on payroll deposits, date, amount, concept.

### Buró
- **MVP**: UI shell with `EmptyState`.
- **Future**: `DataTable` of credits (Saldo actual, Monto de pago, Tipo de crédito, Alertas) + alert list. Correction actions on current balance, payment amount, credit type, alerts.

## Manual Correction UX

### Field States
Each rendered field can be in one of three visual states:

1. **IA extraído** (default): Normal text rendering. Optional subtle "IA" chip (muted) to indicate origin.
2. **Pendiente de revisión**: Missing, null, or low-confidence value. Rendered as "—" with an amber dot and `Completar` button.
3. **Editado manualmente**: Value corrected by the asesora. Renders with a pencil chip and muted "Editado manualmente" label. Tooltip or small expandable area can show original IA value (future).

### Actions
- **Completar**: Shown when the field value is missing/null. Opens a small inline input or popover directly below the field label. The asesora types the value, clicks **Guardar**, and the field transitions to `Editado manualmente`.
- **Editar**: Shown as a pencil icon next to existing values. Opens the same inline editor pre-filled with the current value. Saving transitions the state to `Editado manualmente`.
- **Validar manualmente**: Shown next to fields that require cross-checking against the physical/digital document (e.g., CIC, citizen identifier, CURP). Opens the `DocumentConsultationDrawer` with the original document loaded. The field being validated is visually highlighted (ring or background tint) in the extraction card.

### Editing Rules
- Editing is **contextual and per-field** (or per small section). Never present all fields as editable simultaneously.
- Use inline inputs or a compact popover, not a full-page form.
- No raw JSON is ever exposed to the asesora.
- On save, the UI updates optimistically; the API persists the correction asynchronously.

## Document Consultation Pattern

### Recommendation: Right-Side Drawer
To avoid forcing the asesora to open the document in another tab and lose context, the original document is shown in a **right-side drawer** (`DocumentConsultationDrawer`).

### Behavior
- **Trigger**: Clicking `Validar manualmente` on any field opens the drawer.
- **Layout**: On desktop (≥1024px), the drawer is a fixed 480px panel sliding from the right over the page content. The extraction section remains partially visible behind a semi-transparent backdrop, so the asesora never loses orientation.
- **Content**: The drawer loads the document file (PDF or image) via an `<iframe>` or `<img>` using the existing document file URL. A small header shows the document filename and a **Cerrar** button.
- **Interaction**: The asesora can zoom/scroll the document inside the drawer. They can click outside the drawer or press **Escape** to close it and return to the extraction card.
- **Future enhancement**: Region highlighting (draw a box on the document that corresponds to the field being validated). Out of MVP scope.

### Why not split-pane or modal?
- **Split-pane** would permanently reduce the extraction section width, hurting readability of tables (payroll, bank movements).
- **Modal** would completely obscure the extraction card, forcing the asesora to memorize the field value before opening the document.
- **Drawer** is the sweet spot: document is large enough to read, extraction context is still visible, and it does not alter the main layout.

## MVP vs Future Scope

| Feature | MVP (before Task 2.8) | Future (Sprint 3+) |
|---|---|---|
| Tabbed extraction section with summary bar and AlertBanner | ✅ Yes | — |
| Identidad tab with FieldGrid + manual validation card | ✅ Yes | — |
| Nómina tab — consolidated summary + receipt cards/rows | ✅ Yes | — |
| Estados de cuenta tab — UI shell + empty state | ✅ Yes | Full extraction + movements `DataTable` |
| Buró tab — UI shell + empty state | ✅ Yes | Full extraction + credit `DataTable` |
| Per-field `Completar` / `Editar` actions | ✅ Yes | — |
| "Editado manualmente" indicator after save | ✅ Yes | — |
| Document consultation drawer (basic PDF/image viewer) | ✅ Yes | Region highlight, zoom controls |
| Traceability DB schema design | ✅ Yes (proposed) | Full implementation + audit log UI |
| Traceability API endpoints | Placeholder / mock | Full CRUD + history retrieval |
| Cross-category validation ("Resumen" tab) | — | ✅ Yes |
| Mixed-income / CSF / independent activity ("Ingresos" tab) | — | ✅ Yes (replaces/expands "Nómina") |
| Financial amounts in summary bar | — | ❌ No (by design decision) |
| Full raw JSON suppression enforcement | ✅ Yes | — |

## Data Traceability Model

### Purpose
When an asesora corrects or completes a field, the system must remember the original AI-extracted value, the corrected value, who made the change, and when. This is foundational for audit and for future ML feedback loops.

### Proposed Schema (Prisma)

```prisma
model ExtractedDataCorrection {
  id            String   @id @default(cuid())
  documentId    String
  document      Document @relation(fields: [documentId], references: [id])

  fieldPath     String   // e.g. "identity.curp", "payroll.0.netIncome"
  originalValue String?  // JSON stringified or plain text
  correctedValue String  // JSON stringified or plain text

  correctionType CorrectionType // COMPLETAR | EDITAR
  reason         String?        // optional free text

  correctedBy   String   // userId (asesora)
  correctedAt   DateTime @default(now())

  @@index([documentId, fieldPath])
}

enum CorrectionType {
  COMPLETAR
  EDITAR
}
```

### API Contract (Minimal MVP)

- `POST /documents/:id/corrections`
  - Body: `{ fieldPath, correctedValue, correctionType, reason? }`
  - The backend stores the row and returns the updated extracted data enriched with `source: 'MANUAL'`.
- `GET /documents/:id/corrections?fieldPath=...`
  - Returns history for a field (future use).

### Frontend Enrichment
The extraction response for each field should include:

```ts
interface ExtractedField<T> {
  value: T;
  source: 'AI' | 'MANUAL';
  originalValue?: T;       // populated if corrected
  correctedAt?: string;    // ISO timestamp
  correctedBy?: string;    // user name or id
}
```

In the MVP, the UI can work with a lightweight mock or a minimal endpoint that stores only the latest correction. Full history and audit UI are deferred.

## Component Inventory

### New Components

| Component | Location | Responsibility |
|-----------|----------|----------------|
| `ExtractionSection` | `app/ui/extraction/extraction-section.tsx` | Container: summary bar + tabs + alert banner |
| `ExtractionCategoryTabs` | `app/ui/extraction/extraction-category-tabs.tsx` | Tab navigation for Identidad, Nómina, Estados de cuenta, Buró |
| `ExtractionDocumentCard` | `app/ui/extraction/extraction-document-card.tsx` | Collapsible card: header (doc name, status, alert count) + body (fields/table) |
| `ExtractionSummaryBar` | `app/ui/extraction/extraction-summary-bar.tsx` | Horizontal operational summary: category pills with counts/status |
| `AlertBanner` | `app/ui/extraction/alert-banner.tsx` | Global banner: aggregate alert counts with deep-link actions |
| `FieldGrid` | `app/ui/common/field-grid.tsx` | Reusable dl/grid for key-value pairs (extracted from current `Field` pattern) |
| `DocumentConsultationDrawer` | `app/ui/documents/document-consultation-drawer.tsx` | Right-side drawer for original document preview |
| `InlineFieldEditor` | `app/ui/extraction/inline-field-editor.tsx` | Inline input/popover for Completar/Editar actions |
| `ManualCorrectionIndicator` | `app/ui/extraction/manual-correction-indicator.tsx` | Chip/badge showing "Editado manualmente" or "Pendiente" |

### Reused HU-08 Components

| Component | Usage |
|-----------|-------|
| `Card` | Extraction document cards, summary containers |
| `DataTable` | Payroll receipt tables, bank movements, credit bureau lists |
| `StatusBadge` / `Badge` | Document status, alert severity, correction state |
| `Button` | Completar, Editar, drawer triggers |
| `CopyButton` | CIC, citizen identifier, CURP, account numbers |
| `EmptyState` | Tabs with no processed documents |
| `PageHeader` | Already used; no change |
