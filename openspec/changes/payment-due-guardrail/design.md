# Design: Payment Due Guardrail

## Technical Approach

Add three fields to credit JSONB schema (`paymentDueAmountSource`, `paymentDueAmountConfirmed`, `paymentDueAmountManualOverride`) and thread them through extraction → normalization → frontend. The guardrail blocks unconfirmed amounts from `monthlyDebtContribution` at source. A new PATCH endpoint allows analysts to confirm/override per credit.

## Architecture Decisions

### Decision: Source tracking as enum + boolean + nullable

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Single status enum | Loses override value separate from auto-extracted | Rejected: need the amount itself |
| CoroutineSource pattern reuse | Different semantics (credits have layout confidence, not just AI vs manual) | Rejected: misaligned |
| Source enum + confirmed flag + override nullable | Three fields but orthogonal concerns, matches proposal specs exactly | **Chosen** |

**Rationale**: `paymentDueAmountSource` tracks provenance (UNCONFIRMED | CONFIRMED_AUTO | MANUAL), `paymentDueAmountConfirmed` is the yes/no toggle, `paymentDueAmountManualOverride` stores the analyst-entered value. This matches the spec's effective-amount resolution priority chain.

### Decision: Guardrail placement in normalizeCreditBureau()

| Option | Tradeoff | Decision |
|--------|----------|----------|
| New separate guardrail function | Cleaner separation but adds call-site complexity | Rejected: unnecessary indirection |
| In `mergeLayoutWithGemini()` | Too early — normalization hasn't run yet | Rejected: runs before normalize |
| In `normalizeCreditBureau()` at `monthlyDebtContribution` computation | Single point of truth, reuses existing LOW confidence check | **Chosen** |

**Rationale**: `normalizeCreditBureau()` already computes `monthlyDebtContribution` at line 1540, including a LOW confidence check. Extending that block to also check `paymentDueAmountSource === UNCONFIRMED` is a minimal, surgical change.

## Data Flow

```
Extract → mergeLayoutWithGemini() [sets needsManualReview, candidatePaymentDueAmount]
  → normalizeCreditBureau() [if source=UNCONFIRMED: monthlyDebtContribution=null]
    → JSONB persist
      → Frontend parseBuro() [reads new fields, exposes to UI]
        → CreditRow [shows review badge + confirm/override actions]
          → PATCH /credits/:index/payment-due [persists override]
            → re-read → normalizeCreditBureau [now CONFIRMED_AUTO or MANUAL → feeds contribution]
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/documents/document-ai.types.ts` | Modify | Add `PaymentDueAmountSource` enum and new credit fields to type definitions |
| `apps/api/src/documents/credit-bureau-extraction.service.ts` | Modify | (a) Set `paymentDueAmountSource` in `mergeLayoutWithGemini()` when LOW/no-match. (b) Guardrail in `normalizeCreditBureau()`: skip contribution when UNCONFIRMED. (c) Default UNCONFIRMED for legacy records. |
| `apps/api/src/documents/documents.controller.ts` | Modify | Add `PATCH :documentId/credits/:index/payment-due` endpoint |
| `apps/api/src/documents/documents.service.ts` | Modify | Add `updateCreditPaymentDue()` — atomic JSONB partial update |
| `apps/web/app/lib/extraction.ts` | Modify | Add new fields to `ParsedCreditBureauCredit`, parse them in `parseBuro()` |
| `apps/web/app/ui/extraction/buro-tab.tsx` | Modify | Review badge + confirm button + override input in `CreditRow` |

## Interfaces / Contracts

```typescript
// New enum (API + frontend inlined)
enum PaymentDueAmountSource {
  UNCONFIRMED = "UNCONFIRMED",
  CONFIRMED_AUTO = "CONFIRMED_AUTO",
  MANUAL = "MANUAL",
}

// New fields per credit (JSONB)
interface PaymentDueGuardrailFields {
  paymentDueAmountSource: PaymentDueAmountSource;    // default: UNCONFIRMED
  paymentDueAmountConfirmed: boolean;                 // default: false
  paymentDueAmountManualOverride: number | null;      // default: null
}

// PATCH endpoint body
interface UpdatePaymentDueDto {
  paymentDueAmountManualOverride?: number;   // sets source to MANUAL
  paymentDueAmountConfirmed?: boolean;        // sets source to CONFIRMED_AUTO if no override
}
```

**Effective amount resolution** (spec priority chain):
1. `paymentDueAmountManualOverride` if set → return it
2. `paymentDueAmountSource === CONFIRMED_AUTO` → return `paymentDueAmount`
3. Otherwise → return `null` (block)

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit: `normalizeCreditBureau()` | UNCONFIRMED credits contribute 0 | Extend existing spec at line 1550 — assert `monthlyDebtContribution=null` when source is UNCONFIRMED |
| Unit: `mergeLayoutWithGemini()` | LOW/no-match sets UNCONFIRMED source | Extend layout spec tests — assert new fields populated |
| Unit: PATCH endpoint | Validates input, sets source to MANUAL/CONFIRMED_AUTO | New controller spec |
| Integration | Full flow: extraction → guardrail → PATCH update → frontend render | New e2e-like integration test |
| Frontend | Review badge renders when `needsManualReview=true` | Component test in `buro-tab.tsx` |

## Open Questions

- None — all design decisions resolved per proposal and specs
