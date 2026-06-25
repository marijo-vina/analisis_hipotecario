# Exploration: UX/UI Architecture for Extracted Data Section

## Current State

The case detail page (`page.tsx`, 588 lines) renders a vertical stack:

1. **PageHeader** — breadcrumbs, title, actions
2. **2-column grid** — case summary + client (left 2/3), observations + financial analysis placeholder (right 1/3)
3. **Full-width Documents section** — upload form + document table
4. **Full-width ExtractionResults** — 2-column card grid, INE/passport only

`ExtractionResults` and `getExtraction` are hardcoded for INE identity data. The extraction section renders **below** the documents section as a static 2-column grid of cards. Alerts are embedded inside the identity card. As more document types gain extraction (payroll, bank statements, credit bureau), this pattern will create an extremely long, unmanageable page.

## Affected Areas

- `apps/web/app/dashboard/expedientes/[id]/page.tsx` — monolithic server component with hardcoded INE extraction logic
- `apps/web/app/ui/common/card.tsx` — reusable container, used heavily in extraction display
- `apps/web/app/ui/common/data-table.tsx` — presentational table, ideal for payroll/bank tabular data
- `apps/web/app/ui/common/badge.tsx` — unified StatusBadge, can extend to extraction status/severity
- `apps/web/app/ui/documents/documents-client-section.tsx` — documents wrapper; should remain decoupled from extraction

## Approaches

### Option A: Tabbed Extraction Section (Recommended)

Create a dedicated **"Datos extraídos"** section below documents with category tabs:
- **Tabs**: Identidad | Ingresos | Estados de cuenta | Buró de crédito
- **Per tab**: collapsible cards per document instance, summary bar at top
- **Global alert banner** at section level, per-document alerts inside cards

**Pros:**
- Scales linearly: new document type = new tab
- Asesora sees only one category at a time → low visual saturation
- Documents (upload/manage) and extractions (review/validate) remain conceptually separate but spatially adjacent
- Leverages existing DataTable for tabular extraction data (payroll tables, bank movements)
- Summary bar gives immediate situational awareness without scrolling

**Cons:**
- Requires new container/tab component (not in current UI kit)
- Cross-category validation (e.g., "name on INE matches payroll") requires tab switching

**Effort:** Medium

### Option B: Interleaved Document-Extraction Cards

Replace the document list table with expanded rows or adjacent cards: each document row expands to show its extraction.

**Pros:**
- Tight coupling between document and its data — no context switching
- Natural for asesoras who validate per document

**Cons:**
- Document table becomes extremely wide/tall with variable content
- Breaks the clean table abstraction; mixes upload/management with data review
- Hard to show aggregate summaries ("total income across 6 receipts")
- DataTable component would need significant rework or replacement

**Effort:** High

### Option C: Sidebar Panel (Right Column)

Move extraction into the right 1/3 column, replacing or alongside observations/financial analysis.

**Pros:**
- Uses existing 2-column layout real estate
- Documents and extractions visible simultaneously

**Cons:**
- Right column is only 1/3 width — too narrow for payroll tables, credit bureau lists
- Financial analysis placeholder is already planned for that space (Sprint 3)
- Would force all extraction into narrow cards, hurting readability

**Effort:** Low (but poor fit)

### Option D: Accordion-Only (No Tabs)

Single extraction section with stacked accordion groups by document type.

**Pros:**
- Simpler than tabs; no new navigation component
- Can see multiple categories if desired by expanding accordions

**Cons:**
- With 4+ categories, the stack becomes as tall as the current problem
- No quick way to jump to a category
- Visual saturation remains high when multiple are expanded

**Effort:** Low-Medium

## Recommendation

**Adopt Option A: Tabbed Extraction Section with collapsible cards per document.**

Rationale:
- The asesora's workflow has two distinct phases: **document management** (upload, process, check status) and **data validation** (review extracted values, cross-check external systems). These are separate mental modes. Tabs respect that separation while keeping them on the same page.
- The document table is already effective for its job; don't break it.
- Tabs provide a clear scalability path: Task 2.8 adds "Ingresos", Sprint 3 adds "Estados de cuenta" and "Buró".
- Collapsible cards within tabs allow hiding clean documents and surfacing only those with alerts or pending validation.

## Risks

- **Tab state not persisted on refresh** — asesora may lose context if page refreshes during validation. Mitigation: default-open tab with alerts, or URL hash for tab state.
- **"Scroll amnesia"** — if extraction section is far below documents, asesora scrolls a lot. Mitigation: sticky summary bar or anchor links from document table rows to their extraction cards.
- **Cross-tab cognitive load** — validating name consistency across INE and payroll requires tab switching. Mitigation: consider a "Resumen de validación" tab in Sprint 3 that surfaces cross-cutting checks.
- **Performance** — all extraction data renders server-side; with many documents this increases payload. Mitigation: extraction section can be a client component that fetches on demand, or use React `Suspense` boundaries per tab.

