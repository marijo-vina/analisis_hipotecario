# Design: PFAE Identity Match (HU-19a)

## Technical Approach

Exploration Approach 1. `IdentityMatchRule` keeps one `SOURCE_DEFINITIONS` registry; each entry declares which `personType`s it applies to. `execute()` resolves `activeDefs` once and threads them through `indexDocsBySource` / `collectFieldValues` / `compareField` — no duplicated arrays, no SALARIED behavior change. `CaseAnalysisService` adds `personType` to the existing context spread and resolves `phaseARules` per request. The frontend threads `personType` into `AnalysisSection` like `DocumentUpload`/`ExtractionSection` already do, then branches at four existing touchpoints.

## Architecture Decisions

| Decision | Choice | Rejected | Rationale |
|---|---|---|---|
| Discriminator | `client.personType` from `mortgageCase.personType` | Document presence | Stray `PAYROLL_RECEIPT` on PFAE must produce no `payroll` source |
| Source scoping | `appliesTo: PersonTypeScope[]` per `SourceDefinition` | Two parallel arrays | Shared sources stay single-definition; unknown/absent `personType` falls back to SALARIED |
| Optional semantics | Explicit `optional` + `reference` booleans on `SourceDefinition` | `sourceKey === 'client'` string checks | Removes scattered special-casing; `tax-return` gets document-grade severity while `client` stays reference-only |
| Tax-return severity | RFC mismatch → FAIL/ERROR, name-only → PARTIAL/WARNING | WARNING for RFC | Closed decision + spec delta; identical to `bank-statement` |
| Bankarization skip | Orchestrator builds `phaseARules` per request | Rule-internal early return / implicit empty PASS | Explicit and testable; avoids wasted deposit/pagadora work |
| `personType` transport | Existing context spread (like `caseId`) | New `AnalysisRule.execute` parameter | Zero interface change, no impact on other rules |
| Checklist source of truth | One `REQUIRED_DOC_CHECKS` per `personType`, consumed by both `hasMissingDocs` and `AnalysisConfirmModal` | Duplicated conditions | Prevents memo/modal drift; mirrors `case-status-calculator.service.ts` |

## Data Flow

```
run(caseId)
  └─ mortgageCase (client + documents + personType)
       ├─ context = { ...client, caseId, personType }
       ├─ phaseARules = PFAE ? [identityMatch] : [identityMatch, bankarization]
       │      └─ IdentityMatchRule.execute(context, docs)
       │             activeDefs = SOURCE_DEFINITIONS.filter(appliesTo ∋ personType)
       │             → detail.sources / detail.fields
       ├─ Phase B (income + liability)   ── unchanged
       └─ Phase C (bank viability)       ── unchanged
                 ↓ AnalysisRun.detail
   AnalysisSection(personType) → ValidacionesTab / IdentitySummaryCard / ConfirmModal
```

## File Changes

| File | Action | Description |
|---|---|---|
| `apps/api/src/case-analysis/rules/identity-match.rule.ts` | Modify | `appliesTo`/`optional`/`reference` on `SourceDefinition`; `client` becomes a definition; new `csf` + `tax-return` sources; `activeDefs` threaded through private methods |
| `apps/api/src/case-analysis/case-analysis.service.ts` | Modify | `personType` in context; `resolvePhaseARules()` replaces the constructor array (rules kept as private fields) |
| `apps/api/src/case-analysis/rules/bankarization-validation.rule.ts` | Modify | JSDoc only: state it is not invoked for PFAE; keep the empty-input PASS guard |
| `apps/web/app/ui/expedientes/case-detail-workspace.tsx` | Modify | `personType={caseData.personType}` on `<AnalysisSection>` |
| `apps/web/app/ui/expedientes/analysis-section.tsx` | Modify | `personType?: string` prop; `csf`/`tax-return` in `SOURCE_LABELS`+`SOURCE_ICONS`; personType-aware `COLUMNS`; hide conciliación for PFAE; `REQUIRED_DOC_CHECKS` |
| `apps/api/src/case-analysis/rules/identity-match.rule.spec.ts` | Modify | PFAE fixtures; SALARIED assertions preserved |
| `apps/api/src/case-analysis/case-analysis.service.spec.ts` | Modify | PFAE skip + SALARIED regression + context shape |

`case-analysis.module.ts`, `normalize.ts`, and both extraction services are untouched.

## Interfaces

```ts
type PersonTypeScope = 'SALARIED' | 'PFAE';

interface SourceDefinition {
  sourceKey: string;
  documentTypeCode?: string;      // absent → non-document source (client)
  appliesTo: PersonTypeScope[];
  /** Absent value ⇒ omitted from comparison, never a mismatch. */
  optional?: boolean;
  /** Operational reference: mismatch vs document consensus is PARTIAL/WARNING. */
  reference?: boolean;
  extract: Record<'fullName' | 'rfc' | 'curp', (d: Record<string, unknown> | null) => string | null>;
}
```

New entries: `csf` (PFAE, `taxpayer.fullName|rfc|curp`), `tax-return` (PFAE, `optional`, `satReceipt.taxpayerName` → `fullName`, `satReceipt.rfc`, `curp: () => null`). `payroll` becomes `appliesTo: ['SALARIED']`; `client` becomes `{ optional: true, reference: true, appliesTo: both }`. `compareField` resolves the reference source via the definition map instead of comparing `sourceKey`.

## UI Constraints

Follows the platform `design.md` (Gestión Financiera): no new visual language. New source chips reuse the existing `SOURCE_LABELS`/`SOURCE_ICONS` label-and-icon pattern (`csf: "CSF"`, `tax-return: "Declaración"`); the discrepancy table keeps its white card and `gf-border` grid; the PFAE checklist reuses the current `gf-surface` panel with emerald/amber state text. `gf-red` stays on the single primary action; semantic color only for PASS/PARTIAL/FAIL.

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit (rule) | PFAE source set, stray payroll ignored, CSF match, tax-return RFC FAIL / name PARTIAL / absent NOT_AVAILABLE, SALARIED regression | Jest fixtures with `client.personType` |
| Unit (service) | PFAE skips bankarization, SALARIED runs both, context carries `personType` | Existing `Test.createTestingModule` mocks; assert `mockBankarizationRule.execute` not called |
| Component | `csf` column renders, conciliación hidden for PFAE, PFAE checklist has no nómina row, SALARIED unchanged | RTL on `AnalysisSection` |

## Migration / Rollout

No migration. Additive `detail.sources[]` keys; historical `AnalysisRun` records render unchanged. Single-branch revert.

## Open Questions

- [ ] `proposal.md` success criterion says tax-return RFC mismatch yields WARNING; the spec delta and the closed decision say FAIL. Design encodes FAIL — proposal line should be corrected.
