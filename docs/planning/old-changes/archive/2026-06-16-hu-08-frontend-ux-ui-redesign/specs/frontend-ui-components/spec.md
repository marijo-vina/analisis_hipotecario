# frontend-ui-components Specification

## Purpose

Reusable UI component library with institutional Gestión Financiera visual identity. All pages consume these components for visual consistency.

## Requirements

| ID | Requirement | AC |
|----|-------------|----|
| UI-01 | Button component MUST support variants: primary (#B0002A bg, white text), secondary (white bg, #111827 text, #F0C9CF border), destructive (#DC2626 bg, white text). All variants SHALL have radius 8px, hover states, disabled state. | AC-02 |
| UI-02 | Card component MUST render with white bg, #F0C9CF border, radius 12px, shadow 0 2px 8px rgba(0,0,0,0.04), padding 24px. | AC-02 |
| UI-03 | StatusBadge component MUST accept both case (expediente) and document statuses without breaking existing uses. MAY be split internally into CaseStatusBadge and DocumentStatusBadge provided the public API is clear. MUST map statuses to explicit color tokens (success green, warning amber, info blue, danger red, neutral gray). MUST use human-readable Spanish names, never technical codes. | AC-02, AC-06, AC-07 |
| UI-04 | DataTable component MUST support column headers, row hover, empty state, horizontal scroll for overflow (not global page scroll). Text size SHALL be ≥14px. | AC-05, AC-06, AC-07 |
| UI-05 | EmptyState component MUST render an icon, short message in Spanish, and optional CTA button (primary variant). | AC-05, AC-06, AC-07 |
| UI-06 | ConfirmDialog component MUST render centered modal with dark overlay (bg-black/40), message, Cancelar (secondary) and Confirmar (primary/destructive) buttons. MUST show loading state during async action. | AC-08 |
| UI-07 | FormField component MUST render label, input (height 42px, border #F0C9CF, radius 8px, focus border #B0002A), and inline error message (red text below field). MUST accept `error` prop for validation display. | AC-02, AC-05 |
| UI-08 | PageHeader component MUST render breadcrumb navigation, title, optional action button, and optional status badge. | AC-01, AC-05, AC-06 |
| UI-09 | Topbar component MUST render at 72px height with search input, quick actions, "Nuevo expediente" button, notifications bell, and user avatar/name. | AC-01 |
| UI-10 | Sidebar component MUST render at 260px width, #111111 bg, brand logo/name, nav items with active state indicator (#B0002A accent), and logout button at bottom. | AC-01, AC-02 |
| UI-11 | DocumentPreviewDialog component MUST render a centered modal with dark overlay, title "Vista previa del documento", file name display, content area (`iframe` for PDF, `img` for images), "Cerrar" (secondary) and "Abrir en nueva pestaña" (secondary) buttons. MUST handle loading, error, and unsupported type states. | AC-07 |

### Scenarios

**UI-01 — Button variants:**
- GIVEN a Button with `variant="primary"` → WHEN rendered → THEN bg is #B0002A, text white, hover darkens to #8F0022
- GIVEN a Button with `disabled` → WHEN rendered → THEN opacity reduced, cursor not-allowed, onClick suppressed

**UI-03 — StatusBadge colors (case statuses):**
| Status (Spanish) | Color |
|---|---|
| Pendiente de documentos | amber |
| Documentos cargados | sky |
| En procesamiento | indigo |
| En revisión | blue |
| Observado | red |
| Cerrado | slate |
| Rechazado | red |

**UI-03 — StatusBadge colors (document statuses):**
| Status (Spanish) | Color |
|---|---|
| Subido | sky |
| Validado | green |
| Rechazado | red |
| Procesado | teal |
| Error | red |

**UI-06 — ConfirmDialog flow:**
- GIVEN dialog is open → WHEN user clicks "Cancelar" → THEN dialog closes, no action taken
- GIVEN dialog open with async action → WHEN user clicks "Confirmar" → THEN button shows loading state, action executes, dialog closes on success
- GIVEN dialog open → WHEN user clicks overlay backdrop → THEN dialog closes

**UI-10 — Sidebar nav active state:**
- GIVEN asesora on `/dashboard/clientes` → WHEN sidebar renders → THEN "Clientes" nav item shows active state (lighter bg or left-border accent #B0002A)

**UI-11 — DocumentPreviewDialog:**
- GIVEN document with PDF mime type → WHEN modal opens with signed URL → THEN `iframe` renders the PDF
- GIVEN document with image mime type → WHEN modal opens → THEN `img` tag renders the image
- GIVEN signed URL fetch fails → WHEN modal attempts to load → THEN error "El documento no está disponible"
- GIVEN unsupported file type → WHEN modal opens → THEN message "Este tipo de archivo no se puede previsualizar. Puedes abrirlo en una nueva pestaña."
