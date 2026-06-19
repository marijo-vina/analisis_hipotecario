# 03. Data Model (Sprint 1)
> Nota: Este documento pertenece al Sprint 1 y describe la base actualmente implementada. No debe asumirse como alcance completo del Sprint 2.

Este documento define el modelo conceptual de datos para el **Sprint 1**, el cual abarca la base del sistema, gestión de expedientes y catálogos principales.

## Entidades Principales

### 1. User
Usuarios internos del sistema (Asesoras).
- `id`: UUID (PK)
- `email`: String (Unique)
- `passwordHash`: String
- `name`: String
- `role`: Enum (ADMIN, ADVISOR)
- `createdAt`: DateTime
- `updatedAt`: DateTime

### 2. Client
Datos generales del cliente solicitante.
- `id`: UUID (PK)
- `firstName`: String
- `lastName`: String
- `secondLastName`: String (opcional)
- `rfc`: String (opcional, Unique)
- `curp`: String (opcional, Unique)
- `email`: String (opcional)
- `phone`: String (opcional)
- `createdAt`: DateTime
- `updatedAt`: DateTime

### 3. MortgageCase (Expediente)
El expediente de crédito hipotecario asociado a un cliente.
- `id`: UUID (PK)
- `clientId`: UUID (FK -> Client)
- `advisorId`: UUID (FK -> User)
- `creditTypeId`: Int (FK -> CreditType)
- `statusId`: Int (FK -> CaseStatus)
- `requestedAmount`: Decimal (monto solicitado)
- `propertyValue`: Decimal (valor aproximado del inmueble)
- `notes`: Text (opcional)
- `createdAt`: DateTime
- `updatedAt`: DateTime

### 4. Document
Metadatos de los documentos cargados al expediente. El archivo físico vive en Google Cloud Storage.
- `id`: UUID (PK)
- `mortgageCaseId`: UUID (FK -> MortgageCase)
- `documentTypeId`: Int (FK -> DocumentType)
- `documentStatusId`: Int (FK -> DocumentStatus)
- `fileUrl`: String (URL o Path en GCS, nullable — se asigna en HU-07)
- `storagePath`: String (ruta interna en GCS generada por StoragePathService)
- `originalName`: String
- `mimeType`: String? (MIME type del archivo subido, e.g. application/pdf — se asigna en HU-07)
- `sizeBytes`: Int? (tamaño del archivo en bytes — se asigna en HU-07)
- `uploadedById`: UUID (FK -> User)
- `ocrText`: String? (texto extraído por OCR de Document AI — agregado en HU-08 Sprint 2)
- `processedAt`: DateTime? (timestamp de procesamiento OCR exitoso — agregado en HU-08 Sprint 2)
- `processingError`: String? (mensaje de error si OCR falló — agregado en HU-08 Sprint 2)
- `createdAt`: DateTime
- `updatedAt`: DateTime (@updatedAt)

## Catálogos (Tablas de referencia)

### 5. CreditType
Catálogo de los tipos de crédito hipotecario disponibles.
- `id`: Int (PK, AutoIncrement)
- `code`: String (Unique, ej: 'COMPRA', 'MEJORA', 'LIQUIDEZ', 'TERRENO', 'REMODELACION', 'CONSTRUCCION')
- `name`: String (ej: 'Compra de casa o departamento')
- `isActive`: Boolean

### 6. CaseStatus
Catálogo de los estados por los que pasa un expediente.
- `id`: Int (PK, AutoIncrement)
- `code`: String (Unique, ej: 'DRAFT', 'INTEGRATION', 'ANALYSIS', 'COMPLETED')
- `name`: String (ej: 'Borrador', 'Integración Documental')
- `order`: Int (para organizar visualmente el pipeline)

### 7. DocumentType
Catálogo de los tipos de documento soportados. Reemplaza el enum nativo de PostgreSQL para consistencia con CreditType/CaseStatus.
- `id`: Int (PK, AutoIncrement)
- `code`: String (Unique, ej: 'PAYROLL_RECEIPT', 'BANK_STATEMENT', 'CREDIT_BUREAU_REPORT', 'INE', 'PROOF_OF_ADDRESS')
- `name`: String (ej: 'Recibo de Nómina')
- `isActive`: Boolean (para habilitar/deshabilitar tipos sin borrar datos)

### 8. DocumentStatus
Catálogo del pipeline de procesamiento de un documento.
- `id`: Int (PK, AutoIncrement)
- `code`: String (Unique, ej: 'UPLOADED', 'PENDING_REVIEW', 'PROCESSING', 'PROCESSED', 'ERROR')
- `name`: String (ej: 'Subido')
- `order`: Int (para ordenar visualmente el pipeline)

## Relaciones

- Un **User** tiene muchos **MortgageCases** (como asesor asignado).
- Un **Client** tiene muchos **MortgageCases**.
- Un **MortgageCase** pertenece a un **Client**, a un **User**, a un **CreditType** y a un **CaseStatus**.
- Un **MortgageCase** tiene muchos **Documents**.