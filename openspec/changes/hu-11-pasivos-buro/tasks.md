# Tasks: HU-11 — Pasivos desde Buró de Crédito

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1,000–1,200 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (backend types + Prisma + service) → PR 2 (controller + integration) → PR 3 (frontend UI) |
| Delivery strategy | single-pr |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Prisma model + domain types + pure calculation service + unit tests | PR 1 | Base branch; self-contained logic |
| 2 | Controller + DTOs + integration tests + AppModule wiring | PR 2 | Depends on PR 1; adds HTTP layer |
| 3 | Frontend components (KPI cards, table, modal) + analysis-section wiring | PR 3 | Depends on PR 2; UI only |

## Phase 1: Foundation / Infrastructure

- [x] 1.1 Add `LiabilitySnapshot` model to `apps/api/prisma/schema.prisma` with relation to `MortgageCase`, then run `npx prisma generate`
- [x] 1.2 Create `apps/api/src/liability/liability.types.ts` with all enums (`CreditNature`, `InstitutionCategory`, `LiabilityStatus`, `ClassificationSource`, `GlobalLiabilityStatus`, `RuleApplied`) and interfaces (`LiabilityCreditInput`, `LiabilityCreditResult`, `LiabilityCalculationResult`)
- [x] 1.3 Create `apps/api/src/liability/liability.module.ts` importing `PrismaModule`, exporting `LiabilityCalculationService`
- [x] 1.4 Register `LiabilityModule` in `apps/api/src/app.module.ts` imports array
- [x] 1.5 Add `LiabilityCreditResult` type export to `apps/web/app/lib/extraction.ts` for frontend shared types

## Phase 2: Core Implementation — Calculation Service

- [x] 2.1 Create `apps/api/src/liability/liability.service.ts` with `calculate()` method: parse inputs to integer cents, classify creditNature via keyword matching (REVOLVING: TARJETA/REVOLVENTE/LÍNEA; FIXED: AUTO/HIPOTECA/PERSONAL/NÓMINA/SERVICIO), detect collisions → UNKNOWN + REQUIRES_REVIEW
- [x] 2.2 Implement REVOLVING rule: `MAX(balanceCents × factor, paymentCents)`, handle missing data → REQUIRES_REVIEW or INCOMPLETE per spec
- [x] 2.3 Implement FIXED rule: use `paymentCents` directly; `saldo > 0 && pago === 0` → INCOMPLETE; `pago > saldo` → CALCULATED + warning
- [x] 2.4 Implement UNKNOWN rule: conservative `MAX(saldo × 0.06, pago)` with REQUIRES_REVIEW; all-null → INCOMPLETE
- [x] 2.5 Implement closed credit rule: `isClosed` → contribution = 0, rule = CLOSED_ZERO
- [x] 2.6 Implement `institutionCategory` deterministic mapping from institution name
- [x] 2.7 Implement global status aggregation: all CALCULATED → CALCULATED; ≥1 REQUIRES_REVIEW → PARTIAL; ≥1 INCOMPLETE → INCOMPLETE
- [x] 2.8 Implement `grossCurrentMonthlyDebt` and `totalCurrentBalance` aggregates in integer cents, convert to pesos only for display
- [x] 2.9 Implement snapshot persistence: `POST /calculate` creates new `LiabilitySnapshot` row with full enriched result as JSON
- [x] 2.10 Implement `getLatest()` method: returns most recent `LiabilitySnapshot` for a given `mortgageCaseId`
- [x] 2.11 Implement `overrideCredit()` method: accepts `creditNature`, `currentBalance`, `paymentDueAmountEffective`, `reason`; recalculates single credit, creates new snapshot, sets `classificationSource = MANUAL`

## Phase 3: Controller + DTOs + Integration

