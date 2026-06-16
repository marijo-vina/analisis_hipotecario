# 04. API Contracts (Sprint 1)

Este documento define la estructura de las peticiones (Requests) y respuestas (Responses) para los endpoints del backend del Sprint 1, construidos en NestJS.

Todas las peticiones esperan y devuelven `application/json` a menos que se indique lo contrario. Para listar, se asume un envoltorio genérico tipo `{ "data": [...] }`.

## 1. Clientes (`/clients`)

### `POST /clients`
Crea un nuevo cliente.
**Request Body:**
```json
{
  "firstName": "Juan",
  "lastName": "Pérez",
  "secondLastName": "García",
  "rfc": "PEGJ800101XYZ",
  "curp": "PEGJ800101HDFRXY00",
  "email": "juan.perez@email.com",
  "phone": "5512345678"
}
```

### `GET /clients`
Obtiene la lista de clientes (con paginación opcional en querystring).
**Response (200 OK):**
```json
{
  "data": [
    {
      "id": "uuid-client-1",
      "firstName": "Juan",
      "lastName": "Pérez",
      "rfc": "PEGJ800101XYZ",
      "createdAt": "2026-06-03T10:00:00Z"
    }
  ],
  "meta": { "total": 1, "page": 1, "limit": 10 }
}
```

### `GET /clients/:id`
**Response (200 OK):**
```json
{
  "id": "uuid-client-1",
  "firstName": "Juan",
  "lastName": "Pérez",
  "secondLastName": "García",
  "rfc": "PEGJ800101XYZ",
  "curp": "PEGJ800101HDFRXY00",
  "email": "juan.perez@email.com",
  "phone": "5512345678",
  "createdAt": "2026-06-03T10:00:00Z",
  "updatedAt": "2026-06-03T10:00:00Z"
}
```

### `PATCH /clients/:id`
Actualiza parcialmente a un cliente.
**Request Body (Cualquier campo es opcional):**
```json
{
  "phone": "5599887766"
}
```

---

## 2. Expedientes Hipotecarios (`/mortgage-cases`)

### `POST /mortgage-cases`
Crea un nuevo expediente ligado a un cliente y asignado a una asesora.
**Request Body:**
```json
{
  "clientId": "uuid-client-1",
  "creditTypeId": 1,
  "personType": "SALARIED",
  "propertyLocation": "CDMX",
  "requestedAmount": 1500000.00,
  "propertyValue": 2000000.00,
  "estimatedTermMonths": 240,
  "notes": "Cliente pre-aprobado en simulador."
}
```

Notas de contrato:
- `advisorId` **NO** se acepta en body. Se toma del JWT autenticado.
- `statusId` **NO** se acepta en body. Se asigna internamente como `PENDING_DOCUMENTS`.
- Campos opcionales: `propertyLocation?`, `requestedAmount?`, `propertyValue?`, `estimatedTermMonths?`, `personType?`.

### `GET /mortgage-cases`
**Response (200 OK):**
```json
{
  "data": [
    {
      "id": "uuid-case-1",
      "clientId": "uuid-client-1",
      "clientName": "Juan Pérez",
      "creditType": "COMPRA",
      "status": "PENDING_DOCUMENTS",
      "personType": "SALARIED",
      "requestedAmount": "1500000.00",
      "createdAt": "2026-06-03T10:00:00Z"
    }
  ]
}
```

### `GET /mortgage-cases/:id`
**Response (200 OK):**
```json
{
  "id": "uuid-case-1",
  "client": {
    "id": "uuid-client-1",
    "firstName": "Juan",
    "lastName": "Pérez"
  },
  "advisor": {
    "id": "uuid-user-1",
    "name": "Cristina Asesora"
  },
  "creditType": { "id": 1, "code": "COMPRA", "name": "Compra de vivienda" },
  "status": { "id": 1, "code": "PENDING_DOCUMENTS", "name": "Pendiente de documentos" },
  "personType": "SALARIED",
  "propertyLocation": "CDMX",
  "estimatedTermMonths": 240,
  "requestedAmount": "1500000.00",
  "propertyValue": "2000000.00",
  "notes": "Cliente pre-aprobado en formulario.",
  "documents": []
}
```

