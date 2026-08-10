# Exploration: HU-03 — Crear Expediente Hipotecario

## Current State

### ✅ Lo que ya existe

| Capa | Estado | Detalle |
|------|--------|---------|
| **Modelo Prisma** | ✅ Completo | `MortgageCase`, `CreditType`, `CaseStatus`, `Document` definidos con relaciones, constraints y FK |
| **Migración DB** | ✅ Aplicada | Tablas creadas en `20260604002410_init` con FK constraints y unique indexes |
| **Cliente Prisma** | ✅ Generado | `src/generated/prisma/` con todos los tipos y delegates |
| **API Contracts** | ✅ Documentados | `specs/04-api-contracts.md` define POST/GET/PATCH `/mortgage-cases`, `GET /credit-types`, `GET /case-statuses` |
| **Data Model** | ✅ Documentado | `specs/03-data-model.md` describe entidades, campos y relaciones |
| **Auth / Guard** | ✅ Operativo | `JwtAuthGuard` reutilizable, tested en clients module |
| **PrismaModule** | ✅ Operativo | `PrismaService` exportado, listo para inyectar en nuevos módulos |
| **Plan HU-03** | ✅ Definido | `specs/Plan-por-sprints.md` y `contexto_mvp_sdd_orchestrator.md` definen alcance y tipos de crédito |
| **Seed de User** | ✅ Completo | Admin `admin@gestion.com` con password `admin123` |

### ❌ Lo que falta

| Capa | Estado | Detalle |
|------|--------|---------|
| **Módulo NestJS** | ❌ No existe | No hay `mortgage-cases/` ni `catalogs/` en `apps/api/src/` |
| **Controller** | ❌ No existe | Sin endpoints para POST/GET/PATCH `/mortgage-cases` ni catálogos |
| **Service** | ❌ No existe | Sin lógica de creación, listado, detalle con relaciones, cambio de estado |
| **DTOs** | ❌ No existen | Sin `CreateMortgageCaseDto`, `UpdateMortgageCaseDto`, `UpdateStatusDto` |
| **Seed de catálogos** | ❌ No existe | `CreditType` (6 tipos) y `CaseStatus` (pipeline states) sin seed data |
| **Tests unitarios** | ❌ No existen | TDD estricto → deben escribirse primero |
| **Tests e2e** | ❌ No existen | Sin cobertura de integración |
| **Spec dedicada** | ❌ No existe | `specs/07-expedientes.spec.md` sugerida pero no creada |
| **Paginación** | ❌ No existe | Respuesta con wrapper `{ data, meta }` no implementada para listados |

## Affected Areas

### Archivos nuevos a crear
- `apps/api/src/mortgage-cases/dto/create-mortgage-case.dto.ts` — Validación de entrada para crear expediente
- `apps/api/src/mortgage-cases/dto/update-mortgage-case.dto.ts` — Validación de entrada para actualizar
- `apps/api/src/mortgage-cases/dto/update-status.dto.ts` — Cambio de estado del pipeline
- `apps/api/src/mortgage-cases/mortgage-cases.controller.ts` — Endpoints REST protegidos con JWT
- `apps/api/src/mortgage-cases/mortgage-cases.service.ts` — Lógica de negocio con Prisma
- `apps/api/src/mortgage-cases/mortgage-cases.service.spec.ts` — Tests unitarios (TDD)
- `apps/api/src/mortgage-cases/mortgage-cases.module.ts` — Módulo NestJS
- `apps/api/src/catalogs/catalogs.controller.ts` — Endpoints GET para credit-types y case-statuses
- `apps/api/src/catalogs/catalogs.service.ts` — Lectura simple de catálogos
- `apps/api/src/catalogs/catalogs.module.ts` — Módulo NestJS
- `apps/api/test/mortgage-cases.e2e-spec.ts` — Tests de integración
- `specs/07-expedientes.spec.md` — Especificación funcional HU-03

### Archivos existentes a modificar
- `apps/api/src/app.module.ts` — Agregar `MortgageCasesModule` a imports
- `apps/api/prisma/seed.ts` — Agregar seeds de `CreditType` (6) y `CaseStatus` (4-5 estados)

