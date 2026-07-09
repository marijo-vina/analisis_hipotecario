## Exploration: HU-09 — Identity Match Validation

### Current State

The platform (Sprint 2) delivers OCR + Gemini AI extraction producing structured JSON per document type. Each extraction service (`OfficialIdExtractionService`, `PayrollExtractionService`, `BankStatementExtractionService`, `CreditBureauExtractionService`) persists extracted data into `Document.extractedData` (unstructured `Json` field in Prisma). There is **no existing cross-document validation engine**, no case-level analysis entity, and no business-rule orchestration beyond per-document alert computation inside each extraction service.

`MortgageCasesService` is purely CRUD + status updates. `CaseStatus` is a relational lookup table (codes like `PENDING_DOCUMENTS`), not an enum in Prisma, so new statuses can be added via seed data without schema changes. `PersonType` is currently hardcoded to `SALARIED` only.

### Identity Field Mapping Table

| Document Type | Schema File | fullName Path | rfc Path | curp Path | Notes |
|---|---|---|---|---|---|
| Official ID (INE/Passport) | `official-identification.schema.md` | `identity.fullName` | **NOT PRESENT** | `identity.curp` | Has `idNumber` for passports, `voterKey` for INE. No RFC. |
| Payroll Receipt | `payroll-receipt.schema.md` | `employee.fullName` | `employee.rfc` | `employee.curp` | All three fields present. |
| Bank Statement | `bank-statement.schema.md` | `accountHolder.fullName` | **NOT PRESENT** | **NOT PRESENT** | Only holder name; no tax IDs. |
| Credit Bureau Report | `credit-bureau.schema.md` | `borrower.fullName` | `borrower.rfc` | **NOT PRESENT** | No CURP field defined. |

**Critical finding**: RFC appears in only 2 of 4 documents. CURP appears in only 2 of 4 documents. Therefore, the business rule "cross-reference across all documents" must be interpreted as **"compare each field across every document that contains it"**, not "every document must have all three fields".

### Affected Areas

- `apps/api/prisma/schema.prisma` — needs a `CaseAnalysis` or `CaseValidation` table (or similar) to persist cross-document validation results for the UI dashboard.
- `apps/api/src/mortgage-cases/` — needs orchestration to trigger validation and handle knockout status transitions.
- `apps/api/src/documents/` — extraction services may need to emit a lightweight hook or be polled by the validation engine after extraction completes.
- `apps/api/src/clients/` — `Client` entity has `fullName`, `rfc`, `curp`; these should be the **canonical source of truth** against which document-extracted values are compared.
- Future: new `validation/` or `case-analysis/` module.

### Approaches

#### 1. Dedicated `IdentityMatchService` within `mortgage-cases` module
- **Description**: Add a single service inside `mortgage-cases` that queries all `Document.extractedData` for a case, extracts identity fields, compares them to the `Client` record, and produces a pass/fail result with alerts.
- **Pros**: Minimal boilerplate; leverages existing module imports; fast to implement.
- **Cons**: Mortgage-cases module becomes a god object as Sprint 3 adds income match, liability calc, and bank viability rules. Business rules are tightly coupled to CRUD orchestration. Harder to unit-test in isolation.
- **Effort**: Low

#### 2. Standalone `validation` module with pluggable rule engines
- **Description**: Create a new `ValidationModule` (or `CaseAnalysisModule`) with a `ValidationEngine` that runs a registry of `Rule` implementations. HU-09 becomes `IdentityMatchRule`. Future Sprint 3 work becomes `IncomeMatchRule`, `LiabilityCalculationRule`, etc. Results are persisted into a dedicated table/JSONB column and exposed via `GET /mortgage-cases/:id/analysis`.
- **Pros**: Clean separation of concerns; each rule is independently testable; naturally supports the UI "Análisis del Expediente" dashboard with multiple validation categories; scales to future rules without touching case CRUD.
- **Cons**: Slightly more initial scaffolding (module, controller, service, rule interface, migration).
- **Effort**: Medium

#### 3. Event-driven validation triggered after document extraction
- **Description**: Emit a NestJS event (`DocumentExtractedEvent`) after each extraction. An event listener checks whether all required documents for identity match are present and, if so, runs validation asynchronously.
- **Pros**: Fully decoupled; automatic; feels "modern".
- **Cons**: The codebase currently has **zero event infrastructure**. Adds unnecessary complexity for MVP. Knockout is immediate and synchronous — eventual consistency is risky here. Harder to debug.
- **Effort**: High

### Recommendation

**Option 2: Standalone `validation` module with pluggable rules.**

Rationale:
- Sprint 3 explicitly builds a Financial Engine and Business Rule Validation layer on top of JSON schemas. A dedicated module reflects that architectural boundary.
- The user's UI proposal shows an "Análisis del Expediente" status dashboard with multiple validation categories (Identity, Nómina vs Banco, Pasivos, Ingreso, Bancos). A `ValidationEngine` with discrete rules maps 1:1 to that UI.
- Extensibility is a stated requirement: income match, liability calc, and bank viability are coming. Option 1 would require refactoring later; Option 2 accommodates them natively.
- Option 3 is over-engineered for a knockout rule that must be immediate and deterministic.

