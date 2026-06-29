# Design: Schema Adjustments for Bank Statement Extraction

## Technical Approach

Single-file schema update to `specs/ai-extraction/schemas/bank-statement.schema.md`. All four adjustments are additive with `null` defaults — zero breaking changes. Bump `schemaVersion` from `"1.0"` to `"1.1"`. No TypeScript type mirrors exist yet for this schema; the extraction service (`BankStatementExtractionService`) is a downstream task. This design is purely the contract layer.

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Currency enum scope | `"MXN" \| "USD" \| "OTHER"` at `payrollDeposits[].currency` only | Root document-level currency is unnecessary; bank statements are single-currency. KISS. |
| RFC field placement | `detectedPayerRfc` inside `payrollDeposits[]` AND `possiblePayrollProviders[]` | Both arrays carry `originalConcept` text that may contain RFC. Consumers (Sprint 3 payroll matching) need the field in both contexts. |
| Balance validation | Alert on negative, don't block extraction | Follows existing alert pattern (alerts are advisory, not fatal). Overdraft accounts are real and must not crash extraction. |
| Schema version bump | `"1.0"` → `"1.1"` | Signals additive change to downstream consumers without breaking `"1.0"` parsers. |
| Alert format | Free-text addition to "Reglas y alertas sugeridas" section | Existing schema has no structured alert format — alerts are listed as bullet suggestions. Follow the existing convention. |

## Data Flow

```
OCR (Document AI) → GeminiService.extractStructuredData()
                         │
                         ├── schema: bank-statement.schema.md (v1.1)
                         └── extraInstructions: RFC regex + detection guidance
                              │
                              ▼
                    extractedData (JSON) → Prisma JSONB column
                              │
                    ┌─────────┼──────────┐
                    ▼         ▼          ▼
              Financial    Payroll     Analyst
              Engine       Matching    UI
              (Sprint 3)  (Sprint 3)  (future)
```

The schema flows into Gemini as the output contract JSON (stringified by `GeminiService.buildPrompt`). Post-extraction normalization and alert filtering (per the `PayrollExtractionService` pattern) will happen in the future `BankStatementExtractionService`.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `specs/ai-extraction/schemas/bank-statement.schema.md` | Modify | Add 4 field types, validation rules, alert guidance, bump schemaVersion |
| `apps/api/src/documents/bank-statement-extraction.service.ts` | Create (downstream) | New extraction service — OUT OF SCOPE for this task |
| `apps/api/src/documents/documents.module.ts` | Modify (downstream) | Register new extraction service — OUT OF SCOPE |
| `apps/api/src/documents/documents.controller.ts` | Modify (downstream) | Add `extract-bank-statement` endpoint — OUT OF SCOPE |

## Schema Changes Detail

### 1. Currency (`payrollDeposits[].currency`)
```
Before: "currency": "MXN"
After:  "currency": "MXN | USD | OTHER"   (default: "MXN")
```
Alert rule: when `!== "MXN"`, append non-MXN currency alert.

### 2. RFC Detection (`payrollDeposits[].detectedPayerRfc`, `possiblePayrollProviders[].detectedPayerRfc`)
```
New field: "detectedPayerRfc": "string | null"
```
Guidance: regex `[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}` against `originalConcept`. No match → `null`. Fallback to Name+Amount+Date matching.

### 3. Balance Fields (`statementPeriod.averageBalance`, `statementPeriod.endingBalance`)
```
New fields: "averageBalance": "number | null", "endingBalance": "number | null"
```
Alert if negative. Coherence guidance: `endingBalance` should roughly equal `beginningBalance + deposits - withdrawals` when available.

### 4. Joint Account (`accountHolder.isJointAccount`)
```
New field: "isJointAccount": "boolean | null"
```
Guidance: multiple titulars or "mancomunada" text → `true`. Unclear → `null`.

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Schema validation | New fields parse correctly | Manual schema review against spec scenarios |
| Unit (downstream) | RFC regex extraction | Test 5 concept texts: match, no match, false positive, Ñ character, 3-letter homoclave |
| Unit (downstream) | Currency alert generation | MXN (no alert), USD (alert), OTHER (alert), missing (default MXN) |
| Unit (downstream) | Balance alert generation | Positive, negative, zero, null |
| Integration (downstream) | Full Gemini extraction | Mocked GeminiService with schema v1.1, verify all 4 fields appear in output |

## Migration / Rollout

No data migration. All new fields are `null` by default. Existing `extractedData` JSONB columns with `"currency": "MXN"` remain valid under the new enum. Schema version `"1.1"` allows consumers to opt into new fields. Rollback: revert `bank-statement.schema.md` to `"1.0"` — consumers ignoring unknown fields remain unaffected.

## Open Questions

- [ ] Should the `currency` enum also apply to `possiblePayrollProviders[].amount` or `otherRelevantMovements[].amount`? Current scope limits to `payrollDeposits[]`. Decision needed for Sprint 3.
