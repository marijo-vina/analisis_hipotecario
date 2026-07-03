import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiService, GeminiErrorCode } from './gemini.service';

// ---------------------------------------------------------------------------
// Document type codes that trigger credit bureau extraction
// ---------------------------------------------------------------------------
const CREDIT_BUREAU_DOC_TYPES = ['CREDIT_BUREAU_REPORT'];

// ---------------------------------------------------------------------------
// Specialized instructions for credit bureau extraction
// ---------------------------------------------------------------------------
const CREDIT_BUREAU_INSTRUCTIONS = [
  'Reporte de Buró de Crédito (México). Extraé ÚNICAMENTE datos crudos de este documento.',
  '',
  '─── REGLA ANTI-GLOSARIO ───',
  'IGNORÁ completamente secciones de glosario, leyendas, definiciones, instructivos,',
  'notas al pie, textos legales, promocionales o explicativos. Ej: "¿Qué significa el',
  'histórico de pagos?", tablas de claves de observación, definiciones generales de Buró.',
  'Solo extraé datos de las secciones del acreditado: Resumen de Créditos, Detalle de',
  'Créditos, Datos del Acreditado, Detalle de Consultas.',
  '',
  '─── Datos del acreditado ───',
  'borrower.fullName: nombre en MAYÚSCULAS. borrower.birthDate: YYYY-MM-DD.',
  'borrower.rfc: RFC. borrower.lastReportedAddress: domicilio.',
  '',
  '─── Datos del reporte ───',
  'report.consultationDate: YYYY-MM-DD (Fecha de Consulta).',
  'report.numberOfInquiries: número de consultas 24 meses.',
  'report.publicScore: null (el score viene de documento separado "Mi Score").',
  '',
  '─── Créditos ───',
  'Extraé TODOS los créditos. El OCR tiene DOS partes por crédito:',
  '',
  'PARTE 1 — Línea de datos concatenados (Saldo, Máximo, Límite, Moneda, Fechas, etc.):',
  '  Ej: "30,283193,336150,000MXAGO-25AGO-03050,000NO APLICA"',
  '  Ej: "73,881307,825MXAGO-25JUL-09049,800NO APLICA"',
  '  El último número ANTES de "NO APLICA" es Monto Último Pago → lastPaymentAmount.',
  '  En los ejemplos: 50,000 y 49,800 son lastPaymentAmount.',
  '',
  'PARTE 2 — Línea de pago (SIEMPRE en renglones separados ABAJO de la línea concatenada):',
  '  Formato: [número] [texto descriptivo en mayúsculas en renglones separados]',
  '  Ej: "1,875\\nPAGO\\nMÍNIMO\\nPARA\\nCUENTAS\\nREVOLVE\\nNTES" → paymentDueAmount = 1875',
  '  Ej: "0\\nMENSUAL"                                          → paymentDueAmount = 0',
  '  Ej: "0\\nMENSUAL\\n36"                                     → paymentDueAmount = 0',
  '  Ej: "0\\nPAGO\\nMÍNIMO\\nPARA\\nCUENTAS\\nREVOLVE\\nNTES"  → paymentDueAmount = 0',
  '  REGLA: paymentDueAmount es el número de ESTA línea. El texto que sigue',
  '  ("MENSUAL", "PAGO MÍNIMO PARA CUENTAS REVOLVENTES") es solo decorativo, ignorá su valor.',
  '',
  'RESUMEN:',
  '  - lastPaymentAmount = último número de la línea concatenada (antes de NO APLICA).',
  '  - paymentDueAmount = número de la línea de pago separada (la que tiene texto debajo).',
  '  - NUNCA tomes un número de la línea concatenada como paymentDueAmount.',
  '',
  '  institution, creditType, classification (REVOLVING|FIXED_PAYMENT|MORTGAGE|AUTO|',
  '    PERSONAL_LOAN|DEPARTMENT_STORE|NON_BANK_SERVICE|UNKNOWN),',
  '  status (ACTIVE|CLOSED), currentBalance, creditLimit,',
  '  paymentDueAmount: número del OCR que viene con texto ("PAGO MÍNIMO", "MENSUAL").',
  '  lastPaymentAmount: número del OCR que está SOLO, sin texto descriptivo.',
  '  currency ("MXN" por defecto),',
  '  paymentHistory: string crudo del Histórico de Pagos, sin interpretar.',
  '  mopCodes: array de strings con códigos MOP del historial. Valores: 0-9, U, -.',
  '  observationKeys: array de strings con claves de observación que aparezcan',
  '    ASOCIADAS DIRECTAMENTE a este crédito (no del glosario). Ej: ["UP","LC"].',
  '  rawTextReference: texto original de la fila del crédito en el reporte.',
  '',
  '─── Flags booleanos por crédito ───',
  'hasLatePayments: true si hay MOP 2-3. MOP 0-1 NO es atraso. U y - NO son atraso.',
  'hasSeriousDelinquency: true si hay MOP 4,5,6,7,8,9.',
  'Los campos hasWriteOff, hasFraudFlag, hasSettlementOrDiscount, hasIdentityTheft',
  'deben ser null. El sistema los calcula a partir de observationKeys.',
  '',
  '─── NO generes ───',
  'NO generes alertas, riskSummary, ni flags de quebranto/fraude/quita.',
  'NO uses el glosario como fuente de datos.',
  'NO marques score (el campo publicScore es null).',
  '',
  '─── JSON VÁLIDO ───',
  'El JSON de salida DEBE ser parseable. Reglas estrictas:',
  '- paymentHistory debe ser un string ENTRE COMILLAS: "111000222".',
  '- mopCodes debe ser un array de strings: ["1","1","1","0","U"].',
  '- NUNCA pongas texto crudo del OCR fuera de comillas en el JSON.',
  '- El JSON debe cerrar correctamente con }.',
].join('\n');

