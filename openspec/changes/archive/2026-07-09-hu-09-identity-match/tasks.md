# Tasks: HU-09 Identity Match Validation

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 550–650 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: Foundation (schema + enums) → PR 2: Core + Integration + Tests |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | PR | Base | Notes |
|------|------|-----|------|-------|
| 1 | Prisma schema + migration | PR 1 | feature/sprint-3-hu09-identity-match | Enums, models, CaseStatus REQUIRES_REVIEW. Self-contained. |
| 2 | Module + service + rule + endpoints + tests | PR 2 | PR 1 branch | Depends on schema from PR 1. Full implementation + verification. |

## Phase 1: Foundation — Prisma Schema

- [x] 1.1 Add `AnalysisExecutionStatus` enum (PENDING, RUNNING, COMPLETED, ERROR) to `apps/api/prisma/schema.prisma`
- [x] 1.2 Add `AnalysisOutcome` enum (PASS, PARTIAL, FAIL)
- [x] 1.3 Add `ReviewDecisionAction` enum (MARK_FALSE_POSITIVE, CONFIRM_ISSUE, CANCEL_CASE)
- [x] 1.4 Add `REQUIRES_REVIEW` to existing `CaseStatus` enum
- [x] 1.5 Add `AnalysisRun` model (executionStatus, outcome, detail Json, triggeredBy, relations to MortgageCase/ReviewDecision/AnalysisAlert)
- [x] 1.6 Add `AnalysisAlert` model (run relation, ruleCode, severity, field, message)
- [x] 1.7 Add `ReviewDecision` model (run relation, action enum, justification?, decidedBy, decidedAt)
- [x] 1.8 Run `npx prisma migrate dev --name add-analysis-run` and verify migration

## Phase 2: Core — case-analysis Module

- [x] 2.1 Create `apps/api/src/case-analysis/case-analysis.module.ts` (import PrismaModule, export CaseAnalysisService)
- [x] 2.2 Create `apps/api/src/case-analysis/analysis-rule.interface.ts` with `AnalysisRule` interface + `RuleResult` + `FieldComparison` types
- [x] 2.3 Create `apps/api/src/case-analysis/dto/analysis-result.dto.ts` (runId, executionStatus, outcome, summary, detail, executionMetadata)
- [x] 2.4 Create `apps/api/src/case-analysis/dto/review-decision.dto.ts` (action enum, justification?)
- [x] 2.5 Implement `normalizeText()` pure function: uppercase, strip accents, trim, collapse spaces, remove non-significant special chars
- [x] 2.6 Create `apps/api/src/case-analysis/rules/identity-match.rule.ts` implementing `AnalysisRule` with field-intersection logic, normalization, severity classification

## Phase 3: Integration — mortgage-cases Wiring

- [x] 3.1 Create `apps/api/src/case-analysis/case-analysis.service.ts`: orchestrator that loads Client + documents, runs rules, persists AnalysisRun + alerts, handles FAIL→REQUIRES_REVIEW gating
- [x] 3.2 Add `POST /:caseId/analyze` to mortgage-cases controller — delegates to CaseAnalysisService
- [x] 3.3 Add `GET /:caseId/analysis/latest` to mortgage-cases controller — returns most recent AnalysisRun
- [x] 3.4 Add `POST /:caseId/analysis/:runId/review-decision` to mortgage-cases controller — validates justification for MARK_FALSE_POSITIVE
- [x] 3.5 Wire `CaseAnalysisModule` import into `MortgageCasesModule`
- [x] 3.6 Wire `CaseAnalysisModule` import into `AppModule`

## Phase 4: Testing

- [x] 4.1 Unit test `normalizeText()` — Jest `it.each` for accents, double spaces, special chars, empty, null
- [x] 4.2 Unit test `IdentityMatchRule` — field intersection (NOT_AVAILABLE), RFC mismatch FAIL, name-only PARTIAL, all-match PASS
- [x] 4.3 Unit test `CaseAnalysisService` — mock PrismaService, verify run+alert persistence, FAIL→REQUIRES_REVIEW transition
- [x] 4.4 Integration test `POST /analyze` — supertest with mocked PrismaService, assert 200 + AnalysisResult shape
- [x] 4.5 Integration test `GET /analysis/latest` — 200 with run, 200/null when no runs exist
- [x] 4.6 Integration test `POST /review-decision` — 200 with justification, 400 without, 404 for non-existent run

## Phase 5: Verification

- [x] 5.1 Run `npm test` in `apps/api` — all tests pass (existing + new)
- [x] 5.2 Verify against spec scenarios: PASS on matching fields, FAIL on RFC mismatch, NOT_AVAILABLE on absent fields, REQUIRES_REVIEW status transition
