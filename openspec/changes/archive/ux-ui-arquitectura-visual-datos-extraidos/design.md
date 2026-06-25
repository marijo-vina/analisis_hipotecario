# Design: UX/UI Architecture for Extracted Data Section

## Technical Approach

Replace the monolithic `ExtractionResults`/`getExtraction` block in `page.tsx` with a client `ExtractionSection` component that composes nine new extraction-specific components (all in `app/ui/extraction/`) plus a promoted `FieldGrid` (`app/ui/common/`). The section renders below the existing documents area only when `documents.some(d => d.documentStatus.code === 'PROCESSED')`. Category tabs (Identidad, Nómina, Estados de cuenta, Buró) manage visibility; tab state lives in `useState`. Document consultation opens a right-side drawer (`DocumentConsultationDrawer`, 480-560px desktop, full-screen mobile) that coexists with the existing `DocumentPreviewDialog` "Ver" button — it does NOT replace it.

## Architecture Decisions

| Decision | Option A | Option B | Chosen | Rationale |
|----------|----------|----------|--------|-----------|
| ExtractionSection server vs client | Server component (RSC) | Client component (`"use client"`) | **Client** | Needs tab state, card collapse state, inline editing state, and drawer open/close — all interactive. Server-only would require URL param roundtrips for every interaction. |
| Nómina: card per receipt vs DataTable | Collapsible cards per receipt | Expandable DataTable rows | **DataTable** | Spec explicitly requires DataTable. Same component already used for document list — consistent UX. Expandable detail rows provide the per-receipt drilldown without layout shifts. |
| Correction state management | Lift to ExtractionSection | Per-card `useReducer` | **Per-card `useReducer`** | Each card's corrections are independent. `useReducer` per card isolates state, avoids re-rendering siblings. Proposal confirms this. |
| Tab persistence | URL query param (`?tab=nomina`) | Local state only | **Local state** (MVP) | Hash `#extraccion` handles scroll-to-section. Tab state persistence via URL is deferred (spec NFR-EXT-06 says SHOULD, not MUST). Adds complexity with no MVP requirement. |
| Drawer: reuse DocumentPreviewDialog vs new component | Extend existing modal | New drawer component | **New drawer** | Different UX: drawer slides over content (partial obscuring) vs modal covers everything. Different interactions: backdrop click closes vs modal close button. Distinct component avoids conditional complexity. |

## Data Flow

```
page.tsx (RSC)
  │  fetches documents, passes to ExtractionSection
  ▼
ExtractionSection ("use client")
  ├── ExtractionSummaryBar ← computed from documents (counts per category)
  ├── AlertBanner ← aggregated alerts from all PROCESSED docs
  ├── ExtractionCategoryTabs ← manages activeTab state
  └── {activeTab === "identidad" && <IdentidadTab docs={...} />}
       {activeTab === "nomina"    && <NominaTab    docs={...} />}
       {activeTab === "estados"   && <EmptyStateShell message={...} />}
       {activeTab === "buro"      && <EmptyStateShell message={...} />}

identidad/
  └── IdentidadTab.tsx
       ├── ExtractionDocumentCard ← per INE/PASSPORT doc, collapsible
       │    ├── FieldGrid (Tipo doc, Nombre, CURP, etc.)
       │    ├── ManualCorrectionIndicator (state chip)
       │    └── InlineFieldEditor (per-field, opens on Completar/Editar click)
       └── ManualValidationCard (CIC, Identificador ciudadano + CopyButton)

nomina/
  └── NominaTab.tsx
       ├── NominaSummaryCard ← consolidated: counts, empleado, RFC, promedios
       └── NominaReceiptTable ← expandable DataTable
            └── Expanded row: datos empleado, empleador, percepciones, deducciones

DocumentConsultationDrawer ← triggered from "Validar manualmente"
  └── loads doc via iframe/img using existing signed URL
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/web/app/ui/extraction/extraction-section.tsx` | Create | Client container: composes summary bar + tabs + alert banner. Accepts `documents: Document[]` prop. |
| `apps/web/app/ui/extraction/extraction-summary-bar.tsx` | Create | Horizontal pills: category name + count badge (processed/total). No financial amounts. |
| `apps/web/app/ui/extraction/extraction-category-tabs.tsx` | Create | Tab buttons: Identidad, Nómina, Estados de cuenta, Buró. Accepts `activeTab` + `onChange`. |
| `apps/web/app/ui/extraction/alert-banner.tsx` | Create | Global banner: `{N} críticas · {M} advertencias` with links. Renders `null` when no alerts. |
| `apps/web/app/ui/extraction/extraction-document-card.tsx` | Create | Collapsible card (header with doc name/status/alert count + expandable body). Wraps FieldGrid. |
| `apps/web/app/ui/extraction/identidad-tab.tsx` | Create | Renders ExtractionDocumentCard per identity doc + ManualValidationCard inline. |
| `apps/web/app/ui/extraction/nomina-tab.tsx` | Create | NominaSummaryCard + NominaReceiptTable (expandable DataTable). |
| `apps/web/app/ui/extraction/nomina-summary-card.tsx` | Create | Consolidated summary: recibos, periodos, empleado, RFC, empleador, promedios, timbrado, alertas. |
| `apps/web/app/ui/extraction/nomina-receipt-table.tsx` | Create | Expandable DataTable: Periodo, Fecha pago, Periodicidad, Ingreso bruto, Deducciones, Ingreso neto, Timbrado, Alertas + expanded detail row. |
| `apps/web/app/ui/extraction/inline-field-editor.tsx` | Create | Inline input/popover triggered by Completar/Editar. Single field at a time.|
| `apps/web/app/ui/extraction/manual-correction-indicator.tsx` | Create | Chip: "Editado manualmente" (green), "Pendiente" (amber dot), or nothing (IA extraído). |
| `apps/web/app/ui/common/field-grid.tsx` | Create | Promoted from `page.tsx` `Field` helper. Returns `<dl className="grid">` with optional `action` slot per field. |
| `apps/web/app/ui/documents/document-consultation-drawer.tsx` | Create | Right-side drawer: 480-560px desktop, full-screen mobile. Loads PDF/img via signed URL. |
| `apps/web/app/dashboard/expedientes/[id]/page.tsx` | Modify | Remove `getExtraction`, `ExtractionResults`, `IneManualValidationCard`, `CopyField`, `Field`. Import `ExtractionSection`. Pass `documents` prop. |
| `apps/web/app/dashboard/expedientes/[id]/extraction/` | Delete | Not created — extraction logic lives in `app/ui/extraction/`, not page directory. |
| `apps/web/app/ui/documents/document-actions.tsx` | No change | "Ver" button continues using existing `DocumentPreviewDialog`. Not affected. |