### Dependencias con HU-02
- `MortgageCase.clientId` → requiere `Client` existente → `clients.service.findOne()` puede reutilizarse para validar existencia
- El controller de mortgage-cases puede importar `ClientsModule` o usar Prisma directo para validar el clientId

## Architectural Decisions to Evaluate

### 1. ¿Catálogos como módulo separado o endpoints en mortgage-cases?

**Opción A — Módulo Catalogs independiente**
- `catalogs.controller.ts` con `GET /credit-types` y `GET /case-statuses`
- Reusable para el frontend sin acoplar a mortgage-cases
- Pros: separación clara, los catálogos son recursos independientes
- Cons: un módulo más, overhead mínimo

**Opción B — Endpoints dentro de mortgage-cases**
- `mortgage-cases.controller.ts` con `GET /mortgage-cases/credit-types` y `GET /mortgage-cases/statuses`
- Pros: menos módulos
- Cons: URLs menos RESTful, acoplamiento semántico

**Recomendación**: Opción A — los contratos ya definen `GET /credit-types` y `GET /case-statuses` como rutas independientes (ver `04-api-contracts.md`).

### 2. ¿De dónde sale el advisorId?

**Opción A — Del body (como está en el contrato actual)**
- El frontend envía `advisorId` en el POST
- Pros: coincide con el contrato documentado
- Cons: inseguro, el cliente puede suplantar

**Opción B — Del JWT del request**
- El controller extrae `req.user.id` del token
- Pros: seguro, auditable
- Cons: requiere actualizar el api-contract

**Recomendación**: Opción B — es la práctica segura. El `04-api-contracts.md` debe actualizarse para reflejar que `advisorId` se obtiene del token autenticado. Eliminar `advisorId` del body del POST. El contrato actual probablemente se escribió antes de que el patrón de auth estuviera maduro.

### 3. Seed data: ¿IDs hardcodeados o auto-increment?

Los catálogos usan `@default(autoincrement())`. El seed debe usar `upsert` con `where: { code }` para ser idempotente. Los IDs resultantes no deben hardcodearse en tests — los tests deben obtener los catálogos por `code`.

## Risks

1. **Catálogos sin seed**: Si no hay datos en `CreditType` y `CaseStatus`, crear un MortgageCase falla por FK constraint. **Mitigación**: seed de catálogos debe ser parte de la misma tarea.
2. **advisorId inseguro en contrato**: El api-contract actual permite enviar `advisorId` desde cliente. **Mitigación**: el diseño técnico debe usar JWT, y actualizar el contrato.
3. **Decimal precision**: `requestedAmount` y `propertyValue` son `Decimal` en Prisma. NestJS validation debe manejar números flotantes correctamente con transformación a string para Prisma.
4. **FK cascade**: Las FK están en `ON DELETE RESTRICT` — no se puede borrar un Client si tiene MortgageCases. Esto es correcto, pero debe manejarse en el service con errores claros.
5. **Sin spec funcional dedicada**: HU-03 no tiene su archivo `07-expedientes.spec.md`. La fase `sdd-spec` debe crearlo antes de diseñar/implementar.

## Recommendation

1. Crear la spec funcional (`07-expedientes.spec.md`) como primer paso obligatorio (fase `sdd-spec`)
2. Seed de catálogos (`CreditType` 6 tipos + `CaseStatus` pipeline de 4-5 estados)
3. Módulo `CatalogsModule` → `GET /credit-types`, `GET /case-statuses` (simple, solo lectura pública)
4. Módulo `MortgageCasesModule` con patrón Controller→Service→Prisma idéntico a ClientsModule
5. `advisorId` del JWT, no del body — actualizar api-contract
6. TDD estricto: tests unitarios primero, luego implementación, luego e2e

## Ready for Proposal
**Sí** — La exploración confirma que la base de datos, el cliente Prisma, la autenticación y los contratos están listos. HU-03 puede iniciarse inmediatamente después de crear la spec funcional. Las dependencias con HU-02 están cubiertas (clients module operativo).
