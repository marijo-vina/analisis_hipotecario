## Exploration: Tarea 2.6 — Servicio de Extracción Estructurada con Gemini

### Current State

El proyecto ya cuenta con un pipeline de OCR funcional via Google Document AI (`DocumentAiService`). Los documentos pasan por estados (`UPLOADED` → `PROCESSING` → `PROCESSED`/`OCR_ERROR`/`ERROR`) y el texto OCR se almacena en `Document.ocrText`. Los esquemas JSON esperados para extracción estructurada ya están documentados en `specs/ai-extraction/schemas/`.

No existe ningún código relacionado con Gemini o Google Generative AI en el backend.

### Affected Areas

- `apps/api/src/documents/documents.module.ts` — debe registrar el nuevo provider.
- `apps/api/src/documents/` — ubicación natural para `gemini.service.ts` (siguiendo el patrón `document-ai.service.ts`).
- `apps/api/package.json` — falta `@google/generative-ai`.
- `apps/api/.env` — faltan variables de entorno para Gemini (`GEMINI_API_KEY`, posiblemente `GEMINI_MODEL`).
- `apps/api/src/documents/document-ai.service.spec.ts` — referencia de patrón para mockear SDK de Google con `jest.mock` a nivel de módulo.
- `apps/api/src/documents/documents.service.spec.ts` — referencia de patrón para inyectar mocks de servicios externos con `useValue`.
- `apps/api/prisma/schema.prisma` — NO tiene campos para resultados de extracción (`extractedData`, `extractionStatus`, `rawResponse`). Esto es intencional y se delega a Tarea 2.12.
- `apps/api/prisma/seed.ts` — ya incluye `EXTRACTION_READY` y `EXTRACTION_ERROR` en `DocumentStatus`, por lo que el catálogo de estados está preparado.

### Dependency Gaps

| Paquete / Recurso | Estado | Nota |
|---|---|---|
| `@google/generative-ai` | **Falta** | Debe agregarse a `dependencies` en `apps/api/package.json`. |
| `GEMINI_API_KEY` | **Falta** | Nueva variable de entorno requerida. Seguir convención existente (ConfigService). |
| `GEMINI_MODEL` (opcional) | **Falta** | Recomendado para poder cambiar modelo sin deploy. Ej: `gemini-2.5-pro`. |

### Data Model Status

- **`Document.ocrText`** — existe, almacena texto plano del OCR.
- **`Document.processedAt`** — existe, timestamp de procesamiento OCR exitoso.
- **`Document.processingError`** — existe, mensaje de error del OCR.
- **`DocumentStatus.EXTRACTION_READY / EXTRACTION_ERROR`** — existen en seed.ts; la base está lista para soportar estados de extracción.
- **Campos de extracción estructurada (`extractedData`, `extractionStatus`, `rawResponse`)** — **NO existen**. Esto es correcto según alcance: se difiere a Tarea 2.12.

**Veredicto sobre diferir persistencia:** Es viable. El servicio base de Tarea 2.6 devolverá JSON en memoria. Los consumidores (Tareas 2.7–2.10) recibirán el objeto estructurado y decidirán qué hacer con él. No hay bloqueo.

### Integration Points

1. **Nuevo `GeminiService`** (o `GenerativeAiService`) como thin SDK wrapper:
   - Inyectar `ConfigService`.
   - Leer `GEMINI_API_KEY` (y opcionalmente `GEMINI_MODEL`).
   - Inicializar `GoogleGenerativeAI` en el constructor.
   - Método público: `extractStructured(ocrText: string, documentType: string, schema: object): Promise<unknown>`.

2. **Registro en `DocumentsModule`**:
   - Agregar `GeminiService` al array `providers`.
   - Exportar si otros módulos lo necesitarán (aunque por ahora solo lo usará `DocumentsService` o un futuro `ExtractionService`).

3. **Error handling**:
   - Seguir patrón de `DocumentAiService`: dejar que errores del SDK propaguen.
   - El caller (`DocumentsService` o servicio de extracción posterior) hará el try/catch, logging con `Logger`, y traducción a `BadGatewayException` si es necesario.

