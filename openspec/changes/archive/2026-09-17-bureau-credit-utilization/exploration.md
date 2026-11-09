## Exploration: bureau-credit-utilization

Advisor-facing credit-card utilization (per card + global) and last-4 digits under Institución on the shared Buro tab. Applies to asalariado, PFAE, and future profiles via the existing unforked UI — not profile-specific tables.

### Current State

The Buro tab is shared. `ExtractionSection` always includes the `buro` category for PFAE and SALARIED; `BuroTab` takes `{ documents, caseId }` and never branches on `personType`. Future profiles that keep this shell inherit the change.

`CreditsTable` already splits rows into **Créditos Bancarios** vs **Créditos No Bancarios** (`isBankingCredit` = `classification !== "NON_BANK_SERVICE"`). Columns today: `#`, Institución, Tipo de crédito, Estado, Saldo actual, Monto a pagar, Límite / crédito, Comportamiento. Institución is `credit.institution ?? "—"` with no account digits.

`ParsedCreditBureauCredit` already has `currentBalance` and `creditLimit`. It does **not** have `accountNumber`. `parseBuro` maps those two financial fields from `Document.extractedData.credits[]` and drops `accountNumber` even if JSONB already contains it.

Classification enum (Gemini + schema): `REVOLVING | FIXED_PAYMENT | MORTGAGE | AUTO | PERSONAL_LOAN | DEPARTMENT_STORE | NON_BANK_SERVICE | UNKNOWN`. Schema example maps `creditType: "TARJETA DE CREDITO"` → `REVOLVING`. Backend already treats `classification === 'REVOLVING'` as the revolving population (`BURO_HIGH_REVOLVING_COUNT`). Coordinate merge overwrites classification to `NON_BANK_SERVICE` when the PDF section is `CRÉDITOS NO BANCARIOS`.

**accountNumber pipeline (verified):**

| Source | Has accountNumber? | Copied onto persisted credit? |
|--------|--------------------|-------------------------------|
| Gemini schema (LEAN / REDUCED) | **No field** — not requested | Only if the model emits an extra key |
| Layout extractor `extractInstitutionFromLine` | Yes — longest digit run ≥ 6 chars from institution line (`SANTANDER 1234567890`) | **No** — used only as merge key |
| Coordinate `extractBlockValues` | Field exists; **always set `null`** | Coordinate merge does not copy it |
| Default flags (`.env.example`) | `COORDINATE_EXTRACTION_ENABLED=true`, `USE_LAYOUT_EXTRACTION=false` | Layout path (the one that actually parses digits) is off by default |

Acceptance tests sometimes assert `credit.accountNumber` (e.g. TELCEL `82953660`), so Gemini *may* emit extras on some PDFs, but that is not a contract.

**Utilization can be shown for existing stored bureaus without re-OCR** because balance and limit are already on JSONB. **Last-4 cannot be guaranteed without re-extraction** unless digits already live on `accountNumber`, `institution`, or `rawTextReference`.

KPI row is Score / activos / cerrados / consultas 24m. Sidebar already has a MOP behavior legend — the natural home for the utilization traffic-light legend.

No web tests cover `buro-tab.tsx`. API coverage for extraction merge/classification is strong.

### Affected Areas

- `apps/web/app/ui/extraction/buro-tab.tsx` — new Utilización column, last-4 under Institución, global KPI, traffic-light legend
- `apps/web/app/lib/extraction.ts` — parse `accountNumber`; shared utilization helper (card predicate, rate, global aggregate, bands)
- `apps/web/app/ui/extraction/extraction-section.tsx` — **not forked**; confirm BuroTab stays personType-agnostic
- `apps/api/src/documents/credit-bureau-extraction.service.ts` — copy layout/coordinate `accountNumber` onto persisted credits; do not persist derived utilization
- `apps/api/src/documents/coordinate-grid.extractor.ts` — stop hardcoding `accountNumber: null`; parse digits from `creditorInfo` (reuse `extractInstitutionFromLine` or equivalent)
- `apps/api/src/documents/layout-lines-extractor.ts` — already extracts accountNumber; merge must persist it
- `apps/api/src/documents/document-ai.types.ts` — `LayoutCreditField.accountNumber` already exists
- `openspec/specs/ai-extraction/schemas/credit-bureau.schema.md` — add `accountNumber`; do **not** add utilization fields
- `openspec/specs/bureau-extraction/spec.md` — persist accountNumber from layout/coordinate; prompt-size budget: do not add accountNumber to Gemini schema
- `openspec/specs/frontend/spec.md` — advisor table column + global KPI + legend
- Out of scope: `apps/web/app/ui/expedientes/liability-table.tsx` (pasivos, 6% revolving rule — different table)

### Approaches

1. **UI-derived utilization + persist `accountNumber` on extract (recommended)** — Compute per-card and global rates in the web app from stored `currentBalance` / `creditLimit`. Add Utilización column + KPI + legend on the shared Buro tab. Persist `accountNumber` on new extractions (copy from layout; parse from coordinate `creditorInfo`). Parser reads `accountNumber` defensively so existing JSONB that already has it shows last-4 without re-OCR.
   - Pros: Matches advisor request; works for all person types; utilization live on existing docs; no stale derived JSONB; small Gemini prompt (no new schema field); last-4 improves going forward
   - Cons: Last-4 on *old* docs is best-effort until re-extract; coordinate extractor needs a small parse fix
   - Effort: Medium

