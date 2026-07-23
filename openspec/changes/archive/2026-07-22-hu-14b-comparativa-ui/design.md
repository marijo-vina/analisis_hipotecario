# Design: HU-14B — Comparativa Bancaria UI

## Technical Approach

Four-phase incremental delivery: backend bugfix + POST payload gap → frontend types → header redesign → comparativa tab. Reuses existing `DataTable<T>`, `Card`, and inline tab styling patterns. No new backend endpoints — leverages already-persisted `BankViabilitySnapshot`.

## Architecture Decisions

| Decision | Choice | Tradeoff | Rationale |
|----------|--------|----------|-----------|
| Scotiabank flags source | Pass `BankarizationFlags` via `context` from orchestrator | Requires orchestrator to extract from Phase A result (~8 lines) | Eliminates stale DB read; flags are always from current run |
| POST payload fix | Spread `bankViability` into `detail` on return object | One extra property spread | Matches GET `/analysis/latest` shape; UI needs no second fetch |
| `observations` UiState | Separate discriminated-union variant `{ phase: "observations"; run }` | Duplicates `result` shape but with distinct rendering | Amber CompactStatusBar vs green; derived from `outcome === "PARTIAL"` or conditioned/review products |
| Stepper during execution | All 3 phases gray/pending; no per-phase simulation | Less granular than real progress, but honest | Backend is single POST call — no SSE/polling; simulating phases would mislead |
| Translation catalog | `STATUS_LABELS` / `REASON_LABELS` constants in `definitions.ts` | Couples labels to types file | Centralized, tree-shakeable, colocated with types they translate |

## Data Flow

```
POST /analyze → AnalysisResultPayload (now with detail.bankViability)
    ↓ triggerAnalysis()
    ↓ handleAnalyze()
    ↓ loadLatest()
GET /analysis/latest → AnalysisRun.detail.bankViability
    ↓
UiState.result.run or UiState.observations.run
    ↓
BankComparisonTab(bankViability)
    ├── StatusHeader( productMatches, destination )
    ├── FinancialSummary( inputs )
    ├── ProductTable( productMatches )  ← DataTable<ProductMatch>
    │   └── ExpandableDetail( match )   ← per-row toggle
    └── WarningLegend( warningLegend )
```

## File Changes

| File | Action | Change | Lines |
|------|--------|--------|-------|
| `apps/api/.../bank-viability.types.ts` | Modify | Add `BankarizationFlags` interface | +4 |
| `apps/api/.../case-analysis.service.ts` | Modify | Extract flags from Phase A, inject into context; add `bankViability` to POST detail | +10 |
| `apps/api/.../bank-viability.rule.ts` | Modify | Refactor `deriveScotiabankFlags(caseId)` → `deriveScotiabankFlags(flags?)` | -10 +6 |
| `apps/web/app/lib/definitions.ts` | Modify | Add `BankViabilitySnapshot`, `ProductMatch`, `ProductMatchStatus`, `CheckStatus`, `CheckResult`, `ProductMatchCalculation`, `ProductPolicySnapshot`, `BankViabilityInputs`; extend `AnalysisDetail` with `bankViability?`; add `STATUS_LABELS`, `REASON_LABELS` constants | +60 |
| `apps/web/.../analysis-section.tsx` | Modify | Header redesign: button to header row, remove duplicate link; add stepper/status bar; tabs disabled prop; `observations` UiState | +70 -15 |
| `apps/web/.../bank-comparison-tab.tsx` | Create | Full comparativa tab with 6 UI states, 4 blocks, expandable detail | +250 |

**Total: ~415 changed lines.** Slightly over 400-line budget — the types block (+60) is a new self-contained unit.

## Interfaces

```typescript
// --- Props contracts for new components ---

interface AnalysisStepperProps {
  phase: "analyzing" | "error";
  onRetry?: () => void;
}

interface CompactStatusBarProps {
  phase: "result" | "observations";
  timestamp: string;
}

interface BankComparisonTabProps {
  bankViability?: BankViabilitySnapshot;
}

// ExpandableDetail is internal to BankComparisonTab (no separate file)
```

**UiState discriminant:**

```typescript
type UiState =
  | { phase: "loading" }
  | { phase: "idle" }
  | { phase: "analyzing" }
  | { phase: "result"; run: AnalysisRun }
  | { phase: "observations"; run: AnalysisRun }   // NEW
  | { phase: "error"; message: string };
```

Transition to `observations` when: `outcome === "PARTIAL"` OR any `productMatch` has `CONDITIONED`/`REQUIRES_REVIEW` status.

## Product Ordering

```typescript
const STATUS_ORDER: Record<string, number> = {
  PRELIMINARY_VIABLE: 0, CONDITIONED: 1, REQUIRES_REVIEW: 2, NOT_COMPATIBLE: 3,
};
// sort by status order, then availableCapacity DESC (nulls last)
```

## Age Formatting

```typescript
function formatAge(months: number | null): string {
  if (months == null) return "—";
  const years = Math.floor(months / 12);
  const rem = months % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} ${years === 1 ? "año" : "años"}`);
  if (rem > 0) parts.push(`${rem} ${rem === 1 ? "mes" : "meses"}`);
  return parts.join(" ") || "0 meses";
}
```

## 6 UI States (BankComparisonTab)

Render function switches on derived state:

1. **Empty**: `bankViability == null` → "Sin comparativa bancaria — Selecciona Analizar expediente"
2. **Results**: `productMatches.length > 0` → full table + detail
3. **Unsupported**: `destination == null` → "Destino no incluido en la evaluación del MVP"
4. **Insufficient**: `reasons` include `MISSING_INCOME_CALCULATION`, `MISSING_LIABILITY_SNAPSHOT`, `INVALID_PROPERTY_VALUE`, or `INVALID_REQUESTED_AMOUNT` AND no `productMatches` → "Datos insuficientes"
5. **No products**: `productMatches.length === 0` with supported destination → "Sin productos activos para el destino y perfil"
6. **Error**: exception boundary → "Error al obtener la comparativa"

The tab is wrapped in an error boundary for per-tab isolation.

## Testing Strategy

| Layer | What | How |
|-------|------|-----|
| Unit (backend) | `deriveScotiabankFlags` with flags param | Jest test: null flags → both false; populated flags → pass-through |
| Unit (backend) | POST response includes `bankViability` | Jest test: verify `AnalysisResultPayload.detail.bankViability` exists |
| Unit (frontend) | `formatAge` edge cases | Vitest: 360→"30 años", 365→"30 años 5 meses", 0→"0 meses", null→"—" |
| Unit (frontend) | Product ordering logic | Vitest: verify sort by status then capacity DESC |
| Integration | `BankComparisonTab` UI states | React Testing Library: render each state, assert correct message |
| E2E | Full analysis + comparativa tab | Manual flow: upload docs → analyze → verify table renders, expand row |

## Migration / Rollout

No migration required. Backend changes are additive — existing runs continue to work. Frontend is pure addition with one modified file. Scotiabank flag fix is a correctness improvement; no data migration needed.

## Open Questions

None.
