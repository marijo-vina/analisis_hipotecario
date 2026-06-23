// ---------------------------------------------------------------------------
// Mock @google/generative-ai — must be module-level for jest.mock hoisting
// ---------------------------------------------------------------------------

const mockGenerateContent = jest.fn();
const mockGetGenerativeModel = jest.fn().mockReturnValue({
  generateContent: mockGenerateContent,
});

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GeminiService } from './gemini.service';

describe('GeminiService', () => {
  let service: GeminiService;

  const mockConfigService = {
    get: jest.fn(),
  };

  const API_KEY = 'test-api-key-12345';

  const configureEnv = (overrides: Record<string, string | undefined> = {}) => {
    const defaults: Record<string, string | undefined> = {
      GEMINI_API_KEY: API_KEY,
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
    it('initializes the SDK client when GEMINI_API_KEY is set and non-empty', async () => {
      configureEnv();
      const module = await buildModule();
      service = module.get<GeminiService>(GeminiService);

      expect(service).toBeDefined();
      expect(GoogleGenerativeAI).toHaveBeenCalledWith(API_KEY);
      expect(mockGetGenerativeModel).toHaveBeenCalledWith({
        model: 'gemini-2.5-pro',
      });
    });

    it('throws GEMINI_CONFIG_ERROR when GEMINI_API_KEY is undefined', () => {
      configureEnv({ GEMINI_API_KEY: undefined });

      expect(() => new GeminiService(mockConfigService as any)).toThrow(
        'GEMINI_CONFIG_ERROR',
      );
    });

    it('throws GEMINI_CONFIG_ERROR when GEMINI_API_KEY is empty string', () => {
      configureEnv({ GEMINI_API_KEY: '' });

      expect(() => new GeminiService(mockConfigService as any)).toThrow(
        'GEMINI_CONFIG_ERROR',
      );
    });

    it('uses the model name from GEMINI_MODEL env var when provided', async () => {
      configureEnv({ GEMINI_MODEL: 'gemini-2.0-flash' });
      const module = await buildModule();
      module.get<GeminiService>(GeminiService);

      expect(mockGetGenerativeModel).toHaveBeenCalledWith({
        model: 'gemini-2.0-flash',
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

    it('explicitly instructs using null for missing/unfound fields', () => {
      const prompt = invokeBuild('texto OCR', 'INE', { name: { type: 'string' } });
      expect(prompt).toMatch(/null/i);
    });

    it('instructs YYYY-MM-DD format for all dates', () => {
      const prompt = invokeBuild('t', 'INE', {});
      expect(prompt).toContain('YYYY-MM-DD');
    });

    it('instructs decimal numbers without $ or commas for amounts', () => {
      const prompt = invokeBuild('t', 'INE', {});
      expect(prompt).toMatch(/sin\s*[\$]/i);
      expect(prompt).toMatch(/decimal/i);
    });

    it('explicitly forbids inventing or guessing data', () => {
      const prompt = invokeBuild('t', 'INE', {});
      expect(prompt).toMatch(/no .*(invent|inventes|inventar)/i);
    });

    it('includes the provided schema definition as output contract', () => {
      const schema = { required: ['name', 'date'] };
      const prompt = invokeBuild('t', 'INE', schema);
      expect(prompt).toContain(JSON.stringify(schema));
    });

    it('injects the OCR text and documentType into the prompt', () => {
      const prompt = invokeBuild('CLAUSULA: 12345', 'RFC', {});
      expect(prompt).toContain('CLAUSULA: 12345');
      expect(prompt).toContain('RFC');
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

    it('throws GEMINI_INVALID_JSON when response is malformed JSON', () => {
      expect(() => invokeParse('{"name":"Juan",')).toThrow('GEMINI_INVALID_JSON');
    });
  });

  describe('extractStructuredData', () => {
    const ocrText = 'NOMBRE: Juan Perez\nFECHA: 2024-01-15';
    const schema = { type: 'object', required: ['name', 'date'] };

    beforeEach(async () => {
      configureEnv();
      const module = await buildModule();
      service = module.get<GeminiService>(GeminiService);
    });

    it('returns success with parsed JSON when extraction succeeds', async () => {
      const mockJson = '{"name":"Juan","date":"2024-01-15"}';
      mockGenerateContent.mockResolvedValue({ response: { text: () => mockJson } });

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
      mockGenerateContent.mockResolvedValue({ response: { text: () => mockJson } });

      const result = await service.extractStructuredData(ocrText, 'RFC', schema);

      expect(result.success).toBe(true);
      expect(result.documentType).toBe('RFC');
      expect(result.extractedData).toEqual({ rfc: 'XAXX010101000' });
    });

    it('injects the provided schema into generationConfig.responseSchema', async () => {
      const customSchema = {
        type: 'object',
        properties: { name: { type: 'string' }, date: { type: 'string' } },
        required: ['name', 'date'],
      };
      mockGenerateContent.mockResolvedValue({
        response: { text: () => '{"name":"x","date":"y"}' },
      });

      await service.extractStructuredData(ocrText, 'INE', customSchema);

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          generationConfig: expect.objectContaining({ responseSchema: customSchema }),
        }),
      );
    });

    it('sets responseMimeType application/json and temperature 0.1 in generationConfig', async () => {
      mockGenerateContent.mockResolvedValue({
        response: { text: () => '{"name":"x"}' },
      });

      await service.extractStructuredData(ocrText, 'INE', schema);

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          generationConfig: expect.objectContaining({
            responseMimeType: 'application/json',
            temperature: 0.1,
          }),
        }),
      );
    });

    it('passes the rendered prompt as a user message in contents', async () => {
      mockGenerateContent.mockResolvedValue({
        response: { text: () => '{"name":"x"}' },
      });

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

    it('returns GEMINI_REQUEST_ERROR with status in details when API returns HTTP 503', async () => {
      const apiError: any = new Error('Service Unavailable');
      apiError.status = 503;
      mockGenerateContent.mockRejectedValue(apiError);

      const result = await service.extractStructuredData(ocrText, 'INE', schema);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('GEMINI_REQUEST_ERROR');
      expect(result.error?.details).toEqual({ status: 503 });
    });

    it('returns GEMINI_INVALID_JSON when API returns non-JSON text', async () => {
      mockGenerateContent.mockResolvedValue({
        response: { text: () => 'I cannot extract that' },
      });

      const result = await service.extractStructuredData(ocrText, 'INE', schema);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('GEMINI_INVALID_JSON');
    });

    it('returns GEMINI_EMPTY_RESPONSE when API returns empty text', async () => {
      mockGenerateContent.mockResolvedValue({ response: { text: () => '' } });

      const result = await service.extractStructuredData(ocrText, 'INE', schema);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('GEMINI_EMPTY_RESPONSE');
    });
  });
});