// ---------------------------------------------------------------------------
// Alert severity and category enums
// ---------------------------------------------------------------------------
type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
type AlertCategory =
  | 'IDENTITY'
  | 'ADDRESS'
  | 'INCOME'
  | 'CREDIT_BUREAU'
  | 'BANK_STATEMENT'
  | 'DOCUMENT_QUALITY'
  | 'MANUAL_VALIDATION'
  | 'REQUIREMENT';

interface ExtractionAlert {
  code: string;
  severity: AlertSeverity;
  category: AlertCategory;
  message: string;
  field: string | null;
  requiresManualReview: boolean;
}

// ---------------------------------------------------------------------------
// Schema — output contract Gemini must fulfill (credit-bureau.schema.md v1.0)
// ---------------------------------------------------------------------------
const CREDIT_BUREAU_SCHEMA = {
  schemaVersion: '1.0',
  documentType: 'CREDIT_BUREAU_REPORT',
  extractionMetadata: {
    sourceDocumentId: null,
    mortgageCaseId: null,
    ocrProcessedAt: null,
    extractedAt: null,
    model: null,
    confidence: 0.0,
  },
  documentRequirementContext: {
    incomeBehavior: 'NOT_APPLICABLE',
    requiredPayrollReceiptMonths: null,
    requiredBankStatementMonths: null,
    detectedDocumentMonths: null,
    isRequirementSatisfied: null,
    requirementNotes: null,
  },
  borrower: {
    fullName: 'string | null',
    birthDate: 'YYYY-MM-DD | null',
    rfc: 'string | null',
    lastReportedAddress: 'string | null',
  },
  report: {
    consultationDate: 'YYYY-MM-DD | null',
    numberOfInquiries: 'number | null',
    publicScore: 'null — score is extracted from a separate Mi Score document',
  },
  credits: [
    {
      institution: 'string | null',
      creditType: 'string | null',
      classification:
        'REVOLVING | FIXED_PAYMENT | MORTGAGE | AUTO | PERSONAL_LOAN | DEPARTMENT_STORE | NON_BANK_SERVICE | UNKNOWN',
      status: 'ACTIVE | CLOSED | UNKNOWN',
      currentBalance: 'number | null',
      paymentDueAmount: 'number | null — "Monto a Pagar". El OCR incluye texto como "PAGO MÍNIMO" o "MENSUAL" junto al número. Extraé solo el número.',
      lastPaymentAmount: 'number | null — "Monto Último Pago". El OCR muestra solo números limpios, sin texto descriptivo.',
      creditLimit: 'number | null',
      currency: 'MXN',
      paymentHistory: 'string | null',
      mopCodes: [],
      observationKeys: [],
      hasLatePayments: 'boolean | null',
      hasSeriousDelinquency: 'boolean | null',
      hasWriteOff: 'boolean | null — solo si aparece clave UP asociada al crédito',
      hasSettlementOrDiscount: 'boolean | null — solo si aparece clave LC o LG asociada al crédito',
      hasFraudFlag: 'boolean | null — solo si aparece clave FD asociada al crédito',
      hasIdentityTheft: 'boolean | null — solo si aparece clave RI asociada al crédito',
      isClosed: 'boolean | null',
      monthlyDebtContribution: 'number | null',
      rawTextReference: 'string | null',
    },
  ],
  riskSummary: {
    hasWriteOff: 'boolean | null',
    hasSettlementOrDiscount: 'boolean | null',
    hasFraudFlag: 'boolean | null',
    hasIdentityTheft: 'boolean | null',
    hasMinorDelinquency: 'boolean | null',
    hasSeriousDelinquency: 'boolean | null',
    hasPreventiveKeys: 'boolean | null',
    possibleHomonym: 'boolean | null',
    riskNotes: 'string | null',
  },
  missingFields: [],
};

