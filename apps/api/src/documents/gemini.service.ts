import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VertexAI, HarmCategory, HarmBlockThreshold } from '@google-cloud/vertexai';

const SYSTEM_INSTRUCTION = [
  'Eres un extractor documental para analisis hipotecario.',
  'Tu unica tarea es extraer datos estructurados a partir del texto OCR provisto.',
  'Reglas estrictas:',
  '- Extrae UNICAMENTE de la informacion presente en el texto OCR. No utilices conocimiento externo.',
  '- NO inventes ni adivines datos. Ante cualquier duda, usa null.',
  '- Usa null para todo campo que no se encuentre en el OCR.',
  '- Normaliza todas las fechas al formato YYYY-MM-DD.',
  '- Normaliza todos los montos como numeros decimales sin $ y sin comas como separador de miles.',
  '- Manten RFC, CURP y nombres en MAYUSCULAS.',
  '- Devuelve UNICAMENTE un objeto JSON valido, sin texto explicativo, sin markdown.',
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
const DEFAULT_LOCATION = 'us-central1';
const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_MAX_OUTPUT_TOKENS = 16384;

/** HTTP status codes that indicate a temporary server-side overload. */
const RETRYABLE_STATUSES = new Set([429, 503]);

/** Maximum retries for transient errors. */
const MAX_RETRIES = 3;

/** Backoff delays in milliseconds: attempt 1 -> 0ms, 2 -> 1000ms, 3 -> 2000ms. */
const RETRY_DELAYS_MS = [0, 1000, 2000];

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly vertexAI: VertexAI;
  private readonly modelName: string;
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number;

  constructor(private readonly configService: ConfigService) {
    const projectId = this.configService.get<string>('GEMINI_PROJECT_ID');
    const location =
      this.configService.get<string>('GEMINI_LOCATION') || DEFAULT_LOCATION;

    if (!projectId) {
      throw new Error(
        `${GeminiErrorCode.GEMINI_CONFIG_ERROR}: GEMINI_PROJECT_ID is required for Vertex AI`,
      );
    }

    this.vertexAI = new VertexAI({ project: projectId, location });

    this.modelName =
      this.configService.get<string>('GEMINI_MODEL') || DEFAULT_MODEL;

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

  /**
   * Creates a fresh GenerativeModel instance per extraction call.
   * This ensures generationConfig is set correctly each time (Vertex AI SDK
   * does not support per-request generationConfig overrides).
   */
  private getModel(maxTokens: number) {
    return this.vertexAI.getGenerativeModel({
      model: this.modelName,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
        maxOutputTokens: maxTokens,
      },
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
      ],
      systemInstruction: {
        role: 'system',
        parts: [{ text: SYSTEM_INSTRUCTION }],
      },
    });
  }

  private buildPrompt(
    ocrText: string,
    documentType: string,
    schema: Record<string, unknown>,
    extraInstructions?: string,
  ): string {
    const parts: string[] = [];

    if (extraInstructions) {
      parts.push(extraInstructions, '');
    }

    parts.push(
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

  /**
   * Attempts to salvage a truncated JSON response by closing unclosed
   * brackets, braces, and strings. Used when the model hits MAX_TOKENS
   * and cuts off mid-output (common with large credit bureau responses
   * where the missingFields array grows with each credit).
   */
  private salvageTruncatedJson(text: string): Record<string, unknown> {
    let salvaged = text.trim();

    // Remove trailing comma if present (most common truncation point)
    salvaged = salvaged.replace(/,\s*$/, '');

    // Remove trailing incomplete key-value pair (e.g., '"creditType":')
    salvaged = salvaged.replace(/,\s*"[^"]*"\s*:\s*$/g, '');
    // Also handle if it's the only key-value in an object
    salvaged = salvaged.replace(/"[^"]*"\s*:\s*$/g, '').replace(/,\s*$/, '');

    // Track open/close order with a stack to close in correct nesting
    const stack: string[] = [];
    let inString = false;
    let escapeNext = false;

    for (const ch of salvaged) {
      if (escapeNext) { escapeNext = false; continue; }
      if (ch === '\\') { escapeNext = true; continue; }
      if (ch === '"' && !escapeNext) { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{' || ch === '[') stack.push(ch);
      if (ch === '}' || ch === ']') stack.pop();
    }

    // Close any unclosed string
    if (inString) {
      salvaged += '"';
    }

    // Close in reverse nesting order (innermost first)
    for (let i = stack.length - 1; i >= 0; i--) {
      salvaged += stack[i] === '{' ? '}' : ']';
    }

    return JSON.parse(salvaged) as Record<string, unknown>;
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

    // First attempt: direct parse
    try {
      return JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
      // Second attempt: salvage truncated JSON (model hit MAX_TOKENS)
      try {
        return this.salvageTruncatedJson(cleaned);
      } catch {
        throw new Error(GeminiErrorCode.GEMINI_INVALID_JSON);
      }
    }
  }

  /**
   * Extracts the text response from a Vertex AI GenerateContentResult.
   * Vertex AI returns: response.candidates[0].content.parts[0].text
   *
   * Also checks the candidate's finishReason and returns it alongside
   * the text so callers can handle MAX_TOKENS (truncated output).
   */
  private extractText(result: {
    response: {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }>;
    };
  }): { text: string; finishReason: string } {
    const candidate = result.response.candidates?.[0];
    if (!candidate?.content?.parts?.length) {
      throw new Error(GeminiErrorCode.GEMINI_EMPTY_RESPONSE);
    }
    return {
      text: candidate.content.parts[0].text ?? '',
      finishReason: candidate.finishReason ?? 'UNKNOWN',
    };
  }

  /**
   * Executes a single Vertex AI API call with timeout.
   */
  private async executeRequest(
    model: ReturnType<GeminiService['getModel']>,
    prompt: string,
  ) {
    return this.callWithTimeout(
      model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
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

    if (status !== undefined && RETRYABLE_STATUSES.has(status)) {
      return true;
    }

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

    const model = this.getModel(this.maxOutputTokens);

    // ---- Retry loop for transient errors ----
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

        const genResult = await this.executeRequest(model, prompt);
        const { text: rawText, finishReason } = this.extractText(genResult);

        // Detect truncated output — the model hit its token limit.
        // Log as warning (not error) because the salvage logic in
        // parseJsonResponse can often recover the partial JSON.
        if (finishReason === 'MAX_TOKENS') {
          this.logger.warn(
            `[Gemini] Response truncated (MAX_TOKENS) for ${documentType}. ` +
              `Raw length: ${rawText.length} chars. Attempting JSON salvage.`,
          );
        }

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
          this.logger.error(
            `[Gemini] JSON parse failed: ${code}. Raw length: ${rawText.length} chars. Start: ${rawText.slice(0, 300)} ... End: ${rawText.slice(-300)}`,
          );
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

        if (this.isRetryable(err) && attempt < MAX_RETRIES - 1) {
          continue;
        }

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

        break;
      }
    }

    // ---- Exhausted retries or non-retryable error ----
    const message =
      lastError instanceof Error ? lastError.message : String(lastError);
    this.logger.error(`[Gemini] extraction error: ${message}`);

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

    const maybeStatus =
      (lastError as { status?: unknown; code?: unknown }) || {};
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
      /* swallow - race settled already */
    });
    return Promise.race([promise, timeoutPromise]);
  }
}
