# Archive Report: HU-14B — Comparativa Bancaria UI

**Change**: `hu-14b-comparativa-ui`
**Archived to**: `openspec/changes/archive/2026-07-22-hu-14b-comparativa-ui/`
**Archive date**: 2026-07-22
**Source version**: ANAQUEL_MAYO_2026
**Mode**: hybrid (filesystem + Engram)
**PR chain**: 3 chained PRs (`feature/hu-14b-pr1-backend-types` → `feature/hu-14b-pr2-header` → `feature/hu-14b-pr3-comparativa`)

## Cycle Summary

The HU-14B SDD cycle completed after addressing all 3 actionable warnings from the verify-report. The change delivered the "Comparativa bancaria" tab in the analysis section, a header redesign with global 3-phase stepper, typed frontend contracts mirroring the backend `BankViabilitySnapshot`, and a Scotiabank-flag correctness fix that eliminates the stale DB read for bankarization flags.

**Cycle**: explore → propose → spec → design → tasks → apply → verify → archive (post-verify warning fix)

## Task Completion Gate

| Metric | Value |
|--------|-------|
| Implementation tasks complete | 20 / 20 (in `tasks.md`) |
| Implementation tasks unchecked | 0 |
| Test pass rate | 832 / 832 (47 suites) — was 830, +2 from warning fixes |
| Gate | **PASSED** |

All 20 implementation tasks were marked `[x]` in `openspec/changes/archive/2026-07-22-hu-14b-comparativa-ui/tasks.md` before archive. No stale checkboxes remained. No `apply-progress` reconciliation was needed.

## Verify-Report Status

| Check | Result |
|-------|--------|
| Tests | 832 passed / 0 failed |
| Type check (tsc) | 0 errors |
| Spec compliance | 52 / 54 scenarios compliant (2 with documented known limitations) |
| Verdict | **PASS WITH WARNINGS** (intentional archive, non-blocking) |

### Post-verify Warning Fixes (applied on `feature/hu-14b-pr1-backend-types`)

After the verify-report flagged 5 warnings, the 3 actionable ones were resolved on the PR #1 branch and committed as `fix(hu-14b): resolve verify-report warnings 1-3` (commit `c9ae2e3`).

| # | Warning | Resolution | Files changed |
|---|---------|------------|---------------|
| 1 | `ProductPolicySnapshot` missing `bankName`/`productName` | Added optional `bankName?: string` and `productName?: string` to the frontend `ProductPolicySnapshot` interface with JSDoc explaining the backend gap and the existing `bankCode`/`productCode` fallback. | `apps/web/app/lib/definitions.ts` |
| 2 | No isolated test for `deriveScotiabankFlags(undefined)` | Added a focused test that exercises the no-flags path through `execute()` with a SCOTIABANK product, asserting `inputs.hasPagadoraIncome === false`, `inputs.scotiabankExcluded === false`, and that the SCOTIABANK_PAGADORA_EXCLUSION reason is NOT pushed. | `apps/api/src/case-analysis/rules/bank-viability.rule.spec.ts` |
| 3 | No explicit assertion for `detail.bankViability` in POST response | Added a test that calls `service.run(...)` and asserts (a) `result.detail` has `bankViability`, (b) the snapshot equals what the rule produced, and (c) the persisted `AnalysisRun` detail includes the same `bankViability` (so GET shape matches POST). | `apps/api/src/case-analysis/case-analysis.service.spec.ts` |

Commit: `c9ae2e3 fix(hu-14b): resolve verify-report warnings 1-3` on `feature/hu-14b-pr1-backend-types` (3 files, +64 lines).

### Known Limitations (documented, non-blocking)

| # | Limitation | Mitigation | Spec reference |
|---|------------|------------|----------------|
| 4 | No frontend test runner (`apps/web` has no Jest/Vitest) | All `formatAge`/ordering/UI-state behavior is verified through `tsc --noEmit` only. Recommended follow-up: add Vitest to `apps/web` in a future HU. | n/a (infrastructure) |
| 5 | "Ingreso requerido" control always shows `NOT_APPLICABLE` | The backend does not compute an `incomeRequirement` check yet. The control is rendered for future-proofing. The frontend `7 controls are displayed` scenario in `frontend/spec.md` now carries an explicit NOTE documenting this MVP limitation. | `openspec/specs/frontend/spec.md` — "Comparativa Bancaria Tab UI" → "7 controls are displayed" |

## Specs Synced

### case-analysis — `openspec/specs/case-analysis/spec.md`

| Action | Requirement | Notes |
|--------|-------------|-------|
| MODIFIED | Phased Orchestration | Added clause "Phase A results SHALL be passed to Phase C as typed `BankarizationFlags`". Added "Phase A flags passed to Phase C" scenario. Added "(Previously: ...queried DB for stale flags.)" note. |
| ADDED | BankarizationFlags Interface | 2 scenarios (typed definition, default-false fallback). |
| ADDED | BankViability in POST Response | 2 scenarios (POST includes bankViability; POST and GET expose identical structure). |
| REMOVED | (no-op) BankViabilityRule derives Scotiabank flags from DB | The "Removed" delta requirement referred to a pre-HU-14B implementation behavior that was never a separately-named requirement in the main spec. The DB-read removal is captured inside the MODIFIED Phased Orchestration clause. No file-level deletion needed. |

