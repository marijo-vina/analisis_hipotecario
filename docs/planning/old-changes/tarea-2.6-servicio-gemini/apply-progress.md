# Apply Progress: Servicio de Extracción Estructurada con Gemini (Tarea 2.6)

**Status**: success — all 11 tasks implemented in single batch via Strict TDD.
**Mode**: Strict TDD (NestJS / Jest 30 — `npm test` from `apps/api`)
**Final test result**: 230/230 passing across 22 suites (GeminiService suite: 27/27).
**Baseline (safety net)**: DocumentAiService 6/6 preserved.

## Completed Tasks

- [x] 1.1 Add `@google/generative-ai` (v0.24.1) to `apps/api/package.json` dependencies
- [x] 1.2 Add env vars `GEMINI_API_KEY`, `GEMINI_MODEL=gemini-2.5-pro`, `GEMINI_TIMEOUT_MS=30000`, `GEMINI_MAX_OUTPUT_TOKENS=8192` to `apps/api/.env`
- [x] 2.1 Constructor tests (RED: 4 tests failed; GREEN: 4 passed)
- [x] 2.2 Constructor implementation + `ExtractionResult` interface + `GeminiErrorCode` enum
- [x] 2.3 buildPrompt tests (6 scenarios from spec — null / YYYY-MM-DD / decimal-no-symbols / no invent / schema contract / injection)
- [x] 2.4 buildPrompt implementation with `SYSTEM_INSTRUCTION` constant
- [x] 2.5 parseJsonResponse tests (direct JSON, ```json fence, plain ``` fence, non-JSON, empty, malformed)
- [x] 2.6 parseJsonResponse implementation with markdown-fence stripping
- [x] 2.7 extractStructuredData tests (11 cases — success, OCR_TEXT_EMPTY, GEMINI_SCHEMA_MISSING, RFC metadata, schema injection, responseMimeType/temperature, contents/prompt, GEMINI_TIMEOUT, GEMINI_REQUEST_ERROR 503 with status details, GEMINI_INVALID_JSON, GEMINI_EMPTY_RESPONSE)
- [x] 2.8 extractStructuredData implementation with input guards, `callWithTimeout` race, parser error mapping, `mapExtractorError`
- [x] 3.1 Registered `GeminiService` in `DocumentsModule.providers`

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `apps/api/package.json` | Modified | Added `@google/generative-ai@^0.24.1` dependency (installed) |
| `apps/api/.env` | Modified | Added 4 `GEMINI_*` env vars with documented defaults |
| `apps/api/src/documents/gemini.service.ts` | Created | GeminiService — thin SDK wrapper, prompt template, JSON parsing, controlled error mapping |
| `apps/api/src/documents/gemini.service.spec.ts` | Created | 27 unit tests following the module-level SDK mock pattern |
| `apps/api/src/documents/documents.module.ts` | Modified | Registered `GeminiService` in `providers` (no export yet) |

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | n/a | Config | N/A (infra) | ➖ structural | ✅ Installed | ➖ skipped: structural config | ➖ |
| 1.2 | n/a | Config | N/A (infra) | ➖ structural | ✅ Env file | ➖ skipped: structural config | ➖ |
| 2.1 | `gemini.service.spec.ts` | Unit | N/A (new) | ✅ Written (4 fail) | ✅ 4 pass | ✅ 4 cases (3 scenarios) | ✅ Clean |
| 2.2 | (same) | Unit | N/A (new) | (covered by 2.1 RED) | ✅ Constructor | (same as 2.1) | ✅ Types extracted |
| 2.3 | `gemini.service.spec.ts` | Unit | N/A (new) | ✅ Written (6 fail) | ✅ 6 pass | ✅ 6 spec scenarios | ✅ SYSTEM_INSTRUCTION extracted |
| 2.4 | (same) | Unit | N/A (new) | (covered by 2.3 RED) | ✅ buildPrompt | (same as 2.3) | ✅ Pure string builder |
| 2.5 | `gemini.service.spec.ts` | Unit | N/A (new) | ✅ Written (6 fail) | ✅ 6 pass | ✅ 6 scenarios + free-fence edge | ✅ Pure parser |
| 2.6 | (same) | Unit | N/A (new) | (covered by 2.5 RED) | ✅ parseJsonResponse | (same as 2.5) | ✅ regex extracted |
| 2.7 | `gemini.service.spec.ts` | Unit | N/A (new) | ✅ Written (11 fail) | ✅ 11 pass | ✅ 11 scenarios across happy path + 9 error paths | ✅ Helpers extracted |
| 2.8 | (same) | Unit | N/A (new) | (covered by 2.7 RED) | ✅ 11 pass | (same as 2.7) | ✅ callWithTimeout / mapExtractorError extracted |
| 3.1 | (suite) | Module | ✅ 230/230 | ➖ structural registration | ✅ 230/230 (no regression) | ➖ skipped: structural registration | ➖ |

### Test Summary
- **Total tests written (new)**: 27
- **Total tests passing**: 27 / 27 (GeminiService) — 230 / 230 (api full suite)
- **Layers used**: Unit (27)
- **Approval tests (refactoring)**: None — no refactoring tasks
- **Pure functions created**: 2 (`buildPrompt`, `parseJsonResponse`, `mapExtractorError`)

## Deviations from Design

1. **`extractStructuredData` never throws** — the spec scenarios loosely say "throws `GEMINI_EMPTY_RESPONSE` / `GEMINI_TIMEOUT` / `GEMINI_REQUEST_ERROR`", but the design (Error Handling Strategy) and the orchestrator instructions both explicitly require `success: false` results with `error.code` instead of throwing. I implemented the design's contract: input/SDK/parse errors all return `ExtractionResult` with `success: false`. The parser helper (`parseJsonResponse`) still throws the controlled codes internally — the public method catches and maps them to the structured result.
2. **Empty OCR input → `OCR_TEXT_EMPTY`** (not `GEMINI_EMPTY_RESPONSE`). The spec scenario labeled it `GEMINI_EMPTY_RESPONSE`, but the design's data flow and error strategy distinguish "empty OCR input" (input guard → `OCR_TEXT_EMPTY`) from "empty Gemini response text" (parse guard → `GEMINI_EMPTY_RESPONSE`). Both error codes are defined in the enum and used in the correct places. This is the most consistent reading of the two artifacts.
3. **SDK request shape** — the design did not pin the exact `generateContent` call shape. I used the documented `generateContent({ contents, generationConfig })` form (per Google Generative AI SDK docs) so the schema lives in `generationConfig.responseSchema` as the spec scenario requires, and the prompt lives in `contents[0].parts[0].text`.

## Issues Found

None. The only behaviors not present in the SDK mock at compile time are correctly handled — `jest.mock(@google/generative-ai)` at module level keeps tests offline. Logger error output appears in the test console for the negative-path tests (expected; tests assert the structured `result.error.code`, not the log).

## Remaining Tasks

None — all 11 tasks complete. Change is ready for verify.

## Relevant Files

- `apps/api/src/documents/gemini.service.ts` — `GeminiService`, `ExtractionResult`, `GeminiErrorCode`
- `apps/api/src/documents/gemini.service.spec.ts` — 27 unit tests
- `apps/api/src/documents/documents.module.ts` — registration
- `apps/api/.env` — `GEMINI_*` configuration
- `apps/api/package.json` — dependency addition