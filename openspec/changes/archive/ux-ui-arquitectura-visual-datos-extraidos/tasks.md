# Tasks: UX/UI Architecture for Extracted Data Section

**Change**: `ux-ui-arquitectura-visual-datos-extraidos`
**Branch**: `task/ux-ui-arquitectura-visual-datos-extraidos`
**MVP cut**: T101–T602

---

## Batch 1: Foundation Components

- [x] T101 — Create `FieldGrid` as reusable `dl.grid` with label, value, action slot, correction state
  Files: `apps/web/app/ui/common/field-grid.tsx`
  Deps: none
  Accept: renders 3 states (AI/PENDING/MANUAL), action slot per field
  REQ: frontend-extraction-components, frontend-extraction-correction

- [x] T102 — Create `ManualCorrectionIndicator` chip: green "Editado manualmente", amber "Pendiente", or hidden
  Files: `apps/web/app/ui/extraction/manual-correction-indicator.tsx`
  Deps: none
  Accept: chip shows correct text+color per `source` prop
  REQ: frontend-extraction-correction

- [x] T103 — Create `InlineFieldEditor` inline input popover for Completar/Editar
  Files: `apps/web/app/ui/extraction/inline-field-editor.tsx`
  Deps: T102
  Accept: opens below field label, Guardar transitions to MANUAL, only one editor open at a time
  REQ: frontend-extraction-correction (SPEC-7, SPEC-8)

## Batch 2: Extraction Section Shell

- [x] T201 — Create `ExtractionSummaryBar` with category pills: counts/status per doc category
  Files: `apps/web/app/ui/extraction/extraction-summary-bar.tsx`
  Deps: none
  Accept: renders "Identidad ✓ | Nómina 2/3 ⚠ | …" from document array
  REQ: frontend-extraction-section (SPEC-3)

- [x] T202 — Create `ExtractionCategoryTabs` tab bar: Identidad, Nómina, Estados de cuenta, Buró
  Files: `apps/web/app/ui/extraction/extraction-category-tabs.tsx`
  Deps: none
  Accept: `activeTab` + `onChange` props, active tab highlighted
  REQ: frontend-extraction-section

- [x] T203 — Create `AlertBanner` global alert aggregator with deep links
  Files: `apps/web/app/ui/extraction/alert-banner.tsx`
  Deps: none
  Accept: shows "{N} críticas · {M} advertencias" with links; renders null when no alerts; INFO hidden
  REQ: frontend-extraction-section (SPEC-4), frontend-extraction-alerts (SPEC-9, SPEC-11)

- [x] T204 — Create `ExtractionSection` client container composing SummaryBar + AlertBanner + Tabs + tab panels
  Files: `apps/web/app/ui/extraction/extraction-section.tsx`
  Deps: T201, T202, T203
  Accept: section hidden when 0 PROCESSED docs; hash `#extraccion` for scroll-to; tab state in useState
  REQ: frontend-extraction-section (SPEC-1, SPEC-2), NFR-EXT-06

## Batch 3: Identidad Tab

- [x] T301 — Create `ExtractionDocumentCard` collapsible card with header (name, status, alert count) + expandable FieldGrid body
  Files: `apps/web/app/ui/extraction/extraction-document-card.tsx`
  Deps: T101
  Accept: collapse toggle, auto-expand when alerts exist, "Documento vencido" badge if expired
  REQ: frontend-extraction-identidad (SPEC-5, SPEC-6)

- [x] T302 — Create `IdentidadTab` rendering ExtractionDocumentCard per identity doc + manual validation card (CIC, citizen ID)
  Files: `apps/web/app/ui/extraction/identidad-tab.tsx`
  Deps: T301, CopyButton
  Accept: INE fields (7) + manual validation card with CopyButton
  REQ: frontend-extraction-identidad (SPEC-5, SPEC-7)

## Batch 4: Nómina Tab

- [x] T401 — Create `NominaSummaryCard` consolidated summary: counts, empleado, RFC, empleador, promedios, timbrado, alertas
  Files: `apps/web/app/ui/extraction/nomina-summary-card.tsx`
  Deps: T101
  Accept: renders all summary fields, uses mock data shape
  REQ: frontend-extraction-nomina (SPEC-8)

