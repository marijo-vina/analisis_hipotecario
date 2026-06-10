# Design: HU-03 — Crear Expediente Hipotecario

## Scope

HU-03 cubre EXCLUSIVAMENTE:

| Método | Endpoint | Auth |
|--------|----------|------|
| POST | `/mortgage-cases` | JWT |
| GET | `/mortgage-cases` | JWT |
| GET | `/mortgage-cases/:id` | JWT |
| GET | `/credit-types` | Público |
| GET | `/case-statuses` | Público |

`PATCH /mortgage-cases/:id` queda **explícitamente diferido a HU-04** (actualizar expediente / completar datos / cambio de estatus).

## Technical Approach

NestJS Controller → Service → Prisma, réplica del patrón de ClientsModule.
`advisorId` se extrae de `req.user.id` (JWT). `statusId` y `personType` se asignan server-side.
`ValidationPipe` ya configurado en `main.ts` con `whitelist: true, forbidNonWhitelisted: true, transform: true`.
DTOs con class-validator para campos obligatorios y condicionales >0.

## Architecture Decisions

| Decision | Choice | Rejected | Rationale |
|----------|--------|-----------|-----------|
| Catálogos | Módulo independiente `CatalogsModule` con GET /credit-types, GET /case-statuses | Endpoints dentro de MortgageCasesModule | Los contratos ya definen rutas independientes. Separación clara de responsabilidades. |
| advisorId | `@Req() req` en controller, `req.user.id` inyectado al service | Decorator custom `@CurrentUser()` | Agregar un decorator custom es sobre-ingeniería para un solo uso. `@Req()` es idiomático NestJS. |
| personType | `enum PersonType { SALARIED }` en Prisma. DTO con `@IsOptional() @IsIn(['SALARIED'])`. Default server-side `SALARIED` si no se envía. | Campo `String` en Prisma (migración más fácil, pero sin type-safety) | El enum de Prisma da type-safety a nivel schema. Solo se acepta `SALARIED` en MVP. Futuras fases ampliarán el enum agregando miembros (migración esperable). |
| propertyLocation | `String?` | Descomponer en state/city/address | El spec explícitamente lo difiere a futura HU. MVP simple, sin restricción `@unique`. |
| Decimal opcionales | `Decimal?` en Prisma, `@IsNumber()` `@Min(0.01)` condicional en DTO | Mantener `Decimal` obligatorio con default 0 | 0 es semánticamente distinto de "no informado". Nullable es correcto. |
| Seeds | `upsert` con `where: { code }` en `prisma/seed.ts` | Script SQL separado | Mismo patrón del seed de User existente. Idempotente, permite re-ejecución. |
| statusId | Resuelto server-side buscando `CaseStatus` con `code = PENDING_DOCUMENTS` | Aceptar `statusId` en body | Seguridad: el frontend no debe controlar el estado inicial. Siempre arranca en `PENDING_DOCUMENTS`. |
| Seguridad de input | `ValidationPipe` con `whitelist + forbidNonWhitelisted` (ya configurado en `main.ts`). DTO sin `advisorId` ni `statusId`. | Validación manual en controller | `forbidNonWhitelisted` rechaza propiedades no declaradas con `400 Bad Request`. Si alguien envía `advisorId` en body, NestJS lo rechaza automáticamente. |
| PATCH /mortgage-cases/:id | **Diferido a HU-04** | Incluir en HU-03 | HU-03 cubre solo creación y consulta. La actualización requiere flujo de documentos, cambio de estatus y reglas de negocio que no son parte del MVP de alta. |

## Prisma Schema Changes

Nueva migración `add_mortgage_case_preprofiling_fields`:

```prisma
// Nueva enum
enum PersonType {
  SALARIED
}

// Cambios en MortgageCase
model MortgageCase {
  // ... campos existentes ...
  personType          PersonType  @default(SALARIED)
  propertyLocation    String?
  estimatedTermMonths Int?
  requestedAmount     Decimal?    // era Decimal (obligatorio)
  propertyValue       Decimal?    // era Decimal (obligatorio)
}
```

## Data Flow

