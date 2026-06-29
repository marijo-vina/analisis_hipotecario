# Proposal: Schema Adjustments for Bank Statement Extraction (Task 2.9)

## Intent

Four fine-tuning adjustments to the bank statement JSON schema (`specs/ai-extraction/schemas/bank-statement.schema.md`) to prevent financial engine exceptions and enable exact payroll matching in Sprint 3:

1. **Currency field**: Hardcoded `"MXN"` crashes on USD accounts (frontera/ejecutivos). Change to enum `MXN | USD | OTHER` with alert on non-MXN.
2. **RFC del Paginador/Empleador**: New `detectedPayerRfc` in `payrollDeposits[]` and `possiblePayrollProviders[]`. Gemini regex-hunts RFC pattern inside `originalConcept`. Enables 100% exact match against payroll receipts.
3. **Saldo Promedio / Saldo Final**: New `averageBalance` and `endingBalance` in `statementPeriod` for automated scoring and analyst review.
4. **Cuentas mancomunadas**: New `isJointAccount` in `accountHolder`. Joint accounts may show payroll from two employers.

## Scope

### In Scope
- Update `bank-statement.schema.md` with all four field additions
- Add currency validation rule and alert for non-MXN
- Add RFC regex extraction instruction for Gemini prompts
- Add balance validation rules (non-negative, coherence check)
- Add joint account detection guidance

### Out of Scope
- Gemini extraction prompt implementation (downstream task)
- Financial engine consumer code changes (Sprint 3)
- Payroll receipt matching logic (Sprint 3)
- Frontend display of new fields

## Capabilities

### New Capabilities
- `bank-statement-extraction`: JSON schema contract for structured bank statement data extraction, covering currency handling, RFC detection, balance fields, and joint account identification.

### Modified Capabilities
None — no existing `openspec/specs/` capabilities are affected.

## Approach

Extend the existing schema document at `specs/ai-extraction/schemas/bank-statement.schema.md`:
- Change `currency` from `"MXN"` to enum `"MXN" | "USD" | "OTHER"` with default `"MXN"`
- Add `detectedPayerRfc: "string | null"` to both `payrollDeposits[]` and `possiblePayrollProviders[]`
- Add `averageBalance: "number | null"` and `endingBalance: "number | null"` to `statementPeriod`
- Add `isJointAccount: "boolean | null"` to `accountHolder`
- Add corresponding validation rules and alert definitions

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `specs/ai-extraction/schemas/bank-statement.schema.md` | Modified | Schema field additions and validation rules |
| AI extraction prompts (Gemini) | Modified (downstream) | RFC regex hunting and currency handling instructions |
| Financial engine | Modified (Sprint 3) | Must consume new fields without exceptions |
| Payroll matching module | Modified (Sprint 3) | RFC enables exact matching |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| RFC regex produces false positives from concept text | Medium | Field is `string | null`; false positives degrade to Name+Amount+Date fallback |
| Non-MXN currency breaks downstream consumers | Low | Alert rule flags non-MXN; engine must handle enum |
| Negative balances cause scoring errors | Low | Validation rule: alert if negative, do not block extraction |

## Rollback Plan

Revert `bank-statement.schema.md` to previous version. All new fields are additive and optional (`null` default), so partial rollback is safe — consumers ignoring unknown fields will not break.

## Dependencies

- Sprint 3 payroll receipt matching module (consumes `detectedPayerRfc`)
- Gemini extraction prompt updates (separate downstream task)

## Success Criteria

- [ ] Schema includes `currency` enum with MXN/USD/OTHER and default MXN
- [ ] Schema includes `detectedPayerRfc` in both payroll arrays
- [ ] Schema includes `averageBalance` and `endingBalance` in statementPeriod
- [ ] Schema includes `isJointAccount` in accountHolder
- [ ] Validation rules and alerts defined for all new fields
- [ ] No breaking changes to existing schema consumers
