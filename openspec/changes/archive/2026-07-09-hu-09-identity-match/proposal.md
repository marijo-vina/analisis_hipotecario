# Proposal: HU-09 Identity Match Validation

## Intent

Add the first cross-document validation rule (identity match) to the Sprint 3 Financial Engine. When an asesora clicks **"Analizar expediente"**, the system compares identity fields (`fullName`, `rfc`, `curp`) across all extracted documents and the `Client` record (operational reference, not absolute legal truth). Discrepancies block automatic progression to the financial engine until a human resolves them — but never prevent viewing, reviewing, or reprocessing the case.

## Scope

### In Scope
- `case-analysis` module: `AnalysisRun` entity, `AnalysisRule` interface, `AnalysisResult` contract
- `AnalysisRun` with split statuses: `executionStatus` (PENDING|RUNNING|COMPLETED|ERROR) + `outcome` (PASS|PARTIAL|FAIL)
- `IdentityMatchRule`: cross-document field intersection with deterministic text normalization
- Stable `detail` structure: sources, fields, original values, normalized values, per-field status, severity, alerts
- `POST /mortgage-cases/:caseId/analyze` (synchronous MVP)
- `GET /mortgage-cases/:caseId/analysis/latest`
- `POST /mortgage-cases/:caseId/analysis/:runId/review-decision` — asesora actions: MARK_FALSE_POSITIVE, CONFIRM_ISSUE, CANCEL_CASE
- Immutable `AnalysisRun` history per execution; `reviewDecision` stored separately without altering raw result
- Asesora review UI data contract (alerts, status, summary, detail, execution metadata)

### Out of Scope
- Automatic trigger on document upload/removal
- Async job queue / event-driven architecture (model预留 states, but not wired)
- Fuzzy matching or ML-based name similarity
- Auto-cancellation of cases on mismatch
- Income match, liability calc, bank viability rules (future Sprint 3 work)

## Capabilities

### New Capabilities
- `case-analysis`: Module-level spec for `AnalysisRun`, `AnalysisRule`, `AnalysisResult`, and the analysis orchestration service
- `identity-match-validation`: First rule implementation comparing `fullName`/`rfc`/`curp` across Official ID, Payroll, Bank Statement, Credit Bureau, and canonical `Client`

### Modified Capabilities
- `mortgage-cases`: Add `POST /mortgage-cases/:caseId/analyze` and `GET /mortgage-cases/:caseId/analysis/latest` endpoints; case advancement to financial engine gated by latest `AnalysisRun` result

## Approach

1. **Prisma**: add `AnalysisRun` and `AnalysisAlert` tables. `AnalysisRun` carries split statuses: `executionStatus` enum (PENDING|RUNNING|COMPLETED|ERROR) + `outcome` enum (PASS|PARTIAL|FAIL). JSONB `detail` holds rule-specific structured output. Separate `reviewDecision` stores asesora actions (MARK_FALSE_POSITIVE, CONFIRM_ISSUE, CANCEL_CASE) without mutating the immutable raw result.
2. **Module**: `src/case-analysis/` with `CaseAnalysisService` (orchestrator), `AnalysisRule` interface, and `IdentityMatchRule`.
3. **Rule logic**: load `Client` fields (operational reference, not absolute legal truth) → load all documents with `extractedData` → extract mapped fields per schema → normalize (uppercase, strip accents, trim, collapse spaces, remove non-significant special chars) → intersect only where both documents have the field → classify: strong match (RFC/CURP exact), partial match (name only), fail (real discrepancy in comparable field). If `Client` differs from documents, generate an alert but do not cancel — the asesora decides.
4. **Detail structure** (stable contract for UI): `sources[]`, `fields[]` (per-field: `fieldName`, `originalValue`, `normalizedValue`, `status` — MATCH|MISMATCH|NOT_AVAILABLE, `severity`, `alerts[]`).
5. **Status**: "No cumple" (outcome FAIL) sets case operational status to `REQUIRES_REVIEW`. This blocks ONLY automatic advancement to the financial engine / bank viability engine. It does NOT block viewing the case, reviewing documents, reprocessing, or submitting a review decision.
6. **Review decision**: asesora can POST to `/review-decision` with action MARK_FALSE_POSITIVE (with justification), CONFIRM_ISSUE, or CANCEL_CASE. Decision is stored separately; the raw analysis result is never mutated.
7. **Response**: synchronous for MVP; `AnalysisRun` created with `executionStatus` COMPLETED (schema预留 PENDING/RUNNING for future async).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/prisma/schema.prisma` | New | `AnalysisRun` (executionStatus + outcome), `AnalysisAlert`, `ReviewDecision` models |
| `apps/api/src/case-analysis/` | New | Module, service, rule interface, `IdentityMatchRule`, review-decision controller |
| `apps/api/src/mortgage-cases/` | Modified | Mount analysis + review-decision endpoints; gate financial-engine advance on latest run outcome |
| `apps/web/app/ui/expedientes/case-detail-workspace.tsx` | Modified | Display "Analizar expediente" trigger, latest analysis result panel, and review-decision actions |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| False positives from normalization edge cases (e.g., compound last names) | Med | Document normalization policy explicitly; unit-test edge cases; MARK_FALSE_POSITIVE review decision |
| Missing fields in schemas cause confusion | Low | Intersection-only comparison; absent field labeled "No disponible" in detail |
| Mortgage-cases module bloat if rules leak in | Low | Strict `AnalysisRule` interface; all rule logic lives in `case-analysis` |
| Client record treated as absolute truth generates false alerts | Low | `Client` documented as operational reference only; mismatch against docs generates alert, not cancel |

## Rollback Plan

1. Revert Prisma migration (drop `AnalysisRun`, `AnalysisAlert`, `ReviewDecision` tables).
2. Remove `case-analysis` module import from `AppModule`.
3. Delete `src/case-analysis/` directory.
4. Remove analysis + review-decision endpoint registrations from `mortgage-cases` router.
5. Case advancement gate reverts to status-only check.

## Dependencies

- Sprint 2 document extraction services must persist `extractedData` JSONB (already in place).
- `Client` canonical fields (`fullName`, `rfc`, `curp`) must be populated (operational reference, not absolute truth).
- `CaseStatus` enum must include `REQUIRES_REVIEW` value.

## Success Criteria

- [ ] `POST /mortgage-cases/:caseId/analyze` returns `AnalysisResult` with `outcome: PASS` when all comparable identity fields match after normalization
- [ ] Same endpoint returns `outcome: FAIL` with `IDENTITY_MISMATCH` alert when a comparable field differs
- [ ] Absent field in one document does not cause FAIL (marked `NOT_AVAILABLE` in per-field status)
- [ ] `AnalysisRun` carries distinct `executionStatus: COMPLETED` and `outcome: FAIL` — two separate fields
- [ ] Each call creates a new immutable `AnalysisRun` record; raw result is never mutated
- [ ] `GET /mortgage-cases/:caseId/analysis/latest` returns the most recent run with structured `detail` (sources, fields, values, statuses, alerts)
- [ ] FAIL outcome sets case operational status to `REQUIRES_REVIEW`, blocking ONLY automatic financial-engine advance
- [ ] FAIL does NOT block viewing case, reviewing documents, reprocessing, or submitting review decision
- [ ] `POST /mortgage-cases/:caseId/analysis/:runId/review-decision` accepts MARK_FALSE_POSITIVE (with justification), CONFIRM_ISSUE, CANCEL_CASE
- [ ] `reviewDecision` is stored separately; the raw `AnalysisRun` result is unchanged after asesora action
