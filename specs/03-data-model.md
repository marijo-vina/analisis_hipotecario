# 03. Data Model (Sprint 1)

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
- `documentType`: Enum (NOMINA, ESTADO_CUENTA, BURO, INE, COMPROBANTE_DOMICILIO)
- `fileUrl`: String (URL o Path en GCS)
- `originalName`: String
- `uploadedById`: UUID (FK -> User)
- `createdAt`: DateTime

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

## Relaciones

- Un **User** tiene muchos **MortgageCases** (como asesor asignado).
- Un **Client** tiene muchos **MortgageCases**.
- Un **MortgageCase** pertenece a un **Client**, a un **User**, a un **CreditType** y a un **CaseStatus**.
- Un **MortgageCase** tiene muchos **Documents**.