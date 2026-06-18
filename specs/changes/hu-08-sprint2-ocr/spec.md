# Delta Spec: HU-08 Sprint 2 — Procesar documentos con OCR

## NEW: document-ocr

Communicate with Google Document AI to extract raw text from documents stored in GCS. Wraps `@google-cloud/documentai` DocumentProcessorServiceClient using `gcsDocument` input (documents already in GCS — no raw bytes upload).

### Requirements

| ID | Requirement | Strength |
|----|-----------|----------|
| REQ-OCR-001 | Send document to Document AI via `processDocument` with `gcsDocument` input, using `fileUrl` (GCS URI) and `mimeType` from Document record. Return extracted raw text from `result.document.text`. | MUST |

### Scenarios

**Happy path:**
- GIVEN document with `fileUrl="gs://bucket/path/recibo.pdf"` AND `mimeType="application/pdf"` → WHEN `extractText(fileUrl, mimeType)` called → Document AI returns `result.document.text="Contenido extraído"` → THEN returns extracted text string

**Edge cases:**
- GIVEN valid inputs → WHEN Document AI returns empty `document.text` → THEN returns empty string (valid result — empty scan, no error)
- GIVEN Document AI throws gRPC/network error → THEN wraps and propagates error with cause for caller to handle
- GIVEN misconfigured processor (bad project/location/processor ID) → WHEN Document AI returns 404/401 → THEN surfaces as controlled error with context

## NEW: document-processing

Orchestrate document status transitions and the OCR pipeline. Coordinates between controller, `DocumentsService.processDocument()`, and `DocumentAiService.extractText()`.

### Requirements

| ID | Requirement | Strength |
|----|-----------|----------|
| REQ-OCR-002 | Transition document through statuses: UPLOADED → PROCESSING → PROCESSED (success) or ERROR (failure). Set `processedAt` timestamp on success. Set `processingError` message on failure. Never leave document in orphaned PROCESSING state — catch all errors after status update. | MUST |
| REQ-OCR-003 | Reprocessing gate: only UPLOADED and ERROR statuses accepted for processing. PROCESSING and PROCESSED MUST return 400 Bad Request. Prevents duplicate processing and concurrent race conditions. | MUST |
| REQ-OCR-004 | Validate `fileUrl` and `mimeType` are present and non-null before calling Document AI. Missing either MUST return 400 before any external API call. | MUST |
| REQ-OCR-005 | Catch Document AI failures, map to 502 Bad Gateway. Persist `processingError` message on the document record. Log full error server-side without exposing stack traces to client. Document MUST be left in ERROR status on failure (no orphaned PROCESSING). | MUST |
| REQ-OCR-006 | POST `/mortgage-cases/:caseId/documents/:documentId/process` — returns 200 with updated document (including `ocrText`) on success. No request body required. Auth via Bearer JWT. | MUST |

### API Contract

| Property | Value |
|----------|-------|
| Method | POST |
| Path | `/mortgage-cases/:caseId/documents/:documentId/process` |
| Auth | Bearer JWT |
| Content-Type | application/json |
| Body | None (empty) |
| Success | 200 `{ data: Document }` |
| Errors | 400, 404, 502 |

### Error Matrix

| Status | Condition | `message` |
|--------|-----------|-----------|
| 400 | Status is PROCESSING | `"Document is already being processed"` |
| 400 | Status is PROCESSED | `"Document has already been processed"` |
| 400 | `fileUrl` is null | `"Document has no file to process"` |
| 400 | `mimeType` is null | `"Document has no MIME type"` |
| 404 | Document not found or wrong caseId | `"Document not found"` |
| 502 | Document AI failure (network, auth, not found) | `"Document processing service unavailable"` |

### Scenarios

**Happy paths:**
- GIVEN document in UPLOADED status with valid `fileUrl` and `mimeType` → WHEN POST process → THEN status → PROCESSING, Document AI called, `ocrText` saved, `processedAt` set to now, status → PROCESSED, returns 200 with updated document
- GIVEN document in ERROR status (previous failure with `processingError` set) → WHEN POST process → THEN reprocessing allowed — same flow as UPLOADED → PROCESSED on success
- GIVEN successful processing → THEN response includes `ocrText`, `documentType`, and `documentStatus` relations

**Error paths:**
- GIVEN document in PROCESSING status → WHEN POST process → THEN 400 `"Document is already being processed"`
- GIVEN document in PROCESSED status → WHEN POST process → THEN 400 `"Document has already been processed"`
- GIVEN document with `fileUrl=null` → WHEN POST process → THEN 400 `"Document has no file to process"` (no external call made)
- GIVEN document with `mimeType=null` → WHEN POST process → THEN 400 `"Document has no MIME type"` (no external call made)
- GIVEN document not found or `caseId` mismatch → THEN 404 `"Document not found"`
- GIVEN Document AI throws network/gRPC error mid-processing → THEN `processingError` persisted, status → ERROR, server logs full error, returns 502
- GIVEN unexpected runtime error after PROCESSING status set → THEN catch, set status → ERROR, persist `processingError`, return 502 (no orphaned PROCESSING state)

## Quality Gates

| ID | Requirement | Strength |
|----|-----------|----------|
| REQ-OCR-007 | `DocumentAiService` fully tested with mocked `@google-cloud/documentai` client. `DocumentsService.processDocument()` tested for success and failure paths. Controller tested for all response codes (200, 400, 404, 502). No real GCP calls during tests. `npm test` passes. | MUST |
| REQ-OCR-008 | `npm run build` passes with zero TypeScript errors. Existing document CRUD endpoints and all pre-existing tests continue working unchanged. | MUST |

### Scenarios

- GIVEN mocked Document AI client returning text → WHEN `extractText()` called → THEN returns text, mock assertions verify correct gcsDocument input
- GIVEN mocked Document AI client throwing error → WHEN `extractText()` called → THEN error propagates correctly
- GIVEN mocked `DocumentAiService` → WHEN `processDocument()` succeeds → THEN status PROCESSED, `ocrText` and `processedAt` set
- GIVEN mocked `DocumentAiService` throwing → WHEN `processDocument()` fails → THEN status ERROR, `processingError` set
- GIVEN mocked `DocumentsService` → WHEN controller receives request → THEN 200, 400, 404, 502 responses all tested
- GIVEN full test suite → WHEN `npm test` → THEN all new and existing tests pass, zero real GCP calls

## Non-Requirements

Structured data extraction with Gemini, payroll/bank statement/credit bureau interpretation, cross-document validation, financial calculations (liability, payment capacity, bank comparison), batch/queue/background processing, reports, automatic credit approval, and end-user-facing OCR text display are explicitly OUT OF SCOPE for this change. OCR text display is covered by HU-09; structured extraction by HU-10–HU-13.