## Detailed Findings

### 1. Layout Diagnosis

The current `page.tsx` has three structural problems for scaling:

1. **Monolithic extraction logic**: `getExtraction()` (lines 312-404) searches only for `documentType.code === "INE"`. To add payroll, bank statements, and credit bureau, this function would balloon into a massive type-switching block inside the page component.

2. **Fixed 2-column card grid**: `ExtractionResults` renders a rigid `grid-cols-1 lg:grid-cols-2` (lines 421-490). This works for 2 cards (identity + INE validation) but fails for:
   - Payroll: 3-6 receipts × ~10 fields each = 6 cards minimum, plus a summary card
   - Bank statements: a movements table with dozens of rows — doesn't fit a card grid at all
   - Credit bureau: a credit list table + risk alerts — mixed card/table layout needed

3. **Vertical stacking without hierarchy**: Documents → Extraction is a flat sequence. There is no visual hierarchy to guide the asesora from "what needs action" to "the details." Every section is equally loud.

### 2. Information Architecture Gap

Extracted data should be organized as a **separate tabbed section** from documents, with these principles:

- **Documents section remains unchanged** — upload form + status table. It answers: "What do we have and what's its status?"
- **Extraction section answers**: "What did we learn from the processed documents?"
- **Category tabs** organize by *domain concept* (Identidad, Ingresos, Estados de cuenta, Buró), not by document filename. This matches how asesoras think: "Let me review their income" not "Let me review receipt #3."
- **Within a tab**: one collapsible card per document instance. For INE there's 1 card; for payroll there may be 6. Each card shows extracted fields or a table.
- **Global summary bar** at the top of the extraction section shows: documents processed per category, total alerts, pending validations.

This is **not** interleaved with documents (breaks the table), **not** a sidebar (too narrow), and **not** pure accordion (no quick navigation with 4+ categories).

### 3. Component Reuse Analysis

**Reusable as-is:**
| Component | Usage in new architecture |
|-----------|--------------------------|
| `Card` | Extraction document cards, summary bar container |
| `DataTable` | Payroll receipt tables, bank statement movements, credit bureau credit list |
| `StatusBadge` / `Badge` | Document processing status inside extraction cards, alert severity chips |
| `Button` | "Reprocesar" inside extraction card, "Validar en Lista Nominal" link |
| `CopyButton` | CIC, citizen identifier, CURP, account numbers — any field needing copy-paste to external systems |
| `EmptyState` | Tab with no processed documents yet |
| `PageHeader` | Already used; no change |

**New components needed:**
| Component | Responsibility |
|-----------|---------------|
| `ExtractionSection` | Container for the entire extraction area: summary bar + tabs |
| `ExtractionCategoryTabs` | Tab navigation for document categories |
| `ExtractionDocumentCard` | Collapsible card for a single document's extraction data. Header shows doc name + status + alert count. Body shows fields or DataTable. |
| `AlertBanner` | Global banner at extraction section top: "2 alertas críticas, 1 advertencia" with links to affected tabs/cards |
| `FieldGrid` | Reusable dl/grid for key-value pairs (extracted from current `Field` pattern in page.tsx) |
| `ExtractionSummaryBar` | Horizontal bar with category pills: "Identidad ✓ | Ingresos 3/6 ⚠ | Estados de cuenta 0/3 | Buró 1/1 ✓" |

Note: The current `Field` helper inside `page.tsx` (lines 270-289) should be extracted to `ui/common/field-grid.tsx` or similar for reuse across extraction cards.

### 4. Scalability Analysis

With the tabbed + collapsible card architecture:

| Document type | Count | Tab | Card content | Scales? |
|--------------|-------|-----|--------------|---------|
| INE / Passport | 1 | Identidad | FieldGrid (name, CURP, voter key, expiration) | Yes — 1 card |
| Payroll receipts | 3-6 | Ingresos | FieldGrid per receipt + summary card with totals | Yes — 6 collapsible cards, summary at top |
| Bank statements | 3 | Estados de cuenta | FieldGrid (account info) + DataTable (movements) per statement | Yes — tab scrolls, each statement is a card |
| Credit bureau | 1 | Buró | DataTable (credits) + alert list (risk flags) | Yes — table handles arbitrary rows |
| Sprint 3 validations | N/A | Resumen (new) | Cross-cutting validation results | Yes — new tab |

