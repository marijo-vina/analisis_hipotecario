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
  GEMINI_TEMPORARILY_UNAVAILABLE = 'GEMINI_TEMPORARILY_UNAVAILABLE',
}

export interface ExtractionResult {
  success: boolean;
  documentType: string;
  extractedData: Record<string, unknown> | null;
  rawResponse?: string;
  error?: { code: string; message: string; details?: unknown };
}

const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_OUTPUT_TOKENS = 8192;

/** HTTP status codes that indicate a temporary server-side overload. */
const RETRYABLE_STATUSES = new Set([429, 503]);

/** Maximum retries for transient errors. */
const MAX_RETRIES = 3;

/** Backoff delays in milliseconds: attempt 1 → 0ms, 2 → 1000ms, 3 → 2000ms. */
const RETRY_DELAYS_MS = [0, 1000, 2000];

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
    extraInstructions?: string,
  ): string {
    const parts = [SYSTEM_INSTRUCTION];

    if (extraInstructions) {
      parts.push('', extraInstructions);
    }

    parts.push(
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
    );

    return parts.join('\n');
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

  /**
   * Executes a single Gemini API call with timeout.
   * Returns the raw GenerateContentResult, or throws on failure.
   */
  private async executeRequest(
    prompt: string,
    generationConfig: Record<string, unknown>,
  ) {
    return this.callWithTimeout(
      this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig,
      }),
    );
  }

  /**
   * Determines whether an error is retryable (429 Too Many Requests or
   * 503 Service Unavailable / high-demand).
   */
  private isRetryable(err: unknown): boolean {
    const message = err instanceof Error ? err.message : String(err);
    const status = (err as { status?: number })?.status;

    // Check HTTP status first
    if (status !== undefined && RETRYABLE_STATUSES.has(status)) {
      return true;
    }

    // Fallback: check error message for known patterns
    return (
      /503|service unavailable|high demand|too many requests|429|overloaded/i.test(
        message,
      )
    );
  }

  async extractStructuredData(
    ocrText: string,
    documentType: string,
    schema: Record<string, unknown>,
    extraInstructions?: string,
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

    const prompt = this.buildPrompt(
      ocrText,
      documentType,
      schema,
      extraInstructions,
    );
    const generationConfig = {
      responseMimeType: 'application/json',
      temperature: 0.1,
      maxOutputTokens: this.maxOutputTokens,
    };

    // ── Retry loop for transient errors ─────────────────────────────
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          const delay = RETRY_DELAYS_MS[attempt] ?? 2000;
          this.logger.warn(
            `[Gemini] Retry attempt ${attempt + 1}/${MAX_RETRIES} after ${delay}ms for ${documentType}`,
          );
          await this.sleep(delay);
        }

        const genResult = await this.executeRequest(prompt, generationConfig);
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
              message:
                parseErr instanceof Error
                  ? parseErr.message
                  : String(parseErr),
            },
          };
        }
      } catch (err) {
        lastError = err;

        // Only retry on transient server errors
        if (this.isRetryable(err) && attempt < MAX_RETRIES - 1) {
          continue;
        }

        // If it's a timeout, don't retry — return immediately
        if (/timeout|deadline|GEMINI_TIMEOUT/i.test(
          err instanceof Error ? err.message : String(err),
        )) {
          return {
            success: false,
            documentType,
            extractedData: null,
            error: {
              code: GeminiErrorCode.GEMINI_TIMEOUT,
              message: err instanceof Error ? err.message : String(err),
            },
          };
        }

        break; // non-retryable or exhausted retries
      }
    }

    // ── Exhausted retries or non-retryable error ────────────────────
    const message =
      lastError instanceof Error ? lastError.message : String(lastError);
    this.logger.error(`[Gemini] extraction error: ${message}`);

    // Distinguish transient from permanent
    if (this.isRetryable(lastError)) {
      return {
        success: false,
        documentType,
        extractedData: null,
        error: {
          code: GeminiErrorCode.GEMINI_TEMPORARILY_UNAVAILABLE,
          message:
            'Gemini no estuvo disponible temporalmente. Intenta reprocesar el documento en unos minutos.',
          details: { attempts: MAX_RETRIES },
        },
      };
    }

    const maybeStatus = (lastError as { status?: unknown; code?: unknown }) || {};
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

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
}
