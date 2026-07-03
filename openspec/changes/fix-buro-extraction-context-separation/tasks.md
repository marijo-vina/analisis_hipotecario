# Tasks: Fix Bureau Extraction Context Separation

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~420-500 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | auto-forecast |
| Chain strategy | single-pr-default |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: single-pr-default
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Backend: prompt isolation + field corrections + CREDIT_SCORE extraction + tests | Single PR | Full backend slice, testable standalone |
| 2 | Frontend: types + parseBuro + UI | Single PR | Depends on backend field shape |

## Phase 1: Backend — Prompt & Score Isolation

- [x] 1.1 Add `CREDIT_SCORE` to `prisma/seed.ts` DocumentType (CS-001)
- [x] 1.2 Rewrite `CREDIT_BUREAU_INSTRUCTIONS`: strip score fields, add "Extract ONLY from this document" isolation rule (ISO-001/002/003)
- [x] 1.3 Remove `report.publicScore` from `computeMissingFields` (SCO-001/002)

## Phase 2: Backend — Field Corrections

- [x] 2.1 Split `amountToPay` into `paymentDueAmount` + `lastPaymentAmount` in schema + prompt + normalization; deprecate `amountToPay` (PAY-001/002/003/004)
- [x] 2.2 Fix MOP thresholds: `hasLatePayments` on MOP >= 2, `hasSeriousDelinquency` on MOP >= 4, MOP 8→writeOff, MOP 9→fraud, U/- neutral (MOP-001/002/003/004/005)
- [x] 2.3 Fix `BURO_MISSING_BALANCE`: null triggers alert, 0 does not; exclude write-offs (BAL-001/002/003)
- [x] 2.4 Add `isClosed` + `monthlyDebtContribution` to credit normalization: 0 for CLOSED, =paymentDueAmount for ACTIVE (CLS-001/002/003/004)
- [x] 2.5 Normalize observation keys: LC/UP→hasWriteOff, FD→hasFraudFlag, RI→hasIdentityTheft (OBS-001/002/003/004)

## Phase 3: Backend — CREDIT_SCORE Extraction

- [x] 3.1 Create `CreditScoreExtractionService` producing `{ score, scoreIsExcluded, scoreExclusionReason }` (CS-002/003, EXT-001/002/003)
- [x] 3.2 Register CREDIT_SCORE routing bypassing bureau extraction pipeline (CS-002)

## Phase 4: Backend — Tests

- [x] 4.1 Test prompt isolation: no score in bureau output, isolation rule in prompt (ISO scenarios)
- [x] 4.2 Test MOP thresholds: 1=no flag, 2=late, 4=serious, U=neutral, 9=fraud, 8=writeoff (MOP scenarios)
- [x] 4.3 Test balance alert: null triggers, 0 does not, write-off excluded (BAL scenario)
- [x] 4.4 Test payment split: both fields populated, null fallbacks (PAY scenario)
- [x] 4.5 Test closed credits: isClosed + contribution=0 for CLOSED, contribution=paymentDueAmount for ACTIVE (CLS scenario)
- [x] 4.6 Test observation keys: LC/UP→writeOff, FD→fraud, RI→identityTheft no fraud (OBS scenario)
- [x] 4.7 Integration test "BC - JUAN PEREZ": 16 credits, score=null, RFC=PEGJ800101XX1, birth=1980-01-01

## Phase 5: Frontend — Types & Parsing

- [x] 5.1 Add `paymentDueAmount`, `lastPaymentAmount`, `isClosed`, `monthlyDebtContribution` to `ParsedCreditBureauCredit` (PAY-001/002, CLS-001/002)
- [x] 5.2 Add `scoreSource: string | null` to `ParsedCreditBureau` (MRG-004)
- [x] 5.3 Update `parseBuro`: filter CREDIT_SCORE docs alongside bureau reports, merge score from CREDIT_SCORE, set scoreSource (MRG-001/002/003)
- [x] 5.4 Read `paymentDueAmount` in parseBuro instead of `amountToPay` (PAY-004)

## Phase 6: Frontend — UI

- [x] 6.1 Score card shows "—" when null, "Score no disponible", no risk band; add "El cliente no adjuntó documento Mi Score" note below KPI row (UI-001/002/003)
- [x] 6.2 Show "Fuente: Mi Score" label when scoreSource === "CREDIT_SCORE"; hide when null (SRC-001/002)
- [x] 6.3 Base diagnosis on riskSummary flags only; when null+no flags = "Bajo" + "Sin indicadores de riesgo detectados" (DX-001/002/003)
- [x] 6.4 CreditRow "Pago rep." column reads `credit.paymentDueAmount` (PAY-004)
- [x] 6.5 Add closed credit visual indicator (isClosed=true, muted styling) (CLS-001)
