# Archive Report: giros-no-susceptibles

**Change**: giros-no-susceptibles  
**Archived**: 2026-09-30  
**Artifact store**: hybrid (OpenSpec + Engram)  
**Verify verdict**: PASS WITH WARNINGS (0 CRITICAL)  
**Tasks complete**: 17/17 (1.1–1.8, 2.1–2.9)  
**Branch**: `feature/giros-no-susceptibles`

## Engram Lineage (Observation IDs)

| Artifact | Observation ID | topic_key |
|----------|----------------|-----------|
| proposal | #652 | sdd/giros-no-susceptibles/proposal |
| spec | #653 | sdd/giros-no-susceptibles/spec |
| design | #654 | sdd/giros-no-susceptibles/design |
| tasks (decision) | #655 | sdd/giros-no-susceptibles/tasks |
| apply-progress | #656 | sdd/giros-no-susceptibles/apply-progress |
| verify-report | #657 | sdd/giros-no-susceptibles/verify-report |
| archive-report | (this file + Engram upsert) | sdd/giros-no-susceptibles/archive-report |

Note: Engram `tasks` #655 is a delivery-strategy decision (feature-branch-chain), not the full tasks markdown. Archived OpenSpec `tasks.md` is authoritative (17/17 `[x]`).

## Task Completion Gate

- All 17 implementation and verification tasks marked `[x]` in archived `tasks.md`
- verify-report #657: **0 CRITICAL**, verdict PASS WITH WARNINGS
- Orchestrator structured status: applyState all tasks checked; no archive-time checkbox reconciliation required

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| non-susceptible-activities | Created | Full spec copied to main (catalog + matcher, 2 requirements) |
| case-analysis | Updated | 2 ADDED: PFAE Non-Susceptible Activity Knockout, HSBC Liquidity Activity Restriction |
| pfae-validation | Updated | 1 ADDED: Non-Susceptible Activity Alert |
| frontend | Updated | Section 11: Non-Susceptible Reason Labels (1 requirement) |

Main specs updated at:

- `openspec/specs/non-susceptible-activities/spec.md` (new)
- `openspec/specs/case-analysis/spec.md`
- `openspec/specs/pfae-validation/spec.md`
- `openspec/specs/frontend/spec.md` (section 11)

All other requirements in each existing main spec were preserved.

## Archive Location

```
openspec/changes/archive/2026-09-30-giros-no-susceptibles/
```

Active changes directory no longer contains `giros-no-susceptibles`.

## Archive Contents

- proposal.md ✅
- exploration.md ✅
- specs/ (4 domains) ✅
- design.md ✅
- tasks.md ✅ (17/17 complete)
- apply-progress.md ✅
- verify-report.md ✅
- archive-report.md ✅

## Verification Summary (from #657)

- Focused API Jest (3 files): 184/184 passed
- Web vitest (`reason-labels.spec.ts`): 3/3 passed
- Case-analysis regression: 338/338 passed
- API and web production builds: pass
- Spec compliance: 16 COMPLIANT, 1 PARTIAL (catalog shape), 0 FAILING

## Accepted Non-Blockers (orchestrator + verify)

- **HSBC catalog shape**: Spec describes one HSBC entry with four subsectors; implementation uses four catalog entries sharing one scope object — behavioral coverage complete; archived as intentional representation deviation (PARTIAL, not blocking).
- **Lint debt and review size**: High ~650-line forecast; feature-branch-chain delivery; not archive blockers.
- **Next.js lockfile warning**: Separate pending item outside this change scope.

## SDD Cycle Complete

The change has been fully planned, implemented, verified, and archived. Application code remains on branch `feature/giros-no-susceptibles`; orchestrator may commit when ready (no commit performed by archive phase).
