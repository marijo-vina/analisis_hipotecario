# Design: HU-09 Identity Match Validation

## Technical Approach

Synchronous MVP: `POST /mortgage-cases/:caseId/analyze` triggers `CaseAnalysisService`, which loads the `Client` + all documents with `extractedData`, executes registered `AnalysisRule` implementations sequentially, creates an immutable `AnalysisRun` + `AnalysisAlert` records, and returns `AnalysisResult`. FAIL outcome transitions case status to `REQUIRES_REVIEW`, gating only automatic financial-engine advance. Review decisions are stored separately via a `ReviewDecision` model — the raw result is never mutated.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|-------------|-----------|
| Synchronous execution | Request-scope; no job queue | Async queue (BullMQ, SQS) | MVP simplicity. Analysis completes in <2s for identity match. Enum预留 PENDING/RUNNING for future async. |
| Separate `ReviewDecision` model | Own table, 1:N to AnalysisRun | JSONB column on AnalysisRun | Immutable raw results; audit trail; multiple decisions per run possible; clean separation of machine output vs. human action. |
| Field-intersection comparison | Only compare where BOTH sources have the field | Require all fields present | Bank Statement lacks CURP; absent fields are NOT_AVAILABLE, not FAIL. Matches real-world doc variability. |
| `case-analysis` as separate NestJS module | `src/case-analysis/` with own module, service, interface | Inline in mortgage-cases | Single responsibility: rules register here, mortgage-cases only exposes endpoints. All future Sprint 3 rules (income, liability, bank viability) follow same interface. |
| No fuzzy matching | Deterministic normalization only (uppercase, strip accents, trim, collapse spaces, remove `-/._`) | Levenshtein, Jaro-Winkler | Proposal explicitly rules out fuzzy/ML matching. RFC/CURP must match exactly after normalization. |

## Data Flow

```
POST /:caseId/analyze
        │
        ▼
MortgageCasesController.analyze()
        │  @Req() → triggeredBy (asesoraId)
        ▼
CaseAnalysisService.run(caseId, triggeredBy)
        │
        ├─► prisma.mortgageCase.findUnique({ include: { client, documents } })
        │
        ├─► forEach rule of [IdentityMatchRule, ...futureRules]:
        │      rule.execute(client, documents[]) → RuleResult { outcome, detail, alerts[] }
        │
        ├─► prisma.analysisRun.create({ executionStatus: COMPLETED, outcome, detail })
        │
        ├─► prisma.analysisAlert.createMany (from all rule alerts)
        │
        ├─► if outcome === FAIL: prisma.mortgageCase.update({ status: REQUIRES_REVIEW })
        │
        └─► return AnalysisResult { runId, outcome, summary, detail, executionMetadata }
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/api/prisma/schema.prisma` | Modify | Add `AnalysisExecutionStatus`, `AnalysisOutcome`, `ReviewDecisionAction` enums; `AnalysisRun`, `AnalysisAlert`, `ReviewDecision` models; `REQUIRES_REVIEW` to `CaseStatus` codes |
| `apps/api/src/case-analysis/case-analysis.module.ts` | Create | NestJS module; imports PrismaModule; exports CaseAnalysisService |
| `apps/api/src/case-analysis/case-analysis.service.ts` | Create | Orchestrator: load case+docs, run rules, persist run+alerts, return result |
| `apps/api/src/case-analysis/analysis-rule.interface.ts` | Create | `AnalysisRule` interface: `ruleId`, `severity`, `execute(client, docs): RuleResult` |
| `apps/api/src/case-analysis/rules/identity-match.rule.ts` | Create | `IdentityMatchRule` implements `AnalysisRule`; normalization + field-intersection logic |
| `apps/api/src/case-analysis/rules/identity-match.rule.spec.ts` | Create | Unit tests: normalization edge cases, field intersection, severity classification |
| `apps/api/src/case-analysis/dto/analysis-result.dto.ts` | Create | DTO for `AnalysisResult` response shape |
| `apps/api/src/case-analysis/dto/review-decision.dto.ts` | Create | DTO with `action` (enum) + optional `justification` |
| `apps/api/src/mortgage-cases/mortgage-cases.module.ts` | Modify | Import `CaseAnalysisModule` |
| `apps/api/src/mortgage-cases/mortgage-cases.controller.ts` | Modify | Add `POST /:caseId/analyze`, `GET /:caseId/analysis/latest`, `POST /:caseId/analysis/:runId/review-decision` |
| `apps/api/src/mortgage-cases/mortgage-cases.service.ts` | Modify | Delegate analysis to `CaseAnalysisService`; handle status transition on FAIL |
| `apps/api/src/mortgage-cases/mortgage-cases.service.spec.ts` | Modify | Add mock for CaseAnalysisService; test gating logic |
| `apps/api/src/app.module.ts` | Modify | Import `CaseAnalysisModule` |

## Interfaces / Contracts

```typescript
// Prisma enums (additions)
enum AnalysisExecutionStatus { PENDING, RUNNING, COMPLETED, ERROR }
enum AnalysisOutcome { PASS, PARTIAL, FAIL }
enum ReviewDecisionAction { MARK_FALSE_POSITIVE, CONFIRM_ISSUE, CANCEL_CASE }

// Prisma models (additions)
model AnalysisRun {
  case            MortgageCase  @relation(fields: [mortgageCaseId], references: [id])
  executionStatus AnalysisExecutionStatus
  outcome         AnalysisOutcome
  detail          Json          // { sources[], fields[], ruleResults[] }
  triggeredBy     String        // asesora userId
  reviewDecisions ReviewDecision[]
  alerts          AnalysisAlert[]
}
model AnalysisAlert { run, ruleCode, severity, field, message }
model ReviewDecision { run, action, justification?, decidedBy, decidedAt }

// AnalysisRule interface
interface AnalysisRule {
  readonly ruleId: string;
  readonly severity: 'ERROR' | 'WARNING' | 'INFO';
  execute(client: Client, documents: Document[]): Promise<RuleResult>;
}

// RuleResult shape
interface RuleResult {
  ruleId: string; outcome: AnalysisOutcome; severity: string;
  detail: { sources: string[]; fields: FieldComparison[] };
  alerts: { ruleCode: string; severity: string; field: string; message: string }[];
}

// FieldComparison shape
interface FieldComparison {
  fieldName: string;
  originalValue: Record<string, string | null>;
  normalizedValue: Record<string, string | null>;
  status: 'MATCH' | 'MISMATCH' | 'NOT_AVAILABLE';
}
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit — normalization | `normalizeText()` edge cases: accents, double spaces, special chars, empty, null | Pure function; Jest `it.each` table-driven |
| Unit — IdentityMatchRule | Field intersection, severity classification, all-match PASS, RFC-mismatch FAIL, name-only PARTIAL | Mocked `client` + `documents[]`; assert `RuleResult` |
| Unit — CaseAnalysisService | Orchestration: loads case, delegates to rules, persists run+alerts, handles FAIL→REQUIRES_REVIEW | `Test.createTestingModule` with mocked PrismaService (same pattern as mortgage-cases.service.spec.ts) |
| Integration — endpoints | `POST /analyze` returns 200 with AnalysisResult; `GET /analysis/latest`; `POST /review-decision` validation | `supertest` + `@nestjs/testing`; mock PrismaService |

## Open Questions

None — all constraints resolved in specs and proposal.
