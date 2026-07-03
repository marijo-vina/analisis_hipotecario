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
  'Reporte de Buró de Crédito Especial (México) para análisis hipotecario.',
  '',
  'El documento puede tener CUALQUIER formato, layout o disposición de campos.',
  'Analizá TODO el texto OCR, incluyendo el Resumen de Créditos y el Detalle de Créditos.',
  '',
  '─── REGLA DE ORO — AISLAMIENTO DE CONTEXTO ───',
  'NO inventes datos. Ante cualquier duda, usá null.',
  'Extraé ÚNICAMENTE de la información presente en el OCR de ESTE documento.',
  'NUNCA infieras ni referencies datos de otros documentos del expediente.',
  'Extract ONLY from this document\'s text. Never infer or cross-reference other documents.',
  '',
  '─── IMPORTANTE: Score (Mi Score) ───',
  'Este documento es el Reporte de Buró. El score (Mi Score) proviene de un documento',
  'SEPARADO ("Mi Score"). NO extraigas, infieras ni reportes ningún valor de score aquí.',
  'El campo report.publicScore SIEMPRE debe ser null en este reporte.',
  'NO generes ninguna alerta relacionada con score (BURO_SCORE_LOW, etc.).',
  '',
  '─── Datos del acreditado (borrower) ───',
  '  fullName: nombre completo del titular del reporte. Normalizar a MAYÚSCULAS.',
  '  birthDate: fecha de nacimiento YYYY-MM-DD.',
  '  rfc: RFC del acreditado.',
  '  lastReportedAddress: último domicilio reportado en el buró.',
  '',
  '─── Datos del reporte (report) ───',
  '  consultationDate: fecha de consulta (Fecha de Consulta). YYYY-MM-DD.',
  '  numberOfInquiries: número total de consultas en los últimos 24 meses (Detalle de Consultas).',
  '  publicScore: SIEMPRE null. El score se extrae del documento "Mi Score" por separado.',
  '',
  '─── Créditos (credits[]) ───',
  '  Extraé TODOS los créditos del reporte (Resumen y Detalle). Para cada uno:',
  '',
  '  institution: nombre del otorgante (BBVA, BANORTE, SANTANDER, AMEX, etc.).',
  '',
  '  creditType: tipo de crédito según el reporte (TARJETA DE CREDITO, AUTOMOTRIZ,',
  '    HIPOTECARIO, PERSONAL, TELEFONIA CELULAR, etc.).',
  '',
  '  classification: clasificación del crédito:',
  '    "REVOLVING" — tarjetas de crédito, líneas de crédito revolventes.',
  '    "FIXED_PAYMENT" — créditos con pagos fijos (personales, automotrices).',
  '    "MORTGAGE" — créditos hipotecarios o de bienes raíces.',
  '    "AUTO" — créditos automotrices.',
  '    "PERSONAL_LOAN" — préstamos personales.',
  '    "DEPARTMENT_STORE" — créditos de tiendas departamentales.',
  '    "NON_BANK_SERVICE" — servicios no bancarios (telefonía, TV por cable).',
  '    "UNKNOWN" — cuando no se puede determinar.',
  '',
  '  status: "ACTIVE" si el crédito está abierto/vigente, "CLOSED" si está cerrado.',
  '    "UNKNOWN" si no se puede determinar.',
  '',
  '  currentBalance: saldo actual reportado. Número decimal sin $ ni comas.',
  '  paymentDueAmount: "Monto a Pagar". Monto del próximo pago a realizar.',
  '    Número decimal sin $ ni comas.',
  '  lastPaymentAmount: "Monto Último Pago". Monto del último pago realizado.',
  '    Número decimal sin $ ni comas.',
  '  creditLimit: límite de crédito (para revolventes). Número decimal sin $ ni comas.',
  '    null para créditos no revolventes.',
  '',
  '  currency: "MXN" por defecto. "USD" si se detecta en dólares. "OTHER" para otras.',
  '',
  '  paymentHistory: historial de pagos como string (ej. "111111222333").',
  '    Cada dígito/carácter representa un mes en el Histórico de Pagos.',
  '    Extraer la cadena completa tal como aparece, SIN interpretar.',
  '',
  '  mopCodes: array de strings con los códigos MOP únicos detectados en el historial.',
  '    Los valores posibles son: "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "U", "-".',
  '    Significado de códigos MOP (Forma de Pago):',
  '      0 o vacío = Al corriente',
  '      1 = Atraso de 1 a 29 días',
  '      2 = Atraso de 30 a 59 días',
  '      3 = Atraso de 60 a 89 días',
  '      4 = Atraso de 90 a 119 días',
  '      5 = Atraso de 120 a 149 días',
  '      6 = Atraso de 150 días hasta 12 meses',
  '      7 = Atraso de más de 12 meses',
  '      8 = Deuda parcial o total sin recuperar (quebranto)',
  '      9 = Fraude cometido por el consumidor',
  '      U = Cuenta no reportada en este periodo',
  '      - = Cuenta sin información',
  '',
  '  hasLatePayments: true si hay algún MOP >= 2 en el historial (30+ días de atraso).',
  '    MOP 0-1 NO cuenta como atraso (0=al corriente, 1=1-29 días, considerado al corriente).',
  '  hasSeriousDelinquency: true si hay algún MOP >= 4 (90+ días de atraso).',
  '  hasWriteOff: true si hay MOP 8 o clave de observación LC/UP (cuenta que causa quebranto).',
  '    También si aparece clave CV (vencida vendida),',
  '    VR (dación en pago), PC (cobranza).',
  '  hasFraudFlag: true si hay MOP 9 o clave FD (cuenta fraudulenta).',
  '  hasIdentityTheft: true si aparece clave RI (robo de identidad). NO es fraude.',
  '',
  '  rawTextReference: texto original de referencia del reporte para este crédito.',
  '',
  '─── Claves de Observación importantes ───',
  '  El reporte puede incluir claves de observación por crédito. Las más relevantes para riesgo:',
  '  UP = Cuenta que causa quebranto (pérdida total) → CRÍTICO → hasWriteOff',
  '  LC = Convenio de finiquito / quita → ALTO RIESGO → hasWriteOff',
  '  FD = Cuenta fraudulenta → CRÍTICO → hasFraudFlag',
  '  FR = Adjudicación de inmueble por morosidad → CRÍTICO',
  '  SG = Demanda del otorgante → CRÍTICO',
  '  CV = Cuenta vencida vendida → ALTO RIESGO → hasWriteOff',
  '  PC = Cuenta en cobranza → ALTO RIESGO → hasWriteOff',
  '  VR = Dación en pago → ALTO RIESGO → hasWriteOff',
  '  LG = Pago menor por programa institucional',
  '  RV = Cuenta reestructurada',
  '  RI = Robo de identidad (no atribuible al consumidor) → hasIdentityTheft (NO es fraude)',
  '  FN = Fraude no atribuible al consumidor',
  '  CO = Crédito en controversia',
  '  AD = Cuenta o monto ante aclaración',
  '  CL = Cuenta en cobranza pagada totalmente sin quebranto',
  '  CC = Cuenta cancelada o cerrada',
  '  IA = Cuenta inactiva',
  '',
  '  Incluí las claves detectadas como contexto en rawTextReference o deducí las flags correspondientes.',
  '',
  '─── Resumen de riesgo (riskSummary) ───',
  '  hasWriteOff: true si ALGÚN crédito tiene MOP 8 o clave UP/LC/CV/VR.',
  '  hasFraudFlag: true si ALGÚN crédito tiene MOP 9 o clave FD.',
  '  hasIdentityTheft: true si ALGÚN crédito tiene clave RI.',
  '  hasMinorDelinquency: true si ALGÚN crédito tiene MOP 2-3 (30-89 días).',
  '  hasSeriousDelinquency: true si ALGÚN crédito tiene MOP >= 4 (90+ días de atraso).',
  '  hasPreventiveKeys: true si hay claves de observación de riesgo:',
  '    UP, FD, FR, SG, LC, CV, PC, VR, LG, RV.',
  '  possibleHomonym: true si el nombre/RFC/dirección no coincide con lo esperado',
  '    o aparecen créditos que no parecen corresponder al acreditado.',
  '    null si no se puede determinar (requiere comparación externa).',
  '  riskNotes: notas de resumen sobre el perfil de riesgo detectado.',
  '',
  '─── Reglas de alertas ───',
  '  Generá alertas del backend para los siguientes casos:',
  '  - Créditos con MOP >= 4 (serious delinquency): alerta.',
  '  - Créditos con quebranto o fraude: alerta CRÍTICA.',
  '  - Sin créditos detectados: alerta.',
  '  NO generes alertas relacionadas con score (score se procesa por separado).',
  '  NO generes alertas duplicadas. Las alertas serán validadas y filtradas en post-procesamiento.',
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
      paymentDueAmount: 'number | null — "Monto a Pagar"',
      lastPaymentAmount: 'number | null — "Monto Último Pago"',
      creditLimit: 'number | null',
      currency: 'MXN',
      paymentHistory: 'string | null',
      mopCodes: [],
      hasLatePayments: 'boolean | null',
      hasSeriousDelinquency: 'boolean | null',
      hasWriteOff: 'boolean | null',
      hasFraudFlag: 'boolean | null',
      hasIdentityTheft: 'boolean | null',
      isClosed: 'boolean | null',
      monthlyDebtContribution: 'number | null',
      rawTextReference: 'string | null',
    },
  ],
  riskSummary: {
    hasWriteOff: 'boolean | null',
    hasFraudFlag: 'boolean | null',
    hasIdentityTheft: 'boolean | null',
    hasMinorDelinquency: 'boolean | null',
    hasSeriousDelinquency: 'boolean | null',
    hasPreventiveKeys: 'boolean | null',
    possibleHomonym: 'boolean | null',
    riskNotes: 'string | null',
  },
  missingFields: [],
  alerts: [],
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

    // ── 6. Call Gemini with specialized instructions ────────────────────
    const geminiResult = await this.geminiService.extractStructuredData(
      document.ocrText,
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

    // ── 8. Compute alerts from normalized data ─────────────────────────
    const alerts = this.computeAlerts(data);
    const missingFields = this.computeMissingFields(data);

    // ── 9. Merge + dedup + filter contradictions ──────────────────────
    this.normalizeGeminiAlertCodes(data);

    const existingCodes = new Set<string>();
    if (Array.isArray(data.alerts)) {
      for (const a of data.alerts as ExtractionAlert[]) {
        if (a.code) existingCodes.add(a.code);
      }
      const newAlerts = alerts.filter((a) => !existingCodes.has(a.code));
      data.alerts = [...(data.alerts as ExtractionAlert[]), ...newAlerts];
    } else {
      data.alerts = alerts;
    }

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

        // Validate MOP codes
        const mopCodes = credit.mopCodes as string[] | undefined;
        if (Array.isArray(mopCodes)) {
          credit.mopCodes = mopCodes.filter((mop) => {
            const code = String(mop).trim();
            return VALID_MOP_CODES.has(code) || /^\d$/.test(code);
          });
        }

        // Compute boolean flags from MOP + observation keys if not already set
        const codes = Array.isArray(mopCodes)
          ? mopCodes.map((c) => String(c).trim())
          : [];
        const rawText = (credit.rawTextReference as string) ?? '';
        const upperRaw = rawText.toUpperCase();

        // hasLatePayments: any MOP >= 2 (MOP 0-1 are "al corriente", not late)
        if (credit.hasLatePayments == null) {
          credit.hasLatePayments = codes.some((c) =>
            ['2', '3', '4', '5', '6', '7', '8', '9'].includes(c),
          );
        }

        // hasSeriousDelinquency: any MOP >= 4
        if (credit.hasSeriousDelinquency == null) {
          credit.hasSeriousDelinquency = codes.some((c) =>
            ['4', '5', '6', '7', '8', '9'].includes(c),
          );
        }

        // hasWriteOff: MOP 8 or observation keys LC/UP
        if (credit.hasWriteOff == null) {
          credit.hasWriteOff =
            codes.includes('8') ||
            this.rawHasObservationKey(upperRaw, ['LC', 'UP']);
        }

        // hasFraudFlag: MOP 9 or observation key FD
        if (credit.hasFraudFlag == null) {
          credit.hasFraudFlag =
            codes.includes('9') || this.rawHasObservationKey(upperRaw, ['FD']);
        }

        // hasIdentityTheft: observation key RI (NOT fraud)
        if (credit.hasIdentityTheft == null) {
          credit.hasIdentityTheft = this.rawHasObservationKey(upperRaw, ['RI']);
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
        severity: 'INFO',
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

  // -----------------------------------------------------------------------
  // Private: normalize Gemini alert codes to backend-standard BURO_ codes
  // -----------------------------------------------------------------------

  private normalizeGeminiAlertCodes(data: Record<string, unknown>): void {
    if (!Array.isArray(data.alerts)) return;

    const codeMap: Record<string, string> = {
      // Score
      LOW_SCORE: 'BURO_SCORE_LOW',
      low_score: 'BURO_SCORE_LOW',
      SCORE_LOW: 'BURO_SCORE_LOW',
      SCORE_EXCLUDED: 'BURO_SCORE_EXCLUDED',
      score_excluded: 'BURO_SCORE_EXCLUDED',
      SCORE_CRITICAL: 'BURO_SCORE_CRITICAL',
      score_critical: 'BURO_SCORE_CRITICAL',
      // No credits
      NO_CREDITS: 'BURO_NO_CREDITS',
      no_credits: 'BURO_NO_CREDITS',
      EMPTY_CREDITS: 'BURO_NO_CREDITS',
      // Delinquency
      SERIOUS_DELINQUENCY: 'BURO_SERIOUS_DELINQUENCY',
      serious_delinquency: 'BURO_SERIOUS_DELINQUENCY',
      MINOR_DELINQUENCY: 'BURO_MINOR_DELINQUENCY',
      minor_delinquency: 'BURO_MINOR_DELINQUENCY',
      LATE_PAYMENTS: 'BURO_MINOR_DELINQUENCY',
      // Write-off
      WRITE_OFF: 'BURO_WRITE_OFF',
      write_off: 'BURO_WRITE_OFF',
      QUEBRANTO: 'BURO_WRITE_OFF',
      // Fraud
      FRAUD: 'BURO_FRAUD_FLAG',
      fraud: 'BURO_FRAUD_FLAG',
      FRAUD_FLAG: 'BURO_FRAUD_FLAG',
      // Preventive keys
      PREVENTIVE_KEYS: 'BURO_PREVENTIVE_KEYS',
      preventive_keys: 'BURO_PREVENTIVE_KEYS',
      // Borrower
      MISSING_BORROWER: 'BURO_MISSING_BORROWER_NAME',
      missing_borrower: 'BURO_MISSING_BORROWER_NAME',
      MISSING_RFC: 'BURO_MISSING_BORROWER_RFC',
      missing_rfc: 'BURO_MISSING_BORROWER_RFC',
      // Homonym
      HOMONYM: 'BURO_POSSIBLE_HOMONYM',
      homonym: 'BURO_POSSIBLE_HOMONYM',
      POSSIBLE_HOMONYM: 'BURO_POSSIBLE_HOMONYM',
      // Counts
      HIGH_CREDIT_COUNT: 'BURO_HIGH_CREDIT_COUNT',
      HIGH_REVOLVING: 'BURO_HIGH_REVOLVING_COUNT',
      // Balance
      MISSING_BALANCE: 'BURO_MISSING_BALANCE',
      missing_balance: 'BURO_MISSING_BALANCE',
    };

    for (const a of data.alerts as ExtractionAlert[]) {
      if (a.code && codeMap[a.code]) {
        a.code = codeMap[a.code];
      }
    }
  }
}
