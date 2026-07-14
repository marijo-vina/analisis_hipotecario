# Pagadora Detection Specification

## Purpose

Detección de esquemas de pagadora (terceros que pagan nómina), validación de doble espejo y regla limitativa para Scotiabank.

## Requirements

### Requirement: Detección de Proveedor (Provider Candidate)

El sistema DEBE detectar un posible esquema de pagadora cuando los RFCs del recibo y del depósito difieren, y existe un patrón de depósitos recurrentes desde el RFC diferente.

| Condición | Acción |
|-----------|--------|
| RFCs difieren + depósitos recurrentes del RFC distinto | `PROVIDER_CANDIDATE` |
| RFCs difieren + sin patrón recurrente | `RFC_INCOMPATIBLE` → `MANUAL_REVIEW` |

#### Scenario: Proveedor candidato detectado

- GIVEN un recibo con `employer.rfc = "EMPRESA123"`
- AND depósitos recurrentes (≥2 en el periodo) de `detectedPayerRfc = "PAGADORA456"`
- AND la razón social de PAGADORA456 es distinta a EMPRESA123
- WHEN se evalúa el esquema
- THEN el resultado es `status = PROVIDER_CANDIDATE`

#### Scenario: Sin patrón recurrente → no es pagadora

- GIVEN un recibo con RFC diferente al depósito
- AND solo un depósito aislado del RFC distinto (sin recurrencia)
- WHEN se evalúa el esquema
- THEN el resultado es `status = RFC_INCOMPATIBLE`
- AND NO se marca como `PROVIDER_CANDIDATE`

### Requirement: Doble Espejo (Mirror Confirmation)

Cuando se detecta un `PROVIDER_CANDIDATE`, el sistema DEBE buscar depósitos coincidentes en monto y fecha (±2 días) provenientes de AMBAS fuentes: el empleador principal (mismo RFC que el recibo) Y la pagadora (RFC diferente).

| Condición | Resultado |
|-----------|-----------|
| Ambos (empleador + pagadora) tienen depósitos en el periodo | `PROVIDER_MIRROR_CONFIRMED` |
| Solo la pagadora tiene depósitos | `PROVIDER_CANDIDATE` (sin confirmar) |
| Ninguno tiene depósitos compatibles | `NOT_MATCHED` |

#### Scenario: Doble espejo confirmado

- GIVEN un `PROVIDER_CANDIDATE` con pagadora RFC = "PAGADORA456"
- AND un depósito del empleador principal (RFC = "EMPRESA123") con monto y fecha compatibles
- AND un depósito de la pagadora (RFC = "PAGADORA456") con monto y fecha compatibles
- WHEN se evalúa el doble espejo
- THEN el resultado es `status = PROVIDER_MIRROR_CONFIRMED`, `method = PROVIDER_MIRROR`

#### Scenario: Solo pagadora sin espejo del empleador

- GIVEN un `PROVIDER_CANDIDATE` con pagadora RFC = "PAGADORA456"
- AND depósitos de la pagadora compatibles
- AND NO hay depósitos del empleador principal en el mismo periodo
- WHEN se evalúa el doble espejo
- THEN el resultado permanece `status = PROVIDER_CANDIDATE`
- AND NO se confirma `PROVIDER_MIRROR_CONFIRMED`

### Requirement: Regla Scotiabank (Exclusión de Depósito)

Cuando se detecta un esquema de pagadora (RFC del pagador diferente al RFC del empleador) Y el `originalConcept` del depósito de la pagadora, normalizado (mayúsculas, sin acentos), NO contiene la palabra "NOMINA", el sistema DEBE marcar ese depósito como `scotiabankExcluded = true` en el resultado del matching. Esta regla aplica independientemente del banco emisor del estado de cuenta — el flag es para cálculos de Scotiabank como banco destino del crédito.

| Condición | Resultado |
|-----------|-----------|
| Pagadora detectada + concepto sin "NOMINA" | `scotiabankExcluded = true` |
| Pagadora detectada + concepto con "NOMINA" | `scotiabankExcluded = false` |
| Mismo RFC (empleador directo) | No aplica la regla, `scotiabankExcluded = false` |

#### Scenario: Depósito de pagadora con "NOMINA" → no excluido

- GIVEN un depósito de pagadora con `detectedPayerRfc` diferente al `employer.rfc`
- AND `originalConcept` = "PAGO DE NOMINA" (normalizado: contiene "NOMINA")
- WHEN se evalúa la regla Scotiabank
- THEN `scotiabankExcluded = false` (depósito válido para cálculos de Scotiabank)

#### Scenario: Depósito de pagadora sin "NOMINA" → excluido

- GIVEN un depósito de pagadora con `detectedPayerRfc` diferente al `employer.rfc`
- AND `originalConcept` = "TRANSFERENCIA TERCEROS" (normalizado: NO contiene "NOMINA")
- WHEN se evalúa la regla Scotiabank
- THEN `scotiabankExcluded = true` (depósito excluido para cálculos de Scotiabank)

#### Scenario: Depósito directo del empleador → regla no aplica

- GIVEN un depósito con `detectedPayerRfc` igual al `employer.rfc`
- AND `originalConcept` = "TRANSFERENCIA"
- WHEN se evalúa la regla Scotiabank
- THEN `scotiabankExcluded = false` (no aplica — es el empleador directo)

#### Scenario: Concepto "Pago de nómina" → matchea, no excluido

- GIVEN un depósito de pagadora con RFC diferente al empleador
- AND `originalConcept` = "Pago de nómina quincenal"
- WHEN se normaliza (uppercase, strip accents) → "PAGO DE NOMINA QUINCENAL"
- THEN contiene "NOMINA" → `scotiabankExcluded = false`

#### Scenario: Normalización cubre variantes de acentos y case

- GIVEN `originalConcept` = "  Nómina   Especial  "
- WHEN se normaliza (trim, uppercase, strip accents, compact spaces)
- THEN el resultado es "NOMINA ESPECIAL" → contiene "NOMINA" → `scotiabankExcluded = false`
