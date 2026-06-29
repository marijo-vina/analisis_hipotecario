# Design: Rediseño del Workspace de Expediente

## Technical Approach

Server component `page.tsx` fetches all data (case, client, statuses, doc types, docs) via `apiFetch`. A new `CaseDetailWorkspace` client wrapper receives this data as props and manages all interactive state: drawer open/close, observations editing, upload modal, category selection. Drawers, ObservationsEditor, and DocumentBrowser are client islands inside this wrapper. ExtractionSection remains untouched and renders inside the client wrapper.

## Architecture Decisions

| Decision | Option A | Option B | Choice | Rationale |
|----------|----------|----------|--------|-----------|
| Page vs Client Wrapper | Make entire page client | Server page + client wrapper | **Option B** | Preserves SSR for data fetching; only interactive sections hydrate client-side |
| Drawer implementation | Use Radix Dialog | Custom drawer modeled on DocumentConsultationDrawer | **Custom** | No external UI libs in project; existing pattern in codebase with ESC/overlay/animations |
| Observations save trigger | Auto-save on blur | Explicit Guardar/Cancelar buttons | **Explicit buttons** | Spec requires no auto-save; user stays in control of edits |
| DocumentBrowser state | Context/global | Local useState in component | **Local useState** | No cross-component sharing needed; category selection is browser-local |
| Upload modal | Inline form | Modal wrapping DocumentUpload | **Modal** | Spec explicitly requires modal; keeps layout clean |

## Data Flow

```
page.tsx (server) ──fetches──→ apiFetch (JWT, NestJS backend)
        │
        ▼ props: case, client, statuses, docTypes, documents
CaseDetailWorkspace (client)
  ├─ CaseDetailHeader ──→ Link(href) for edit, useState for status dropdown
  ├─ Summary card ──→ onClick → setDrawerOpen(true)
  ├─ ObservationsEditor ──→ PATCH /mortgage-cases/{id} {notes} ──→ router.refresh()
  ├─ DocumentBrowser ──→ useState(selectedCategory) ──→ filter docs, open modal
  ├─ ClientDrawer ←── Drawer(open, onClose, title, children)
  ├─ CaseDetailDrawer ←── Drawer(open, onClose, title, children)
  └─ ExtractionSection (unchanged)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `app/ui/common/drawer.tsx` | **Create** | Reusable right-slide panel: overlay, ESC/backdrop/X close, focus trap, fixed header, scrollable body, mobile full-screen <768px |
| `app/ui/case-detail-header.tsx` | **Create** | Client component. Back arrow (Link), breadcrumb, case ID, StatusBadge, Edit (Link), Cambiar estado (toggles CaseStatusDropdown inline) |
| `app/ui/client-drawer.tsx` | **Create** | Wraps Drawer. Title: "Cliente: [name]". Content: FieldGrid with fullName, rfc, curp, email, phone, dates |
| `app/ui/case-detail-drawer.tsx` | **Create** | Wraps Drawer. Title: "Expediente EXP-XXXX". Content: FieldGrid with ALL MortgageCase fields |
| `app/ui/observations-editor.tsx` | **Create** | Client component. Textarea in Card. Buttons visible on focus/change. 1000 char limit with counter. PATCH via server action. Error stays inline, edit mode preserved |
| `app/ui/documents/document-browser.tsx` | **Create** | 2-column: left=category list with counts (clickable, highlighted), right=filtered DocumentCardGrid. "Agregar documento" button opens modal with DocumentUpload. Pre-selects doc type if category active |
| `app/ui/case-detail-workspace.tsx` | **Create** | Client wrapper. Manages: drawerOpen states, uploadModalOpen, selectedCategory. Renders: header, summary, observations, document browser, drawers, extraction section |
| `app/dashboard/expedientes/[id]/page.tsx` | **Modify** | Replace current layout with: fetch data → render CaseDetailWorkspace + ExtractionSection |
| `app/actions/cases.ts` | **Modify** | Add `updateCaseNotes(caseId, notes)` server action: PATCH `/mortgage-cases/{id}` with `{notes}`, revalidates path |

## Interfaces / Contracts

```typescript
// Drawer props
interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: string; // default "max-w-[480px]"
}

// ObservationsEditor — new server action
async function updateCaseNotes(
  caseId: string, notes: string
): Promise<ActionState>;

// DocumentBrowser props
interface DocumentBrowserProps {
  caseId: string;
  documents: Document[];
  documentTypes: DocumentType[];
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Drawer focus trap, ESC/backdrop close | Jest + React Testing Library, keyboard event simulation |
| Unit | ObservationsEditor save/cancel/char limit | Jest + RTL, mock server action |
| Unit | DocumentBrowser category filtering, pre-select | Jest + RTL, render with mock docs |
| Integration | Full workspace: drawer open, edit observations, upload flow | RTL with mocked apiFetch |
| E2E | Full user journey: navigate to case, open drawers, edit notes, upload doc | Not in scope (no E2E infra) |

## Migration / Rollout

No data migration required. Revert commit to restore previous 3-column layout. Backend unchanged — only frontend components modified.

## Open Questions

- [ ] Does PATCH `/mortgage-cases/{id}` accept `notes` field, or is a new endpoint needed? Verify with backend team.
- [ ] Document categories: how to determine which categories apply to a case? Currently doc types are flat — need a grouping key or use `DocumentType.code` prefixes.