- [x] 3.1 Create `apps/api/src/liability/dto/calculate-liability.dto.ts` with `factorUsed` (Decimal) and `credits` array of `LiabilityCreditInput`
- [x] 3.2 Create `apps/api/src/liability/dto/override-credit.dto.ts` with optional `creditNature`, `currentBalance`, `paymentDueAmountEffective`, and required `reason` (min 10 chars)
- [x] 3.3 Create `apps/api/src/liability/liability.controller.ts` with routes: `POST /cases/:id/liability/calculate`, `GET /cases/:id/liability/latest`, `PATCH /cases/:id/liability/credits/:creditIndex`
- [x] 3.4 Write unit tests `apps/api/src/liability/liability.service.spec.ts` covering all 13+ scenarios: REVOLVING (6%>pago, pago>6%, solo saldo, sin datos), FIXED (normal, pago>saldo, saldo+0→INCOMPLETE, sin pago), UNKNOWN (ambos/uno/ninguno), colisión keywords, crédito cerrado, estado global
- [x] 3.5 Write integration tests `apps/api/src/liability/liability.controller.spec.ts`: POST→snapshot→GET latest, PATCH override→recalcula→nuevo snapshot, verify `creditReference` preserved through calculation
- [x] 3.6 Write test for exact monetary calculation: 3 credits with 1333.33 + 1333.33 + 1333.34 = exactly 4000.00 (no floating-point error)

## Phase 4: Frontend UI Components

- [ ] 4.1 Create `apps/web/app/ui/expedientes/liability-calculation-section.tsx` orchestrator component: fetches latest snapshot via API, renders KPI cards + accordion + table + modal
- [ ] 4.2 Implement KPI cards (inline): Saldo actual total (green `#F0FDF4`), Deuda total mensual (blue `#EFF6FF`), Estado del cálculo (amber `#FFFBEB`) with status badge labels
- [ ] 4.3 Implement accordion: collapsible bar, "Ver/Ocultar desglose del cálculo", default collapsed, full-width clickable
- [ ] 4.4 Create `apps/web/app/ui/expedientes/liability-table.tsx` with columns: Crédito, Institución, Naturaleza, Saldo actual, Monto a considerar, Monto a pagar, Pasivo calculado, Estado
- [ ] 4.5 Implement table sorting: REVOLVING → FIXED → UNKNOWN, with 2px `#F3F4F6` separator between groups
- [ ] 4.6 Implement table badges: naturaleza (Revolvente/Fijo/Pendiente with specified colors), estado (Calculado/Requiere revisión/Incompleto with specified colors)
- [ ] 4.7 Implement table footer: two total rows with `#F9FAFB` background showing `totalCurrentBalance` and `grossCurrentMonthlyDebt` + global status badge
- [ ] 4.8 Make rows with REQUIRES_REVIEW or INCOMPLETE status clickable to open edit modal
- [ ] 4.9 Create `apps/web/app/ui/expedientes/edit-credit-modal.tsx` with fields: naturaleza dropdown, saldo input (conditional), monto a pagar input (conditional), reason textarea (required, min 10 chars)
- [ ] 4.10 Implement modal impact warning banner (amber `#FFFBEB`) and "Recalcular y guardar" button (red `#DC2626`)
- [ ] 4.11 Wire modal submit: calls `PATCH /cases/:id/liability/credits/:creditIndex`, then refreshes via `GET /cases/:id/liability/latest`
- [ ] 4.12 Replace placeholder in `apps/web/app/ui/expedientes/analysis-section.tsx` tab `"motor"` with `<LiabilityCalculationSection caseId={caseId} />`

## Phase 5: Verification

- [ ] 5.1 Run `npx prisma db push` or generate migration for `LiabilitySnapshot` model, verify schema applies cleanly
- [ ] 5.2 Run backend unit tests: `npm test -- liability.service.spec.ts` — all 13+ scenarios pass
- [ ] 5.3 Run backend integration tests: `npm test -- liability.controller.spec.ts` — POST/PATCH/GET endpoints work end-to-end
- [ ] 5.4 Verify `creditReference` passthrough: input credit with reference "CR-001234-ABC" appears unchanged in enriched result
- [ ] 5.5 Verify no-exclusion principle: mortgage credit in bureau data is included in both `grossCurrentMonthlyDebt` and `totalCurrentBalance`
- [ ] 5.6 Verify null vs zero distinction: `currentBalance: null` ≠ `currentBalance: 0` in calculation behavior
- [ ] 5.7 Manual UI test: open tab "Motor financiero", verify KPI cards render, accordion expands/collapses, table shows correct sorting and badges
- [ ] 5.8 Manual UI test: click a REQUIRES_REVIEW row, open modal, change naturaleza, fill reason, submit, verify totals update
