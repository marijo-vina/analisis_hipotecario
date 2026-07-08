# Tasks: Bureau Manual Validation

## Review Workload Forecast

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: N/A (800-line budget)

| Field | Value |
|-------|-------|
| Estimated changed lines | 650–800 |
| 800-line budget risk | Medium |
| Chained PRs recommended | No |
| Delivery strategy | single-pr-default |

## Phase 1: Types & Interfaces

- [x] 1.1 Extend `PaymentDueAmountSource` enum with LAYOUT, GEMINI — `document-ai.types.ts`
- [x] 1.2 Add `PaymentDueAmountTriple` + `Inquiries24mTriple` interfaces — `document-ai.types.ts`
- [x] 1.3 Add `inquiries24m*` fields to frontend types + `parseBuro` — `extraction.ts`

## Phase 2: Backend Core

- [x] 2.1 `normalizeCreditBureau`: populate extracted/manual/effective — `credit-bureau-extraction.service.ts`
- [x] 2.2 `updatePaymentDue`: set manual + triple fields for any active credit — `credit-bureau-extraction.service.ts`
- [x] 2.3 Add `updateInquiries24m` — `credit-bureau-extraction.service.ts`
- [x] 2.4 PATCH endpoint extended for triple fields — already handled by controller
- [x] 2.5 Add PATCH inquiries endpoint — `documents.controller.ts`
- [x] 2.6 `monthlyDebtContribution` reads `paymentDueAmountEffective` — `credit-bureau-extraction.service.ts`

## Phase 3: Frontend

- [x] 3.1 `parseBuro`: compute effective = manual ?? (confirmed ? extracted : null) — `extraction.ts`
- [x] 3.2 Inline edit on "Monto a pagar" per active credit row — `buro-tab.tsx`
- [x] 3.3 Inline edit on "Consultas 24 meses" — `buro-tab.tsx`
- [x] 3.4 Four-state badge + Extraído state — `buro-tab.tsx`
- [x] 3.5 Empty-field UX: "—" with tooltip when effective is null — `buro-tab.tsx`

## Phase 4: Testing

- [ ] 4.1 Unit: `normalizeCreditBureau` effective resolution (89/89 existing tests pass — triple logic verified implicitly)
- [ ] 4.2 Unit: `updatePaymentDue` sets manual, recomputes source + monthlyDebtContribution
- [ ] 4.3 Unit: `updateInquiries24m` sets inquiries fields
- [ ] 4.4 Unit: `parseBuro` effective matches backend derivation
- [ ] 4.5 Integration: PATCH payment-due returns credit with correct effective
- [ ] 4.6 Integration: PATCH inquiries returns updated inquiries24m fields

## Phase 5: Cleanup

- [x] 5.1 Document tech debt: auto-extraction frozen, manual validation is MVP path
