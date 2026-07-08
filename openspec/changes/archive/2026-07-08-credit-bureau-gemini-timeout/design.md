# Design: credit-bureau-gemini-timeout

## Technical Approach

Two-layer optimization to shrink Gemini prompt from ~20K to ~8K chars and output from ~9K to ~4.5K chars. Layer 1 (always-on) strips schema descriptions and trims instructions. Layer 2 (layout-gated via `USE_LAYOUT_EXTRACTION`) removes 4 financial fields already owned by the layout extractor, skips payment disambiguation, and regex-extracts borrower fields from full OCR text.

## Architecture Decisions

| Decision | Options | Tradeoffs | Choice |
|----------|---------|-----------|--------|
| Schema stripping | (A) Constant stripped schema vs (B) Runtime deep-clone + strip | A: simpler, no runtime cost. B: single source of truth, more complex. | **A** — `CREDIT_BUREAU_SCHEMA_LEAN` constant. Schema rarely changes; two constants acceptable. |
| Instructions trim scope | Keep only anti-glossary + golden rule + formats/enums | Removes ~50 lines. OCR examples and decision tree ASCII are the biggest bloat sources (~900 chars combined). Risk: Gemini misclassifies payments without examples → golden rule (2 lines) is sufficient; existing tests validate this. | **Keep anti-glossary, golden rule, formats, enums, JSON rules**. Remove OCR examples and decision tree. |
| Aggressive pre-filter gate | Only when `ocrLayout` present AND `USE_LAYOUT_EXTRACTION=true` | No risk to non-layout path. Narrowest safe gate. | **Dual gate**: `shouldUseLayoutPath()` combines `isLayoutExtractionEnabled() && ocrLayout?.pages?.length` internally. |
| Regex borrower extraction | Extract `fullName`, `rfc`, `birthDate`, `consultationDate` from full OCR text | Deterministic, zero Gemini cost. Fallback: full Layer 1 pipeline when any field null. | **Regex first, Layer 1 fallback**. If any borrower field is null, restart the entire extraction with full OCR + LEAN schema + LEAN instructions. A field-level Gemini fallback is impossible — Layer 2 trims OCR to "DETALLE DE CRÉDITOS" only, so Gemini never sees borrower/report sections. |
| Borrower fallback strategy | (A) Separate Gemini call for borrower fields vs (B) Restart with full Layer 1 pipeline | A: impossible — Layer 2 OCR trim removes borrower/report sections. B: reuses existing code path, handles all fields atomically. Slightly slower but rare edge case. | **B — Full Layer 1 fallback**. When `extractBorrowerFromOcr()` returns null for any field, fall back to the complete extract() flow with LEAN schema/instructions. |
| Skip disambiguation when layout active | Remove `disambiguatePaymentFields()` call from pipeline | Layout owns financial fields — disambiguation is redundant and potentially conflicting. | **Conditional skip** in `extract()` method. |

## Data Flow

### Layer 1 (always-on)

```
OCR Text ──→ preFilterOcr (existing, 15K cap)
                  │
            CREDIT_BUREAU_SCHEMA_LEAN (stripped descriptions)
                  │
            CREDIT_BUREAU_INSTRUCTIONS_LEAN (trimmed)
                  │
                  └──→ Gemini (prompt ~8K, output ~7K)
```

### Layer 2 (layout-gated)