- [x] T402 — Create `NominaReceiptTable` expandable DataTable (Periodo, Fecha pago, Ingreso bruto, etc.) with detailed expanded row
  Files: `apps/web/app/ui/extraction/nomina-receipt-table.tsx`
  Deps: DataTable (common)
  Accept: expandable rows, all required columns, mock data shape
  REQ: frontend-extraction-nomina (SPEC-9, SPEC-10)

- [x] T403 — Create `NominaTab` composing NominaSummaryCard + NominaReceiptTable
  Files: `apps/web/app/ui/extraction/nomina-tab.tsx`
  Deps: T401, T402
  Accept: summary at top, expandable table below
  REQ: frontend-extraction-nomina

## Batch 5: Document Consultation

- [x] T501 — Create `DocumentConsultationDrawer` right-side drawer (480px desktop, full-screen <1024px) with iframe/img doc preview
  Files: `apps/web/app/ui/documents/document-consultation-drawer.tsx`
  Deps: none
  Accept: opens from Validar manualmente, closes via backdrop/Escape/Cerrar, lazy-loads doc on first open
  REQ: frontend-document-consultation (SPEC-12, SPEC-13, SPEC-14), NFR-EXT-03, NFR-EXT-08

## Batch 6: Page Integration

- [x] T601 — Modify `page.tsx`: remove `getExtraction`, `ExtractionResults`, `IneManualValidationCard`, `CopyField`, `Field`; import `ExtractionSection` passing documents prop
  Files: `apps/web/app/dashboard/expedientes/[id]/page.tsx`
  Deps: T204
  Accept: page renders ExtractionSection below documents; old extraction functions deleted; zero raw JSON
  REQ: frontend-extraction-page-integration (SPEC-15, SPEC-16), NFR-EXT-04

- [x] T602 — Add EmptyState shells for Estados de cuenta and Buró tabs inside ExtractionSection
  Files: `apps/web/app/ui/extraction/extraction-section.tsx`
  Deps: T204, EmptyState (common)
  Accept: "Los datos de estados de cuenta se mostrarán aquí una vez procesados" + Buró equivalent
  REQ: frontend-extraction-shells (SPEC-11, SPEC-12)

## Batch 7: Verification

- [ ] T701 — Run `next build` or `tsc --noEmit` — zero TS/build errors
  Deps: T601, T602
  Accept: clean build with 0 errors
  REQ: NFR-EXT-02

- [ ] T702 — Responsive check at ≥1024px: tabs, summary bar, drawer all render correctly
  Deps: T601
  Accept: layout correct on desktop viewport, drawer is 480-560px
  REQ: NFR-EXT-02

- [ ] T703 — Manual functional walkthrough: verify SPEC-1 through SPEC-16 scenarios against rendered UI
  Deps: T601
  Accept: all 16 scenarios pass visual inspection
  REQ: all extraction specs

---

## Summary

| Batch | Tasks | Focus |
|-------|-------|-------|
| 1 — Foundation | 3 | FieldGrid, ManualCorrectionIndicator, InlineFieldEditor |
| 2 — Shell | 4 | SummaryBar, Tabs, AlertBanner, ExtractionSection container |
| 3 — Identidad | 2 | ExtractionDocumentCard, IdentidadTab |
| 4 — Nómina | 3 | NominaSummaryCard, NominaReceiptTable, NominaTab |
| 5 — Drawer | 1 | DocumentConsultationDrawer |
| 6 — Integration | 2 | page.tsx cleanup, EmptyState shells |
| 7 — Verification | 3 | Build, responsive, walkthrough |
| **Total** | **18** | |

### Dependency Graph
```
T101 ─┬→ T301 ─→ T302
       └→ T401 ─→ T403
T102 ─→ T103              T402 ─┘
T201 ─┐
T202 ─┤→ T204 ─→ T601 ─→ T602 ─→ T701
T203 ─┘                          T702
                                  T703
T501 (independent, consumed by any tab)
```

### MVP Scope
Everything through T602 is MVP. T701–T703 are verification gates.
