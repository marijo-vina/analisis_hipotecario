# Tasks: Bank Statement Extraction Service

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~840 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 |
| Delivery strategy | force-chained |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Est. Lines | Base Branch |
|------|------|-----------|------------|-------------|
| 1 | Service core + module registration | PR #1 | ~400 | `feature/tarea-2.9-schema-estados-cuenta` |
| 2 | Controller + controller tests | PR #2 | ~200 | PR #1 branch |
| 3 | Service tests + edge cases | PR #3 | ~240 | PR #2 branch |

## Phase 1: Service Foundation (PR #1)

- [x] 1.1 Create `bank-statement-extraction.service.ts` — `@Injectable()` class, constructor DI (PrismaService, GeminiService), inline TypeScript schema constant for `bank-statement.schema.md` v1.1 (3 nested arrays)
- [x] 1.2 Register `BankStatementExtractionService` in `documents.module.ts` providers

## Phase 2: Core Extraction (PR #1)

- [x] 2.1 Implement `extract()`: fetch document, status gate (PROCESSED/EXTRACTION_ERROR), empty OCR guard, resolve status IDs
- [x] 2.2 Write `BANK_STATEMENT_INSTRUCTIONS` prompt — currency detect, RFC regex in concept text, balance fields, joint account signals, trash deposit classification
- [x] 2.3 Call Gemini with schema spread; handle failure → set EXTRACTION_ERROR status, return error envelope

## Phase 3: Post-Processing & Alerts (PR #1)

- [x] 3.1 `normalizeBankStatement()`: RFC regex `[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}`, currency enum enforcement (MXN/USD/OTHER), non-negative balance clamp
- [x] 3.2 `computeAlerts()`: all 10 BANK_ codes — NO_PAYROLL_DEPOSITS, NON_MXN_CURRENCY, NEGATIVE_BALANCE, JOINT_ACCOUNT, INCOMPLETE_MONTH, MISSING_PERIOD, TITULAR_MISMATCH, FEWER_MONTHS, NO_RFC_DETECTED, PAYROLL_MISMATCH
- [x] 3.3 Trash deposit analysis: classify `otherRelevantMovements[]` entries; merge/dedup alert pipeline; persist `extractedData` via Prisma

## Phase 4: Controller Endpoint (PR #2)

- [x] 4.1 Add `@Post(':documentId/extract-bank-statement')` to `documents.controller.ts` — delegate to service, return `{ data: BankStatementExtractionResult }`

## Phase 5: Tests (PR #2 + PR #3)

- [x] 5.1 Service unit tests: mock GeminiService, test status gates, empty OCR, Gemini failure → EXTRACTION_ERROR (PR #3)
- [x] 5.2 Alert computation tests: non-MXN currency, negative balance, joint account, empty payrollDeposits, no RFC (PR #3)
- [x] 5.3 RFC regex post-validation: valid/invalid/no-RFC strings → correct null/string (PR #3)
- [x] 5.4 Controller unit test: POST endpoint returns 200/400/500 (PR #2)
