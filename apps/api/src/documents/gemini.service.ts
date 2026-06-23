import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';

const SYSTEM_INSTRUCTION = [
  'Eres un extractor documental para análisis hipotecario.',
  'Tu única tarea es extraer datos estructurados a partir del texto OCR provisto.',
  'Reglas estrictas:',
  '- Extrae ÚNICAMENTE de la información presente en el texto OCR. No utilices conocimiento externo.',
  '- NO inventes ni adivines datos. Ante cualquier duda, usa null.',
  '- Usa null para todo campo que no se encuentre en el OCR.',
  '- Normaliza todas las fechas al formato YYYY-MM-DD.',
  '- Normaliza todos los montos como números decimales sin $ y sin comas como separador de miles.',
  '- Mantén RFC, CURP y nombres en MAYÚSCULAS.',
  '- Devuelve ÚNICAMENTE un objeto JSON válido, sin texto explicativo, sin markdown.',
  '- Incluye un arreglo "alerts" con los campos faltantes o de baja confianza.',
].join('\n');

export enum GeminiErrorCode {
  GEMINI_CONFIG_ERROR = 'GEMINI_CONFIG_ERROR',
  GEMINI_REQUEST_ERROR = 'GEMINI_REQUEST_ERROR',
  GEMINI_EMPTY_RESPONSE = 'GEMINI_EMPTY_RESPONSE',
  GEMINI_INVALID_JSON = 'GEMINI_INVALID_JSON',
  GEMINI_TIMEOUT = 'GEMINI_TIMEOUT',
  GEMINI_SCHEMA_MISSING = 'GEMINI_SCHEMA_MISSING',
  OCR_TEXT_EMPTY = 'OCR_TEXT_EMPTY',
}

export interface ExtractionResult {
  success: boolean;
  documentType: string;
  extractedData: Record<string, unknown> | null;
  rawResponse?: string;
  error?: { code: string; message: string; details?: unknown };
}

const DEFAULT_MODEL = 'gemini-2.5-pro';
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_OUTPUT_TOKENS = 8192;

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly genAI: GoogleGenerativeAI;
  private readonly model: GenerativeModel;
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error(GeminiErrorCode.GEMINI_CONFIG_ERROR);
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    const modelName =
      this.configService.get<string>('GEMINI_MODEL') || DEFAULT_MODEL;
    this.model = this.genAI.getGenerativeModel({ model: modelName });

    this.timeoutMs = parseInt(
      this.configService.get<string>('GEMINI_TIMEOUT_MS') ||
        String(DEFAULT_TIMEOUT_MS),
      10,
    );
    this.maxOutputTokens = parseInt(
      this.configService.get<string>('GEMINI_MAX_OUTPUT_TOKENS') ||
        String(DEFAULT_MAX_OUTPUT_TOKENS),
      10,
    );
  }

  private buildPrompt(
    ocrText: string,
    documentType: string,
    schema: Record<string, unknown>,
  ): string {
    return [
      SYSTEM_INSTRUCTION,
      '',
      `Tipo de documento: ${documentType}`,
      '',
      'Esquema de salida (contrato JSON):',
      '```json',
      JSON.stringify(schema),
      '```',
      '',
      'Texto OCR de entrada:',
      '"""',
      ocrText,
      '"""',
    ].join('\n');
  }

  private parseJsonResponse(text: string): Record<string, unknown> {
    if (!text || text.trim() === '') {
      throw new Error(GeminiErrorCode.GEMINI_EMPTY_RESPONSE);
    }

    let cleaned = text.trim();
    const fenceMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenceMatch) {
      cleaned = fenceMatch[1].trim();
    }

    try {
      return JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      throw new Error(GeminiErrorCode.GEMINI_INVALID_JSON);
    }
  }

  async extractStructuredData(
    ocrText: string,
    documentType: string,
    schema: Record<string, unknown>,
  ): Promise<ExtractionResult> {
    if (!ocrText || ocrText.trim() === '') {
      return {
        success: false,
        documentType,
        extractedData: null,
        error: {
          code: GeminiErrorCode.OCR_TEXT_EMPTY,
          message: 'OCR input text is empty',
        },
      };
    }

    if (!schema) {
      return {
        success: false,
        documentType,
        extractedData: null,
        error: {
          code: GeminiErrorCode.GEMINI_SCHEMA_MISSING,
          message: 'Schema parameter is required',
        },
      };
    }

    const prompt = this.buildPrompt(ocrText, documentType, schema);
    const generationConfig = {
      responseMimeType: 'application/json',
      temperature: 0.1,
      maxOutputTokens: this.maxOutputTokens,
      responseSchema: schema,
    };

    try {
      const genResult = await this.callWithTimeout(
        this.model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig,
        }),
      );

      const rawText = genResult.response.text();

      try {
        const extracted = this.parseJsonResponse(rawText);
        return {
          success: true,
          documentType,
          extractedData: extracted,
          rawResponse: rawText,
        };
      } catch (parseErr) {
        const code =
          parseErr instanceof Error
            ? parseErr.message
            : GeminiErrorCode.GEMINI_INVALID_JSON;
        this.logger.error(`[Gemini] JSON parse failed: ${code}`);
        return {
          success: false,
          documentType,
          extractedData: null,
          rawResponse: rawText,
          error: {
            code,
            message: parseErr instanceof Error ? parseErr.message : String(parseErr),
          },
        };
      }
    } catch (err) {
      return this.mapExtractorError(err, documentType);
    }
  }

  private callWithTimeout<T>(promise: Promise<T>): Promise<T> {
    const timeoutPromise = new Promise<T>((_, reject) => {
      const id = setTimeout(
        () => reject(new Error(GeminiErrorCode.GEMINI_TIMEOUT)),
        this.timeoutMs,
      );
      if (id && typeof (id as NodeJS.Timeout).unref === 'function') {
        (id as NodeJS.Timeout).unref();
      }
    });
    timeoutPromise.catch(() => {
      /* swallow — race settled already */
    });
    return Promise.race([promise, timeoutPromise]);
  }

  private mapExtractorError(
    err: unknown,
    documentType: string,
  ): ExtractionResult {
    const message = err instanceof Error ? err.message : String(err);
    this.logger.error(`[Gemini] extraction error: ${message}`);

    if (/timeout|deadline|GEMINI_TIMEOUT/i.test(message)) {
      return {
        success: false,
        documentType,
        extractedData: null,
        error: { code: GeminiErrorCode.GEMINI_TIMEOUT, message },
      };
    }

    const maybeStatus = (err as { status?: unknown; code?: unknown }) || {};
    const status = maybeStatus.status ?? maybeStatus.code;

    return {
      success: false,
      documentType,
      extractedData: null,
      error: {
        code: GeminiErrorCode.GEMINI_REQUEST_ERROR,
        message,
        details: status !== undefined ? { status } : undefined,
      },
    };
  }
}