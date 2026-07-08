# Proposal: Payment Due Guardrail

## Intent

`paymentDueAmount` from auto-extraction can be unreliable (low layout confidence, no match). Today, `needsManualReview` is set in the backend but **never read by the frontend** — flagged credits are invisible to analysts. Unconfirmed amounts silently feed `monthlyDebtContribution` computation, risking incorrect liability totals in Sprint 3. This change adds a guardrail: unconfirmed amounts must NOT auto-calculate liability, and analysts must see and resolve review flags.

## Scope

### In Scope
- Backend guardrail in `normalizeCreditBureau()`: block unconfirmed `paymentDueAmount` from `monthlyDebtContribution`
- New credit fields: `paymentDueAmountSource`, `paymentDueAmountConfirmed`, `paymentDueAmountManualOverride`
- Frontend review indicators: "Requiere revision" badge, "Monto a pagar no confirmado" warning
- Manual override UI: confirm or correct amount per credit
- Technical debt documentation for full auto-extraction confidence

### Out of Scope
- Full liability/passive calculation module (Sprint 3)
- Redesigning the layout extractor
- Relational credit table migration (credits remain JSONB)

## Capabilities

### New Capabilities
- `credit-review`: UI and backend endpoints for analysts to confirm or manually override `paymentDueAmount` per credit, with source tracking (`UNCONFIRMED` | `MANUAL` | `CONFIRMED_AUTO`)

### Modified Capabilities
- `bureau-extraction`: Guardrail in `normalizeCreditBureau()` — when `needsManualReview=true` or layout confidence is LOW, set `paymentDueAmountSource=UNCONFIRMED` and exclude from `monthlyDebtContribution` aggregation until confirmed

## Approach

1. Add `paymentDueAmountSource`, `paymentDueAmountConfirmed`, `paymentDueAmountManualOverride` fields to credit JSONB schema
2. In `mergeLayoutWithGemini()` / `normalizeCreditBureau()`: when confidence is LOW or no layout match, set source to `UNCONFIRMED` and flag for review
3. In liability aggregation (Sprint 3 prep): use `paymentDueAmountManualOverride` if present, else confirmed auto amount, else skip (mark pending)
4. Frontend `buro-tab.tsx`: render review badge per credit, inline confirm/correct actions
5. Backend: add PATCH endpoint to update override and confirmation status

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/src/documents/credit-bureau-extraction.service.ts` | Modified | Guardrail logic in `normalizeCreditBureau()` and `mergeLayoutWithGemini()` |
| `apps/web/app/ui/extraction/buro-tab.tsx` | Modified | Review indicators and override UI per credit |
| `apps/web/app/lib/extraction.ts` | Modified | New fields in frontend types |
| Credit JSONB data model | Modified | New fields (no Prisma schema change — JSONB) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Existing extractions lack new fields | High | Default `paymentDueAmountSource` to `UNCONFIRMED` for records missing the field |
| Analysts skip review, blocking liability calc | Medium | Clear UI warnings; liability module shows "N credits pending review" count |
| Override pattern diverges from bank statement `CorrectionSource` | Low | Document difference; bank statements use enum, credits use source+confirmed+override triple |

## Rollback Plan

Remove guardrail check in `normalizeCreditBureau()` — revert to current behavior where all `paymentDueAmount` values feed computation. New JSONB fields are additive and backward-compatible; no migration rollback needed.

## Dependencies

- Sprint 3 liability module (consumer of the guardrail — not a blocker, guardrail is prerequisite)

## Success Criteria

- [ ] Credits with `needsManualReview=true` show "Requiere revision" in frontend
- [ ] Unconfirmed `paymentDueAmount` does NOT contribute to `monthlyDebtContribution`
- [ ] Analyst can confirm or override amount per credit via UI
- [ ] `paymentDueAmountSource` correctly reflects extraction origin for all credits

## Technical Debt Note

> Extraccion automatica completa de `paymentDueAmount` en Bureau de Credito requiere trabajo posterior con mas formatos reales de prueba. Current layout extraction covers known formats but confidence scoring needs calibration with broader PDF samples.
