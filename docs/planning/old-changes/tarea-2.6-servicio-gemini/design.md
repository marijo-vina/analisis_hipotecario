# Design: Servicio de Extracción Estructurada con Gemini

## Technical Approach

Thin SDK wrapper replicating `DocumentAiService` pattern: inject `ConfigService`, initialize `GoogleGenerativeAI` in constructor, expose `extractStructuredData(ocrText, documentType, schema)`. No orchestration, no persistence — returns parsed JSON in memory. Callers (Tareas 2.7–2.10) decide error handling and storage.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/api/package.json` | Modify | Add `@google/generative-ai` to dependencies |
| `apps/api/.env` | Modify | Add `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_TIMEOUT_MS`, `GEMINI_MAX_OUTPUT_TOKENS` |
| `apps/api/src/documents/gemini.service.ts` | **New** | Thin SDK wrapper with prompt templating and JSON parsing |
| `apps/api/src/documents/gemini.service.spec.ts` | **New** | Unit tests with module-level SDK mock |
| `apps/api/src/documents/documents.module.ts` | Modify | Register `GeminiService` in providers |

## Component Design

### GeminiService

```ts
@Injectable()
export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

    this.genAI = new GoogleGenerativeAI(apiKey);
    const modelName = this.configService.get<string>('GEMINI_MODEL') || 'gemini-2.5-pro';
    this.model = this.genAI.getGenerativeModel({ model: modelName });
  }

  async extractStructuredData(
    ocrText: string,
    documentType: string,
    schema: Record<string, unknown>,
  ): Promise<ExtractionResult>;
}
```

### ExtractionResult Interface

```ts
interface ExtractionResult {
  success: boolean;
  documentType: string;
  extractedData: Record<string, unknown> | null;
  rawResponse?: string;
  error?: { code: string; message: string; details?: unknown };
}
```

### Error Codes

```ts
enum GeminiErrorCode {
  GEMINI_CONFIG_ERROR = 'GEMINI_CONFIG_ERROR',
  GEMINI_REQUEST_ERROR = 'GEMINI_REQUEST_ERROR',
  GEMINI_EMPTY_RESPONSE = 'GEMINI_EMPTY_RESPONSE',
  GEMINI_INVALID_JSON = 'GEMINI_INVALID_JSON',
  GEMINI_TIMEOUT = 'GEMINI_TIMEOUT',
  GEMINI_SCHEMA_MISSING = 'GEMINI_SCHEMA_MISSING',
  OCR_TEXT_EMPTY = 'OCR_TEXT_EMPTY',
}
```

### Prompt Template

The service builds the prompt injecting `ocrText`, `documentType`, and `schema`. The system instruction declares:
- Role: extractor documental para análisis hipotecario
- Extract only from provided OCR text
- `null` for missing fields
- YYYY-MM-DD for dates, decimal numbers without $/commas
- Uppercase for RFC/CURP/names
- JSON only, no explanations
- Use provided schema as output contract
- Include alerts array for missing/low-confidence fields

### SDK Configuration

```ts
const generationConfig: GenerationConfig = {
  responseMimeType: 'application/json',
  temperature: 0.1,
  maxOutputTokens: parseInt(
    configService.get<string>('GEMINI_MAX_OUTPUT_TOKENS') || '8192',
  ),
};
```

### JSON Parsing Strategy

1. `responseMimeType: 'application/json'` guarantees JSON output from Gemini
2. As defense-in-depth, strip markdown fences (` ```json ` / ` ``` `) before `JSON.parse`
3. Wrap in try/catch → return `{ success: false, error: GEMINI_INVALID_JSON }`

## Integration

`DocumentsModule` — add to `providers` array (no export needed yet):

```ts
providers: [
  DocumentsService, DocumentAiService, StoragePathService,
  GcsService, GeminiService,
],
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | Yes | — | Google Generative AI API key |
| `GEMINI_MODEL` | No | `gemini-2.5-pro` | Model identifier |
| `GEMINI_TIMEOUT_MS` | No | `30000` | Request timeout in milliseconds |
| `GEMINI_MAX_OUTPUT_TOKENS` | No | `8192` | Max output tokens |

## Data Flow

```
Caller (eventual ExtractionService)
  │ ocrText + documentType + schema
  ▼
GeminiService.extractStructuredData()
  │ guard: OCR_TEXT_EMPTY | GEMINI_SCHEMA_MISSING
  │ build prompt from template
  │ model.generateContent(prompt, generationConfig)
  │
  ├─ success → parse JSON → { success: true, extractedData, rawResponse }
  └─ failure → { success: false, error: { code, message } }
```

## Error Handling Strategy

- Input guards: validate `ocrText` not empty (`OCR_TEXT_EMPTY`), schema present (`GEMINI_SCHEMA_MISSING`)
- SDK errors: catch `GenerateContentError` → map to `GEMINI_REQUEST_ERROR` / `GEMINI_TIMEOUT`
- `success: false` on all errors — NEVER throws. Caller inspects `result.error` to decide action (e.g., mark `EXTRACTION_ERROR`)
- `Logger` from `@nestjs/common` for all error paths

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | GeminiService | `jest.mock('@google/generative-ai')` at module level; `ConfigService` mock with `{ get: jest.fn() }` |
| Cases | Success, empty OCR, missing API key, SDK error, timeout, invalid JSON, JSON in markdown, missing schema | One `it()` per case |

Test pattern (replicating `document-ai.service.spec.ts`):

```ts
const mockGenerateContent = jest.fn();
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: mockGenerateContent,
    }),
  })),
}));
```

## Open Questions

- None. All dependencies resolved in exploration phase.