## Interfaces / Contracts

```ts
// ExtractionSectionProps — passed from page.tsx
interface ExtractionSectionProps {
  documents: Document[];           // all case documents
}

// ExtractionDocumentCardProps
interface ExtractionDocumentCardProps {
  document: Document;
  category: "identidad" | "nomina" | "estados" | "buro";
  defaultExpanded?: boolean;       // auto-expand when alerts exist
}

// FieldGrid: promoted from current `Field` helper
interface FieldGridProps {
  fields: {
    label: string;
    value?: string;
    missing?: boolean;            // triggers "Completar"
    onEdit?: () => void;          // triggers Editar
    onComplete?: () => void;      // triggers Completar
    correctionState?: "AI" | "PENDING" | "MANUAL";
  }[];
}

// NominaReceiptTable: expandable DataTable
interface ReceiptRow {
  periodo: string;
  fechaPago: string;
  periodicidad: string;
  ingresoBruto: number;
  deducciones: number;
  ingresoNeto: number;
  timbrado: boolean;
  alertas: number;
  // expanded detail
  empleado?: { nombre: string; rfc: string };
  empleador?: { nombre: string; rfc: string };
  percepciones?: { concepto: string; importe: number }[];
  deducciones?: { concepto: string; importe: number }[];
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | FieldGrid renders fields in all 3 states (AI, PENDING, MANUAL) | Render with props, assert text/buttons |
| Unit | AlertBanner shows/hides based on alert count | Render with/without alerts, assert visibility |
| Unit | ExtractionSummaryBar computes correct counts | Pass document array, assert pill labels |
| Integration | Tab switching shows correct content | Render ExtractionSection, click tabs |
| Integration | Inline editor opens only one field at a time | Click Completar on two fields, assert only one editor visible |
| Integration | Drawer opens/closes via all triggers | Click Validar, assert open; click backdrop/Escape/Cerrar, assert closed |
| E2E | Full page renders extraction section below documents | Navigate to case with PROCESSED docs, assert section exists |

## Migration / Rollout

No migration required. The change is purely frontend — no database schema changes, no API changes. Rollback: revert `page.tsx` and delete new directories.

## Open Questions

- **Nomina data shape from API**: The backend extraction contract for payroll isn't finalized. Build with mock data shape. Align DTOs in parallel.
- **Traceability schema**: Proposed `ExtractedDataCorrection` Prisma model exists in proposal but not in scope for MVP. Build frontend correction components to accept a future `onSave` callback — persistence wiring is deferred.
