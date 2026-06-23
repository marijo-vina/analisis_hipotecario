# Tasks: Servicio de Extracción Estructurada con Gemini (Tarea 2.6)

## Phase 1: Infrastructure

- [x] 1.1 Add `@google/generative-ai` to `apps/api/package.json` dependencies
- [x] 1.2 Add `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_TIMEOUT_MS`, `GEMINI_MAX_OUTPUT_TOKENS` to `apps/api/.env`

## Phase 2: Core Implementation (TDD — test first, then implement)

- [x] 2.1 Write constructor tests in `gemini.service.spec.ts`: valid key, missing key (throws `GEMINI_CONFIG_ERROR`), custom model from env
- [x] 2.2 Implement `GeminiService` constructor in `gemini.service.ts`: inject `ConfigService`, init `GoogleGenerativeAI`, build `ExtractionResult` interface and `GeminiErrorCode` enum
- [x] 2.3 Write tests for `buildPrompt()`: null handling, `YYYY-MM-DD` dates, decimal amounts, no data invention, schema as output contract
- [x] 2.4 Implement `buildPrompt(ocrText, documentType, schema)` private method with system instructions
- [x] 2.5 Write tests for JSON parsing: direct JSON, markdown-wrapped, non-JSON, empty response, malformed JSON
- [x] 2.6 Implement `parseJsonResponse(text)` with markdown fence stripping and safe `JSON.parse`
- [x] 2.7 Write tests for `extractStructuredData()`: success path, empty OCR, missing schema, SDK timeout, API 4xx/5xx
- [x] 2.8 Implement `extractStructuredData(ocrText, documentType, schema)` with input guards, SDK call via `generateContent`, error mapping to `ExtractionResult`

## Phase 3: Integration

- [x] 3.1 Register `GeminiService` in `DocumentsModule.providers` array

## Testing Notes

- All tests in `gemini.service.spec.ts` use `jest.mock('@google/generative-ai')` at module level (same pattern as `document-ai.service.spec.ts`)
- `ConfigService` mock with `{ get: jest.fn() }` per test case
- Run with: `npm test` in `apps/api`