# Design: Bureau Manual Validation

## Technical Approach

Extend the existing payment-due-guardrail into a full manual-validation layer. Instead of a single mutable `paymentDueAmount`, each field becomes an immutable triple: `*Extracted` (set once by extraction), `*Manual` (analyst override via PATCH), `*Effective` (computed at read time). Same pattern for `inquiries24m`. The existing `PATCH /documents/:id/credits/:index/payment-due` endpoint accepts manual/confirmed for any active credit; a new document-level PATCH handles inquiries. Frontend adds inline edit with four-state badges.

## Architecture Decisions

### Decision: Triple-field pattern over single mutable field

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Single `paymentDueAmount` mutated in place | Simple, but loses extraction provenance. Can't distinguish "never extracted" from "analyst set to null" | Rejected |
| Triple: extracted / manual / effective | Keeps immutable audit trail. Effective is always derivable. Survives future re-extractions that should not clobber manual values | **Chosen** |

**Rationale**: Extracted values must be immutable to protect against accidental re-extraction overwrites. Manual overrides must survive re-extraction. The effective value is always `manual ?? (confirmed ? extracted : null)` — computed, not stored.

### Decision: Compute effective at read time, not persist

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Persist effective to JSONB | Redundant — derived from two other fields. Risk of inconsistency if one source changes without recompute | Rejected |
| Compute in `normalizeCreditBureau` + `parseBuro` | Single source of truth. No stale effective values. Same derivation frontend and backend | **Chosen** |

### Decision: Extend existing PATCH vs new endpoint

| Option | Tradeoff | Decision |
|--------|----------|----------|
| New `PATCH /manual-validation` endpoint | Clean separation but overkill — same document, same credits array, same mutation semantics | Rejected |
| Extend `PATCH .../credits/:index/payment-due` | Reuses auth, index validation, recalculation logic. Accepts both `paymentDueAmountManual` and `paymentDueAmountConfirmed` | **Chosen** |

New `PATCH .../inquiries` added for document-level `inquiries24mManual`/`inquiries24mConfirmed`.

### Decision: Source enum expanded to `LAYOUT | GEMINI | MANUAL | UNCONFIRMED`

Current `UNCONFIRMED | CONFIRMED_AUTO | MANUAL` doesn't distinguish extraction origin. `LAYOUT` and `GEMINI` carry provenance for audit. The `*Source` field becomes informational-rich: `MANUAL` = analyst edited, `LAYOUT` = high-confidence layout extractor, `GEMINI` = Gemini-only path, `UNCONFIRMED` = blocked/missing.

## Data Flow

```
Extraction (mergeLayoutWithGemini)
  │
  ├─→ paymentDueAmountExtracted ← layout HIGH/MEDIUM or Gemini value (immutable)
  │
  ▼
normalizeCreditBureau (read-time resolution)
  │
  ├─→ paymentDueAmountEffective = manual ?? (confirmed ? extracted : null)
  │
  ▼
parseBuro (frontend)
  │
  ├─→ renders effective value + state badge
  │
  ├─→ "Editar" → inline input → PATCH → credit.paymentDueAmountManual = value
  │                                         credit.paymentDueAmountSource = MANUAL
  │
  └─→ effective recalculated on next read (manual now wins)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/documents/document-ai.types.ts` | Modify | Expand `PaymentDueAmountSource` with `LAYOUT`, `GEMINI`. Add `PaymentDueAmountTriple` + `Inquiries24mTriple` interfaces |
| `apps/api/src/documents/credit-bureau-extraction.service.ts` | Modify | Populate `*Extracted` after merge; compute `*Effective` in `normalizeCreditBureau`; extend `updatePaymentDue` to set `*Manual`; add `updateInquiries24m` |
| `apps/api/src/documents/documents.controller.ts` | Modify | Extend PATCH body types; add `PATCH .../inquiries` endpoint |
| `apps/web/app/lib/extraction.ts` | Modify | `ParsedCreditBureauCredit` gets `paymentDueAmountExtracted/Manual/Effective` + `inquiries24m*`; `parseBuro` computes effective |
| `apps/web/app/ui/extraction/buro-tab.tsx` | Modify | Inline edit on "Monto a pagar" and "Consultas 24m" cells; four-state badge: Extraído / Requiere revisión / Manual / Confirmado |

## Interfaces / Contracts

```typescript
// API-side (document-ai.types.ts)
export enum PaymentDueAmountSource {
  LAYOUT = 'LAYOUT',       // layout HIGH/MEDIUM confirmed
  GEMINI = 'GEMINI',       // Gemini-only path
  MANUAL = 'MANUAL',       // analyst overrode
  UNCONFIRMED = 'UNCONFIRMED', // blocked/missing
}

export interface PaymentDueAmountTriple {
  paymentDueAmountExtracted: number | null;
  paymentDueAmountManual: number | null;
  paymentDueAmountEffective: number | null;
  paymentDueAmountSource: PaymentDueAmountSource;
  paymentDueAmountConfirmed: boolean;
}

// PATCH body (credit-level)
{ paymentDueAmountManual?: number | null; paymentDueAmountConfirmed?: boolean }

// PATCH body (document-level)
{ inquiries24mManual?: number | null; inquiries24mConfirmed?: boolean }
```

Frontend mirrors these in `extraction.ts` with `parseBuro` computing effective from `manual ?? (confirmed ? extracted : null)`.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (API) | `normalizeCreditBureau` effective resolution: manual wins, confirmed + extracted, unconfirmed = null | Jest, mock extractedData with various triple states |
| Unit (API) | `updatePaymentDue` sets manual fields, recomputes source + monthlyDebtContribution | Jest, existing spec patterns |
| Unit (Web) | `parseBuro` effective computation matches backend logic | Jest/Vitest on extracted fixtures |
| Integration | PATCH endpoint returns updated credit with correct effective; PATCH /inquiries works | Supertest e2e or integration spec |
| E2E | Analyst clicks Edit → inputs value → Save → sees updated amount + "Manual" badge | Playwright |

## Migration / Rollout

Existing records lack triple fields. On first read, `normalizeCreditBureau` backfills: `paymentDueAmountExtracted = current paymentDueAmount`, `source` stays `UNCONFIRMED` (or existing `CONFIRMED_AUTO`/`MANUAL`), effective = null until confirmed. No database migration needed — additive JSONB fields. Rollback: revert effective-resolution logic; frontend inline edit degrades to read-only.

## Open Questions

- [ ] Should `inquiries24mEffective` also gate a guardrail (e.g., liability calc uses inquiries count)? Out of scope for this change per proposal.
- [ ] What happens when extraction is re-run on a document that has manual overrides? Current design: extracted field is NOT overwritten if manual already set (needs explicit guard in `extract()`). Confirm this behavior.