```
POST /mortgage-cases
  │
  ├─ JwtAuthGuard → req.user = { id, email, role }
  │
  ├─ ValidationPipe (whitelist: true, forbidNonWhitelisted: true)
  │     ├─ Propiedades no declaradas en DTO (ej. advisorId) → 400 Bad Request
  │     └─ CreateMortgageCaseDto:
  │           ├─ clientId: @IsUUID()
  │           ├─ creditTypeId: @IsInt() @Min(1)
  │           ├─ personType?: @IsOptional() @IsIn(['SALARIED'])
  │           ├─ propertyLocation?: @IsOptional() @IsString()
  │           ├─ requestedAmount?: @IsOptional() @IsNumber() @Min(0.01)
  │           ├─ propertyValue?: @IsOptional() @IsNumber() @Min(0.01)
  │           └─ estimatedTermMonths?: @IsOptional() @IsInt() @Min(1)
  │
  └─ MortgageCasesService.create(dto, advisorId)
        ├─ Resuelve statusId via prisma.caseStatus.findUnique({ where: { code: 'PENDING_DOCUMENTS' } })
        ├─ Valida existencia de clientId y creditTypeId → NotFoundException
        ├─ prisma.mortgageCase.create({ data: { ...dto, advisorId, statusId, personType: dto.personType ?? 'SALARIED' } })
        └─ Retorna expediente con includes: client, advisor, creditType, status
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `prisma/schema.prisma` | Modify | Agregar PersonType enum, propertyLocation, estimatedTermMonths; Decimal→Decimal? |
| `prisma/seed.ts` | Modify | Upserts de CreditType (6) y CaseStatus (5) |
| `src/catalogs/catalogs.module.ts` | Create | Módulo con PrismaModule |
| `src/catalogs/catalogs.controller.ts` | Create | GET /credit-types, GET /case-statuses |
| `src/catalogs/catalogs.service.ts` | Create | Queries de catálogo con Prisma |
| `src/mortgage-cases/mortgage-cases.module.ts` | Create | Módulo con PrismaModule |
| `src/mortgage-cases/mortgage-cases.controller.ts` | Create | POST, GET /, GET /:id con JwtAuthGuard |
| `src/mortgage-cases/mortgage-cases.service.ts` | Create | Lógica de creación/consulta/listado |
| `src/mortgage-cases/dto/create-mortgage-case.dto.ts` | Create | DTO sin advisorId ni statusId; validaciones condicionales |
| `src/mortgage-cases/dto/query-mortgage-case.dto.ts` | Create | DTO para paginación |
| `src/app.module.ts` | Modify | Importar CatalogsModule, MortgageCasesModule |
| `specs/04-api-contracts.md` | Modify | Eliminar advisorId/statusId del body; documentar nuevos campos opcionales; marcar PATCH como diferido |
| `test/mortgage-cases.e2e-spec.ts` | Create | E2E: create, list, get, 401, 400, 404 |

## API Contract Adjustment

POST /mortgage-cases **antes** (inseguro):
```json
{ "clientId", "advisorId", "creditTypeId", "statusId", "requestedAmount", "propertyValue", "notes" }
```

POST /mortgage-cases **después** (seguro):
```json
{ "clientId", "creditTypeId", "personType?", "propertyLocation?", "requestedAmount?", "propertyValue?", "estimatedTermMonths?", "notes?" }
```

`advisorId` y `statusId` eliminados del body.
- `advisorId` → rechazado por `forbidNonWhitelisted` (400 Bad Request si se envía).
- `statusId` → resuelto internamente con `code = PENDING_DOCUMENTS`.
- Response incluye `personType`, `propertyLocation`, `estimatedTermMonths`, `status.code`.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | MortgageCasesService.create | Mock PrismaService; verificar asignación de advisorId, status, defaults; validar errores FK |
| Unit | MortgageCasesService.findAll/findOne | Mock findMany/findUnique con includes |
| Unit | CatalogsService | Mock findMany para credit-types y case-statuses |
| E2E | POST /mortgage-cases | Crear con/sin opcionales; validar status=PENDING_DOCUMENTS; rechazar advisorId en body (400) |
| E2E | GET /mortgage-cases | Listado paginado, 401 sin token |
| E2E | GET /mortgage-cases/:id | Detalle con relaciones; 404 para id inexistente |

TDD estricto: service spec → service impl → controller spec → controller impl → e2e.

## Open Questions

- [x] ~~¿Se necesita un endpoint PATCH /mortgage-cases/:id en este HU?~~ **Resuelto**: Diferido explícitamente a HU-04 (actualizar expediente / completar datos / cambio de estatus). No se implementa en HU-03.
