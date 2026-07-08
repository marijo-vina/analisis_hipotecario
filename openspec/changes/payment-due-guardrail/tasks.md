# Tasks: Payment Due Guardrail

## Review Workload Forecast

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Medium

| Field | Value |
|-------|-------|
| Estimated changed lines | ~400–430 |
| Budget (override) | 800 lines |
| Chained PRs recommended | No |
| Delivery strategy | single-pr |
| Chain strategy | size-exception (fits 800-line budget) |

## Phase 1: Types & Interfaces

- [x] 1.1 Add `PaymentDueAmountSource` enum + `PaymentDueGuardrailFields` to `document-ai.types.ts`
- [x] 1.2 Add new fields to `ParsedCreditBureauCredit` type and `parseBuro()` in `extraction.ts`

## Phase 2: Backend Guardrail

- [x] 2.1 `mergeLayoutWithGemini()`: set `paymentDueAmountSource=UNCONFIRMED` when LOW/no-match confidence
- [x] 2.2 `normalizeCreditBureau()`: guardrail — skip `monthlyDebtContribution` when UNCONFIRMED; default legacy records
- [x] 2.3 `credit-bureau-extraction.service.ts`: add `updatePaymentDue()` — atomic JSONB partial update with source tracking
- [x] 2.4 `documents.controller.ts`: add `PATCH :documentId/credits/:index/payment-due` with DTO validation

## Phase 3: Frontend Review UI

- [x] 3.1 `CreditRow`: render "⚠️ Revisar" badge when `needsManualReview=true` + "No confirmado" when source=UNCONFIRMED and amount is null
- [ ] 3.2 Add confirm button + override numeric input per credit row (deferred to Sprint 3 — data model and indicators ready)
- [ ] 3.3 Wire PATCH calls from confirm/override actions to endpoint (deferred to Sprint 3 — endpoint exists)

## Phase 4: Testing

- [x] 4.1 Updated `normalizeCreditBureau` spec: UNCONFIRMED → contribution blocked (89/89 pass)
- [ ] 4.2 Extend `mergeLayoutWithGemini` spec: LOW/no-match sets source correctly (data model validated by existing tests)
- [ ] 4.3 New PATCH controller spec: validates input, sets MANUAL/CONFIRMED_AUTO source (deferred to Sprint 3)
- [ ] 4.4 Frontend test: badge renders when `needsManualReview=true` (deferred to Sprint 3)
- [ ] 4.5 Integration test: extraction → guardrail → PATCH confirm → contribution unblocked (deferred to Sprint 3)

## Technical Debt

> Extracción automática completa de `paymentDueAmount` en Buró de Crédito requiere trabajo posterior con más formatos reales de prueba. Current layout extraction covers known formats but confidence scoring needs calibration with broader PDF samples.
