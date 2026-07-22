# Archive Report: HU-14A — Unificar flujo de análisis

**Archived**: 2026-07-21
**Change**: `hu-14a-unificar-analisis`
**Verdict**: PASS WITH WARNINGS (intentional archive with documented override)
**Engram observation ID**: 403

---

## Task Completion Gate

| Metric | Value |
|--------|-------|
| Implementation tasks complete | 15 / 15 |
| Manual verification tasks unchecked | 2 (4.2, 4.3 — non-blocking) |
| Test pass rate | 830 / 830 (47 suites) |
| Gate | **PASSED** |

Tasks 4.2 (manual smoke test) and 4.3 (bankViability snapshot verification) remain unchecked. They are documented as non-blocking per the verify-report; they require running frontend + DB with test data, which is outside the apply phase scope.

## Verify-Report Status

| Check | Result |
|-------|--------|
| Type check (tsc) | 6 pre-existing errors (not from this change) |
| Tests | 830 passed / 0 failed |
| Spec compliance | 7 / 7 scenarios |
| Design coherence | 6 / 6 decisions |
| Verdict | **PASS WITH WARNINGS** |

### Intentional Archive Override (recorded)

The verify-report labels "Missing TDD apply-progress evidence" as CRITICAL. Treated as **process documentation gap, not a correctness defect**, because:

- 830 / 830 tests pass (47 suites, no regressions)
- 7 / 7 spec compliance scenarios verified via static evidence (line-cited)
- 6 / 6 design decisions confirmed implemented at expected line numbers
- All spec-required behaviors (phased execution, income fallback, single button, removed endpoints) covered by unit tests
- The verifier's own verdict is PASS WITH WARNINGS, not FAIL

Per the `sdd-archive` skill's intentional-with-warnings policy, the orchestrator's explicit approval of this archive is recorded here.

### Non-Blocking Warnings (carried forward)

- Tasks 4.2 (manual smoke test) and 4.3 (bankViability snapshot verify) unchecked
- Stale JSDoc comments in `income-calculation.controller.ts:54` and `apps/web/app/actions/income.ts:16` still reference removed `POST /confirm` endpoints — cosmetic
- 6 pre-existing tsc errors in unrelated files (pagadora-detection, bankarization.types, credit-bureau-extraction specs) — not introduced by this change

---

## Specs Synced

### case-analysis — `openspec/specs/case-analysis/spec.md`

| Action | Requirement | Notes |
|--------|-------------|-------|
| REMOVED | Review Decision Actions | Entire requirement deleted. Reason: MVP eliminates manual confirmation workflow. Migration: `ReviewDecision` model and endpoints are removed. |
| MODIFIED | AnalysisRun Lifecycle | Removed `reviewDecision` field from schema table. Removed "Review decision does not mutate raw result" scenario. Added Phase B orchestration text. |
| MODIFIED | AnalysisRule Interface | Added clause: rules SHALL NOT transition case to `REQUIRES_REVIEW` status on FAIL. |
| ADDED | Phased Orchestration | 3-phase execution requirement with 2 scenarios. |
| ADDED | Income Fallback in Bank Viability | Nullish fallback requirement with 1 scenario. |

File: 94 → 103 lines, net +2 requirements.

### income-calculation — `openspec/specs/income-calculation/spec.md`

| Action | Requirement | Notes |
|--------|-------------|-------|
| REMOVED | Manual Confirmation | Entire requirement deleted. Reason: MVP uses calculated income directly. |
| REMOVED | Simple States | Entire requirement deleted. Reason: CALCULATED → CONFIRMED transition no longer exists. |
| MODIFIED | Snapshot Persistence and Retrieval | Added "no CONFIRMED transition occurs" clause. Updated scenario wording. |
| (incidental) | Purpose | Updated to remove references to "manual confirmation" and "simple states". |

File: 122 → 95 lines, net -2 requirements.

### frontend — `openspec/specs/frontend/spec.md`

| Action | Requirement | Notes |
|--------|-------------|-------|
| ADDED | Single Analysis Button | New requirement for "Analizar expediente" button. |
| ADDED | Auto-Refresh on Completion | New requirement for tab refresh on analysis completion. |
| (informational) | Removed UI inventory | Documented removed buttons, components, and server actions. |
| REMOVED requirements (delta) | Individual Analysis Triggers, Review Confirmation UI, Income Confirmation Panel | **No-op in main spec**: these requirements were never present in `openspec/specs/frontend/spec.md` (which is the HU-04 base spec). They lived in component files (`analysis-section.tsx`, `estados-conciliacion.tsx`, `income-calculation-section.tsx`) that are not part of the main spec structure. Removal is documented in the new "Removed UI" subsection for traceability. |

File: 181 → 218 lines, net +2 requirements +1 inventory section.

### unified-analysis-flow

Already present at `openspec/specs/unified-analysis-flow/spec.md`. No merge needed — the full spec was created directly during the proposal phase, not as a delta.

---

## Known Inconsistencies Surfaced (carry-forward, not blocking)

1. **`openspec/specs/income-calculation/spec.md` — `Payroll Receipt Display`**: still mentions "review status" as a column. The per-receipt "PENDIENTE / REVISADO" toggle was removed in the frontend (`estados-conciliacion.tsx`). The income-calculation delta did NOT explicitly call this out for modification, so it was left as-is to keep merge scope discipline. Recommended follow-up: remove the "review status" column reference or restore the feature.

2. **`openspec/specs/income-calculation/spec.md` — Purpose**: updated inline (incidental fix) to remove stale references. Not a delta-driven change but a consistency fix necessary to avoid contradicting the new "no CONFIRMED transition" clause.

---

## Archive Contents

```
openspec/changes/archive/2026-07-21-hu-14a-unificar-analisis/
├── archive-report.md            ← this file
├── proposal.md                  ✅
├── design.md                    ✅
├── tasks.md                     ✅ (15/15 implementation complete; 2 manual unchecked, non-blocking)
├── verify-report.md             ✅
├── exploration.md               ✅
└── specs/
    ├── case-analysis/spec.md    ✅
    ├── income-calculation/spec.md ✅
    └── frontend/spec.md         ✅
```

## Source of Truth Updated

- `openspec/specs/case-analysis/spec.md` (synced)
- `openspec/specs/income-calculation/spec.md` (synced)
- `openspec/specs/frontend/spec.md` (synced)
- `openspec/specs/unified-analysis-flow/spec.md` (no change, was already full spec)

## SDD Cycle Status

**COMPLETE.** The change has been fully planned, implemented, verified, and archived. Active changes directory no longer contains `hu-14a-unificar-analisis`. Ready for the next change.
