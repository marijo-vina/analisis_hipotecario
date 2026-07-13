# Proposal: Integrate Coordinate-Based PDF Extraction into Credit Bureau Flow

## Intent

Replace Gemini as the primary extraction method for credit bureau payment data. Coordinate extraction is deterministic, free, and completes in 2-3 seconds (vs Gemini's 5-10s + API cost). Current POC accuracy is 71-77% with safe failures (UNCONFIRMED) — no hallucinated values. Gemini remains as a fallback for uncertain cases.

## Scope

### In Scope
1. Wire `CoordinateExtractionService` into `CreditBureauExtractionService.extract()` as primary method
2. BAND_MATCH → authoritative value; RESCUE/UNCONFIRMED → Gemini fallback
3. Compute `paymentDueAmountEffective` from the triple pattern (extracted / manual / effective)
4. Remove feature flag, make coordinate extraction the default flow
5. Frontend: add visual source indicators (BAND_MATCH, RESCUE, GEMINI, MANUAL chips)
6. Keep `POST /documents/:id/coordinate-extract` dev endpoint for debugging

### Out of Scope
- Per-format kill switches (overengineering for Sprint 3)
- A/B testing or shadow mode (deterministic algorithm)
- Numeric confidence scores in UI (qualitative labels only)

## Capabilities

### New Capabilities
None (integration of existing coordinate extraction POC)

### Modified Capabilities
- `bureau-extraction`: Changes primary extraction pipeline from Gemini-first to coordinate-first with Gemini fallback; adds `paymentDueAmountEffective` computation

## Approach

1. **Backend wiring**: In `CreditBureauExtractionService.extract()`, run coordinate extraction first. If source is `BAND_MATCH`, set `paymentDueAmount` and skip Gemini. If `RESCUE` or `UNCONFIRMED`, run Gemini and merge. Apply manual override last to compute `paymentDueAmountEffective`.
2. **Feature flag removal**: `COORDINATE_EXTRACTION_ENABLED` becomes the default. Setting it to `false` reverts to Gemini-only (rollback path).
3. **Frontend**: Extend existing payment editing UI with colored source chips mapped from `PaymentDueAmountSource` enum.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/src/documents/credit-bureau-extraction.service.ts` | Modified | Primary flow now calls coordinate extraction before Gemini |
| `apps/api/src/documents/coordinate-extraction.service.ts` | Modified | Remove feature-gate logic, integrate as default |
| `apps/api/src/documents/coordinate-extraction.types.ts` | Modified | Ensure `paymentDueAmountEffective` type is exported |
| Frontend payment table | Modified | Add source chips + confidence styling |
| `PaymentDueAmountSource` enum | No change | Already has BAND_MATCH, RESCUE, GEMINI, UNCONFIRMED, MANUAL |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Accuracy drops on new PDF format variants | Med | Safe fallback to Gemini; failures produce UNCONFIRMED, not wrong values |
| Coordinate extraction breaks on layout changes | Low | Conservative rescue logic; manual override always wins |
| Reviewer overload from large diff | Med | Chained PRs: (1) backend wiring, (2) frontend indicators |

## Rollback Plan

Set `COORDINATE_EXTRACTION_ENABLED=false` env var. System reverts to Gemini-only extraction instantly. No migration needed — data model unchanged.

## Dependencies

None. pdfjs-dist and coordinate extractor already compiled and tested in integration branch.

## Success Criteria

- [ ] BAND_MATCH values skip Gemini and are used as authoritative `paymentDueAmount`
- [ ] RESCUE/UNCONFIRMED values trigger Gemini fallback
- [ ] Manual override correctly sets `paymentDueAmountEffective` and source = MANUAL
- [ ] Frontend displays source chips for all 4 states
- [ ] `COORDINATE_EXTRACTION_ENABLED=false` reverts to Gemini-only flow
- [ ] 7 existing coordinate extractor tests remain green
- [ ] PR review slices stay under 400 changed lines
