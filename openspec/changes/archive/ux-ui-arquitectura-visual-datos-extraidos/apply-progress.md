# Apply Progress: UX/UI Architecture for Extracted Data Section

**Change**: `ux-ui-arquitectura-visual-datos-extraidos`
**Mode**: Standard (no strict TDD config present — `openspec/config.yaml` not found)
**Scope**: T101–T602 (15 MVP tasks). Verification batch T701–T703 pending.

## Completed Tasks

- [x] T101 — FieldGrid (`apps/web/app/ui/common/field-grid.tsx`)
- [x] T102 — ManualCorrectionIndicator (`apps/web/app/ui/extraction/manual-correction-indicator.tsx`)
- [x] T103 — InlineFieldEditor (`apps/web/app/ui/extraction/inline-field-editor.tsx`)
- [x] T201 — ExtractionSummaryBar (`apps/web/app/ui/extraction/extraction-summary-bar.tsx`)
- [x] T202 — ExtractionCategoryTabs (`apps/web/app/ui/extraction/extraction-category-tabs.tsx`)
- [x] T203 — AlertBanner (`apps/web/app/ui/extraction/alert-banner.tsx`)
- [x] T204 — ExtractionSection (`apps/web/app/ui/extraction/extraction-section.tsx`)
- [x] T301 — ExtractionDocumentCard (`apps/web/app/ui/extraction/extraction-document-card.tsx`)
- [x] T302 — IdentidadTab (`apps/web/app/ui/extraction/identidad-tab.tsx`)
- [x] T401 — NominaSummaryCard (`apps/web/app/ui/extraction/nomina-summary-card.tsx`)
- [x] T402 — NominaReceiptTable (`apps/web/app/ui/extraction/nomina-receipt-table.tsx`)
- [x] T403 — NominaTab (`apps/web/app/ui/extraction/nomina-tab.tsx`)
- [x] T501 — DocumentConsultationDrawer (`apps/web/app/ui/documents/document-consultation-drawer.tsx`)
- [x] T601 — page.tsx integration (`apps/web/app/dashboard/expedientes/[id]/page.tsx`)
- [x] T602 — EmptyState shells (inside ExtractionSection)

**Total**: 15/18 (T701–T703 are verification gates, out of implementation scope).

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `apps/web/app/lib/extraction.ts` | Created | Pure helpers: `docCategory`, `formatDateDisplay`, `filterAlerts`, `parseIdentity`, `aggregateAlerts` + shared types (`CorrectionSource`, `ExtractionAlert`, `AggregatedAlert`, `ExtractionCategory`). |
| `apps/web/app/ui/common/field-grid.tsx` | Created | `FieldGrid` server-friendly component (promoted from page's `Field`) with action slot + correctionState. |
| `apps/web/app/ui/extraction/manual-correction-indicator.tsx` | Created | Chip: green MANUAL / amber PENDING / null AI. |
| `apps/web/app/ui/extraction/inline-field-editor.tsx` | Created | Client inline input popover, auto-focus, Enter/Escape handling, Guardar → onSave (placeholder console.log). |
| `apps/web/app/ui/extraction/extraction-summary-bar.tsx` | Created | Category pills: ✓ / ⚠ processed/total / "pendiente". |
| `apps/web/app/ui/extraction/extraction-category-tabs.tsx` | Created | Client controlled tab bar with `activeTab`+`onChange`. |
| `apps/web/app/ui/extraction/alert-banner.tsx` | Created | Global aggregator; null when no alerts; INFO filtered upstream; deep-link chips switch tab. |
| `apps/web/app/ui/extraction/extraction-section.tsx` | Created | Client container: SummaryBar + AlertBanner + Tabs + panels; self-hides on 0 PROCESSED; `#extraccion` hash + EmptyState shells for estados/buró. |
| `apps/web/app/ui/extraction/extraction-document-card.tsx` | Created | Client collapsible card; per-card `useReducer` correction state (visual-only); auto-expand on alerts; "Documento vencido" badge; "Validar manualmente" → `onValidate`. |
| `apps/web/app/ui/extraction/identidad-tab.tsx` | Created | Client; one card per identity doc + manual validation card (CIC + Identificador with CopyButton); hosts DocumentConsultationDrawer. |
| `apps/web/app/ui/extraction/nomina-summary-card.tsx` | Created | Consolidated summary with mock shape; timbrado + alert badges. |
| `apps/web/app/ui/extraction/nomina-receipt-table.tsx` | Created | Client expandable table (custom, not `DataTable` — needs per-row state); expanded detail with empleado/empleador/percepciones/deducciones. |
| `apps/web/app/ui/extraction/nomina-tab.tsx` | Created | Composes summary + table with mock data; EmptyState when no PROCESSED payroll. |
| `apps/web/app/ui/documents/document-consultation-drawer.tsx` | Created | Client right-side drawer (max-w 560px desktop / full-screen mobile); lazy-loads signed URL via `getDocumentViewUrl`; closes via backdrop/Escape/Cerrar. |
| `apps/web/app/dashboard/expedientes/[id]/page.tsx` | Modified | Removed `getExtraction`, `ExtractionResults`, `IneManualValidationCard`, `CopyField`, `Field`, `formatDateDisplay`, `CopyButton`/`ReactNode` imports. Replaced case & client `<Field>` blocks with `FieldGrid`. Imports + renders `ExtractionSection documents={documents}`. Zero raw JSON. |

## Deviations from Design

1. **ExtractionSummaryBar / ExtractionCategoryTabs / AlertBanner made client, not server.** Design contract requires `onChange` callbacks (tab switching, alert deep-links). Server components cannot receive function props from a client parent, and `onClick` handlers require client execution. The prompt's "can be server components" hint was overridden by the interaction contract. Noted here, not a silent deviation.
2. **`FieldGrid` action slot is `ReactNode`, not inline `onEdit`/`onComplete` callbacks.** The design interface listed `onEdit`/`onComplete` on `FieldGridField`. To keep `FieldGrid` server-capable and let the per-card client parent own the "only one editor open at a time" invariant, the action is passed as a `ReactNode` built by `ExtractionDocumentCard`. This preserves the "action slot per field" acceptance criterion.
3. **`NominaReceiptTable` is a custom table, not the shared `DataTable`.** The shared `DataTable` is presentational (no expandable-row support). Adding expand state to it would violate its "server component" contract, so a dedicated expandable table was built; `Column<T>` type is intentionally not reused.
4. **`formatDateDisplay` moved to `app/lib/extraction.ts`** (prompt allowed "KEPT or moved to a utility"). Keeps page.tsx clean and lets IdentidadTab reuse it.
5. **`category` prop on ExtractionDocumentCard** currently surfaced via an `sr-only` span (wired, reserved for future per-category styling). No functional impact.

## Issues Found

- None blocking. UI text uses neutral Spanish (no es-MX diacritics in mock labels) — accents omitted intentionally to avoid encoding surprises in mock data; real extracted data retains whatever the API returns. If strict es-MX diacritics are required on mock strings, a quick pass to restore accents is trivial.

## TDD Cycle Evidence

N/A — Strict TDD Mode was not active (`openspec/config.yaml` not present; no testing-capabilities observation in Engram).

## Remaining Tasks

- [ ] T701 — Run `next build` / `tsc --noEmit` (verification gate)
- [ ] T702 — Responsive check at >=1024px
- [ ] T703 — Manual functional walkthrough SPEC-1..SPEC-16