Implementation sketch:
1. **Prisma migration**: add `CaseAnalysis` table (or `CaseValidationResult`) with columns: `id`, `mortgageCaseId`, `ruleCode`, `status` (`PASS | FAIL | PENDING`), `alerts` (JSONB), `executedAt`.
2. **Module**: `src/case-analysis/` or `src/validation/` with `ValidationEngine`, `IdentityMatchRule`, and `CaseAnalysisController`.
3. **Trigger**: expose `POST /mortgage-cases/:id/validate-identity` (manual or called by document extraction flow). Do NOT use events.
4. **Rule logic** (`IdentityMatchRule`):
   - Load `Client` canonical `fullName`, `rfc`, `curp`.
   - Load all documents for the case where `documentType.code IN ('INE','PASSPORT','OFFICIAL_ID','PAYROLL_RECEIPT','BANK_STATEMENT','CREDIT_BUREAU_REPORT')` and `extractedData IS NOT NULL`.
   - Parse `extractedData` JSON to extract the mapped fields per the table above.
   - For `fullName`: compare across Official ID, Payroll, Bank Statement, Credit Bureau, and Client record. Normalize (uppercase, trim) before comparison.
   - For `rfc`: compare across Payroll, Credit Bureau, and Client record.
   - For `curp`: compare across Official ID, Payroll, and Client record.
   - Apply strict exact match (case-insensitive after uppercase normalization; no fuzzy logic).
   - On ANY discrepancy: generate CRITICAL alert with code `IDENTITY_MISMATCH_KNOCKOUT`, message "Error en Expediente / Homonimia", category `IDENTITY`, set case status to `KNOCKOUT` (or equivalent), and return immediate cancellation.
5. **UI feed**: `GET /mortgage-cases/:id/analysis` returns all `CaseAnalysis` rows for the dashboard.

### Risks

1. **Normalization ambiguities**: The business rule demands "EXACT 100% match (no character/digit discrepancies)". However, extracted names may differ in accents (`PÉREZ` vs `PEREZ`), spacing (`PEREZ LOPEZ` vs `PEREZ-LOPEZ`), or compound last names. The rule needs a **deterministic normalization policy** (e.g., strip accents, collapse whitespace, uppercase) or it will produce false knockouts. This is a product decision, not purely technical.
2. **Missing fields in schemas**: Bank Statement and Official ID lack RFC; Credit Bureau and Bank Statement lack CURP. If the rule expects every document to have all three fields, it will fail permanently. The rule MUST define "compare only where present".
3. **Case status lifecycle**: The current `CaseStatus` model supports dynamic codes, but we need to confirm seed data includes (or will include) a `KNOCKOUT` / `CANCELLED` status for the knockout rule to transition to. If not, a migration or seed update is required.
4. **Re-enter from scratch**: "Folio must be re-entered from scratch" is ambiguous. Does it mean soft-delete the case and documents, or hard-delete, or simply block further progress? This affects data retention and audit requirements.
5. **Performance**: `Document.extractedData` is unstructured JSONB. The validation engine will load and parse every document's extracted JSON in-memory. With 10-20 documents per case this is trivial, but if cases grow to 100+ documents, consider selective queries by `documentTypeId`.
6. **Testability**: Because `extractedData` is schemaless JSON, the rule must defensively handle missing nested properties. Unit tests should cover `null` paths, partial extractions, and malformed JSON gracefully.

### Open Questions (need clarification before design phase)

1. **Name normalization policy**: Should accents be stripped before comparison? Are hyphens vs spaces considered mismatches? Is `MARIA JOSE` vs `MARÍA JOSÉ` a knockout?
2. **Missing field semantics**: If a document type does not contain a field (e.g., Bank Statement has no RFC), does that count as "missing" (skip comparison) or "mismatch" (knockout)?
3. **Case status codes**: What `CaseStatus` codes exist in seed data today? Can we add `KNOCKOUT` or `CANCELLED` without breaking existing flows?
4. **Re-enter from scratch**: Does this mean delete the case and all documents, or mark as cancelled and require the advisor to create a new case?
5. **Trigger mechanism**: Should identity validation run automatically when the last required document is extracted, or only when the advisor clicks "Analizar Expediente"?
6. **Persistence**: Should validation results be stored in a new table (recommended) or computed on-the-fly per request?
7. **PFAE/Independent extension**: The business rules mention future `Constancia de Situación Fiscal` + `Declaración Anual` for PFAE clients. Should the validation module architecture预留 (reserve) support for these document types now?

### Ready for Proposal

**Yes**, with one caveat: the open questions above (especially #1 normalization and #2 missing-field semantics) should be answered by the product owner or business analyst before the `sdd-spec` phase, because they directly affect the acceptance criteria and test cases. The technical architecture direction (Option 2, standalone validation module) is solid and does not depend on those answers.