4. **JSON Schema enforcement**:
   - Gemini 1.5 Pro/2.5 Pro soporta `responseMimeType: 'application/json'` y `responseSchema` (via `generationConfig`).
   - El servicio base debería aceptar un schema JSON genérico y pasarlo al modelo para forzar salida estructurada.

### Testing Patterns

- **Unit tests del servicio**: usar `jest.mock('@google/generative-ai', ...)` a nivel de módulo, igual que `document-ai.service.spec.ts`.
- **Unit tests del consumer**: inyectar `GeminiService` como mock con `useValue` en `Test.createTestingModule`, igual que `documents.service.spec.ts`.
- Los tests deben cubrir: éxito con JSON válido, error del SDK, error de parseo (aunque `responseMimeType: 'application/json'` debería eliminar parseo manual en la mayoría de los casos).

### Risks

1. **Rate limits / latencia de Gemini**: el procesamiento de documentos grandes puede tardar varios segundos. El endpoint `POST /process` ya es síncrono; agregar Gemini lo hará más lento. Considerar si en Tarea 2.7+ se necesita background job (fuera de alcance de 2.6).
2. **Tamaño del prompt**: `ocrText` puede ser muy largo (especialmente estados de cuenta). Gemini tiene context window grande, pero hay que verificar límites de tokens.
3. **Costo**: cada extracción consume tokens de entrada (OCR text) + salida (JSON estructurado). No hay medición actual.
4. **Degradación graceful**: si Gemini falla, el flujo del expediente NO debe romperse. El servicio base debe lanzar errores limpios para que el caller decida (ej: marcar `EXTRACTION_ERROR`).
5. **Schema drift**: los esquemas en `specs/ai-extraction/schemas/` pueden evolucionar. El servicio base debe ser genérico y NO hardcodear schemas.

### Approaches

#### 1. Thin SDK Wrapper (GeminiService)
Crear `GeminiService` que encapsule `@google/generative-ai`, acepte texto + tipo + schema, y devuelva JSON parseado.

- **Pros**: Sigue patrón exacto de `DocumentAiService` y `GcsService`. Fácil de testear. Genérico y reutilizable.
- **Cons**: Ninguno significativo.
- **Effort**: Low

#### 2. ExtractionService que orquesta OCR + Gemini
Crear un `ExtractionService` que internamente llame a `DocumentAiService` y luego a Gemini.

- **Pros**: Un solo punto de entrada para "procesar documento completo".
- **Cons**: Rompe la separación OCR vs extracción estructurada que ya se diseñó en Sprint 2. Acopla innecesariamente. Tarea 2.6 pide "servicio base genérico", no orquestador.
- **Effort**: Medium

### Recommendation

**Proceder con la Approach 1: `GeminiService` como thin SDK wrapper.**

Justificación:
- Es coherente con la arquitectura existente (`DocumentAiService`, `GcsService`).
- Cumple el alcance de Tarea 2.6: servicio genérico, reusable, que recibe OCR text + document type + schema y devuelve JSON estructurado.
- No requiere migración de base de datos ahora (persistencia → Tarea 2.12).
- No bloquea Tareas 2.7–2.10; les da la herramienta base para construir encima.

### Ready for Proposal

**Yes.**

Lo que debe contener la propuesta:
1. Agregar `@google/generative-ai` a `apps/api/package.json`.
2. Definir variables de entorno `GEMINI_API_KEY` y `GEMINI_MODEL` en `.env` y `.env.example` (si se crea).
3. Crear `apps/api/src/documents/gemini.service.ts` siguiendo el patrón thin wrapper.
4. Crear `apps/api/src/documents/gemini.service.spec.ts` con mocks del SDK.
5. Registrar `GeminiService` en `DocumentsModule`.
6. El servicio debe:
   - Aceptar `ocrText: string`, `documentTypeCode: string`, `schema: object`.
   - Usar `responseMimeType: 'application/json'` y pasar el schema en `generationConfig`.
   - Devolver `Promise<unknown>` (o un tipo genérico) con el JSON parseado.
   - Dejar que errores del SDK propaguen (el caller hace el manejo).
