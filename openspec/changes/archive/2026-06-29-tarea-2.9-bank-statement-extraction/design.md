# Design: Bank Statement Extraction Service

## Technical Approach

Clone `PayrollExtractionService` template — same dependency injection (PrismaService, GeminiService), same status gate pattern, same alert merge/dedup pipeline. Adapt schema, instructions, and alert logic for bank statement domain. Zero DB changes; `BANK_STATEMENT` document type already seeded.

## Architecture Decisions

### Status Gate

**Choice**: Allow `PROCESSED` and `EXTRACTION_ERROR` (retry) — Payroll pattern.
**Alternatives**: OfficialId pattern (PROCESSED only).
**Rationale**: Gemini failures are often transient; retry from error state provides better UX. Consistent with PayrollExtractionService.

### Alert Naming

**Choice**: `BANK_` prefix, 10 codes:
| Code | Trigger |
|------|---------|
| `BANK_NO_PAYROLL_DEPOSITS` | `payrollDeposits[]` empty |
| `BANK_NON_MXN_CURRENCY` | Any deposit `currency !== "MXN"` |
| `BANK_NEGATIVE_BALANCE` | `averageBalance` or `endingBalance` < 0 |
| `BANK_JOINT_ACCOUNT` | `isJointAccount === true` |
| `BANK_INCOMPLETE_MONTH` | `isCurrentIncompleteMonth === true` |
| `BANK_MISSING_PERIOD` | No `periodStartDate` or `periodEndDate` |
| `BANK_TITULAR_MISMATCH` | Reserved for client-name cross-check (Sprint 3) |
| `BANK_FEWER_MONTHS_THAN_REQUIRED` | `detectedDocumentMonths < required` |
| `BANK_NO_RFC_DETECTED` | No valid RFC across all `payrollDeposits[]` |
| `BANK_PAYROLL_MISMATCH` | Reserved for payroll cross-match (Sprint 3) |

### RFC Post-Validation

**Choice**: Deterministic regex `[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}` applied post-Gemini to `detectedPayerRfc` in both `payrollDeposits[]` and `possiblePayrollProviders[]`. Null-if invalid.
**Rationale**: Gemini may produce false-positive RFC-like strings. Deterministic cleanup before alert computation ensures `BANK_NO_RFC_DETECTED` is accurate. Follows Payroll's `normalizeCanonicalFields` / `applyDeterministicInferences` pattern.

### Schema Constant

**Choice**: Inline TypeScript object mirroring `bank-statement.schema.md` v1.1, 3 nested arrays included. No external JSON import — same as `PAYROLL_SCHEMA`.
**Rationale**: GeminiService expects `Record<string, unknown>`. Inline constant avoids build-time JSON resolution, keeps schema colocated with instructions, and follows existing convention.

## Data Flow

```
Controller.extractBankStatement(caseId, documentId)
  │
  ▼
BankStatementExtractionService.extract(caseId, documentId)
  │
  ├─[1] prisma.document.findUnique (document + type + status)
  ├─[2] Status gate: PROCESSED │ EXTRACTION_ERROR
  ├─[3] prisma.documentStatus.findUnique (resolve status IDs)
  ├─[4] geminiService.extractStructuredData(ocrText, docType, SCHEMA, INSTRUCTIONS)
  │       └─ On failure → set EXTRACTION_ERROR, return error
  ├─[5] normalizeBankStatement(data) — RFC regex, currency enum, balance clamp
  ├─[6] computeAlerts(data) — 10 BANK_ codes
  ├─[7] merge + dedup alerts, compute missing fields
  ├─[8] prisma.document.update(extractedData, status=PROCESSED)
  └─[9] return BankStatementExtractionResult
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/documents/bank-statement-extraction.service.ts` | Create | Service (~450 lines): schema constant, instructions, extract(), normalize, alerts, RFC validator |
| `apps/api/src/documents/bank-statement-extraction.service.spec.ts` | Create | Unit tests (~300 lines): mock Gemini, test alert logic, RFC validation, status gates |
| `apps/api/src/documents/documents.controller.ts` | Modify | Add `POST :documentId/extract-bank-statement` (+15 lines) |
| `apps/api/src/documents/documents.module.ts` | Modify | Register `BankStatementExtractionService` (+2 lines) |

## Interfaces

```typescript
export interface BankStatementExtractionResult {
  success: boolean;
  documentId: string;
  extractedData: Record<string, unknown> | null;
  alerts: ExtractionAlert[];
  missingFields: string[];
  error?: { code: string; message: string };
}
```

Controller endpoint: `POST /mortgage-cases/:caseId/documents/:documentId/extract-bank-statement` → `{ data: BankStatementExtractionResult }`. Guards: `JwtAuthGuard` (inherited from class-level). No DTO needed — params only.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Alert computation | Inject mock extracted data, assert alert codes |
| Unit | RFC post-validation | Valid/invalid/no-RFC strings → correct null/string |
| Unit | Status gates | Wrong status → DOCUMENT_NOT_PROCESSED error |
| Unit | Empty OCR | Returns OCR_TEXT_EMPTY error |
| Unit | Gemini failure | Sets EXTRACTION_ERROR status, returns error envelope |
| Unit | Controller | Mock service, assert 200/error responses |

Mock `GeminiService.extractStructuredData` for all service tests — no live Gemini calls in unit tests.

## Migration / Rollout

No migration required. Rollback: remove service from module providers array and delete controller endpoint. No DB state to revert.