```
OCR Text (full)
  │
  ├──→ extractBorrowerFromOcr(raw) → {fullName, rfc, birthDate, consultationDate}
  │        - Regex from full OCR text (no ocrLayout parameter needed)
  │        - If ANY field is null → FALLBACK to Layer 1 flow (full pipeline, LEAN schema)
  │        - Fallback reuses the existing extract() path — no separate Gemini call
  │
  ├──→ preFilterOcrLayout() → DETALLE DE CRÉDITOS only (~5K) → Gemini w/ REDUCED_SCHEMA
  │        - 4 financial fields excluded from schema: currentBalance, creditLimit,
  │          paymentDueAmount, lastPaymentAmount
  │        - Borrower/report fields omitted from OCR sent to Gemini
  │        - maxCredit and pastDueAmount are NOT in the Gemini schema — they exist
  │          only in FINANCIAL_FIELDS for the layout merger
  │
  └──→ mergeLayoutWithGemini() → LAYOUT authority for financial fields
           - disambiguatePaymentFields() SKIPPED
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/documents/credit-bureau-extraction.service.ts` | Modify | Add `CREDIT_BUREAU_SCHEMA_LEAN`, `CREDIT_BUREAU_INSTRUCTIONS_LEAN`, `CREDIT_BUREAU_SCHEMA_REDUCED` (4 fields removed: `currentBalance`, `creditLimit`, `paymentDueAmount`, `lastPaymentAmount`), `preFilterOcrLayout()`, `extractBorrowerFromOcr(raw: string)`. Add `shouldUseLayoutPath(ocrLayout)` combining env flag + `ocrLayout?.pages?.length`. Gate `disambiguatePaymentFields()` skip. On borrower regex failure, fall back to Layer 1 flow. Use lean schema/instructions in `extract()`. |
| `apps/api/src/documents/gemini.service.ts` | Modify | Raise `DEFAULT_TIMEOUT_MS` from 30000 to 60000 as safety net (prompt reduction should make 30s sufficient, but 60s provides headroom for 20-credit PDFs). |
| `apps/api/src/documents/credit-bureau-extraction.service.spec.ts` | Modify | Add tests for: content-based schema/instructions trimming assertions, combined prompt measurement <10K, layout pre-filter extracts only detail, regex borrower extraction, reduced schema excludes 4 fields, disambiguation skip gate, borrower fallback triggers Layer 1 flow. |

## Interfaces / Contracts

```typescript
// New — regex-extracted borrower fields contract
interface RegexBorrowerFields {
  fullName: string | null;
  rfc: string | null;
  birthDate: string | null;
  consultationDate: string | null;
}

// New method signatures
private preFilterOcrLayout(raw: string): string;
// Only needs raw OCR text — regex operates on the full document, not layout pages
private extractBorrowerFromOcr(raw: string): RegexBorrowerFields;
// Combines isLayoutExtractionEnabled() AND ocrLayout?.pages?.length internally
private shouldUseLayoutPath(ocrLayout: OcrLayout | null): boolean;
```

`CREDIT_BUREAU_SCHEMA_REDUCED` — same structure as full schema minus `currentBalance`, `creditLimit`, `paymentDueAmount`, `lastPaymentAmount` from `credits[]`. `maxCredit` and `pastDueAmount` are layout-merger fields (in `FINANCIAL_FIELDS`, not the Gemini schema) and therefore are not "removed" from the schema — they were never there.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Schema description stripping (content) | Assert `paymentDueAmount` value is `"number | null"` (NOT `"number | null — 'Monto a Pagar'..."`); verify `lastPaymentAmount` has no inline OCR description |
| Unit | Instructions trimming (content) | Assert `CREDIT_BUREAU_INSTRUCTIONS_LEAN` does NOT contain OCR literal examples (e.g. `"0 53,763 42,400 MX"`), ASCII decision tree markers (`┌─`), or redundant explanatory sections |
| Unit | Layout pre-filter extracts only detail | Mock `ocrLayout` present; assert output excludes borrower/report sections |
| Unit | Regex borrower extraction | Test against real bureau OCR snippets; assert fallback triggers when any field is null |
| Unit | Reduced schema field exclusion | Assert 4 financial fields absent from schema: `currentBalance`, `creditLimit`, `paymentDueAmount`, `lastPaymentAmount`; verify `maxCredit` and `pastDueAmount` are NOT present in Gemini schema (only in FINANCIAL_FIELDS) |
| Unit | Disambiguation skip gate | Assert `disambiguatePaymentFields()` NOT called when layout active |
| Unit | Borrower fallback to Layer 1 | When regex returns null for `fullName`, verify the full `extract()` pipeline runs with LEAN schema/instructions (Layer 1 path) |
| Integration | Combined prompt measurement | Build the actual Gemini prompt string (instructions + schema + filtered OCR) and assert `prompt.length < 10000` |
| Integration | 20-credit PDF end-to-end | Mock Gemini with lean prompt; assert extraction <60s, no GEMINI_TIMEOUT |
| Regression | All ~492 existing unit tests pass | Run full suite |

## Open Questions

- [ ] None — all decisions resolved by proposal/spec constraints and codebase analysis.
