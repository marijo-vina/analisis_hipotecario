# Proposal: Bureau Manual Validation

## Intent

The payment-due-guardrail added source tracking (UNCONFIRMED/CONFIRMED_AUTO/MANUAL) but only gates unconfirmed credits. Manual testing with Juan Perez's bureau revealed: AMEX COMPANY shows incorrect amounts (49,800/41,600 should be 0), some credits show "No confirmado", inquiries (consultas) are not extracted, and from the second AMEX COMPANY onwards fields are empty (low confidence matching). Analysts need to correct ANY active credit's amount — not just unconfirmed ones — and edit inquiry counts. This change extends the guardrail into a full manual-validation layer for MVP.

## Scope

### In Scope
- Data model: extracted/manual/effective triple for `paymentDueAmount` and `numberOfInquiries`
- Visual states: Extraido, Requiere revision, Confirmado manualmente, Confirmado automatico
- Editable "Monto a pagar" on ALL active credits (system-extracted or not)
- Editable "Consultas ultimos 24 meses" with same pattern
- Empty field UI: "No confirmado" / "—" with tooltip "Dato pendiente de validacion manual"
- Sprint 3 uses only `paymentDueAmountEffective` for `monthlyDebtContribution`

### Out of Scope
- Extractor redesign or layout engine changes
- Full liability calculation (Sprint 3)
- Relational credit table migration (credits remain JSONB)

## Capabilities

### New Capabilities
None

### Modified Capabilities
- `bureau-extraction`: Extend credit data model with extracted/manual/effective triple (`paymentDueAmountExtracted`, `paymentDueAmountManual`, `paymentDueAmountEffective`, `paymentDueAmountSource` [LAYOUT|GEMINI|MANUAL|UNCONFIRMED], `paymentDueAmountNeedsReview`). Same pattern for `numberOfInquiries`. Resolution rule: manual wins, else confirmed auto, else effective = null.
- `frontend`: Per-credit editable "Monto a pagar" and "Consultas" fields with four visual states. Empty fields render "—" with validation-pending tooltip. All active credits are editable regardless of extraction status.

## Approach

1. Extend credit JSONB with `*Extracted`, `*Manual`, `*Effective`, `*NeedsReview` for both paymentDueAmount and numberOfInquiries
2. Backend: resolve `*Effective` on read — manual > confirmed auto > null. PATCH endpoint accepts manual values for any active credit
3. Frontend: inline editable fields per credit row with state badges (color-coded). Tooltip on empty/unconfirmed fields
4. `monthlyDebtContribution` aggregation reads `paymentDueAmountEffective` only
5. Document tech debt: auto-extraction frozen at current confidence; manual validation is the MVP path

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/src/documents/document-ai.types.ts` | Modified | New triple fields + source enum expansion |
| `apps/api/src/documents/credit-bureau-extraction.service.ts` | Modified | Populate extracted/effective on normalize |
| `apps/api/src/documents/documents.controller.ts` | Modified | PATCH accepts manual values for any credit |
| `apps/web/app/lib/extraction.ts` | Modified | Frontend type mirrors |
| `apps/web/app/ui/extraction/buro-tab.tsx` | Modified | Editable fields + visual states |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Existing records lack new triple fields | High | Default `*Extracted` from current `paymentDueAmount`; `*Effective` resolves via fallback chain |
| Analysts overwhelmed by editable fields on every credit | Medium | Visual states make priority clear — "Requiere revision" badges draw attention first |
| Source enum change (add LAYOUT/GEMINI) breaks existing UNCONFIRMED logic | Low | Additive enum; existing values preserved |

## Rollback Plan

Remove effective-resolution logic; revert `monthlyDebtContribution` to read `paymentDueAmount` directly. New JSONB fields are additive — no migration rollback needed. Frontend editable fields degrade to read-only display.

## Dependencies

- payment-due-guardrail (already merged — provides source tracking foundation)
- Sprint 3 liability module (consumer of effective values)

## Success Criteria

- [ ] ALL active credits show editable "Monto a pagar" regardless of extraction status
- [ ] Four visual states render correctly per amount (extraido/re vision/manual/auto)
- [ ] "Consultas ultimos 24 meses" is editable with same extracted/manual/effective pattern
- [ ] Empty/unconfirmed fields show "—" with tooltip
- [ ] `monthlyDebtContribution` uses `paymentDueAmountEffective` only
- [ ] Tech debt documented in codebase

## Tech Debt Note

> Auto-extraction is FROZEN at current confidence levels. Layout extractor covers known formats but cannot handle AMEX COMPANY edge cases or second-instance matching. Manual validation is the MVP path — full extractor redesign deferred to post-MVP when more bureau format samples are available.
