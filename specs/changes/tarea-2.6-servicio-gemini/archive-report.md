# Archive Report — tarea-2.6-servicio-gemini

## Executive Summary

Cambio **tarea-2.6-servicio-gemini** ("Servicio de extracción estructurada con Gemini") completado y verificado. Implementa un wrapper fino del SDK `@google/generative-ai` siguiendo el patrón `DocumentAiService`, exponiendo `extractStructuredData(ocrText, documentType, schema)` que envía texto OCR a Gemini y devuelve JSON estructurado. No persiste resultados — es un servicio base reusable por las tareas especializadas 2.7–2.10.

11 tasks en 3 fases, todos completados con Strict TDD. 27 tests unitarios. Suite completa 230/230 sin regresiones.

## SDD Cycle Summary

| Phase | Status | Artifacts |
|-------|--------|-----------|
| Exploration | ✅ | `exploration.md` |
| Proposal | ✅ | `proposal.md` |
| Spec | ✅ | `spec.md` (6 requirements, 24 scenarios) |
| Design | ✅ | `design.md` |
| Tasks | ✅ | `tasks.md` (11 tasks, 3 phases) |
| Apply | ✅ | `apply-progress.md` (11/11 complete) |
| Verify | ✅ | `verify-report.md` (0 critical, 1 warning) |
| Archive | ✅ | this file |

## Files Changed

| File | Action |
|------|--------|
| `apps/api/package.json` | Modified — added `@google/generative-ai@^0.24.1` |
| `apps/api/package-lock.json` | Modified — lockfile update |
| `apps/api/.env` | Modified — 4 `GEMINI_*` env vars |
| `apps/api/src/documents/gemini.service.ts` | Created — `GeminiService` + types |
| `apps/api/src/documents/gemini.service.spec.ts` | Created — 27 unit tests |
| `apps/api/src/documents/documents.module.ts` | Modified — register `GeminiService` |
| `specs/changes/tarea-2.6-servicio-gemini/` | Created — complete SDD artifact trail |

## Test Results

- **GeminiService**: 27/27 passing
- **API full suite**: 230/230 passing (22 suites, zero failures)
- **Regressions**: 0
- **Mode**: Strict TDD

## Key Decisions

- **Never throws**: `extractStructuredData` retorna `{ success: false, error }` en vez de lanzar — permite al caller inspeccionar errores sin try/catch
- **temperature: 0.1**: Extracción documental necesita determinismo
- **No export en DocumentsModule**: Por ahora solo uso interno; exportar cuando Tareas 2.7+ lo necesiten
- **Markdown fence stripping**: Defensivo — si Gemini ignora `responseMimeType`, el parser extrae JSON de bloques ```json

## Known Issues

1 WARNING cosmético: type cast en `responseSchema` (`Record<string, unknown>` vs SDK `Schema` type). Cero impacto en runtime.

## Next Steps

- Tarea 2.7–2.10: Servicios de extracción especializados que consuman `GeminiService`
- Tarea 2.12: Persistencia de resultados de extracción