// ---------------------------------------------------------------------------
// Mi Score exclusion codes mapping (used by CreditScoreExtractionService)
// ---------------------------------------------------------------------------
export const SCORE_EXCLUSION_REASONS: Record<number, string> = {
  [-1]: 'Consumidor difunto',
  [-5]:
    'Todas las cuentas cerradas, al menos una con morosidad de 90+ días (MOP>=04)',
  [-6]:
    'Cuentas abiertas en los últimos 6 meses, al menos una con morosidad de 60+ días (MOP>=03)',
  [-7]:
    'Cuentas abiertas en los últimos 6 meses, al menos una con morosidad de 30+ días (MOP>=02)',
  [-8]:
    'Sin cuenta actualizada en los últimos 12 meses o abierta en los últimos 6 meses (Criterios Mínimos de Calificación)',
  [-9]: 'Sin cuentas para calcular Mi Score',
};

// ---------------------------------------------------------------------------
// Valid MOP codes
// ---------------------------------------------------------------------------
const VALID_MOP_CODES = new Set([
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  'U',
  '-',
]);

// ---------------------------------------------------------------------------
// Extraction result envelope
// ---------------------------------------------------------------------------
export interface CreditBureauExtractionResult {
  success: boolean;
  documentId: string;
  extractedData: Record<string, unknown> | null;
  alerts: ExtractionAlert[];
  missingFields: string[];
  error?: { code: string; message: string };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
@Injectable()
export class CreditBureauExtractionService {
  private readonly logger = new Logger(CreditBureauExtractionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geminiService: GeminiService,
  ) {}

  static isCreditBureauDocument(documentTypeCode: string): boolean {
    return CREDIT_BUREAU_DOC_TYPES.includes(documentTypeCode);
  }

  async extract(
    caseId: string,
    documentId: string,
  ): Promise<CreditBureauExtractionResult> {
    // ── 1. Fetch document with type + status ───────────────────────────
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { documentType: true, documentStatus: true },
    });
    if (!document || document.mortgageCaseId !== caseId) {
      throw new Error('Document not found');
    }

    // ── 2. Status gate: allow PROCESSED and EXTRACTION_ERROR (retry) ──
    const statusCode = document.documentStatus.code;
    if (statusCode !== 'PROCESSED' && statusCode !== 'EXTRACTION_ERROR') {
      return {
        success: false,
        documentId,
        extractedData: null,
        alerts: [],
        missingFields: [],
        error: {
          code: 'DOCUMENT_NOT_PROCESSED',
          message:
            'El documento debe estar procesado (OCR) antes de la extracción.',
        },
      };
    }

