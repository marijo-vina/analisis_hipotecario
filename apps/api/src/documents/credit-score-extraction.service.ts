import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiService, GeminiErrorCode } from './gemini.service';
import { SCORE_EXCLUSION_REASONS } from './credit-bureau-extraction.service';

// ---------------------------------------------------------------------------
// Document type code that triggers credit score extraction
// ---------------------------------------------------------------------------
const CREDIT_SCORE_DOC_TYPE = 'CREDIT_SCORE';

// ---------------------------------------------------------------------------
// Specialized instructions for "Mi Score" document extraction
// ---------------------------------------------------------------------------
const CREDIT_SCORE_INSTRUCTIONS = [
  'Documento "Mi Score" (score crediticio) para análisis hipotecario.',
  '',
  '─── REGLA DE ORO — AISLAMIENTO DE CONTEXTO ───',
  'Extraé ÚNICAMENTE de la información presente en el OCR de ESTE documento.',
  'NUNCA infieras ni referencies datos de otros documentos del expediente.',
  'Extract ONLY from this document\'s text. Never infer or cross-reference other documents.',
  '',
  '─── Campo a extraer ───',
  '  score: valor numérico de Mi Score.',
  '    - Rango válido: 400 a 800.',
  '    - Si aparece un número NEGATIVO (-1, -5, -6, -7, -8, -9), es un código de EXCLUSIÓN,',
  '      NO un score válido. Reportar el valor negativo en `score` y marcar scoreIsExcluded=true.',
  '    - Si NO se detecta ningún número de score, reportar score=null y scoreIsExcluded=false.',
  '    - Si el número está fuera del rango 400-800 (y no es negativo), reportar score=null.',
  '',
  '  scoreIsExcluded: true si el valor es un código de exclusión (negativo).',
  '  scoreExclusionReason: texto con la razón de exclusión cuando scoreIsExcluded=true.',
  '',
  'NO extraigas datos de buró, créditos, ni otro tipo de información. Solo el score.',
].join('\n');

// ---------------------------------------------------------------------------
// Schema — output contract Gemini must fulfill for the Mi Score document
// ---------------------------------------------------------------------------
const CREDIT_SCORE_SCHEMA = {
  schemaVersion: '1.0',
  documentType: 'CREDIT_SCORE',
  score: null as number | null,
  scoreIsExcluded: false,
  scoreExclusionReason: null as string | null,
};

// ---------------------------------------------------------------------------
// Extraction result envelope
// ---------------------------------------------------------------------------
export interface CreditScoreExtractionResult {
  success: boolean;
  documentId: string;
  extractedData: Record<string, unknown> | null;
  alerts: ExtractionScoreAlert[];
  error?: { code: string; message: string };
}

interface ExtractionScoreAlert {
  code: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  category: 'CREDIT_BUREAU';
  message: string;
  field: string | null;
  requiresManualReview: boolean;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
@Injectable()
export class CreditScoreExtractionService {
  private readonly logger = new Logger(CreditScoreExtractionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geminiService: GeminiService,
  ) {}

  static isCreditScoreDocument(documentTypeCode: string): boolean {
    return documentTypeCode === CREDIT_SCORE_DOC_TYPE;
  }

  async extract(
    caseId: string,
    documentId: string,
  ): Promise<CreditScoreExtractionResult> {
    // ── 1. Fetch document with type + status ───────────────────────────
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { documentType: true, documentStatus: true },
    });
    if (!document || document.mortgageCaseId !== caseId) {
      throw new Error('Document not found');
    }

    // ── 2. Status gate ──────────────────────────────────────────────────
    const statusCode = document.documentStatus.code;
    if (statusCode !== 'PROCESSED' && statusCode !== 'EXTRACTION_ERROR') {
      return {
        success: false,
        documentId,
        extractedData: null,
        alerts: [],
        error: {
          code: 'DOCUMENT_NOT_PROCESSED',
          message:
            'El documento debe estar procesado (OCR) antes de la extracción.',
        },
      };
    }

    // ── 3. Guard: document type must be CREDIT_SCORE ───────────────────
    if (document.documentType.code !== CREDIT_SCORE_DOC_TYPE) {
      return {
        success: false,
        documentId,
        extractedData: null,
        alerts: [],
        error: {
          code: 'DOCUMENT_TYPE_MISMATCH',
          message:
            'El documento no es un documento de Mi Score (CREDIT_SCORE).',
        },
      };
    }

    // ── 4. Guard: OCR text must exist ────────────────────────────────────
    if (!document.ocrText || document.ocrText.trim() === '') {
      return {
        success: false,
        documentId,
        extractedData: null,
        alerts: [],
        error: {
          code: GeminiErrorCode.OCR_TEXT_EMPTY,
          message: 'El documento no tiene texto OCR extraído.',
        },
      };
    }

