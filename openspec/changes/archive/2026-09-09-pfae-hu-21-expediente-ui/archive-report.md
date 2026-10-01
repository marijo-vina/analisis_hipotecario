# Archive Report: pfae-hu-21-expediente-ui

**Change**: pfae-hu-21-expediente-ui  
**Archived**: 2026-09-09  
**Artifact store**: hybrid (OpenSpec + Engram)  
**Verify verdict**: PASS WITH WARNINGS (0 CRITICAL)  
**Tasks complete**: 14/14  
**Branch**: `feature/pfae-hu-21-expediente-ui`

## Engram Lineage (Observation IDs)

| Artifact | Observation ID | topic_key |
|----------|----------------|-----------|
| proposal | #588 | sdd/pfae-hu-21-expediente-ui/proposal |
| spec | #589 | sdd/pfae-hu-21-expediente-ui/spec |
| design | #590 | sdd/pfae-hu-21-expediente-ui/design |
| tasks | #591 | sdd/pfae-hu-21-expediente-ui/tasks |
| apply-progress | #593 | sdd/pfae-hu-21-expediente-ui/apply-progress |
| verify-report | #595 | sdd/pfae-hu-21-expediente-ui/verify-report |
| archive-report | #597 | sdd/pfae-hu-21-expediente-ui/archive-report |

Note: Engram `apply-progress` #593 is stale (Unit-4 snapshot; 5.1–5.2 unchecked). Local OpenSpec `tasks.md` and `apply-progress.md` in this archive are authoritative (14/14 `[x]`).

## Task Completion Gate

- All 14 implementation and verification tasks marked `[x]` in archived `tasks.md`
- Local `apply-progress.md` confirms Units 1–4 complete; 5.1–5.2 checked after advisor QA
- verify-report #595: **0 CRITICAL**, verdict PASS WITH WARNINGS
- User explicitly approved archive after manual QA 2026-09-09

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| frontend | Updated | 5 ADDED: PFAE Visual Kit and Tab Shell, Validaciones Gates Card, Dual-Base Picker, Comparativa Detail Extras, Solely-Salaried FAIL Non-Viable Presentation |
| unified-analysis-flow | Updated | 1 MODIFIED: Income-Source Switch Re-runs Phase C (lifted HU-20 expediente UI freeze) |
| pfae-validation | Updated | 1 ADDED: Validaciones Gate Render |
| income-calculation | Updated | 1 ADDED: PFAE Cálculo Panel |
| case-analysis | Updated | 1 ADDED: BankResult Factor Audit |

Main specs updated at:
- `openspec/specs/frontend/spec.md` (section 9 appended)
- `openspec/specs/unified-analysis-flow/spec.md`
- `openspec/specs/pfae-validation/spec.md`
- `openspec/specs/income-calculation/spec.md`
- `openspec/specs/case-analysis/spec.md`

All other requirements in each main spec were preserved.

## Archive Location

```
openspec/changes/archive/2026-09-09-pfae-hu-21-expediente-ui/
```

Active changes directory no longer contains this change.

## Archive Contents

- proposal.md ✅
- exploration.md ✅
- specs/ (5 domains) ✅
- design.md ✅
- tasks.md ✅ (14/14 complete)
- apply-progress.md ✅
- verify-report.md ✅
- archive-report.md ✅

## Orchestrator Notes

- **Verify: PASS WITH WARNINGS, 0 CRITICAL.** Focused 252/252, full API 1187/1187, typecheck clean.
- **Manual QA 2026-09-09** after medical seed + date/tenure/giro copy follow-up. User said listo, then verify, then approved archive.
- **Seed applied 2026-09-09** (50 activity factors). Consultorio SAT MATRIX aliases in `seed-data.ts`.
- **Follow-up before archive:** `seed-data.spec.ts` consultorio test now guards `matrixBanks.length > 0` (user accepted verify suggestion).
- **User asked orchestrator to git commit AND push the HU-21 branch** after archive (unlike HU-20 which was local-only). Branch: `feature/pfae-hu-21-expediente-ui`. Do not merge to `perfil-pfae` unless user asks (they did not; only commit+push this feature branch).
- **Known non-blockers:** no web Jest (HU-20 convention); `analysis-section.tsx` grew to 1103 lines (wiring only); Banorte 0.70 backlog; double `resolvePfaeFactor` documented.

## Verification Summary (from #595)

- Focused HU-21 tests: 252/252 passed (9 suites)
- Full API suite: 1187/1187 passed (64 suites)
- Typecheck: apps/api and apps/web clean
- Spec compliance: 6/26 COMPLIANT (API/QA locks), 20/26 PARTIAL (UI-only, no web Jest), 0 FAILING
- Warnings (non-blocking): no web Jest, parent file growth, Engram apply-progress stale, filter-loop seed assertion (fixed pre-archive)

## SDD Cycle Complete

The change has been fully planned, implemented, verified, manually QA'd, and archived. Ready for the next change.
