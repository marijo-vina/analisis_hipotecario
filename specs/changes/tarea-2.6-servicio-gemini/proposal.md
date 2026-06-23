# Proposal: Servicio de Extracción Estructurada con Gemini

## Intent

Crear un servicio base genérico (`GeminiService`) que envíe texto OCR a Gemini y devuelva JSON estructurado, reutilizable por las tareas de extracción especializada (2.7–2.10).

## Scope

### In Scope
- Agregar `@google/generative-ai` a `apps/api/package.json`
- Variables de entorno: `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_TIMEOUT_MS`, `GEMINI_MAX_OUTPUT_TOKENS`
- Crear `GeminiService` como thin SDK wrapper en `apps/api/src/documents/gemini.service.ts`
- Prompt base genérico + `responseMimeType: 'application/json'` con schema injection
- Validación de respuesta JSON y manejo de respuestas mal formateadas
- Manejo de errores controlados (sin romper el expediente)
- Tests unitarios con mocks del SDK
- Documentar variables en `.env.example`
- Registrar en `DocumentsModule`

### Out of Scope
- Extracción especializada por tipo de documento (2.7–2.10)
- Cálculo financiero o capacidad de pago
- Persistencia de resultados (2.12)
- Endpoints especializados o migraciones de BD
- Integración con KYC, Lista Nominal, scraping
- Decisiones automáticas de crédito

## Capabilities

### New Capabilities
- `ai-extraction`: Servicio base genérico de extracción estructurada con Gemini. Recibe OCR text + documentType + schema y devuelve JSON validado.

### Modified Capabilities
- None

## Approach

Replicar el patrón `DocumentAiService`: thin wrapper que encapsula `@google/generative-ai`, inyecta `ConfigService`, inicializa el cliente en el constructor y expone un método `extractStructured(ocrText, documentType, schema)`. El servicio fuerza salida JSON vía `generationConfig.responseMimeType` y `responseSchema`, valida el parseo y deja que errores del SDK propaguen para que el caller decida (ej: marcar `EXTRACTION_ERROR`).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/package.json` | Modified | Agrega `@google/generative-ai` |
| `apps/api/src/documents/gemini.service.ts` | New | Thin wrapper del SDK de Gemini |
| `apps/api/src/documents/gemini.service.spec.ts` | New | Tests unitarios con mocks |
| `apps/api/src/documents/documents.module.ts` | Modified | Registra `GeminiService` |
| `apps/api/.env.example` | Modified | Documenta variables de entorno |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Rate limits / latencia | Medium | Timeout configurable; caller maneja fallo graceful |
| Prompt muy largo (OCR extenso) | Medium | Validar tamaño en caller; considerar chunking en futuro |
| Costo de tokens | Low | Monitorear uso; schema injection reduce tokens de salida |
| Schema drift | Low | Servicio genérico recibe schema como parámetro, no hardcodea |

## Rollback Plan

Revertir el commit de Tarea 2.6, eliminar `gemini.service.ts` y su spec, quitar `@google/generative-ai` de `package.json` y restaurar `DocumentsModule`.

## Dependencies

- Ninguna. La exploración está completa.

## Success Criteria

- [ ] `GeminiService` envía texto OCR a Gemini y recibe respuesta
- [ ] Acepta `documentType` y schema de referencia como parámetros
- [ ] Gemini devuelve JSON interpretable por el sistema
- [ ] Valida JSON antes de considerar éxito
- [ ] Errores de Gemini manejados de forma controlada
- [ ] No se rompe el expediente si Gemini falla
- [ ] Tests unitarios con mocks (sin llamadas reales)
- [ ] Variables de entorno documentadas
- [ ] Build limpio, tests existentes pasando