    // ── 3. Guard: document type must be CREDIT_BUREAU_REPORT ──────────
    if (document.documentType.code !== 'CREDIT_BUREAU_REPORT') {
      return {
        success: false,
        documentId,
        extractedData: null,
        alerts: [],
        missingFields: [],
        error: {
          code: 'DOCUMENT_TYPE_MISMATCH',
          message:
            'El documento no es un reporte de buró de crédito (CREDIT_BUREAU_REPORT).',
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
        missingFields: [],
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

    // ── 6. Truncate OCR text if excessively large ───────────────────────
    // Bureau reports can be 20+ pages. Gemini has input token limits and
    // performance degrades with very large inputs. Keep the first 30K chars
    // which typically contain the summary and credit detail sections.
    const MAX_OCR_CHARS = 30000;
    const ocrText = document.ocrText.length > MAX_OCR_CHARS
      ? document.ocrText.slice(0, MAX_OCR_CHARS) +
        `\n\n[OCR truncado — ${document.ocrText.length - MAX_OCR_CHARS} caracteres omitidos del final]`
      : document.ocrText;

    // ── 7. Call Gemini with specialized instructions ────────────────────
    const geminiResult = await this.geminiService.extractStructuredData(
      ocrText,
      document.documentType.code,
      { ...CREDIT_BUREAU_SCHEMA },
      CREDIT_BUREAU_INSTRUCTIONS,
    );

    if (!geminiResult.success) {
      this.logger.warn(
        `[CreditBureau] Gemini extraction failed for doc ${documentId}: ${geminiResult.error?.code}`,
      );

      try {
        await this.prisma.document.update({
          where: { id: documentId },
          data: { documentStatusId: extractionErrorStatus.id },
        });
      } catch (dbError) {
        this.logger.error(
          `[CreditBureau] Failed to set EXTRACTION_ERROR status for doc ${documentId}: ${(dbError as Error).message}`,
        );
      }

      return {
        success: false,
        documentId,
        extractedData: geminiResult.extractedData,
        alerts: [],
        missingFields: [],
        error: geminiResult.error
          ? {
              code: geminiResult.error.code,
              message: geminiResult.error.message,
            }
          : { code: 'UNKNOWN', message: 'Extraction failed' },
      };
    }

    const data = geminiResult.extractedData as Record<string, unknown>;

    // ── 7. Normalize credit bureau fields ──────────────────────────────
    this.normalizeCreditBureau(data);

    // ── 8. Compute alerts deterministically from normalized data ─────────
    // Alerts are computed entirely in the backend. Gemini extracts raw data only.
    data.alerts = this.computeAlerts(data);
    const missingFields = this.computeMissingFields(data);

    if (Array.isArray(data.missingFields)) {
      const existingFields: string[] = (data.missingFields as unknown[]).filter(
        (f): f is string => typeof f === 'string',
      );
      data.missingFields = [
        ...existingFields,
        ...missingFields.filter((f) => !existingFields.includes(f)),
      ];
    } else {
      data.missingFields = missingFields;
    }

    data.alerts = this.normalizeAlerts(
      (data.alerts as ExtractionAlert[]) ?? [],
    );

    // ── 10. Persist extractedData + status atomically ──────────────────
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
      alerts: data.alerts as ExtractionAlert[],
      missingFields,
    };
  }

  // -----------------------------------------------------------------------
  // Private: check if rawTextReference contains an observation key
  // Matches standalone 2-letter codes (word boundaries), not substrings.
  // -----------------------------------------------------------------------

  private rawHasObservationKey(
    upperRaw: string,
    keys: string[],
  ): boolean {
    if (!upperRaw) return false;
    for (const key of keys) {
      // Match key as a standalone token (surrounded by non-letter chars or string edges)
      const re = new RegExp(`(?<![A-ZÑ])${key}(?![A-ZÑ])`, 'u');
      if (re.test(upperRaw)) return true;
    }
    return false;
  }

  /**
   * Extracts 2-3 character uppercase observation keys from raw text.
   * Used as legacy fallback when observationKeys array is not provided by Gemini.
   * Only extracts keys from a known set to avoid false positives from glossary text.
   */
  private extractObservationKeys(upperRaw: string): string[] {
    const KNOWN_KEYS = [
      'UP', 'LC', 'LG', 'FD', 'FR', 'SG', 'CV', 'PC', 'VR', 'RV',
      'RI', 'FN', 'CO', 'AD', 'CL', 'CC', 'IA',
    ];
    const found = new Set<string>();
    for (const key of KNOWN_KEYS) {
      const re = new RegExp(`(?<![A-ZÑ])${key}(?![A-ZÑ])`, 'u');
      if (re.test(upperRaw)) found.add(key);
    }
    return Array.from(found);
  }

  // -----------------------------------------------------------------------
  // Private: normalize credit bureau fields post-Gemini
  // -----------------------------------------------------------------------

  private normalizeCreditBureau(data: Record<string, unknown>): void {
    const credits = data.credits as Record<string, unknown>[] | undefined;
    const report = (data.report ?? {}) as Record<string, unknown>;

    // ── Score normalization ──────────────────────────────────────────────
    // ISO-001/002/003 + SCO-001/002/003: Score is extracted from a separate
    // CREDIT_SCORE document. The bureau report MUST NOT carry a score value.
    // Force publicScore to null regardless of what Gemini returns, so no
    // score bleed happens and no score-related alerts fire from bureau.
    if (report.publicScore != null) {
      this.logger.warn(
        `[CreditBureau] Ignoring publicScore from bureau report (score belongs to CREDIT_SCORE doc)`,
      );
      report.publicScore = null;
    }

    // ── Credits normalization ────────────────────────────────────────────
    if (Array.isArray(credits)) {
      for (const credit of credits) {
        // Normalize currency
        const currency = (credit.currency as string | undefined) ?? null;
        if (!currency || currency.trim() === '') {
          credit.currency = 'MXN';
        } else {
          const normalized = currency.toUpperCase().trim();
          if (!['MXN', 'USD', 'OTHER'].includes(normalized)) {
            credit.currency = 'OTHER';
          } else {
            credit.currency = normalized;
          }
        }

        // Validate MOP codes and deduplicate consecutive repeats (OCR ghosts)
        const mopCodes = credit.mopCodes as string[] | undefined;
        if (Array.isArray(mopCodes)) {
          const validCodes = mopCodes
            .map((mop) => String(mop).trim())
            .filter((code) => VALID_MOP_CODES.has(code) || /^\d$/.test(code));
          // Deduplicate consecutive identical codes (OCR often repeats adjacent cells)
          const deduped: string[] = [];
          for (const code of validCodes) {
            if (deduped.length === 0 || deduped[deduped.length - 1] !== code) {
              deduped.push(code);
            }
          }
          credit.mopCodes = deduped;
        }

        // Compute boolean flags from MOP + observation keys if not already set
        const codes = Array.isArray(mopCodes)
          ? mopCodes.map((c) => String(c).trim())
          : [];
        const rawText = (credit.rawTextReference as string) ?? '';
        const upperRaw = rawText.toUpperCase();

        // Normalize observationKeys: prefer the array, fall back to rawTextReference
        let obsKeys: string[] = [];
        if (Array.isArray(credit.observationKeys)) {
          obsKeys = credit.observationKeys
            .map((k: unknown) => String(k).toUpperCase().trim())
            .filter((k) => k.length >= 2 && k.length <= 3);
        } else if (upperRaw) {
          // Legacy fallback: extract 2-3 char uppercase keys from rawTextReference
          obsKeys = this.extractObservationKeys(upperRaw);
        }
        credit.observationKeys = obsKeys;

        // hasLatePayments: any MOP >= 2 (MOP 0-1 are "al corriente", not late)
        if (credit.hasLatePayments == null) {
          credit.hasLatePayments = codes.some((c) =>
            ['2', '3', '4', '5', '6', '7', '8', '9'].includes(c),
          );
        }

        // hasSeriousDelinquency: any MOP >= 4 (90+ days)
        if (credit.hasSeriousDelinquency == null) {
          credit.hasSeriousDelinquency = codes.some((c) =>
            ['4', '5', '6', '7', '8', '9'].includes(c),
          );
        }

        // hasWriteOff: ONLY observation key UP (quebranto)
        if (credit.hasWriteOff == null) {
          credit.hasWriteOff = obsKeys.includes('UP') ||
            this.rawHasObservationKey(upperRaw, ['UP']);
        }

        // hasSettlementOrDiscount: observation keys LC or LG (quita)
        if (credit.hasSettlementOrDiscount == null) {
          credit.hasSettlementOrDiscount = obsKeys.includes('LC') ||
            obsKeys.includes('LG') ||
            this.rawHasObservationKey(upperRaw, ['LC', 'LG']);
        }

        // hasFraudFlag: ONLY observation key FD
        if (credit.hasFraudFlag == null) {
          credit.hasFraudFlag = obsKeys.includes('FD') ||
            this.rawHasObservationKey(upperRaw, ['FD']);
        }

        // hasIdentityTheft: observation key RI (NOT fraud)
        if (credit.hasIdentityTheft == null) {
          credit.hasIdentityTheft = obsKeys.includes('RI') ||
            this.rawHasObservationKey(upperRaw, ['RI']);
        }

        // Validate classification enum
        const validClassifications = [
          'REVOLVING',
          'FIXED_PAYMENT',
          'MORTGAGE',
          'AUTO',
          'PERSONAL_LOAN',
          'DEPARTMENT_STORE',
          'NON_BANK_SERVICE',
          'UNKNOWN',
        ];
        if (
          credit.classification &&
          !validClassifications.includes(credit.classification as string)
        ) {
          credit.classification = 'UNKNOWN';
        }

        // Validate status enum
        const validStatuses = ['ACTIVE', 'CLOSED', 'UNKNOWN'];
        if (
          credit.status &&
          !validStatuses.includes(credit.status as string)
        ) {
          credit.status = 'UNKNOWN';
        }

        // ── isClosed + monthlyDebtContribution (CLS-001/002/003/004) ──────────
        credit.isClosed = credit.status === 'CLOSED';
        if (credit.isClosed) {
          credit.monthlyDebtContribution = 0;
        } else if (credit.status === 'ACTIVE') {
          credit.monthlyDebtContribution =
            (credit.paymentDueAmount as number | null) ?? null;
        } else {
          credit.monthlyDebtContribution = null;
        }

        // ── Payment fields: coerce to number | null (PAY-003) ────────────
        if (
          credit.paymentDueAmount != null &&
          typeof credit.paymentDueAmount !== 'number'
        ) {
          credit.paymentDueAmount = null;
        }
        if (credit.paymentDueAmount == null) {
          credit.paymentDueAmount = null;
        }
        if (
          credit.lastPaymentAmount != null &&
          typeof credit.lastPaymentAmount !== 'number'
        ) {
          credit.lastPaymentAmount = null;
        }
        if (credit.lastPaymentAmount == null) {
          credit.lastPaymentAmount = null;
        }

        // ── PAY-004: Detect suspicious identical values (likely misclassified) ─
        // Only warn when both are non-zero and equal. Zero is legitimate for
        // closed credits or credits with no payment activity.
        if (
          credit.paymentDueAmount != null &&
          credit.lastPaymentAmount != null &&
          credit.paymentDueAmount !== 0 &&
          credit.lastPaymentAmount !== 0 &&
          credit.paymentDueAmount === credit.lastPaymentAmount
        ) {
          this.logger.warn(
            `[CreditBureau] Suspicious: paymentDueAmount === lastPaymentAmount ` +
              `(${credit.paymentDueAmount}) for ${credit.institution ?? 'unknown'}. ` +
              `Gemini may have misclassified the payment column. ` +
              `Verify against the original PDF — these are likely the same value ` +
              `extracted into both fields.`,
          );
        }
      }
    }

    // ── Risk summary: ensure booleans from credits ───────────────────────
    const riskSummary = (data.riskSummary ?? {}) as Record<string, unknown>;
    if (Array.isArray(credits) && credits.length > 0) {
      if (riskSummary.hasWriteOff == null) {
        riskSummary.hasWriteOff = credits.some(
          (c) => c.hasWriteOff === true,
        );
      }
      if (riskSummary.hasSettlementOrDiscount == null) {
        riskSummary.hasSettlementOrDiscount = credits.some(
          (c) => c.hasSettlementOrDiscount === true,
        );
      }
      if (riskSummary.hasFraudFlag == null) {
        riskSummary.hasFraudFlag = credits.some(
          (c) => c.hasFraudFlag === true,
        );
      }
      if (riskSummary.hasIdentityTheft == null) {
        riskSummary.hasIdentityTheft = credits.some(
          (c) => c.hasIdentityTheft === true,
        );
      }
      if (riskSummary.hasMinorDelinquency == null) {
        riskSummary.hasMinorDelinquency = credits.some(
          (c) => c.hasLatePayments === true && c.hasSeriousDelinquency !== true,
        );
      }
      if (riskSummary.hasSeriousDelinquency == null) {
        riskSummary.hasSeriousDelinquency = credits.some(
          (c) => c.hasSeriousDelinquency === true,
        );
      }
    }

    data.riskSummary = riskSummary;
  }

  // -----------------------------------------------------------------------
  // Private: alert computation — BURO_ codes
  // -----------------------------------------------------------------------

  private computeAlerts(data: Record<string, unknown>): ExtractionAlert[] {
    const alerts: ExtractionAlert[] = [];

    const credits = data.credits as Record<string, unknown>[] | undefined;
    const report = (data.report ?? {}) as Record<string, unknown>;
    const riskSummary = (data.riskSummary ?? {}) as Record<string, unknown>;
    const borrower = (data.borrower ?? {}) as Record<string, unknown>;

    // ── BURO_NO_CREDITS — credits[] empty ────────────────────────────────
    const hasCredits = Array.isArray(credits) && credits.length > 0;
    if (!hasCredits) {
      alerts.push({
        code: 'BURO_NO_CREDITS',
        severity: 'WARNING',
        category: 'CREDIT_BUREAU',
        message:
          'No se detectaron créditos en el reporte de buró. Verificar que el OCR haya extraído correctamente.',
        field: 'credits',
        requiresManualReview: true,
      });
    }

    // ── BURO_SERIOUS_DELINQUENCY — any credit with MOP >= 4 ──────────────
    if (riskSummary.hasSeriousDelinquency === true) {
      alerts.push({
        code: 'BURO_SERIOUS_DELINQUENCY',
        severity: 'CRITICAL',
        category: 'CREDIT_BUREAU',
        message:
          'Se detectaron créditos con morosidad grave (90+ días de atraso). Revisar detalle de créditos.',
        field: 'credits[].hasSeriousDelinquency',
        requiresManualReview: true,
      });
    }

    // ── BURO_WRITE_OFF — any credit with quebranto ───────────────────────
    if (riskSummary.hasWriteOff === true) {
      alerts.push({
        code: 'BURO_WRITE_OFF',
        severity: 'CRITICAL',
        category: 'CREDIT_BUREAU',
        message:
          'Se detectaron créditos con quebranto (pérdida total para el otorgante). Riesgo crediticio severo.',
        field: 'credits[].hasWriteOff',
        requiresManualReview: true,
      });
    }

    // ── BURO_SETTLEMENT_OR_DISCOUNT — any credit with quita ──────────────
    if (riskSummary.hasSettlementOrDiscount === true) {
      alerts.push({
        code: 'BURO_SETTLEMENT_OR_DISCOUNT',
        severity: 'CRITICAL',
        category: 'CREDIT_BUREAU',
        message:
          'Se detectaron créditos con quita o descuento (clave LC/LG). Implica acuerdo de pago reducido.',
        field: 'credits[].hasSettlementOrDiscount',
        requiresManualReview: true,
      });
    }

    // ── BURO_FRAUD — any credit with fraud flag ──────────────────────────
    if (riskSummary.hasFraudFlag === true) {
      alerts.push({
        code: 'BURO_FRAUD_FLAG',
        severity: 'CRITICAL',
        category: 'CREDIT_BUREAU',
        message:
          'Se detectó marca de fraude en al menos un crédito. Requiere investigación inmediata.',
        field: 'credits[].hasFraudFlag',
        requiresManualReview: true,
      });
    }

    // ── BURO_PREVENTIVE_KEYS — claves de observación de riesgo ──────────
    if (riskSummary.hasPreventiveKeys === true) {
      alerts.push({
        code: 'BURO_PREVENTIVE_KEYS',
        severity: 'WARNING',
        category: 'CREDIT_BUREAU',
        message:
          'Se detectaron claves de observación preventivas (quita, cobranza, reestructura, etc.). Revisar detalle.',
        field: 'riskSummary.hasPreventiveKeys',
        requiresManualReview: true,
      });
    }

    // ── BURO_MINOR_DELINQUENCY — atrasos leves ──────────────────────────
    if (
      riskSummary.hasMinorDelinquency === true &&
      riskSummary.hasSeriousDelinquency !== true
    ) {
      alerts.push({
        code: 'BURO_MINOR_DELINQUENCY',
        severity: 'WARNING',
        category: 'CREDIT_BUREAU',
        message:
          'Se detectaron atrasos menores (1-89 días) en algunos créditos. No es crítico pero revisar.',
        field: 'credits[].hasLatePayments',
        requiresManualReview: false,
      });
    }

    // ── BURO_MISSING_BORROWER — borrower info incomplete ─────────────────
    const fullName = borrower.fullName as string | undefined | null;
    const rfc = borrower.rfc as string | undefined | null;
    if (!fullName || fullName.trim() === '') {
      alerts.push({
        code: 'BURO_MISSING_BORROWER_NAME',
        severity: 'WARNING',
        category: 'IDENTITY',
        message:
          'No se pudo extraer el nombre del acreditado del reporte de buró.',
        field: 'borrower.fullName',
        requiresManualReview: true,
      });
    }
    if (!rfc || rfc.trim() === '') {
      alerts.push({
        code: 'BURO_MISSING_BORROWER_RFC',
        severity: 'WARNING',
        category: 'IDENTITY',
        message:
          'No se pudo extraer el RFC del acreditado del reporte de buró.',
        field: 'borrower.rfc',
        requiresManualReview: true,
      });
    }

    // ── BURO_HOMONYM — possible homonym ──────────────────────────────────
    if (riskSummary.possibleHomonym === true) {
      alerts.push({
        code: 'BURO_POSSIBLE_HOMONYM',
        severity: 'WARNING',
        category: 'CREDIT_BUREAU',
        message:
          'Posible homónimo detectado. Créditos en el reporte podrían no corresponder al acreditado.',
        field: 'riskSummary.possibleHomonym',
        requiresManualReview: true,
      });
    }

    // ── BURO_ACTIVE_CREDITS_COUNT — count active credits ─────────────────
    if (Array.isArray(credits)) {
      const activeCredits = credits.filter(
        (c) => c.status === 'ACTIVE',
      );
      const revolvingWithBalance = credits.filter(
        (c) =>
          c.classification === 'REVOLVING' &&
          c.status === 'ACTIVE' &&
          c.currentBalance != null &&
          (c.currentBalance as number) > 0,
      );

      if (activeCredits.length > 5) {
        alerts.push({
          code: 'BURO_HIGH_CREDIT_COUNT',
          severity: 'INFO',
          category: 'CREDIT_BUREAU',
          message: `El acreditado tiene ${activeCredits.length} créditos activos. Considerar nivel de endeudamiento.`,
          field: 'credits',
          requiresManualReview: false,
        });
      }

      if (revolvingWithBalance.length > 3) {
        alerts.push({
          code: 'BURO_HIGH_REVOLVING_COUNT',
          severity: 'INFO',
          category: 'CREDIT_BUREAU',
          message: `El acreditado tiene ${revolvingWithBalance.length} créditos revolventes activos con saldo.`,
          field: 'credits',
          requiresManualReview: false,
        });
      }
    }

    // ── BURO_MISSING_BALANCE — active credits without currentBalance (null only) ─
    // BAL-001: null triggers alert. BAL-002: 0 does NOT trigger (explicitly zero).
    // BAL-003: write-off credits excluded from balance alert.
    if (Array.isArray(credits)) {
      const activeWithoutBalance = credits.filter(
        (c) =>
          c.status === 'ACTIVE' &&
          c.currentBalance == null &&
          c.hasWriteOff !== true,
      );
      if (activeWithoutBalance.length > 0) {
        alerts.push({
          code: 'BURO_MISSING_BALANCE',
          severity: 'WARNING',
          category: 'CREDIT_BUREAU',
          message: `Hay ${activeWithoutBalance.length} crédito(s) activo(s) sin saldo actual detectable. Verificar montos.`,
          field: 'credits[].currentBalance',
          requiresManualReview: true,
        });
      }
    }

    return alerts;
  }

  // -----------------------------------------------------------------------
  // Private: missing field detection
  // -----------------------------------------------------------------------

  private computeMissingFields(data: Record<string, unknown>): string[] {
    const missing: string[] = [];
    const borrower = (data.borrower ?? {}) as Record<string, unknown>;
    const report = (data.report ?? {}) as Record<string, unknown>;

    // Borrower
    if (
      !borrower.fullName ||
      (borrower.fullName as string)?.trim() === ''
    ) {
      missing.push('borrower.fullName');
    }
    if (!borrower.rfc || (borrower.rfc as string)?.trim() === '') {
      missing.push('borrower.rfc');
    }

    // Report
    if (!report.consultationDate) {
      missing.push('report.consultationDate');
    }
    // NOTE: report.publicScore is NOT a missing field — score is optional in
    // bureau-only extraction (it comes from a separate CREDIT_SCORE document).
    // See SCO-001/002/003.

    return missing;
  }

  // -----------------------------------------------------------------------
  // Private: normalize alerts to Spanish
  // -----------------------------------------------------------------------

  private normalizeAlerts(alerts: ExtractionAlert[]): ExtractionAlert[] {
    return alerts.map((a) => {
      const map: Record<string, string> = {
        'No credits found in report.':
          'No se detectaron créditos en el reporte.',
        'Serious delinquency detected.':
          'Se detectó morosidad grave.',
        'Write-off detected.':
          'Se detectó crédito con quebranto.',
        'Fraud flag detected.':
          'Se detectó marca de fraude.',
        'Preventive observation keys detected.':
          'Se detectaron claves de observación preventivas.',
        'Low credit score.':
          'Mi Score bajo detectado.',
        'Missing borrower information.':
          'Falta información del acreditado.',
      };
      const tr = map[a.message];
      return tr ? { ...a, message: tr } : a;
    });
  }

}
