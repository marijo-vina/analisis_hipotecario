# Spec: Mortgage Cases (Backend)

## Purpose

Backend API specification for mortgage case management. Provides endpoints for creating, listing, detailing, and updating mortgage cases, including case status lifecycle management.

## Capabilities

| Capability | Type | Description |
|---|---|---|
| `backend-case-status-update` | New | PATCH /mortgage-cases/:id endpoint for status changes with double validation |

---

## 1. Requirements

### Functional

| ID | Priority | Requirement |
|----|----------|-------------|
| FR-0501 | P0 | Seed MUST define 8 case statuses ordered 1-8: `PENDING_DOCUMENTS`, `DOCUMENTS_UPLOADED`, `PROCESSING`, `DATA_EXTRACTED`, `IN_REVIEW`, `REPORT_GENERATED`, `OBSERVED`, `CLOSED` |
| FR-0502 | P0 | Seed MUST upsert 8 new statuses first, THEN remap existing cases from old→new status codes, THEN delete old status codes no longer in catalog |
| FR-0503 | P0 | `PATCH /mortgage-cases/:id` with valid `{ statusCode }` MUST update `statusId` and return 200 with full includes (`client`, `advisor`, `creditType`, `status`) |
| FR-0504 | P0 | `PATCH /mortgage-cases/:id` with `statusCode` not in `@IsIn` set MUST return 400 "Invalid status code" |
| FR-0505 | P0 | `PATCH /mortgage-cases/:id` with non-existent case id MUST return 404 "Mortgage case not found" |
| FR-0506 | P0 | `PATCH /mortgage-cases/:id` without valid JWT MUST return 401 |
| FR-0507 | P0 | `UpdateMortgageCaseStatusDto.statusCode` MUST validate via `@IsIn([...8 valid codes])` — rejected codes return 400 before reaching service |
| FR-0508 | P0 | Service MUST additionally verify `statusCode` exists in `CaseStatus` table; return 400 "Status code not found" if missing (defense-in-depth) |
| FR-0509 | P0 | PATCH 200 response MUST include `client`, `advisor`, `creditType`, `status` relations for immediate UI update |
| FR-0510 | P1 | `updatedAt` MUST auto-reflect status change timestamp (Prisma `@updatedAt`) |
| FR-0515 | P1 | `POST /mortgage-cases` MUST still default new cases to `PENDING_DOCUMENTS` — no regression |
| FR-0516 | P1 | `GET /case-statuses` MUST return all 8 updated statuses in `order` ascending |

### Non-Functional

| ID | Requirement |
|----|-------------|
| NFR-0501 | `PATCH /mortgage-cases/:id` MUST respond in < 500ms (p95) |
| NFR-0502 | Existing endpoints `POST /mortgage-cases`, `GET /mortgage-cases`, `GET /mortgage-cases/:id` MUST NOT change contract or behavior |
| NFR-0503 | All existing mortgage-cases test blocks MUST continue to pass |
| NFR-0504 | New unit tests MUST cover: valid status change (200), invalid statusCode via DTO (400), statusCode not in DB (400), missing case (404) |

---

## 2. Scenarios

### FR-0503 — Valid status change

- GIVEN case `mc-1` with status `PENDING_DOCUMENTS` AND valid JWT
- WHEN `PATCH /mortgage-cases/mc-1` body `{ "statusCode": "IN_REVIEW" }`
- THEN 200, `status.code === "IN_REVIEW"`, `updatedAt` changed, response includes `client`, `advisor`, `creditType`, `status`

### FR-0504 — DTO rejects unknown code

- GIVEN valid case AND valid JWT
- WHEN `PATCH /mortgage-cases/:id` body `{ "statusCode": "NONEXISTENT" }`
- THEN 400, `message` "Invalid status code"

### FR-0505 — Missing case

- GIVEN valid JWT
- WHEN `PATCH /mortgage-cases/nonexistent-uuid` body `{ "statusCode": "CLOSED" }`
- THEN 404, `message` "Mortgage case not found"

### FR-0506 — Unauthenticated

- GIVEN no `Authorization` header
- WHEN `PATCH /mortgage-cases/:id` with any body
- THEN 401

### FR-0508 — Service rejects valid-code-not-in-DB

- GIVEN a `statusCode` that passes DTO validation but was removed from DB
- WHEN service queries `CaseStatus` by code
- THEN 400, `message` "Status code not found"

### FR-0515 — Regression: create still defaults PENDING_DOCUMENTS

- GIVEN valid create payload → WHEN `POST /mortgage-cases` → THEN new case has `status.code === "PENDING_DOCUMENTS"`

---

## 3. API Contracts

### PATCH /mortgage-cases/:id

```
PATCH /mortgage-cases/:id
Authorization: Bearer <token>
Content-Type: application/json

Request:
{ "statusCode": "IN_REVIEW" }

Response 200:
{
  "id": "uuid",
  "clientId": "uuid",
  "advisorId": "uuid",
  "creditTypeId": 1,
  "statusId": 5,
  "personType": "SALARIED",
  "propertyLocation": "...",
  "requestedAmount": "...",
  "propertyValue": "...",
  "estimatedTermMonths": 12,
  "notes": "...",
  "createdAt": "...",
  "updatedAt": "<new-timestamp>",
  "client": { ... },
  "advisor": { ... },
  "creditType": { ... },
  "status": { "id": 5, "code": "IN_REVIEW", "name": "En revisión", "order": 5 }
}

Response 400 — DTO:
{ "message": "Invalid status code", "error": "Bad Request", "statusCode": 400 }

Response 400 — Service:
{ "message": "Status code not found", "error": "Bad Request", "statusCode": 400 }

Response 401:
{ "message": "Unauthorized", "statusCode": 401 }

Response 404:
{ "message": "Mortgage case not found", "error": "Not Found", "statusCode": 404 }
```

---

## 4. Data Changes

### Seed: 8 new statuses (replaces 5 old)

| Order | Code | Name |
|-------|------|------|
| 1 | PENDING_DOCUMENTS | Pendiente de documentos |
| 2 | DOCUMENTS_UPLOADED | Documentos cargados |
| 3 | PROCESSING | En procesamiento |
| 4 | DATA_EXTRACTED | Datos extraídos |
| 5 | IN_REVIEW | En revisión |
| 6 | REPORT_GENERATED | Reporte generado |
| 7 | OBSERVED | Observado |
| 8 | CLOSED | Cerrado |

### Migration: Old → New status mapping

| Old Code | → | New Code | Rationale |
|----------|---|----------|-----------|
| PENDING_DOCUMENTS | → | PENDING_DOCUMENTS | Same concept, retained |
| INTEGRATION | → | DOCUMENTS_UPLOADED | Closest equivalent (document/file integration phase) |
| ANALYSIS | → | IN_REVIEW | Closest equivalent |
| COMPLETED | → | CLOSED | Terminal state |
| REJECTED | → | OBSERVED | Non-terminal issue state |

**Migration strategy** (ordered for FK safety):
1. Seed upserts all 8 new codes (ensures target status IDs exist)
2. For each old→new pair, find `statusId` for old code and new code
3. `UPDATE "MortgageCase" SET "statusId" = <newId> WHERE "statusId" = <oldId>`
4. Seed deletes codes not in the new set (INTEGRATION, ANALYSIS, COMPLETED, REJECTED)
