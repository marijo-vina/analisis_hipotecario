# AI Extraction Specification

## Purpose

Base generic service (`GeminiService`) that sends OCR text to Google Gemini and returns validated structured JSON. Reusable by Tareas 2.7–2.10. Returns in-memory objects only — no persistence (deferred to Tarea 2.12).

## Requirements

### Requirement: Gemini Service Initialization

The system MUST initialize the Gemini client via `@google/generative-ai` SDK using `GEMINI_API_KEY` from `ConfigService`. Model defaults to `GEMINI_MODEL` env var or `gemini-2.5-pro`. Missing/empty key MUST throw `GEMINI_CONFIG_ERROR` at construction.

#### Scenario: Successful initialization

- GIVEN `GEMINI_API_KEY` is set and non-empty
- WHEN `GeminiService` is instantiated
- THEN client initializes without error

#### Scenario: Missing API key

- GIVEN `GEMINI_API_KEY` is undefined or empty
- WHEN `GeminiService` is instantiated
- THEN throws `GEMINI_CONFIG_ERROR`

#### Scenario: Custom model

- GIVEN `GEMINI_MODEL=gemini-2.0-flash`
- WHEN `GeminiService` is instantiated
- THEN client uses `gemini-2.0-flash`

### Requirement: Structured Data Extraction

The system MUST expose `extractStructuredData(ocrText, documentType, schema)` sending OCR text to Gemini with `responseMimeType: 'application/json'` and schema injected into `generationConfig.responseSchema`. Returns parsed JSON.

#### Scenario: Successful extraction

- GIVEN valid OCR text, documentType `"INE"`, valid schema
- WHEN `extractStructuredData` is called
- THEN returns parsed JSON matching schema shape

#### Scenario: Empty OCR text

- GIVEN `ocrText` is empty string
- WHEN `extractStructuredData` is called
- THEN throws `GEMINI_EMPTY_RESPONSE`

#### Scenario: Document type in metadata

- GIVEN valid OCR text, documentType `"RFC"`
- WHEN extraction succeeds
- THEN response includes `documentType: "RFC"` in metadata

#### Scenario: Schema injection

- GIVEN schema with required fields `["name","date"]`
- WHEN `extractStructuredData` is called
- THEN `generationConfig.responseSchema` contains the schema

### Requirement: JSON Response Validation

The system MUST validate Gemini's response is parseable JSON. If `responseMimeType` fails, defensively extract JSON from ```markdown code blocks.

#### Scenario: Direct JSON

- GIVEN response `{"name":"Juan","date":"2024-01-15"}`
- WHEN validated
- THEN returns parsed object

#### Scenario: Markdown-wrapped JSON

- GIVEN response ````json\n{"name":"Juan"}\n````
- WHEN validated
- THEN extracts and parses inner JSON

#### Scenario: Non-JSON text

- GIVEN response `"I cannot extract that"`
- WHEN validated
- THEN throws `GEMINI_INVALID_JSON`

#### Scenario: Empty response

- GIVEN response `""`
- WHEN validated
- THEN throws `GEMINI_EMPTY_RESPONSE`

#### Scenario: Malformed JSON

- GIVEN response `{"name":"Juan",` (incomplete)
- WHEN validated
- THEN throws `GEMINI_INVALID_JSON`

### Requirement: Controlled Error Handling

The system MUST catch all Gemini errors and translate to controlled codes with `code`, `message`, optional `details`. No unhandled exceptions may break the mortgage case flow.

#### Scenario: API timeout

- GIVEN API exceeds `GEMINI_TIMEOUT_MS`
- WHEN `extractStructuredData` is called
- THEN throws error with `code: "GEMINI_TIMEOUT"`

#### Scenario: API 4xx/5xx

- GIVEN API returns HTTP 503
- WHEN `extractStructuredData` is called
- THEN throws error with `code: "GEMINI_REQUEST_ERROR"`, status in details

#### Scenario: Missing schema param

- GIVEN `schema` is undefined
- WHEN `extractStructuredData` is called
- THEN throws error with `code: "GEMINI_SCHEMA_MISSING"`

### Requirement: Base Prompt Template

The system MUST use a base prompt instructing Gemini to: extract ONLY from OCR text, use `null` for missing data, normalize dates to `YYYY-MM-DD`, normalize amounts as decimals (no symbols), keep RFC/CURP uppercase, return ONLY JSON, include alerts for missing/low-confidence data. MUST explicitly forbid inventing data.

#### Scenario: Null handling

- GIVEN base prompt is generated
- THEN instructs Gemini to use `null` for unfound fields

#### Scenario: Date normalization

- GIVEN base prompt is generated
- THEN instructs `YYYY-MM-DD` format for all dates

#### Scenario: Amount normalization

- GIVEN base prompt is generated
- THEN instructs decimal numbers without `$` or `,`

#### Scenario: No data invention

- GIVEN base prompt is generated
- THEN explicitly forbids inventing or guessing data

#### Scenario: Schema in prompt

- GIVEN base prompt generated with schema
- THEN includes schema definition as output contract

### Requirement: Module Registration

`GeminiService` MUST be registered as provider in `DocumentsModule` and be injectable/mockable.

#### Scenario: Available via DI

- GIVEN `DocumentsModule` is loaded
- WHEN service requests `GeminiService` via DI
- THEN instance is provided

#### Scenario: Mockable in tests

- GIVEN test creates mock via `useValue`
- WHEN `Test.createTestingModule` is configured
- THEN `extractStructuredData` calls can be verified without API

## Cross-References

- **Tarea 2.6**: This spec
- **Tareas 2.7–2.10**: Specialized extraction consumers
- **Tarea 2.12**: Extraction persistence (out of scope)
- **`specs/ai-extraction/schemas/`**: JSON schemas passed as `schema` param
- **`DocumentAiService`**: Pattern reference (thin SDK wrapper)
