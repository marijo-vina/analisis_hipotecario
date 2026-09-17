# Design: Bureau Credit Utilization

## Technical Approach

Advisors see per-row and global utilization on shared `BuroTab`, derived at render from stored `currentBalance` / `creditLimit`. Last-4 is a UI mask over persisted `accountNumber`. New extracts copy layout/coordinate digits onto Gemini credits; merge today uses `accountNumber` as a key only and coordinate hard-codes `null`. Gemini schemas stay unchanged. Specs may still be in flight; this follows the proposal plus current code.

## Architecture Decisions

| Decision | Options | Tradeoff | Choice |
|----------|---------|----------|--------|
| Where to compute utilization | Persist JSONB vs UI helper vs liability-table | Persist goes stale; pasivos table is a different rule set | Pure helper in web; not persisted |
| Last-4 source | Gemini schema vs dedicated `last4` vs persist full `accountNumber` | Schema growth is forbidden; `last4` duplicates | Persist full number; UI `****` + last 4 |
| Buro surfaces | Fork by `personType` vs shared tab vs third table | Forks and extra tables were rejected | Shared `BuroTab` only |
| Coordinate digits | Keep `null` vs duplicate regex vs reuse layout parse | `null` blocks last-4 on the default extract path | Shared string parser (layout ≥6 digits) |
| Merge copy vs key-only | Key-only (today) vs copy onto credit | Key-only never shows last-4 | Copy layout always; coordinate fills if still empty |
| KPI / legend | Replace Score vs fifth KPI vs sidebar-only | Replacing Score loses the existing bar | Extra KPI; six-band legend beside MOP |
| Re-extract old JSONB | Silent OCR vs best-effort parse | Silent replay is out of scope | No silent re-extract |

Non-obvious persist order (layout merge runs before coordinate):

```
if (lc.accountNumber) credit.accountNumber = lc.accountNumber
if (cc.accountNumber && !credit.accountNumber) credit.accountNumber = cc.accountNumber
```

Default flags: layout off, coordinate on — coordinate fill is the production last-4 path.

## Data Flow

```mermaid
sequenceDiagram
  participant PDF
  participant Coord as coordinate-grid
  participant Layout as layout-lines
  participant Merge as bureau extraction merge
  participant JSONB as extractedData.credits
  participant Parse as parseBuro
  participant UI as BuroTab

  PDF->>Coord: creditorInfo text
  Coord->>Coord: parseInstitutionAndAccount
  PDF->>Layout: institution line (if flag on)
  Layout->>Layout: same parser
  Coord->>Merge: accountNumber
  Layout->>Merge: accountNumber
  Merge->>JSONB: copy digits; never write utilization
  JSONB->>Parse: currentBalance, creditLimit, accountNumber
  Parse->>UI: ParsedCreditBureauCredit
  UI->>UI: derive rate/global/bands; mask last-4
```

Stored bureaus skip extract: balances/limits already parse; last-4 is best-effort (`accountNumber` → ≥4 digits in `institution` → `rawTextReference` → `"—"`).

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/web/app/lib/bureau-utilization.ts` | Create | Predicate, rate, global, bands, last-4 mask |
| `apps/web/app/lib/bureau-utilization.spec.ts` | Create | First web unit tests (vitest, lib-only) |
| `apps/web/package.json` | Modify | Add vitest + `test` script |
| `apps/web/app/lib/extraction.ts` | Modify | `accountNumber` on type + `parseBuro` |
| `apps/web/app/ui/extraction/buro-tab.tsx` | Modify | Column, fifth KPI, MOP-adjacent legend, last-4 |
| `apps/api/src/documents/layout-lines-extractor.ts` | Modify | Export `parseInstitutionAndAccount`; line helper delegates |
| `apps/api/src/documents/coordinate-grid.extractor.ts` | Modify | Parse `creditorInfo`; set `accountNumber`; strip institution digits |
| `apps/api/src/documents/credit-bureau-extraction.service.ts` | Modify | Copy `accountNumber` after layout/coordinate match |
| `apps/api/src/documents/*extractor*.spec.ts` + `credit-bureau-extraction.service.spec.ts` | Modify | Parser, persist-on-match; schema still omits `accountNumber` |

Unchanged: Gemini LEAN/REDUCED schemas, `credit-bureau.schema.md`, `extraction-section.tsx`, `liability-table.tsx`.

## Interfaces / Contracts

Helper input is `ParsedCreditBureauCredit[]`. In-scope: `classification === 'REVOLVING'`; `DEPARTMENT_STORE` iff `creditLimit > 0`; `/tarjeta/i` on `creditType` only when `UNKNOWN`. Exclude MORTGAGE, AUTO, PERSONAL_LOAN, FIXED_PAYMENT, NON_BANK_SERVICE.

Rate: `currentBalance / creditLimit` when limit > 0; null/0 limit or null balance → `"—"` (null balance is not 0). Closed → `"—"`, omit from global. Over-limit allowed. Global: `sum(balances)/sum(limits)` of in-scope active cards with limit > 0 and non-null balance; denom 0 → `"—"`. Round display % then band: 0–10 Excelente; 11–30 Muy buena; 31–50 Aceptable; 51–70 Atención; 71–90 Crítico; 91+ Muy crítico. Column on **all** rows of both tables; in-scope gets % + chip (two greens, amber, orange, two reds).

`accountNumber` remains optional JSONB. Do not persist utilization or `last4`.

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit (web) | Predicate, edges, global, bands, last-4 chain | vitest on the helper |
| Unit (API) | Digit parse from `creditorInfo`; layout/coordinate copy; empty-skip | Existing Jest files |
| Contract | Gemini schema has no `accountNumber` / utilization | Keep Phase 3 schema tests |
| E2E | — | None in v1 |

## Migration / Rollout

No Prisma migration. Additive JSONB; utilization is not stored. Existing cases show utilization now; last-4 improves on next extract. Rollback: revert the feature branch.

## Open Questions

- [ ] KPI wrap (`xl:grid-cols-5` vs compact 5th cell) — visual, not blocking
- [ ] Strip digits from stored coordinate `institution` (yes: matches layout, helps `normInstitution`) — recheck if merge tests fail
- [ ] 4–5 digit accounts: layout `MIN_ACCOUNT_DIGITS=6` will not persist; UI ≥4 fallback still applies
