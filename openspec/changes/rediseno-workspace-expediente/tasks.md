# Tasks: Rediseño Workspace de Expediente

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~650-820 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 → PR 4 |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Drawer + updateCaseNotes action | PR 1 | ~170 lines; base for all drawers |
| 2 | Header, ObservationsEditor, client/case drawers | PR 2 | ~320 lines; depends on PR 1 |
| 3 | DocumentBrowser | PR 3 | ~190 lines; independent of PR 2 |
| 4 | Workspace wrapper + page.tsx | PR 4 | ~170 lines; depends on PR 2+3 |

## Phase 1: Foundation

- [ ] 1.1 Create `apps/web/app/ui/common/drawer.tsx` — reusable slide-in panel, overlay, ESC/X/backdrop close, focus trap, mobile fullscreen <768px
- [ ] 1.2 Add `updateCaseNotes(caseId, notes)` server action in `apps/web/app/actions/cases.ts` — PATCH `/mortgage-cases/{id}` with `{notes}`, revalidate path

## Phase 2: Core Components

- [x] 2.1 Create `apps/web/app/ui/expedientes/case-detail-header.tsx` — back arrow, breadcrumb, StatusBadge, Edit link, "Cambiar estado" inline dropdown toggle
- [x] 2.2 Create `apps/web/app/ui/expedientes/observations-editor.tsx` — client textarea, Guardar/Cancelar, 1000-char counter, PATCH via updateCaseNotes, inline error on failure
- [x] 2.3 Create `apps/web/app/ui/expedientes/client-drawer.tsx` — wraps Drawer, title "Cliente: [name]", FieldGrid with all Client fields
- [x] 2.4 Create `apps/web/app/ui/expedientes/case-detail-drawer.tsx` — wraps Drawer, title "Expediente EXP-XXXX", FieldGrid with all MortgageCase fields

## Phase 3: Document Browser

- [x] 3.1 Create `apps/web/app/ui/documents/document-browser.tsx` — 2-column: left category list with counts, right compact DocumentCardGrid filtered by category
- [x] 3.2 Add upload modal to DocumentBrowser — wraps DocumentUpload, pre-selects doc type from active category, opens on "Agregar documento" click

## Phase 4: Integration

- [x] 4.1 Create `apps/web/app/ui/expedientes/case-detail-workspace.tsx` — client wrapper, manages drawer open/close states, renders header + summary + observations + DocumentBrowser + drawers + ExtractionSection
- [x] 4.2 Modify `apps/web/app/dashboard/expedientes/[id]/page.tsx` — fetch all data (case, client, statuses, doc types, docs), render CaseDetailWorkspace, remove old 3-col layout and financial analysis card

## Phase 5: Testing

- [ ] 5.1 Write tests for Drawer — focus trap, ESC/backdrop/X close, mobile fullscreen, renders children
- [ ] 5.2 Write tests for ObservationsEditor — save/cancel flow, char limit 1000, error keeps edit mode, no auto-save on blur
- [ ] 5.3 Write tests for DocumentBrowser — category filtering, pre-select, auto-select first non-empty, empty state, upload modal opens
- [ ] 5.4 Write integration tests — workspace drawer open/close, observations save flow, document upload flow

## Riesgos técnicos a verificar

- [ ] Verificar que PATCH `/mortgage-cases/{id}` acepte campo `notes` (o `updateCaseNotes` necesita endpoint separado)
- [ ] Verificar agrupación de categorías de documentos — ¿campo de categoría en DocumentType o mapeo por `code`?