The tab container limits visible content to one category. Collapsible cards limit visible content to one document at a time (or only those with alerts). This caps visual saturation regardless of total document count.

DataTable is the critical scaling component: bank movements and credit lists are inherently tabular and would be unreadable as card grids.

### 5. Alert Architecture

Current pattern: alerts are embedded inside the identity card (lines 456-480), mixed with data fields. This doesn't scale — a credit bureau report may have 10+ risk alerts; a payroll receipt may have none.

**Proposed two-tier architecture:**

1. **Global AlertBanner** at the top of the extraction section:
   - Shows aggregate counts: "2 críticas · 3 advertencias"
   - Each count is a link that jumps to the relevant tab and scrolls to the affected card
   - Only visible when alerts exist; completely hidden for clean cases (reduces saturation)

2. **Per-document alerts** inside each `ExtractionDocumentCard`:
   - Alert list appears in the card header (badge with count) and body (detailed messages)
   - Uses existing amber/red color tokens from HU-08
   - Deduplicated by `code` (already implemented in `getExtraction`, lines 332-351)

**Avoiding duplication:**
- Global banner shows **counts and severity summary only**, not repeated messages
- Per-document shows **full messages and context**
- If the same alert code appears on multiple documents (unlikely but possible), global counts it once per document instance, per-document shows it in each relevant card

### 6. Visual Saturation Reduction

Specific techniques, grounded in HU-08 tokens and components:

1. **Collapsible cards as default**:
   - Cards with no alerts and valid data: **collapsed by default**, showing only header (doc type, status badge, 4-5 key fields)
   - Cards with alerts or pending validation: **expanded by default**
   - This reduces the initial visible surface area by ~60-70% for typical cases

2. **Tab isolation**:
   - Only one category visible at a time
   - Background of inactive tabs uses `--gf-bg` (#FFF7F7); active tab uses `--gf-surface` (#FFFFFF) for clear focus

3. **Summary bar replaces detail**:
   - The `ExtractionSummaryBar` gives situational awareness without rendering every field
   - Asesora decides which tab to open based on summary, not by scrolling through everything

4. **DataTable for repetitive data**:
   - Payroll lines, bank movements, credit list → table, not card grid
   - Table rows are visually quieter than cards (no border per row, just horizontal rules)

5. **Whitespace discipline**:
   - Use `--card-padding: 24px` consistently; don't increase padding for "emphasis"
   - Alert banners use the full section width but are single-line with subtle background (amber-50/red-50 from existing badge colors)

6. **Hide, don't disable**:
   - If a category has zero processed documents, the tab label shows "Ingresos (0)" in `--gf-text-muted` instead of a disabled state
   - Completely hide the extraction section if NO documents are processed (avoids empty-state clutter)

### 7. Flow Analysis

**Optimal asesora workflow when reviewing a case:**

1. **Arrival**: Lands on case detail page. PageHeader gives case ID, status, and action buttons.
2. **Situational scan** (2-3 seconds):
   - Glances at case summary (amount, property, client name)
   - Glances at document table: counts and statuses (how many PROCESSED? any ERROR?)
   - If extraction section exists, glances at summary bar: any alerts? which categories are done?
3. **Alert-driven navigation**:
   - If AlertBanner shows alerts → clicks linked tab → finds expanded card → reviews and validates
   - If no alerts → opens "Ingresos" tab → expands cards to review consistency across receipts
4. **External validation** (for INE):
   - In "Identidad" tab, copies CIC + citizen identifier using `CopyButton`
   - Opens Lista Nominal in another tab
   - Returns, confirms or reports discrepancy
5. **Cross-check** (Sprint 3):
   - Opens "Resumen" tab to see if income from payroll matches bank deposits
6. **Case action**:
   - Updates status via `CaseStatusDropdown` (already at bottom of left column)
   - Or adds observations

**Current friction in this flow:**
- The asesora must scroll past the document upload form and full document table to reach extraction data. If they spot an ERROR in the document table, they scroll down, then scroll back up to click "Reintentar."
- With the proposed architecture, the document table stays where it is (good — it's the management surface), but extraction gets its own organized section. A future enhancement could add a "Ver datos" quick action button per document row that jumps to the relevant tab and card.

## Ready for Proposal

Yes. The exploration confirms:
1. The current page.tsx extraction pattern is unsustainable beyond INE/passport.
2. A tabbed extraction section with collapsible cards, global alert banner, and category summary bar is the right architecture.
3. Most needed components can be built from existing HU-08 primitives; ~3-4 new container components are required.
4. The design respects the asesora's mental model (validate by domain category, not by filename) and scales to Sprint 3 document types.

**Next recommended phase**: `sdd-propose` — define scope, approach, and affected files for the extraction UI architecture change.
