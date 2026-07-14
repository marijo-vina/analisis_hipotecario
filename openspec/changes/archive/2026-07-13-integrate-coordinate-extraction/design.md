# Design: Integrate Coordinate-Based PDF Extraction into Credit Bureau Flow

## Technical Approach

Inject `CoordinateExtractionService.extract(pdfBuffer)` into `CreditBureauExtractionService.extract()` between OCR validation (step 6) and the Gemini call (step 8). Coordinate extraction runs on the raw PDF bytes from GCS. After Gemini completes, merge coordinate results onto Gemini credits by institution name + positional order. BAND_MATCH values are authoritative and overwrite Gemini's `paymentDueAmount`. RESCUE/UNCONFIRMED defer to Gemini. Feature flag `COORDINATE_EXTRACTION_ENABLED` (default `true`) gates the entire coordinate path; `false` reverts to Gemini-only.

## Architecture Decisions

| Option | Tradeoff | Decision |
|--------|----------|----------|
| **A.** Run coordinate BEFORE Gemini, merge after | One extra GCS download (~500ms), but avoids calling Gemini for BAND_MATCH fields | ✅ **Chosen** — deterministic extraction saves Gemini API cost when BAND_MATCH hits |
| **B.** Run coordinate AFTER Gemini, use as correction | No extra latency in happy path; risks overwriting Gemini with unverified coordinate data | Rejected — defeats purpose of coordinate-first architecture |
| **C.** Split Gemini calls: one per credit, skip BAND_MATCH credits | Per-credit latency kills the 60s budget for 20-credit PDFs | Rejected — batching is non-negotiable for performance |

**Decision: Coordinate-first, Gemini-fallback merge (Option A)**

| Option | Tradeoff | Decision |
|--------|----------|----------|
| **Merge key: institution + accountNumber** | accountNumber is unreliable in Gemini output (~30% null) | ⚠️ Fallback needed |
| **Merge key: institution + positional order** | Survives missing accountNumbers; fails if Gemini skips a credit | ✅ **Chosen** — same pattern as `mergeLayoutWithGemini` |

**Decision: Institution + positional order matching (with exact accountNumber tie-break)**

| Option | Tradeoff | Decision |
|--------|----------|----------|
| **Use REDUCED schema when all credits BAND_MATCH** | Saves tokens but adds conditional schema selection complexity | Deferred to Phase 2 optimization |
| **Always use LEAN schema, coordinate overwrites** | Simpler code; Gemini still extracts paymentDueAmount but it's discarded for BAND_MATCH | ✅ **Chosen** for Phase 1 — correctness over token savings |

**Decision: Always full LEAN schema → coordinate overwrites BAND_MATCH results**

## Data Flow

