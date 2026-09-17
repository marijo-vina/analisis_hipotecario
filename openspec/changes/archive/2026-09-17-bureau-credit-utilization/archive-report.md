# Archive Report: bureau-credit-utilization

**Change**: bureau-credit-utilization  
**Archived**: 2026-09-17  
**Artifact store**: hybrid (OpenSpec + Engram)  
**Verify verdict**: PASS WITH WARNINGS (0 CRITICAL)  
**Tasks complete**: 14/14  
**Branch**: `feature/bureau-credit-utilization`

## Engram Lineage (Observation IDs)

| Artifact | Observation ID | topic_key |
|----------|----------------|-----------|
| proposal | #612 | sdd/bureau-credit-utilization/proposal |
| spec | #613 | sdd/bureau-credit-utilization/spec |
| design | #614 | sdd/bureau-credit-utilization/design |
| tasks | #615 | sdd/bureau-credit-utilization/tasks |
| apply-progress | #617 | sdd/bureau-credit-utilization/apply-progress |
| verify-report | #618 | sdd/bureau-credit-utilization/verify-report |
| user QA decision | #609 | (decision — PFAE Buro QA confirmed) |
| archive-report | (this file + Engram upsert) | sdd/bureau-credit-utilization/archive-report |

Note: Engram `tasks` #615 is stale (3.1–3.2 unchecked at last save). Archived OpenSpec `tasks.md` is authoritative (14/14 `[x]`).

## Task Completion Gate

- All 14 implementation and verification tasks marked `[x]` in archived `tasks.md`
- verify-report #618: **0 CRITICAL**, verdict PASS WITH WARNINGS
- User confirmed PFAE Buro QA complete ("ya quedó") — observation #609; task 3.2 closed by orchestrator after live expediente validation

## Post-Verify Implementation (shipped after verify, included in archive)

These fixes landed in the working tree after sdd-verify and are part of the shipped behavior documented in merged specs:

1. **Predicate fix**: `isInScope` trusts `creditType` `/tarjeta/i` for NON_BANK_SERVICE credits in créditos no bancarios (AMEX). MORTGAGE/AUTO always excluded; PERSONAL_LOAN/FIXED_PAYMENT/NON_BANK_SERVICE excluded only when creditType is not tarjeta.
2. **Last-4 OCR next-line parse**: Institution cell shows `****` + last 4 from persisted `accountNumber` or OCR next-line digit parse under Institución.

Delta spec and proposal in this archive were updated to match shipped predicate before folder move.

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| frontend | Updated | 2 ADDED: Shared Buro Utilization Display (with NON_BANK_SERVICE tarjeta scenario), Masked Last-4 under Institution — section 10 |
| bureau-extraction | Updated | 1 ADDED: Persist Account Number on Extract |
| coordinate-extraction | Updated | 1 ADDED: Parse Account Number from Creditor Info |

Main specs updated at:

- `openspec/specs/frontend/spec.md` (section 10 appended)
- `openspec/specs/bureau-extraction/spec.md`
- `openspec/specs/coordinate-extraction/spec.md`

All other requirements in each main spec were preserved.

## Archive Location

```
openspec/changes/archive/2026-09-17-bureau-credit-utilization/
```

Active changes directory no longer contains this change.

## Archive Contents

- proposal.md ✅
- exploration.md ✅
- specs/ (3 domains) ✅
- design.md ✅
- tasks.md ✅ (14/14 complete)
- verify-report.md ✅
- state.yaml ✅
- archive-report.md ✅

## Verification Summary (from #618)

- API Jest (3 extractor/merge files): 153/153 passed
- Web vitest (`bureau-utilization.spec.ts`): 36/36 passed
- Spec compliance: 5/9 ✅ COMPLIANT, 4/9 ⚠️ PARTIAL (UI render paths; helper/API cover behavioral contract)
- Manual QA 2026-09-17: utilization on open revolving (BBVA) and NON_BANK_SERVICE AMEX tarjetas; last-4 under Institución; closed/telco/leasing still dash; shared BuroTab (no personType fork)

## Known Non-Blockers (from verify)

- No component/browser tests for `BuroTab` (v1 design: E2E none)
- vitest pinned ^3.2.7 (not 5.x); `extractBlockValues` exported for tests
- Spec-file typecheck warnings (`CreditStub` not Partial; coordinate stub missing `sectionType`)
- `layout-lines-extractor.ts` whole-file coverage 56% (new parser tested)

## SDD Cycle Complete

The change has been fully planned, implemented, verified, manually QA'd, and archived. Ready for orchestrator git commit on `feature/bureau-credit-utilization`.