2. **Persist utilization on the bureau JSONB** — Backend writes `utilizationRate` / `globalUtilization` at extract time.
   - Pros: Backend alerts could reuse the number
   - Cons: Stale if fields change; unnecessary for a display metric; still needs UI bands; does not solve last-4
   - Effort: Medium (higher coupling, little benefit)

3. **Credit-card subsection + always re-extract** — New table of cards only; require re-OCR for every existing bureau.
   - Pros: Cleaner card-only view
   - Cons: Forks the current banking/non-banking split; delays value on existing cases; user asked for a column on the existing table
   - Effort: High

4. **Ask Gemini for `accountNumber` / last4** — Add the field to `CREDIT_BUREAU_SCHEMA_*`.
   - Pros: Might fill last-4 when layout is off
   - Cons: Conflicts with prompt-size budget; Gemini already unreliable on financial columns; layout/coordinate already see the digits
   - Effort: Low-Medium, poor reliability

### Recommendation

**Approach 1.** Keep one shared Buro tab. Derive utilization in the UI. Persist `accountNumber` (not a dedicated last4, not utilization) on extract.

**Q1 — Which credits count as tarjeta?** Recommend **`classification === 'REVOLVING'`** as the primary predicate (already used for revolving alerts; schema example maps tarjetas here). Exclude `MORTGAGE`, `AUTO`, `PERSONAL_LOAN`, `FIXED_PAYMENT`, `NON_BANK_SERVICE`. **Include `DEPARTMENT_STORE` only if `creditLimit > 0`** (store revolving with a line). Fallback: `creditType` matches `/tarjeta/i` when classification is `UNKNOWN`. Do **not** use `creditType` containing "tarjeta" as the sole rule — too fragile vs the enum.

Coordinate risk: non-banking section forces `NON_BANK_SERVICE`, so a Liverpool card in that section would be excluded. That matches "credit cards" more than store/telco lines. Lock this in proposal.

**Q2 — Formula:** `rate = currentBalance / creditLimit` when `creditLimit > 0` and the row is in-scope. Edges:
- `creditLimit` null/0 → `"—"` / N/A; omit from global
- `currentBalance` null → N/A (do not treat as 0)
- `currentBalance` 0 + valid limit → 0% (Excelente)
- balance > limit → allow >100%, band **91–100%+ Muy crítico**
- closed / `isClosed` → per-row muted N/A (or show rate but exclude from global — recommend exclude + N/A)

Integer bands from the advisor legend (inclusive as written): `0–10`, `11–30`, `31–50`, `51–70`, `71–90`, `91+`. Round display to nearest integer percent, then band. Colors: two greens, amber, orange, two reds — same visual language as MOP chips.

**Q3 — Global:** **`sum(balances) / sum(limits)`** of in-scope active cards with `creditLimit > 0` and non-null balance. Not the average of per-card rates (a maxed $5k card must not outweigh a $200k card at 10%). If the denominator is 0, show `"—"`.

**Q4 — Last 4:** Persist full `accountNumber` on the credit JSONB; UI shows `****` + last 4 under the institution name (mask, do not show the full number). Source order: persisted `accountNumber` → longest digit run ≥ 4 in `institution` → same in `rawTextReference` → `"—"`. Do not add a separate `last4` field. Do not add `accountNumber` to the Gemini schema (prompt budget). Copy from layout on match; parse coordinate `creditorInfo` with the existing institution-line helper.

**Q5 — Column:** **All rows** in both existing tables. In-scope cards get rate + traffic light; others get `"—"`. No third subsection.

**Q6 — Traffic light:** **Both** per-card (column) and global (KPI). Legend visible in the right sidebar next to the MOP legend, using the six advisor bands.

**Q7 — Persistence:** **UI derives utilization.** No backend utilization field. Existing stored bureaus show utilization immediately. New extractions also persist `accountNumber` for last-4.

**Q8 — Backfill:** Utilization: **yes, no re-extract.** Last-4: **best-effort** on stored JSONB (parser starts reading `accountNumber` / leftover digits). Full last-4 coverage needs a new extraction (or a future optional backfill job — out of v1). User intent "existing profiles + future" means shared UI for all cases, not a silent OCR replay.

**Global KPI placement:** Prefer a fifth KPI (or a compact card above the tables) rather than replacing Score/activos/consultas. `sm:grid-cols-4` will need a layout tweak.

### Risks

- Last-4 missing on most existing JSONB (`USE_LAYOUT_EXTRACTION=false`, coordinate `accountNumber: null`, Gemini schema omits the field, `parseBuro` drops extras)
- `DEPARTMENT_STORE` vs `NON_BANK_SERVICE` vs real tarjetas — wrong predicate hides maxed store cards or includes telco lines
- Closed cards with leftover balances inflating global if not excluded
- `creditLimit` null on some active revolvers (known extraction gap) → N/A rows, incomplete global
- Wide table: 9th column + two-line Institución on already-dense rows
- KPI row wrapping on small screens if a fifth cell is added
- No frontend tests for `buro-tab.tsx` — need new unit tests for the pure helper
- Prompt-size spec forbids growing Gemini schema; last-4 must come from layout/coordinate copy

### Ready for Proposal

**Yes.** Product rules above are locked enough to spec. Proposal should confirm: (1) REVOLVING + store-cards-with-limit vs cards-only, (2) closed cards N/A vs shown-but-excluded, (3) fifth KPI vs sidebar global, (4) no silent re-extract for last-4 backfill.