```
extract() called
    │
    ▼
Fetch document + validate OCR exists (steps 1-6, unchanged)
    │
    ▼
COORDINATE_EXTRACTION_ENABLED? ──No──▶ skip coordinate, continue to Gemini
    │ Yes
    ▼
GcsService.downloadFile(doc.storagePath) → pdfBuffer
    │
    ▼
CoordinateExtractionService.extract(pdfBuffer, doc.originalName)
    │
    ├─ pdfjs-dist: extractWords(pdfBuffer) → CoordinateWord[]
    └─ extractFromCoordinateWords(words, sourceName) → CoordinateExtractionResult
    │
    ▼
Store result.credits[] in-memory (keyed by institution + index)
    │
    ▼
Pre-filter OCR (step 7, unchanged)
    │
    ▼
Call Gemini with LEAN schema (step 8, unchanged)
    │
    ▼
For each Gemini credit:
    ├─ Match to coordinate credit (institution norm + position)
    ├─ BAND_MATCH → paymentDueAmount = coordinate value, source = BAND_MATCH
    ├─ RESCUE → keep Gemini value, source = RESCUE, log warning
    └─ UNCONFIRMED → keep Gemini value (or null), source = UNCONFIRMED
    │
    ▼
Disambiguate payment fields (step 9, unchanged — Layer 1 only)
    │
    ▼
maybeMergeLayout (step 7b, unchanged)
    │
    ▼
normalizeCreditBureau (step 8, unchanged) — sets paymentDueAmountSource, computes effective
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/documents/credit-bureau-extraction.service.ts` | Modify | Inject `CoordinateExtractionService` + `GcsService` into constructor. Add coordinate extraction block between steps 6 and 7. Add `mergeCoordinateResults()` private method. Wire `COORDINATE_EXTRACTION_ENABLED` flag. |
| `apps/api/src/documents/documents.module.ts` | Modify | Register `CoordinateExtractionService` in `CreditBureauExtractionService`'s module (if not already). |
| `apps/api/src/documents/documents.controller.ts` | Modify | Remove `COORDINATE_EXTRACTION_ENABLED` guard from `coordinateExtract` dev endpoint (keep endpoint available for debugging). |
| `apps/web/app/lib/extraction.ts` | Modify | Add `BAND_MATCH` and `RESCUE` to frontend `PaymentDueAmountSource` enum (currently missing). Add source chip rendering in `parseBuro`. |
| `apps/web/app/ui/extraction/buro-tab.tsx` | Modify | Extend `renderStateBadge()` with BAND_MATCH (green ✅), RESCUE (yellow ⚠️), and GEMINI (blue 🔵) chips. |
| `apps/api/src/documents/credit-bureau-extraction.service.spec.ts` | Modify | Add tests: coordinate BAND_MATCH overwrites Gemini, RESCUE falls back to Gemini, feature flag off skips coordinate, download failure falls back gracefully. |

## Interfaces / Contracts

### Coordinate → Gemini merge contract

```typescript
interface MergeResult {
  creditIndex: number;
  source: PaymentDueAmountSource;
  coordinateValue: string | null;  // raw band value
  geminiValue: number | null;      // Gemini's extracted paymentDueAmount
  finalValue: number | null;       // the value that wins
}

// Merge rules:
// BAND_MATCH   → finalValue = parseFloat(coordinateValue), source = BAND_MATCH
// RESCUE       → finalValue = geminiValue, source = RESCUE (log coordinate as candidate)
// UNCONFIRMED  → finalValue = geminiValue ?? null, source = UNCONFIRMED
```

### Institution normalization for merge key

```typescript
function normInst(name: string): string {
  return name.toUpperCase().replace(/[^A-ZÑ0-9]/g, '').trim();
}
// Match: normalized institution + credit index within same-institution group
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (extractor) | `extractFromCoordinateWords` pure functions | 7 existing tests remain green (no changes to extractor) |
| Unit (service) | `mergeCoordinateResults` logic | Mock coordinate result + Gemini result, assert BAND_MATCH overwrites, RESCUE/UNCONFIRMED fall back |
| Unit (service) | Feature flag gate | `COORDINATE_EXTRACTION_ENABLED=false` → coordinate never called |
| Unit (service) | GCS download failure | Mock `downloadFile` rejection → pipeline continues with Gemini-only |
| Integration | Full `extract()` with real PDF | Use test PDF fixture, assert `paymentDueAmountSource` populated correctly |
| E2E (frontend) | Source chip rendering | Cypress: assert green chip for BAND_MATCH credit, yellow for RESCUE |

## Migration / Rollout

1. Deploy with `COORDINATE_EXTRACTION_ENABLED=true` (default)
2. Monitor extraction logs for coordinate match rate and warnings
3. Rollback: set `COORDINATE_EXTRACTION_ENABLED=false` → instant Gemini-only revert
4. No data migration required — new `paymentDueAmountSource` values are additive to existing JSONB

## Open Questions

- [ ] Should we emit an alert when coordinate extraction finds a BAND_MATCH that differs significantly (>20%) from Gemini's value? (Currently: coordinate wins silently)
- [ ] Do all deployment environments have pdfjs-dist compiled and working? (Confirmed in integration branch — verify CI pipeline)
- [ ] Should `CoordinateExtractionService` be called per-credit or once per document? (Per document, confirmed by current POC)
