# Bureau Extraction UI — Score Display & Null Handling

## Purpose

Defines frontend behavior when score is null, score source labeling, and diagnosis decoupling from score-based risk assessment.

## ADDED Requirements

### Requirement: Null Score Display

When `score` is null, the KPI card MUST show "—" as the value with "Score no disponible" as the subtitle. An explanatory note "El cliente no adjuntó documento Mi Score." MUST be displayed below the KPI row.

| ID | Rule |
|----|------|
| UI-001 | KPI score value shows "—" when score is null |
| UI-002 | KPI score subtitle shows "Score no disponible" when score is null |
| UI-003 | Explanatory note "El cliente no adjuntó documento Mi Score." renders below KPI row |

#### Scenario: Null score KPI display

- GIVEN parsed bureau data with `score` = null
- WHEN the KPI row renders
- THEN the score card shows value "—"
- AND the subtitle reads "Score no disponible"
- AND no risk band color (green/yellow/orange/red) is applied

#### Scenario: Explanatory note for missing score

- GIVEN parsed bureau data with `score` = null
- WHEN the bureau tab renders
- THEN the note "El cliente no adjuntó documento Mi Score." is visible
- AND no score-based risk assessment is shown

### Requirement: Score Source Labeling

When score comes from a CREDIT_SCORE document, the UI MUST display "Fuente: Mi Score" next to or below the score value.

| ID | Rule |
|----|------|
| SRC-001 | When `scoreSource === "CREDIT_SCORE"`, show "Fuente: Mi Score" label |
| SRC-002 | When score is null, no source label is shown |
| SRC-003 | Source label uses muted text styling (text-slate-400 or equivalent) |

#### Scenario: Score from Mi Score document

- GIVEN parsed data with `score` = 720 and `scoreSource` = "CREDIT_SCORE"
- WHEN the KPI row renders
- THEN the score card shows "720"
- AND "Fuente: Mi Score" is displayed as a subtitle or annotation

### Requirement: Diagnosis Decoupling

The diagnosis card MUST base risk assessment on report alerts (quebranto, fraude, morosidad) ONLY, not on score bands. When score is null, diagnosis MUST NOT default to any risk level based on missing score.

| ID | Rule |
|----|------|
| DX-001 | Diagnosis risk level derives from `riskSummary` flags, not score |
| DX-002 | When score is null, diagnosis falls back to "Sin indicadores de riesgo detectados" if no flags |
| DX-003 | Score-based risk messages (e.g., "Score en zona de riesgo") MUST NOT appear when score is null |

#### Scenario: Diagnosis without score

- GIVEN `score` = null and `riskSummary` has no flags (all false)
- WHEN diagnosis card renders
- THEN risk level = "Bajo"
- AND message = "Sin indicadores de riesgo detectados."

#### Scenario: Diagnosis with flags but no score

- GIVEN `score` = null and `riskSummary.hasMinorDelinquency` = true
- WHEN diagnosis card renders
- THEN risk level = "Medio"
- AND message references delinquency, not score

### Requirement: Score Band Exclusion

When score is an exclusion code (negative), the UI MUST NOT render a score band color. The exclusion reason MUST be shown instead.

| ID | Rule |
|----|------|
| EXC-001 | When `scoreIsExcluded` = true, no band color renders |
| EXC-002 | Exclusion reason text displays in place of band label |

#### Scenario: Exclusion code display

- GIVEN `score` = -5 and `scoreIsExcluded` = true
- WHEN the KPI row renders
- THEN score value shows "—"
- AND subtitle shows the exclusion reason (e.g., "Todas las cuentas cerradas — morosidad de 90+ días")
- AND no risk band color is applied