### `PATCH /mortgage-cases/:id`
**Diferido a HU-04**. No forma parte del alcance de HU-03.

---

## 3. Catálogos (`/catalogs`)

Para simplificar el frontend, podemos tener rutas específicas o agruparlos. Mantendremos las rutas explícitas propuestas:

**Seguridad:** estos endpoints internos requieren JWT (`Authorization: Bearer <token>`).

### `GET /credit-types`
**Response (200 OK):**
```json
{
  "data": [
    { "id": 1, "code": "COMPRA", "name": "Compra de vivienda", "isActive": true },
    { "id": 2, "code": "LIQUIDEZ", "name": "Obtención de liquidez", "isActive": true }
  ]
}
```

### `GET /case-statuses`
**Response (200 OK):**
```json
{
  "data": [
    { "id": 1, "code": "PENDING_DOCUMENTS", "name": "Pendiente de documentos", "order": 10 },
    { "id": 2, "code": "INTEGRATION", "name": "Integración", "order": 20 }
  ]
}
```

### `GET /document-types`
**Response (200 OK):**
```json
{
  "data": [
    { "id": 1, "code": "PAYROLL_RECEIPT", "name": "Recibo de Nómina", "isActive": true },
    { "id": 2, "code": "BANK_STATEMENT", "name": "Estado de Cuenta", "isActive": true }
  ]
}
```

### `GET /document-statuses`
**Response (200 OK):**
```json
{
  "data": [
    { "id": 1, "code": "UPLOADED", "name": "Subido", "order": 10 },
    { "id": 2, "code": "PROCESSING", "name": "Procesando", "order": 20 }
  ]
}
```

---

## 4. Documentos (Metadata)

*Nota: Estos endpoints gestionan la metadata; la subida real (multipart) interactuará de otra forma o usará URLs prefirmadas en el futuro, pero la metadata en base de datos responde a estos contratos.*

*Nota de HU-06: `documentType` ahora es `documentTypeId` (FK a catalogo). `fileUrl` inicia nulo y se asigna en HU-07. `uploadedById` se obtiene del JWT, no del body.*

### `POST /mortgage-cases/:caseId/documents`
Registra la metadata de un documento que pertenece a un expediente.
**Request Body:**
```json
{
  "documentTypeId": 1,
  "originalName": "recibo_nomina_mayo.pdf"
}
```

Notas de contrato:
- `uploadedById` **NO** se acepta en body. Se toma del JWT autenticado.
- `fileUrl` **NO** se acepta en body. Inicia `null` y se asigna en HU-07.
- `documentStatusId` **NO** se acepta en body. Se asigna internamente como `UPLOADED`.
- Body requerido: `documentTypeId` (Int ≥ 1), `originalName` (String no vacío).

**Response (201 Created):**
```json
{
  "data": {
    "id": "uuid-doc-1",
    "documentType": { "id": 1, "code": "PAYROLL_RECEIPT", "name": "Recibo de Nómina" },
    "documentStatus": { "id": 1, "code": "UPLOADED", "name": "Subido" },
    "originalName": "recibo_nomina_mayo.pdf",
    "fileUrl": null,
    "storagePath": null,
    "uploadedBy": {
      "id": "uuid-user-1",
      "name": "María Asesora"
    },
    "createdAt": "2026-06-03T10:15:00Z",
    "updatedAt": "2026-06-03T10:15:00Z"
  }
}
```

### `GET /mortgage-cases/:caseId/documents`
Obtiene los documentos de un expediente.
**Response (200 OK):**
```json
{
  "data": [
    {
      "id": "uuid-doc-1",
      "documentType": { "id": 1, "code": "PAYROLL_RECEIPT", "name": "Recibo de Nómina" },
      "documentStatus": { "id": 1, "code": "UPLOADED", "name": "Subido" },
      "originalName": "recibo_nomina_mayo.pdf",
      "fileUrl": null,
      "storagePath": null,
      "createdAt": "2026-06-03T10:15:00Z",
      "updatedAt": "2026-06-03T10:15:00Z"
    }
  ]
}
```

