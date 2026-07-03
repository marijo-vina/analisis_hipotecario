# Proposal: Fix Bureau Extraction Context Separation

## Intent

The credit bureau extraction (Task 2.10) has six critical data-accuracy bugs caused by the AI model crossing document boundaries, confusing field semantics, and misinterpreting MOP codes. These produce wrong scores, wrong payment amounts, false delinquency flags, and spurious balance alerts — all of which undermine the mortgage analyst's trust in the system.

## Scope

### In Scope
- Enforce strict per-document extraction context: each document's OCR is extracted independently, never cross-referenced
- Separate CREDIT_SCORE document type from REPORT_CREDIT_BUREAU; score is optional (null when "Mi Score" doc absent)
- Fix `amountToPay` field mapping: "Pago rep." column must use paymentDueAmount ("Monto a Pagar"), NOT lastPaymentAmount
- Fix MOP flag thresholds: MOP 0-1 = current, 2-3 = minor delay, 4-8 = serious, 9 = fraud; "U" = no info (not delay)
- Fix observation key interpretation: LC=quita, UP=quebranto, FD=fraude, RI=robo identidad
- Fix balance alert: distinguish null (undetectable) from 0 (explicitly zero) — only null triggers BURO_MISSING_BALANCE
- Mark closed credits so future Sprint 3 pasivos can exclude them (zero monthly debt contribution)
- Frontend: show "Score no disponible" + note when score is null; show "Fuente: Mi Score" when from CREDIT_SCORE doc
- Validation case: PDF "BC - ALEJANDRO DIAZ" must yield 16 credits (8 active, 8 closed), score=null, RFC=DICA690402SD3

### Out of Scope
- Sprint 3 pasivos/debt-ratio calculations (only prepare data shape)
- New UI for uploading/processing separate Mi Score documents

## Capabilities

### New Capabilities
- `credit-score-extraction`: Separate extraction pipeline for CREDIT_SCORE document type ("Mi Score"), independent from REPORT_CREDIT_BUREAU

### Modified Capabilities
- None at the spec level — this is a bugfix within the existing bureau extraction capability. No `openspec/specs/` entry covers bureau extraction yet (it was part of Task 2.10 without a dedicated spec).

## Approach

1. **Backend — Gemini prompt isolation**: Rewrite `CREDIT_BUREAU_INSTRUCTIONS` to remove all score-related instructions. Add explicit rule: "Extract ONLY from this document's text. Never infer or cross-reference other documents."
2. **Backend — CREDIT_SCORE extraction**: Add `CREDIT_SCORE` to document type seed. Create extraction service (or extend existing) that handles the "Mi Score" document separately, producing `{ score, scoreIsExcluded, scoreExclusionReason }`.
3. **Backend — Field mapping fix**: Split `amountToPay` instruction into two distinct fields: `paymentDueAmount` ("Monto a Pagar") and `lastPaymentAmount` ("Monto Último Pago"). Update schema and instructions.
4. **Backend — MOP threshold fix**: Change `hasLatePayments` rule from `MOP >= 1` to `MOP >= 2`. Update instructions to clarify 0-1 = current.
5. **Backend — Balance alert fix**: Change `BURO_MISSING_BALANCE` filter from `balance == null || balance === 0` to `balance == null` only.
6. **Backend — Closed credit marker**: Add `isClosed: boolean` and `monthlyDebtContribution: number` (0 for closed) to credit output schema.
7. **Frontend — `extraction.ts`**: Update `ParsedCreditBureauCredit` type with new fields. Update `parseBuro` to read score from separate CREDIT_SCORE document. Fix balance alert parsing.
8. **Frontend — `buro-tab.tsx`**: Handle null score display ("Score no disponible" + "El cliente no adjuntó documento Mi Score"). Show "Fuente: Mi Score" when score comes from CREDIT_SCORE doc. Base diagnosis only on report alerts.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/src/documents/credit-bureau-extraction.service.ts` | Modified | Prompt rewrite, MOP thresholds, balance alert fix, field split |
| `apps/api/src/documents/credit-bureau-extraction.service.spec.ts` | Modified | New test cases for all six fixes + validation case |
| `apps/api/prisma/seed.ts` | Modified | Add CREDIT_SCORE document type |
| `apps/web/app/lib/extraction.ts` | Modified | ParsedCreditBureau types, parseBuro function — optional score, new fields |
| `apps/web/app/ui/extraction/buro-tab.tsx` | Modified | Null score UI, score source label, diagnosis decoupling |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Gemini ignores prompt isolation and still infers score from report text | Medium | Add explicit negative examples in instructions; validate with test PDF |
| CREDIT_SCORE doc type requires DB migration (seed-only vs migration) | Low | Check if DocumentType is seed-managed; add migration if needed |
| Existing extracted data in production has wrong values | Medium | Document that re-extraction is needed; add migration script or admin endpoint |
| Frontend breaks if old extractedData lacks new fields | Low | Null-safe parsing with fallbacks in `parseBuro` |

## Rollback Plan

Revert the extraction service prompt and schema changes. Old prompt/schema is backward-compatible (Gemini output is JSON). Frontend changes are null-safe — old data without new fields renders correctly with existing fallbacks. No DB schema changes to roll back (seed-only).

## Dependencies

- Document type `CREDIT_SCORE` must exist in `DocumentType` seed/migration before extraction can process it
- Validation PDF "BC - ALEJANDRO DIAZ - 2025.08.22" must be available in test fixtures

## Success Criteria

- [ ] Test PDF "BC - ALEJANDRO DIAZ" yields: 16 credits (8 active, 8 closed), score=null, RFC=DICA690402SD3, birth=02-04-1969
- [ ] No false BURO_MISSING_BALANCE alerts when currentBalance is explicitly $0.00
- [ ] MOP codes 0-1 do NOT trigger hasLatePayments; only codes 2+ do
- [ ] "Mi Score" document produces score independently; absence yields score=null (not inferred)
- [ ] "Pago rep." column shows paymentDueAmount, not lastPaymentAmount
- [ ] Closed credits render in table but carry `monthlyDebtContribution: 0`
- [ ] Frontend shows "Score no disponible" with explanatory note when score is null