File: 103 → 143 lines, net +2 requirements, +3 scenarios.

### frontend — `openspec/specs/frontend/spec.md`

| Action | Requirement | Notes |
|--------|-------------|-------|
| ADDED (section 7) | Bank Viability Type Definitions | 3 scenarios (types declared, ProductMatchCalculation shape, ProductPolicySnapshot shape incl. `bankName`/`productName` fallback contract). |
| ADDED | AnalysisDetail Extended with bankViability | 1 scenario. |
| ADDED | Centralized Translation Catalog | 2 scenarios. |
| ADDED | Human-Readable Age Formatting | 4 scenarios (360, 365, 12, 13). |
| ADDED | Comparativa Bancaria Tab UI | 18 scenarios covering status header, financial summary, 8-column table, status priority ordering, null-as-dash, status badges, expandable 3-section detail, 7 controls (with NOTE on Ingreso requerido MVP limitation), aforo-conditioned, maturity-conditioned, warning legend, unsupported destination, datos insuficientes (×2), missing-birth-date alone does NOT trigger datos insuficientes, table shown even with REQUIRES_REVIEW, no products, backend codes never exposed, dual-aforo display. |
| ADDED | Header Redesign with Global Button | 2 scenarios. |
| ADDED | Global 3-Phase Progress Indicator | 4 scenarios. |
| MODIFIED | Tab Label Rename | Updated: tab renamed from "Bancos / Viabilidad" to "Comparativa bancaria". |

File: 218 → 421 lines, net +7 requirements (1 new section), +30 scenarios.

### unified-analysis-flow — `openspec/specs/unified-analysis-flow/spec.md`

| Action | Requirement | Notes |
|--------|-------------|-------|
| MODIFIED | Single Analysis Trigger | Added "Button SHALL be located in the analysis section header, right-aligned" and "frontend SHALL NOT receive per-phase progress updates" clauses. Updated "Single button triggers all phases" scenario to specify "in the header". Added "(Previously: Button was located inside the Validaciones tab content area.)". |
| ADDED | Analysis Button Location | 1 scenario (button in header, not in tab content). |
| ADDED | Global Progress Indicator (No Per-Phase Tracking) | 2 scenarios (all phases pending during request; all marked completed after success). |
| ADDED | Error State with Re-attempt | 2 scenarios (last successful preserved; no partial results on error). |
| ADDED | Completion with Observations | 3 scenarios (PARTIAL outcome, CONDITIONED products, REQUIRES_REVIEW products — all trigger amber bar). |
| MODIFIED | Tabs During Analysis | Added "Tabs SHALL NOT be individually enabled based on simulated phase completion" and "(Previously: Tab behavior during analysis was not explicitly specified.)". |
| REMOVED | (no-op) Removed UI inventory from delta | The Removed UI inventory is already present in the `Removed UI (HU-14A cleanup)` block of `frontend/spec.md`. No duplicate move needed. |

File: 65 → 153 lines, net +4 requirements, +8 scenarios.

## Source of Truth Updated

- `openspec/specs/case-analysis/spec.md` (synced — phased orchestration modified, 2 new requirements)
- `openspec/specs/frontend/spec.md` (synced — new section 7 "Comparativa Bancaria" + Tab Label Rename)
- `openspec/specs/unified-analysis-flow/spec.md` (synced — 2 modified + 4 added requirements)

## Archive Contents

```
openspec/changes/archive/2026-07-22-hu-14b-comparativa-ui/
├── archive-report.md            ← this file
├── proposal.md                  ✅
├── design.md                    ✅
├── tasks.md                     ✅ (20/20 complete)
├── verify-report.md             ✅
├── exploration.md               ✅
├── exploration-v2.md            ✅
└── specs/
    ├── case-analysis/spec.md            ✅ (merged into main)
    ├── frontend/spec.md                 ✅ (merged into main)
    └── unified-analysis-flow/spec.md    ✅ (merged into main)
```

## Active Changes Directory

Confirmed: `openspec/changes/hu-14b-comparativa-ui/` no longer exists. The active changes directory now contains only other open changes (bureau-manual-validation, fix-buro-extraction-context-separation, hu-04-frontend-minimo, hu-07-ajustes-ux-validaciones, hu-08-frontend-ux-ui-redesign, payment-due-guardrail, redesign-layout-extractor-lines-first, rediseno-workspace-expediente).

## Carry-Forward Items

The 2 known limitations above (frontend test runner, "Ingreso requerido" control) are recommended follow-ups for a future HU. Neither blocks the SDD cycle.

## Engram Traceability

This archive report is also persisted to Engram for cross-session traceability:

| Engram observation ID | Topic key | Type |
|----------------------|-----------|------|
| _assigned at save_ | `sdd/hu-14b-comparativa-ui/archive-report` | architecture |

Future sessions can retrieve the full archive context via `mem_get_observation` or `mem_search("hu-14b comparativa bancaria archive")`.

## SDD Cycle Status

**COMPLETE.** The change has been fully planned, implemented, verified, warning-fixed, and archived. The source-of-truth specs in `openspec/specs/` now reflect the new behavior, and the audit trail in `openspec/changes/archive/2026-07-22-hu-14b-comparativa-ui/` preserves the full delta context for future reference.

Ready for the next change.
