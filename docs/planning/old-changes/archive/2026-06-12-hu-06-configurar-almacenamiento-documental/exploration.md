# Exploration: HU-06 — Configurar almacenamiento documental

## Current State

### ✅ Lo que ya existe

| Capa | Estado | Detalle |
|------|--------|---------|
| **Modelo Prisma** | ✅ Completo | `Document` existe con `documentType` como enum nativo PostgreSQL |
| **Migración DB** | ✅ Aplicada | Tablas creadas en `20260604002410_init` |
| **Cliente Prisma** | ✅ Generado | `src/generated/prisma/` con tipos y delegates |
| **Auth / Guard** | ✅ Operativo | `JwtAuthGuard` reutilizable |
| **PrismaModule** | ✅ Operativo | `PrismaService` exportado |
| **CatalogsModule** | ✅ Operativo | `GET /credit-types`, `GET /case-statuses` funcionando |
| **MortgageCasesModule** | ✅ Operativo | CRUD de expedientes con relaciones |
| **Seed** | ✅ Parcial | `CreditType` (6) y `CaseStatus` (4) seedeados |

### ❌ Lo que falta

| Capa | Estado | Detalle |
|------|--------|---------|
| **DocumentType catalog** | ❌ No existe | `Document` usa enum nativo — inconsistente con CreditType/CaseStatus |
| **DocumentStatus pipeline** | ❌ No existe | Sin tracking de estados de procesamiento (UPLOADED → PROCESSED) |
| **Document FKs** | ❌ No existe | `Document` no tiene FKs a catálogos ni `updatedAt` |
| **DocumentsModule** | ❌ No existe | Sin controller, service, DTOs ni tests para documentos |
| **StoragePathService** | ❌ No existe | Sin generador de rutas GCS para HU-07 |
| **Document catalog endpoints** | ❌ No existe | Sin `GET /document-types` ni `GET /document-statuses` |
| **Document metadata CRUD** | ❌ No existe | Sin endpoints para registrar/listar/obtener documentos |
| **Tests** | ❌ No existen | TDD estricto → deben escribirse primero |

## Affected Areas

### Archivos nuevos a crear
- `apps/api/src/documents/dto/create-document.dto.ts` — Validación de entrada para registrar metadata
- `apps/api/src/documents/dto/query-document.dto.ts` — DTO de consulta (paginación futura)
- `apps/api/src/documents/documents.controller.ts` — Endpoints REST protegidos con JWT
- `apps/api/src/documents/documents.service.ts` — Lógica de negocio con Prisma
- `apps/api/src/documents/documents.service.spec.ts` — Tests unitarios (TDD)
- `apps/api/src/documents/documents.controller.spec.ts` — Tests unitarios
- `apps/api/src/documents/storage-path.service.ts` — Servicio puro para rutas GCS
- `apps/api/src/documents/storage-path.service.spec.ts` — Tests unitarios
- `apps/api/src/documents/documents.module.ts` — Módulo NestJS
- `apps/api/src/documents/dto/create-document.dto.spec.ts` — Tests de validación DTO

### Archivos existentes a modificar
- `apps/api/prisma/schema.prisma` — Remover enum `DocumentType`, agregar `DocumentType`/`DocumentStatus` catalogos, modificar `Document`
- `apps/api/prisma/seed.ts` — Agregar seeds de `DocumentType` (5) y `DocumentStatus` (5)
- `apps/api/src/catalogs/catalogs.controller.ts` — Agregar `GET /document-types`, `GET /document-statuses`
- `apps/api/src/catalogs/catalogs.service.ts` — Agregar `getDocumentTypes()`, `getDocumentStatuses()`
- `apps/api/src/catalogs/catalogs.controller.spec.ts` — Tests para nuevos endpoints
- `apps/api/src/catalogs/catalogs.service.spec.ts` — Tests para nuevos métodos
- `apps/api/src/app.module.ts` — Agregar `DocumentsModule` a imports
- `apps/api/.env` — Agregar variables GCS comentadas

## Architectural Decisions

### 1. ¿Enum nativo o tabla catalogo para DocumentType?

**Opción A — Mantener enum nativo PostgreSQL**
- Pros: rápido, no requiere migración de tabla
- Cons: no extensible sin migración, sin metadatos (`isActive`), inconsistente con CreditType/CaseStatus

**Opción B — Convertir a tabla catalogo**
- Pros: consistente con el resto del sistema, extensible, soporta `isActive`, seeds con upsert
- Cons: requiere migración destructiva (pero 0 documentos en DB)

**Recomendación**: Opción B — consistencia arquitectónica con CreditType/CaseStatus.

### 2. ¿Dónde van los endpoints de catálogo documental?

**Opción A — Módulo Catalogs existente**
- `catalogs.controller.ts` con `GET /document-types` y `GET /document-statuses`
- Reutiliza patrón existente de credit-types/case-statuses

**Opción B — Módulo Documents independiente**
- `documents.controller.ts` con endpoints de catálogo
- Pros: todo documental en un solo módulo
- Cons: rompe el patrón de catálogos centralizado

**Recomendación**: Opción A — los catálogos son recursos independientes, igual que credit-types y case-statuses.

### 3. ¿Cómo se obtiene uploadedById?

**Opción A — Del body**
- Inseguro, el cliente puede suplantar

**Opción B — Del JWT del request**
- El controller extrae `req.user.id` del token
- Pros: seguro, auditable, consistente con `advisorId` en MortgageCase

**Recomendación**: Opción B — del JWT, no del body.

## Risks

1. **Enum-to-FK migration destructiva**: La migración elimina el enum nativo. **Mitigación**: 0 documentos en DB; migración segura.
2. **Prisma Client regeneration**: Puede romper imports del enum. **Mitigación**: verificar que ningún código fuente importe `DocumentType` enum.
3. **Circular references**: Relaciones inversas Document → DocumentType/DocumentStatus pueden generar referencias circulares en TypeScript. **Mitigación**: usar `Omit`/`Pick` en tipos exportados si es necesario.

## Recommendation

1. Migrar schema: eliminar enum `DocumentType`, crear `DocumentType`/`DocumentStatus` catalogos, modificar `Document` con FKs y `updatedAt`
2. Seed de catálogos documentales (5 tipos + 5 estados)
3. Extender `CatalogsModule` con `GET /document-types` y `GET /document-statuses`
4. Crear `DocumentsModule` con patrón Controller→Service→Prisma
5. Crear `StoragePathService` puro para HU-07
6. TDD estricto: tests unitarios primero, luego implementación
7. `uploadedById` del JWT, no del body

## Ready for Proposal
**Sí** — La base de datos, autenticación y catálogos están listos. HU-06 puede iniciarse inmediatamente. La dependencia con HU-03 está cubierta (MortgageCase module operativo).
