# Delta for Frontend

## ADDED Requirements

### Requirement: Shared Buro Utilization Display

Shared Buro tab MUST NOT fork by `personType` and MUST NOT add a third table. Utilización MUST appear on **all** rows of both tables. In-scope open cards with limit > 0 and non-null balance MUST show rate + traffic light; all other rows `"—"`. Utilization MUST be UI-derived from stored `currentBalance`/`creditLimit`.

| Rule | Contract |
|------|----------|
| In-scope | `classification === 'REVOLVING'`; `DEPARTMENT_STORE` iff `creditLimit > 0`; `creditType` `/tarjeta/i` for all other classifications (covers NON_BANK_SERVICE AMEX in créditos no bancarios, OTHER/OTROS/UNKNOWN/FIXED_PAYMENT/PERSONAL_LOAN mislabels) |
| Exclude | MORTGAGE, AUTO always; PERSONAL_LOAN, FIXED_PAYMENT, NON_BANK_SERVICE only when `creditType` does not match `/tarjeta/i` |
| Rate | `currentBalance / creditLimit` if limit > 0. Null/0 limit → `"—"`, omit global. Null balance → `"—"` (not 0). Over-limit allowed, band 91+ |
| Closed | Per-row `"—"`; excluded from global |
| Global | Extra KPI (keep Score / activos / cerrados / consultas). `sum(balances)/sum(limits)` of in-scope active cards with limit > 0 and non-null balance. Denom 0 → `"—"` |
| Bands | After rounding display %: 0–10 Excelente; 11–30 Muy buena; 31–50 Aceptable; 51–70 Atención; 71–90 Crítico; 91+ Muy crítico. Legend beside MOP |

#### Scenario: In-scope rate

- GIVEN open REVOLVING credit, balance 3000, limit 10000
- WHEN the Buro tab renders
- THEN Utilización MUST show 30% Muy buena with a traffic light on both tables
- AND SALARIED and PFAE MUST share the same column, KPI, and MOP-adjacent legend

#### Scenario: Dashes

- GIVEN a MORTGAGE row, a closed REVOLVING row, and an in-scope row with null balance
- WHEN rows render
- THEN each cell MUST be `"—"` (null balance MUST NOT be 0)

#### Scenario: Weighted KPI and stored bureau

- GIVEN two open in-scope cards 5000/5000 and 10000/100000
- WHEN the extra KPI renders
- THEN global MUST be 15000/105000, not the average of per-card rates
- AND original four KPIs MUST remain; denom 0 MUST show `"—"`; stored bureaus MUST show utilization without re-OCR

### Requirement: Masked Last-4 under Institution

UI MUST show `****` + last 4 under Institución (MUST NOT show the full number). Source: `accountNumber` → ≥4 digits in `institution` → `rawTextReference` → `"—"`. Existing JSONB last-4 MUST be best-effort. Parser MUST read stored `accountNumber`.

#### Scenario: Mask and fallback

- GIVEN `accountNumber` "82953660"
- WHEN Institución renders
- THEN UI MUST show `****3660`
- AND with no `accountNumber` and institution "Visa 1234567890" MUST show `****7890`; if no ≥4-digit source, `"—"` without silent re-extract
