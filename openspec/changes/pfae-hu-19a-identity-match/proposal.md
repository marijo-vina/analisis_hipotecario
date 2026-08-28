# Proposal: PFAE Identity Match (HU-19a)

## Intent

PFAE cases have no payroll receipt, and `IdentityMatchRule` has no `csf` source definition — so a PFAE case with INE + CSF + bank statements + bureau silently ignores CSF and yields thin, untrustworthy identity coverage. The Validaciones tab compounds this: payroll-centric identity matrix, a "Conciliación nómina vs banco" section that can never apply, and a pre-analysis checklist demanding a payroll receipt. Asesoras cannot explain PFAE identity results today.

## Scope

### In Scope

- `personType`-aware identity sources. PFAE: `official-id`, `csf` (`taxpayer.fullName/rfc/curp`), `tax-return` (`satReceipt.taxpayerName` + `satReceipt.rfc`; no CURP → `NOT_AVAILABLE`), `bank-statement`, `credit-bureau`, `client`. `payroll` excluded.
- Tax-return is a first-class identity source (name + RFC), same severity as bank-statement: RFC mismatch → FAIL, name-only → PARTIAL.
- Thread `personType` from `mortgageCase` into the Phase A rule context.
- Skip `BankarizationValidationRule` for PFAE via per-request `phaseARules`.
- UI: pass `personType` into `AnalysisSection`; add `csf` label/icon/column; hide nómina conciliation for PFAE; PFAE modal checklist (INE/passport, CSF, tax return, bank statements, bureau).
- Spec delta + tests covering both PFAE and SALARIED paths.

### Out of Scope

- HU-19b CSF gates (régimen, arraigo, vigencia, activity coherence) — must not be elevated to Phase A here.
- Income engine, dual bases, comparativa, 7% revolving factor, canonical giro catalog.
- Any behavior change to the SALARIED path.

## Proposal assumptions (closed decisions)

| Decision | Value |
|---|---|
| Discriminator | `personType` only — never document presence |
| Stray payroll doc in PFAE | Ignored; no `payroll` source |
| Tax-return | First-class source: `taxpayerName` + `rfc`. RFC mismatch → FAIL. Absent fields → `NOT_AVAILABLE`. No CURP on SAT acuse. |
| Normalization / severity | Unchanged, deterministic |
| Bankarization for PFAE | Explicitly skipped by orchestrator, not implicit empty PASS |
| `personType` transport | Existing `client` context spread (Approach 1) |
| Missing docs in PFAE | Soft confirmation, never blocking — same as SALARIED |

## Proposal question round

**0 remaining product questions.** Non-blocking notes for later HUs: (1) how PFAE gates render once HU-19b lands may reshape the section that HU-19a leaves empty; (2) bank CMA tenure-by-profile is a `BankPolicy` column (`minimumActivityTenureMonths`), not a duplicated grid — HU-20.

## Capabilities

### New Capabilities

- None

### Modified Capabilities

- `identity-match-validation`: PFAE source matrix, `csf` source, first-class `tax-return` (name + RFC), `payroll` excluded for PFAE.
- `case-analysis`: Phase A rule set resolved per-request by `personType`; rule context carries `personType`.
- `frontend`: PFAE-aware analysis UI — `csf` source rendering, nómina conciliation hidden, personType-aware pre-analysis checklist.

## Approach

Exploration Approach 1. Tag each `SourceDefinition` with the `personType`(s) it applies to and filter once at the top of `IdentityMatchRule.execute()`; shared sources (`official-id`, `bank-statement`, `credit-bureau`, `client`) are not duplicated. `CaseAnalysisService` adds `personType` to the context object already spread into every Phase A rule and builds `phaseARules` per request. Frontend mirrors the established `document-upload.tsx` pattern: `personType?: string` prop threaded from `case-detail-workspace.tsx`, then `if (personType === "PFAE")` branches at the four identified touchpoints. Reuses `normalize.ts` and existing CSF/tax-return extraction shapes as-is.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/src/case-analysis/rules/identity-match.rule.ts` | Modified | personType-tagged sources; `csf` + first-class `tax-return` (name + RFC) |
| `apps/api/src/case-analysis/case-analysis.service.ts` | Modified | `personType` in context; per-request `phaseARules` |
| `apps/api/src/case-analysis/rules/bankarization-validation.rule.ts` | Modified | Harden/confirm no-op; no longer invoked for PFAE |
| `apps/web/app/ui/expedientes/analysis-section.tsx` | Modified | `personType` prop; `csf` rendering; hide conciliation; PFAE checklist + `hasMissingDocs` |
| `apps/web/app/ui/expedientes/case-detail-workspace.tsx` | Modified | Pass `personType` into `<AnalysisSection>` (missing wire) |
| `*.spec.ts` (rule + service) | Modified | PFAE fixtures; preserve SALARIED assertions |
| `openspec/specs/identity-match-validation/spec.md` | Modified | Delta (written by `sdd-spec`) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| SALARIED regression from source filtering | Med | Keep existing SALARIED assertions green; treat PFAE as additive branch |
| `phaseARules` moves from constructor to per-request | Med | Cover both paths in `case-analysis.service.spec.ts`; no signature change to `AnalysisRule` |
| Generalizing "optional source" logic leaks `sourceKey === 'client'` special cases | Med | Design phase defines an explicit `optional` flag on `SourceDefinition` |
| UI silently drops `csf` if labels/columns are missed | Med | Update `SOURCE_LABELS`, `SOURCE_ICONS`, `COLUMNS` together; PFAE UI test |
| Accidental HU-19b scope creep via CSF `alerts[]` | Low | Read only `taxpayer.*`; assert no new Phase A alerts |
| Overloaded `client` context object | Low | JSDoc note; same precedent as existing `caseId` injection |

## Rollback Plan

Single-branch revert. Backend is additive behind `personType === 'PFAE'`; reverting `identity-match.rule.ts` and the two `case-analysis.service.ts` lines restores the flat source array and the fixed constructor rule set. Frontend rollback is removing the `personType` prop and its branches — the salaried render path is untouched. No migrations, no persisted schema change, no stored `AnalysisRun` shape change (new source keys are additive within existing `detail.sources[]`).

## Dependencies

- HU-15/16 delivered: `CSF` and `TAX_RETURN` document types wired through upload, browse, and extraction.
- `csf-extraction.service.ts` (`taxpayer.rfc/curp/fullName`) and `tax-return-extraction.service.ts` (`satReceipt.rfc`) — read-only, no change.

## Success Criteria

- [ ] PFAE case with INE + CSF + bank statements + bureau shows an identity matrix including CSF, with no Nómina column and no FAIL caused by absent payroll.
- [ ] A stray `PAYROLL_RECEIPT` on a PFAE case produces no `payroll` identity source.
- [ ] Tax-return RFC mismatch yields FAIL (not WARNING); absent fields yield `NOT_AVAILABLE`.
- [ ] `BankarizationValidationRule` does not execute for PFAE; conciliation section absent from the PFAE Validaciones tab.
- [ ] PFAE pre-analysis modal lists INE/passport, CSF, tax return, bank statements, bureau — soft confirmation only.
- [ ] SALARIED identity + bankarization behavior and tests unchanged.
