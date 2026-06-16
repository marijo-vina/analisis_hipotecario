# Exploration: HU-07 — Cargar documentos al expediente

## Current State

### ✅ Lo que ya existe (gracias a HU-06)

| Capa | Estado | Detalle |
|------|--------|---------|
| **Document model** | ✅ Completo | FKs a DocumentType/DocumentStatus, `fileUrl` y `storagePath` nullable |
| **DocumentsModule** | ✅ Operativo | Controller, Service, DTOs, StoragePathService, tests unitarios |
| **Catalog endpoints** | ✅ Operativos | `GET /document-types`, `GET /document-statuses` |
| **Auth / Guard** | ✅ Operativo | `JwtAuthGuard` reutilizable |
| **PrismaModule** | ✅ Operativo | `PrismaService` exportado |
| **StoragePathService** | ✅ Operativo | Genera rutas `{caseId}/{code}/{filename}` |
| **Frontend case detail** | ✅ Parcial | Página de expediente con datos del cliente y asesor |
| **MortgageCasesModule** | ✅ Operativo | CRUD de expedientes con relaciones |

### ❌ Lo que falta

| Capa | Estado | Detalle |
|------|--------|---------|
| **GCS integration** | ❌ No existe | Sin `@google-cloud/storage`, sin subida de archivos reales |
| **File upload endpoint** | ❌ No existe | Sin endpoint multipart ni `FileInterceptor` |
| **MIME/size validation** | ❌ No existe | Sin validación de tipo ni tamaño de archivo |
| **Document metadata fields** | ❌ No existe | `mimeType` y `sizeBytes` no están en el schema Prisma |
| **GcsService** | ❌ No existe | Sin wrapper de GCS para upload de buffers |
| **Frontend upload UI** | ❌ No existe | Sin componente de carga de archivos ni lista de documentos |
| **Route Handler proxy** | ❌ No existe | Sin intermediario entre browser y NestJS para multipart |
| **Tests de upload** | ❌ No existen | TDD estricto → deben escribirse primero |

## Affected Areas

### Archivos nuevos a crear
- `apps/api/src/documents/gcs.service.ts` — Wrapper de `@google-cloud/storage`
- `apps/api/src/documents/gcs.service.spec.ts` — Tests unitarios de GCS
- `apps/web/app/api/mortgage-cases/[id]/documents/upload/route.ts` — Route Handler proxy
- `apps/web/app/ui/documents/document-upload.tsx` — Client component para subir archivos
- `apps/web/app/ui/documents/document-list.tsx` — Componente de lista de documentos
- `apps/web/app/ui/documents/documents-client-section.tsx` — Wrapper client-side

### Archivos existentes a modificar
- `apps/api/prisma/schema.prisma` — Agregar `mimeType String?` y `sizeBytes Int?` a Document
- `apps/api/src/documents/documents.service.ts` — Agregar `uploadAndCreate()`
- `apps/api/src/documents/documents.service.spec.ts` — Tests de uploadAndCreate
- `apps/api/src/documents/documents.controller.ts` — Agregar `POST upload` con FileInterceptor
- `apps/api/src/documents/documents.controller.spec.ts` — Tests del endpoint upload
- `apps/api/src/documents/documents.module.ts` — Agregar `GcsService` a providers
- `apps/api/.env` — Descomentar GCS vars, agregar `MAX_UPLOAD_SIZE_MB`
- `apps/api/package.json` — Agregar `@google-cloud/storage` y `@types/multer`
- `apps/web/app/lib/definitions.ts` — Agregar `Document` y `DocumentType` interfaces
- `apps/web/app/dashboard/expedientes/[id]/page.tsx` — Integrar upload + list

## Architectural Decisions

### 1. ¿Dónde vive GcsService?

**Opción A — Módulo Upload separado**
- Pros: reutilizable por otros módulos en el futuro
- Cons: over-engineering para un solo consumidor; más complejo

**Opción B — Dentro de DocumentsModule (`documents/gcs.service.ts`)**
- Pros: más simple, Documents es el único consumidor actual
- Cons: menos reutilizable si otros módulos necesitan GCS

**Recomendación**: Opción B — consistencia con HU-06; extraer a módulo separado si se comparte.

### 2. ¿Cómo transporta el frontend el archivo?

**Opción A — Server Action de Next.js**
- Pros: patrón recomendado por Next.js
- Cons: limites de body-size en server actions; JWT httpOnly no accesible desde client JS

**Opción B — Route Handler que proxies multipart a NestJS**
- Pros: no hay límite de body-size en Route Handler; JWT se lee serverside desde cookie httpOnly
- Cons: un hop extra (browser → Next.js → NestJS)

**Recomendación**: Opción B — evita limitaciones de server actions y mantiene JWT seguro.

### 3. ¿Multer memoryStorage o diskStorage?

**Opción A — diskStorage**
- Pros: soporta archivos grandes sin consumir RAM
- Cons: necesita cleanup de archivos temporales; más complejo

**Opción B — memoryStorage**
- Pros: más simple, sin cleanup; aceptable para ≤10 MB
- Cons: consume RAM proporcional al tamaño del archivo

**Recomendación**: Opción B — MVP con límite 10 MB; migrar a diskStorage si se necesita >50 MB.

### 4. ¿URI pública o gs:// para fileUrl?

**Opción A — URL pública HTTP (`https://storage.googleapis.com/...`)**
- Pros: accesible directamente desde navegador
- Cons: requiere bucket público o signed URLs; menos seguro

**Opción B — URI `gs://{bucket}/{path}`**
- Pros: identificador estable nativo de GCS; bucket puede permanecer privado
- Cons: no descargable directamente desde browser sin signed URL

**Recomendación**: Opción B — bucket privado, signed URLs en HU-XX futura.

## Risks

1. **GCS sin emulador local**: En dev se usa ADC (`gcloud auth application-default login`) o bucket real pequeño.
2. **Next.js server-action body-size limit**: Evitado por diseño (Route Handler).
3. **Multer memoryStorage para archivos grandes**: Mitigado por límite 10 MB.
4. **MIME type confiado al cliente**: Se valida serverside con whitelist.
5. **Testing GCS en CI**: Mock de `@google-cloud/storage` en tests unitarios.

## Recommendation

1. Instalar `@google-cloud/storage` y `@types/multer`
2. Extender schema Prisma con `mimeType` y `sizeBytes` (nullable, no destructivo)
3. Crear `GcsService` con `uploadFile()` que retorna `gs://` URI
4. Agregar `uploadAndCreate()` a `DocumentsService` con flujo: validar case → validar type → validar archivo → buildPath → GCS upload → Prisma create
5. Agregar `POST upload` a `DocumentsController` con `FileInterceptor` + `JwtAuthGuard`
6. Crear Route Handler proxy en Next.js
7. Crear `DocumentUpload` y `DocumentList` en frontend
8. TDD estricto: tests unitarios primero, luego implementación

## Ready for Proposal

**Sí** — HU-06 dejó toda la infraestructura lista. El upload de archivos es la pieza natural siguiente.

## Dependencies

- **HU-06** (completo): `DocumentsModule`, `StoragePathService`, catalog seeding
- **HU-03** (completo): `MortgageCasesModule` para validar existencia de expediente
- **HU-02** (completo): `JwtAuthGuard` para proteger endpoint