### `GET /mortgage-cases/:caseId/documents/:documentId`
Obtiene el detalle de un documento específico dentro de un expediente. La búsqueda está acotada por `caseId`.
**Response (200 OK):**
```json
{
  "data": {
    "id": "uuid-doc-1",
    "mortgageCaseId": "uuid-case-1",
    "documentType": { "id": 1, "code": "PAYROLL_RECEIPT", "name": "Recibo de Nómina" },
    "documentStatus": { "id": 1, "code": "UPLOADED", "name": "Subido" },
    "originalName": "recibo_nomina_mayo.pdf",
    "fileUrl": null,
    "storagePath": null,
    "mimeType": null,
    "sizeBytes": null,
    "uploadedBy": {
      "id": "uuid-user-1",
      "name": "María Asesora"
    },
    "createdAt": "2026-06-03T10:15:00Z",
    "updatedAt": "2026-06-03T10:15:00Z"
  }
}
```

### `POST /mortgage-cases/:caseId/documents/upload`
Sube un archivo real al expediente via multipart/form-data. El archivo se almacena en Google Cloud Storage y se crea un registro Document con todos los metadatos.
**Auth:** Bearer JWT (requerido) — `401 Unauthorized` si falta o es inválido.
**Content-Type:** multipart/form-data
**Fields:**
- `file` (binary, required) — archivo PDF, JPEG o PNG
- `documentTypeId` (number, required) — ID del tipo de documento del catálogo

**Validaciones:**
- MIME type whitelist: `application/pdf`, `image/jpeg`, `image/png`
- Tamaño máximo: `MAX_UPLOAD_SIZE_MB` (default 10 MB) — `413 Payload Too Large` si excede
- Archivo vacío (0 bytes) → `400 Bad Request`
- `documentTypeId` debe existir y estar activo → `400 Bad Request`
- `caseId` debe existir → `404 Not Found`
- GCS no disponible → `502 Bad Gateway`

**Response (201 Created):**
```json
{
  "data": {
    "id": "uuid-doc-1",
    "documentType": { "id": 1, "code": "PAYROLL_RECEIPT", "name": "Recibo de Nómina" },
    "documentStatus": { "id": 1, "code": "UPLOADED", "name": "Subido" },
    "originalName": "recibo_nomina_mayo.pdf",
    "fileUrl": "gs://hipotecario-documentos-dev/abc-123/PAYROLL_RECEIPT/recibo_nomina_mayo.pdf",
    "storagePath": "abc-123/PAYROLL_RECEIPT/recibo_nomina_mayo.pdf",
    "mimeType": "application/pdf",
    "sizeBytes": 245760,
    "uploadedBy": {
      "id": "uuid-user-1",
      "name": "María Asesora"
    },
    "createdAt": "2026-06-03T10:15:00Z",
    "updatedAt": "2026-06-03T10:15:00Z"
  }
}
```

**Error Responses:**

| Status | Condición | `message` |
|--------|-----------|-----------|
| 400 | No file attached | `"File is required"` |
| 400 | MIME no en whitelist | `"File type not allowed. Allowed: application/pdf, image/jpeg, image/png"` |
| 400 | File 0 bytes | `"File is empty"` |
| 400 | `documentTypeId` no es número | `"documentTypeId must be a number"` |
| 400 | Document type not found | `"Document type not found"` |
| 400 | Document type inactive | `"Document type is not active"` |
| 401 | JWT missing/invalid/expired | `"Unauthorized"` |
| 404 | Mortgage case not found | `"Mortgage case not found"` |
| 413 | File excede MAX_UPLOAD_SIZE_MB | `"File exceeds maximum size of XMB"` |
| 502 | GCS upload fails | `"File storage service unavailable"` |