    // ── 5. Resolve status IDs for transitions ───────────────────────────
    const processedStatus = await this.prisma.documentStatus.findUnique({
      where: { code: 'PROCESSED' },
    });
    const extractionErrorStatus = await this.prisma.documentStatus.findUnique({
      where: { code: 'EXTRACTION_ERROR' },
    });
    if (!processedStatus || !extractionErrorStatus) {
      throw new Error('Required document status codes not found in database');
    }

    // ── 6. Call Gemini with score-specific instructions ─────────────────
    const geminiResult = await this.geminiService.extractStructuredData(
      document.ocrText,
      document.documentType.code,
      { ...CREDIT_SCORE_SCHEMA },
      CREDIT_SCORE_INSTRUCTIONS,
    );

    if (!geminiResult.success) {
      this.logger.warn(
        `[CreditScore] Gemini extraction failed for doc ${documentId}: ${geminiResult.error?.code}`,
      );

      try {
        await this.prisma.document.update({
          where: { id: documentId },
          data: { documentStatusId: extractionErrorStatus.id },
        });
      } catch (dbError) {
        this.logger.error(
          `[CreditScore] Failed to set EXTRACTION_ERROR status for doc ${documentId}: ${(dbError as Error).message}`,
        );
      }

      return {
        success: false,
        documentId,
        extractedData: null,
        alerts: [],
        error: geminiResult.error
          ? {
              code: geminiResult.error.code,
              message: geminiResult.error.message,
            }
          : { code: 'UNKNOWN', message: 'Extraction failed' },
      };
    }

    const data = geminiResult.extractedData as Record<string, unknown>;

    // ── 7. Normalize score fields ───────────────────────────────────────
    this.normalizeScore(data);

    // ── 8. Compute alerts ───────────────────────────────────────────────
    const alerts = this.computeScoreAlerts(data);

    // ── 9. Persist extractedData + status atomically ──────────────────
    await this.prisma.document.update({
      where: { id: documentId },
      data: {
        extractedData: data as any,
        documentStatusId: processedStatus.id,
      },
    });

    return {
      success: true,
      documentId,
      extractedData: data,
      alerts,
    };
  }

  // -----------------------------------------------------------------------
  // Private: normalize score fields post-Gemini
  // -----------------------------------------------------------------------

  private normalizeScore(data: Record<string, unknown>): void {
    let score = data.score as number | null | undefined;

    if (score == null) {
      data.score = null;
      data.scoreIsExcluded = false;
      data.scoreExclusionReason = null;
      return;
    }

    if (typeof score !== 'number') {
      this.logger.warn(
        `[CreditScore] Score is not a number (${typeof score}), nulling`,
      );
      data.score = null;
      data.scoreIsExcluded = false;
      data.scoreExclusionReason = null;
      return;
    }

    if (score < 0) {
      // Exclusion code
      data.score = score;
      data.scoreIsExcluded = true;
      data.scoreExclusionReason =
        SCORE_EXCLUSION_REASONS[score] ??
        `Código de exclusión desconocido: ${score}`;
    } else if (score < 400 || score > 800) {
      // Out of valid range
      this.logger.warn(
        `[CreditScore] Score ${score} fuera del rango 400-800, anulando`,
      );
      data.score = null;
      data.scoreIsExcluded = false;
      data.scoreExclusionReason = null;
    } else {
      data.score = score;
      data.scoreIsExcluded = false;
      data.scoreExclusionReason = null;
    }
  }

  // -----------------------------------------------------------------------
  // Private: alert computation for score
  // -----------------------------------------------------------------------

  private computeScoreAlerts(data: Record<string, unknown>): ExtractionScoreAlert[] {
    const alerts: ExtractionScoreAlert[] = [];
    const score = data.score as number | null | undefined;
    const scoreIsExcluded = data.scoreIsExcluded === true;

    if (scoreIsExcluded && score != null && score < 0) {
      const reason =
        data.scoreExclusionReason as string ??
        SCORE_EXCLUSION_REASONS[score] ??
        `Código de exclusión desconocido: ${score}`;
      alerts.push({
        code: 'BURO_SCORE_EXCLUDED',
        severity: 'WARNING',
        category: 'CREDIT_BUREAU',
        message: `Mi Score no disponible: ${reason}`,
        field: 'score',
        requiresManualReview: true,
      });
      return alerts;
    }

    if (score == null) {
      // No score detectable — no alert (EXT-003)
      return alerts;
    }

    if (score < 500) {
      alerts.push({
        code: 'BURO_SCORE_CRITICAL',
        severity: 'CRITICAL',
        category: 'CREDIT_BUREAU',
        message: `Mi Score en zona de riesgo muy alto: ${score}. Probabilidad elevada de incumplimiento a 90+ días.`,
        field: 'score',
        requiresManualReview: true,
      });
    } else if (score < 600) {
      alerts.push({
        code: 'BURO_SCORE_LOW',
        severity: 'WARNING',
        category: 'CREDIT_BUREAU',
        message: `Mi Score en zona de riesgo: ${score}. Revisar historial crediticio.`,
        field: 'score',
        requiresManualReview: true,
      });
    }

    return alerts;
  }
}
