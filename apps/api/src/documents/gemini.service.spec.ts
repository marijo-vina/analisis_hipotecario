// ---------------------------------------------------------------------------
// Mock @google-cloud/vertexai — must be module-level for jest.mock hoisting
// ---------------------------------------------------------------------------

const mockGenerateContent = jest.fn();
const mockGetGenerativeModel = jest.fn().mockReturnValue({
  generateContent: mockGenerateContent,
});

jest.mock('@google-cloud/vertexai', () => ({
  VertexAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
  HarmCategory: {
    HARM_CATEGORY_DANGEROUS_CONTENT: 'HARM_CATEGORY_DANGEROUS_CONTENT',
    HARM_CATEGORY_HARASSMENT: 'HARM_CATEGORY_HARASSMENT',
    HARM_CATEGORY_HATE_SPEECH: 'HARM_CATEGORY_HATE_SPEECH',
    HARM_CATEGORY_SEXUALLY_EXPLICIT: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
  },
  HarmBlockThreshold: {
    BLOCK_MEDIUM_AND_ABOVE: 'BLOCK_MEDIUM_AND_ABOVE',
  },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { VertexAI } from '@google-cloud/vertexai';
import { GeminiService } from './gemini.service';

describe('GeminiService', () => {
  let service: GeminiService;

  const mockConfigService = {
    get: jest.fn(),
  };

  const PROJECT_ID = 'test-project-id-12345';

  const configureEnv = (overrides: Record<string, string | undefined> = {}) => {
    const defaults: Record<string, string | undefined> = {
      GEMINI_PROJECT_ID: PROJECT_ID,
      GEMINI_LOCATION: undefined,
      GEMINI_MODEL: undefined,
      GEMINI_TIMEOUT_MS: undefined,
      GEMINI_MAX_OUTPUT_TOKENS: undefined,
    };
    const merged = { ...defaults, ...overrides };
    mockConfigService.get.mockImplementation((key: string) => merged[key]);
  };

  const buildModule = async (): Promise<TestingModule> =>
    Test.createTestingModule({
      providers: [GeminiService, { provide: ConfigService, useValue: mockConfigService }],
    }).compile();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('initializes the VertexAI SDK client with default location when GEMINI_LOCATION is not set', async () => {
      configureEnv();
      const module = await buildModule();
      service = module.get<GeminiService>(GeminiService);

      expect(service).toBeDefined();
      expect(VertexAI).toHaveBeenCalledWith({
        project: PROJECT_ID,
        location: 'us-central1',
      });
      // getGenerativeModel is NOT called in constructor — it's called lazily
      // via getModel() during extractStructuredData.
      expect(mockGetGenerativeModel).not.toHaveBeenCalled();
    });

    it('throws GEMINI_CONFIG_ERROR when GEMINI_PROJECT_ID is undefined', () => {
      configureEnv({ GEMINI_PROJECT_ID: undefined });

      expect(() => new GeminiService(mockConfigService as any)).toThrow(
        'GEMINI_CONFIG_ERROR',
      );
    });

    it('throws GEMINI_CONFIG_ERROR when GEMINI_PROJECT_ID is empty string', () => {
      configureEnv({ GEMINI_PROJECT_ID: '' });

      expect(() => new GeminiService(mockConfigService as any)).toThrow(
        'GEMINI_CONFIG_ERROR',
      );
    });

    it('stores the model name from GEMINI_MODEL env var (verified via getModel call)', async () => {
      configureEnv({ GEMINI_MODEL: 'gemini-2.0-flash' });
      const module = await buildModule();
      service = module.get<GeminiService>(GeminiService);

      // Trigger getModel() by calling extractStructuredData
      mockGenerateContent.mockResolvedValue({
        response: {
          candidates: [{ content: { parts: [{ text: '{"x":"y"}' }] } }],
        },
      });
      await service.extractStructuredData('t', 'INE', {});

      expect(mockGetGenerativeModel).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-2.0-flash',
        }),
      );
    });

    it('uses the location from GEMINI_LOCATION env var when provided', async () => {
      configureEnv({ GEMINI_LOCATION: 'europe-west4' });
      const module = await buildModule();
      module.get<GeminiService>(GeminiService);

      expect(VertexAI).toHaveBeenCalledWith({
        project: PROJECT_ID,
        location: 'europe-west4',
      });
    });
  });

  describe('buildPrompt (private)', () => {
    beforeEach(async () => {
      configureEnv();
      const module = await buildModule();
      service = module.get<GeminiService>(GeminiService);
    });

    const invokeBuild = (
      ocrText: string,
      documentType: string,
      schema: Record<string, unknown>,
    ): string => (service as any).buildPrompt(ocrText, documentType, schema);

    it('includes the provided schema definition as JSON in the prompt', () => {
      const schema = { required: ['name', 'date'] };
      const prompt = invokeBuild('t', 'INE', schema);
      expect(prompt).toContain(JSON.stringify(schema));
    });

    it('injects the OCR text and documentType into the prompt', () => {
      const prompt = invokeBuild('CLAUSULA: 12345', 'RFC', {});
      expect(prompt).toContain('CLAUSULA: 12345');
      expect(prompt).toContain('RFC');
    });

    it('includes extraInstructions when provided as fourth argument', () => {
      const prompt = (service as any).buildPrompt(
        'texto',
        'INE',
        {},
        'Instruccion extra',
      );
      expect(prompt).toContain('Instruccion extra');
    });

    it('labels the schema section as output contract (JSON)', () => {
      const prompt = invokeBuild('t', 'INE', { name: { type: 'string' } });
      expect(prompt).toContain('Esquema de salida');
      expect(prompt).toContain('contrato JSON');
    });
  });

  describe('model configuration', () => {
    beforeEach(async () => {
      configureEnv();
      const module = await buildModule();
      service = module.get<GeminiService>(GeminiService);
    });

    it('configures systemInstruction with Spanish extraction rules', async () => {
      // Trigger getModel by calling extractStructuredData
      mockGenerateContent.mockResolvedValue({
        response: {
          candidates: [
            { content: { parts: [{ text: '{"name":"x"}' }] } },
          ],
        },
      });

      await service.extractStructuredData('texto', 'INE', {});

      const callArgs = mockGetGenerativeModel.mock.calls[0][0];
      const sysInstr = callArgs.systemInstruction;
      expect(sysInstr).toBeDefined();
      expect(sysInstr.role).toBe('system');
      const sysText = sysInstr.parts[0].text;
      expect(sysText).toMatch(/null/);
      expect(sysText).toContain('YYYY-MM-DD');
      expect(sysText).toMatch(/sin\s*\$|sin.*signo.*pesos/i);
      expect(sysText).toMatch(/no\s.*inventes|no\s.*adivines/i);
      expect(sysText).toContain('MAYUSCULAS');
    });

    it('configures safety settings with BLOCK_MEDIUM_AND_ABOVE', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          candidates: [
            { content: { parts: [{ text: '{"name":"x"}' }] } },
          ],
        },
      });

      await service.extractStructuredData('texto', 'INE', {});

      const callArgs = mockGetGenerativeModel.mock.calls[0][0];
      expect(callArgs.safetySettings).toBeDefined();
      expect(callArgs.safetySettings[0].threshold).toBe('BLOCK_MEDIUM_AND_ABOVE');
    });
  });

  describe('parseJsonResponse (private)', () => {
    beforeEach(async () => {
      configureEnv();
      const module = await buildModule();
      service = module.get<GeminiService>(GeminiService);
    });

    const invokeParse = (text: string): Record<string, unknown> =>
      (service as any).parseJsonResponse(text);

    it('returns parsed object when response is direct JSON', () => {
      const result = invokeParse('{"name":"Juan","date":"2024-01-15"}');
      expect(result).toEqual({ name: 'Juan', date: '2024-01-15' });
    });

    it('extracts and parses JSON wrapped in markdown fences', () => {
      const result = invokeParse('```json\n{"name":"Juan"}\n```');
      expect(result).toEqual({ name: 'Juan' });
    });

    it('extracts and parses JSON wrapped in plain markdown fences (no language)', () => {
      const result = invokeParse('```\n{"name":"Maria"}\n```');
      expect(result).toEqual({ name: 'Maria' });
    });

    it('throws GEMINI_INVALID_JSON when response is non-JSON text', () => {
      expect(() => invokeParse('I cannot extract that')).toThrow(
        'GEMINI_INVALID_JSON',
      );
    });

    it('throws GEMINI_EMPTY_RESPONSE when response is empty string', () => {
      expect(() => invokeParse('')).toThrow('GEMINI_EMPTY_RESPONSE');
    });

    it('throws GEMINI_INVALID_JSON when response is truly unparseable', () => {
      // salvageTruncatedJson can recover simple truncations (trailing comma + missing brace),
      // so use text that is genuinely unparseable after salvage.
      expect(() => invokeParse('esto no es JSON ni remotamente')).toThrow(
        'GEMINI_INVALID_JSON',
      );
    });
  });

  describe('extractStructuredData', () => {
    const ocrText = 'NOMBRE: Juan Perez\nFECHA: 2024-01-15';
    const schema = { type: 'object', required: ['name', 'date'] };

    /** Helper: build a valid VertexAI mock response */
    const vertexResponse = (text: string) => ({
      response: {
        candidates: [
          { content: { parts: [{ text }] } },
        ],
      },
    });

    beforeEach(async () => {
      configureEnv();
      const module = await buildModule();
      service = module.get<GeminiService>(GeminiService);
    });

    it('returns success with parsed JSON when extraction succeeds', async () => {
      const mockJson = '{"name":"Juan","date":"2024-01-15"}';
      mockGenerateContent.mockResolvedValue(vertexResponse(mockJson));

      const result = await service.extractStructuredData(ocrText, 'INE', schema);

      expect(result.success).toBe(true);
      expect(result.documentType).toBe('INE');
      expect(result.extractedData).toEqual({ name: 'Juan', date: '2024-01-15' });
      expect(result.rawResponse).toBe(mockJson);
    });

    it('returns OCR_TEXT_EMPTY when ocrText is empty (input guard)', async () => {
      const result = await service.extractStructuredData('', 'INE', schema);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('OCR_TEXT_EMPTY');
      expect(result.extractedData).toBeNull();
      expect(result.documentType).toBe('INE');
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('returns GEMINI_SCHEMA_MISSING when schema is undefined (input guard)', async () => {
      const result = await service.extractStructuredData(
        ocrText,
        'INE',
        undefined as any,
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('GEMINI_SCHEMA_MISSING');
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('reflects the documentType in the result metadata (RFC scenario)', async () => {
      const mockJson = '{"rfc":"XAXX010101000"}';
      mockGenerateContent.mockResolvedValue(vertexResponse(mockJson));

      const result = await service.extractStructuredData(ocrText, 'RFC', schema);

      expect(result.success).toBe(true);
      expect(result.documentType).toBe('RFC');
      expect(result.extractedData).toEqual({ rfc: 'XAXX010101000' });
    });

    it('injects the provided schema into the prompt, not generationConfig', async () => {
      const customSchema = {
        type: 'object',
        properties: { name: { type: 'string' }, date: { type: 'string' } },
        required: ['name', 'date'],
      };
      mockGenerateContent.mockResolvedValue(
        vertexResponse('{"name":"x","date":"y"}'),
      );

      await service.extractStructuredData(ocrText, 'INE', customSchema);

      // generateContent is called on the model returned by getGenerativeModel
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              parts: expect.arrayContaining([
                expect.objectContaining({
                  text: expect.stringContaining(JSON.stringify(customSchema)),
                }),
              ]),
            }),
          ]),
        }),
      );
    });

    it('sets responseMimeType application/json and temperature 0.1 via getGenerativeModel', async () => {
      mockGenerateContent.mockResolvedValue(
        vertexResponse('{"name":"x"}'),
      );

      await service.extractStructuredData(ocrText, 'INE', schema);

      // generationConfig is set on the model via getGenerativeModel()
      expect(mockGetGenerativeModel).toHaveBeenCalledWith(
        expect.objectContaining({
          generationConfig: expect.objectContaining({
            responseMimeType: 'application/json',
            temperature: 0.1,
          }),
        }),
      );
    });

    it('passes the rendered prompt as a user message in contents', async () => {
      mockGenerateContent.mockResolvedValue(
        vertexResponse('{"name":"x"}'),
      );

      await service.extractStructuredData(ocrText, 'INE', schema);

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: [
            expect.objectContaining({
              role: 'user',
              parts: [expect.objectContaining({ text: expect.stringContaining(ocrText) })],
            }),
          ],
        }),
      );
    });

    it('returns GEMINI_TIMEOUT when the API exceeds GEMINI_TIMEOUT_MS', async () => {
      configureEnv({ GEMINI_TIMEOUT_MS: '1' });
      const module = await buildModule();
      service = module.get<GeminiService>(GeminiService);
      mockGenerateContent.mockReturnValue(new Promise(() => {})); // never resolves

      const result = await service.extractStructuredData(ocrText, 'INE', schema);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('GEMINI_TIMEOUT');
    });

    it('returns GEMINI_TEMPORARILY_UNAVAILABLE after exhausting retries on HTTP 503', async () => {
      const apiError: any = new Error('Service Unavailable');
      apiError.status = 503;
      mockGenerateContent.mockRejectedValue(apiError);

      const result = await service.extractStructuredData(ocrText, 'INE', schema);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('GEMINI_TEMPORARILY_UNAVAILABLE');
      expect(result.error?.message).toContain('no estuvo disponible temporalmente');
      // Should have attempted MAX_RETRIES (3) times
      expect(mockGenerateContent).toHaveBeenCalledTimes(3);
    });

    it('retries on HTTP 429 and returns GEMINI_TEMPORARILY_UNAVAILABLE after exhausting retries', async () => {
      const apiError: any = new Error('Too Many Requests');
      apiError.status = 429;
      mockGenerateContent.mockRejectedValue(apiError);

      const result = await service.extractStructuredData(ocrText, 'INE', schema);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('GEMINI_TEMPORARILY_UNAVAILABLE');
      expect(mockGenerateContent).toHaveBeenCalledTimes(3);
    });

    it('succeeds on second attempt when first attempt is 503', async () => {
      const apiError: any = new Error('Service Unavailable');
      apiError.status = 503;
      mockGenerateContent
        .mockRejectedValueOnce(apiError)
        .mockResolvedValueOnce(
          vertexResponse('{"name":"retry-success"}'),
        );

      const result = await service.extractStructuredData(ocrText, 'INE', schema);

      expect(result.success).toBe(true);
      expect(result.extractedData).toEqual({ name: 'retry-success' });
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    });

    it('returns GEMINI_REQUEST_ERROR on non-retryable errors without retrying', async () => {
      const apiError: any = new Error('Internal Server Error');
      apiError.status = 500;
      mockGenerateContent.mockRejectedValue(apiError);

      const result = await service.extractStructuredData(ocrText, 'INE', schema);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('GEMINI_REQUEST_ERROR');
      // Should NOT retry — only 1 attempt
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    it('returns GEMINI_INVALID_JSON when API returns non-JSON text', async () => {
      mockGenerateContent.mockResolvedValue(
        vertexResponse('I cannot extract that'),
      );

      const result = await service.extractStructuredData(ocrText, 'INE', schema);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('GEMINI_INVALID_JSON');
    });

    it('returns GEMINI_EMPTY_RESPONSE when API returns empty text', async () => {
      mockGenerateContent.mockResolvedValue(
        vertexResponse(''),
      );

      const result = await service.extractStructuredData(ocrText, 'INE', schema);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('GEMINI_EMPTY_RESPONSE');
    });

    it('returns GEMINI_REQUEST_ERROR when API response has no candidates', async () => {
      mockGenerateContent.mockResolvedValue({
        response: { candidates: [] },
      });

      const result = await service.extractStructuredData(ocrText, 'INE', schema);

      expect(result.success).toBe(false);
      // extractText throws GEMINI_EMPTY_RESPONSE internally, but the catch
      // handler wraps non-retryable errors as GEMINI_REQUEST_ERROR.
      expect(result.error?.code).toBe('GEMINI_REQUEST_ERROR');
    });
  });
});
