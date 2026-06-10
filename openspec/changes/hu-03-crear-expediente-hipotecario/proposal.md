# Proposal: HU-03 — Crear Expediente Hipotecario

## Intent

Permitir que una asesora autenticada dé de alta un expediente hipotecario mínimo asociado a un cliente existente, sin bloquear el flujo de preperfilamiento cuando faltan datos opcionales.

## Scope

### In Scope
- POST /mortgage-cases con validaciones de seguridad y negocio.
- GET /mortgage-cases/:id para consultar expediente con relaciones.
- GET /mortgage-cases para listar resumen.
- Seeds de CreditType y CaseStatus.
- Ajuste de contrato `specs/04-api-contracts.md` para eliminar `advisorId` del body.

### Out of Scope
- Carga de documentos (HU-04).
- Transiciones de estado complejas (pipeline parcial).
- Campos de preperfilamiento avanzados (propertyState, etc.).

## Capabilities

### New Capabilities
- `mortgage-case-creation`: Alta de expediente con validaciones mínimas y no bloqueantes.
- `catalog-seeds`: Semillas obligatorias de CreditType y CaseStatus.

### Modified Capabilities
- `api-contracts`: Eliminar `advisorId` y `statusId` del body de POST /mortgage-cases; ajustar respuestas.

## Approach

NestJS Controller → Service → Prisma. `advisorId` extraído del JWT vía guard/middleware. Validación con class-validator. `status` inicial `PENDING_DOCUMENTS` asignado por el backend. `personType` default `SALARIED`; si se envía, solo `SALARIED` se acepta. Seeds con Prisma seed o script SQL.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/mortgage-cases/` | New | Controller, Service, DTOs, Module. |
| `prisma/seed.ts` | Modified | Seeds de CreditType y CaseStatus. |
| `specs/04-api-contracts.md` | Modified | Quitar `advisorId` del body; ajustar request/response. |
| `src/auth/` | Modified | Exponer `advisorId` del JWT al request. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Contrato `04-api-contracts` desactualizado | Med | Revisar y actualizar explícitamente en la fase de spec. |
| Seeds no ejecutados antes de pruebas | Med | Documentar dependencia en acceptance criteria. |

## Rollback Plan

Eliminar migration y revertir commit. No afecta datos de clientes existentes.

## Dependencies

- HU-02 (clientes existentes) debe estar operativa.
- HU-01 (login/JWT) para extraer `advisorId`.

## Success Criteria

- [ ] POST /mortgage-cases crea expediente con `status=PENDING_DOCUMENTS`.
- [ ] `advisorId` se toma del JWT y se rechaza si viene en body.
- [ ] Seeds mínimos disponibles antes de pruebas.
- [ ] Listado y consulta devuelven relaciones correctas.
