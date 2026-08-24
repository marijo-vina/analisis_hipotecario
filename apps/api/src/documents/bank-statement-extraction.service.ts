import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiService, GeminiErrorCode } from './gemini.service';
import {
  BankStatementCleanerService,
  ClientFiscalContext,
  RawTransaction,
  StatementSummary,
} from './bank-statement-cleaner.service';
import {
  BankStatementGridExtractor,
  GridDiagnostics,
} from './bank-statement-grid.extractor';
import { OcrLayout } from './document-ai.types';

// ---------------------------------------------------------------------------
// Document type codes that trigger bank-statement extraction
// ---------------------------------------------------------------------------
const BANK_STATEMENT_DOC_TYPES = ['BANK_STATEMENT'];

// ---------------------------------------------------------------------------
// RFC validation regex — post-Gemini deterministic cleanup
// ---------------------------------------------------------------------------
const RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
const RFC_GENERIC_NORMALIZE_REGEX = /[^A-Z0-9]/g;
const RFC_GENERIC_PLACEHOLDER_REGEX = /^X[AE]X{1,2}010101000$/;

// ---------------------------------------------------------------------------
// Specialized instructions for bank-statement extraction (Fast cover extraction)
// ---------------------------------------------------------------------------
const BANK_STATEMENT_INSTRUCTIONS = [
  'Estado de cuenta bancario mexicano para análisis hipotecario.',
  'Extraé los metadatos de la carátula y el resumen de la cuenta.',
  '',
  '─── REGLA DE ORO ───',
  'NO inventes datos. Ante cualquier duda, usá null.',
  'Extraé ÚNICAMENTE de la información presente en el texto de la carátula.',
  '',
  '─── Titular (accountHolder) ───',
  '  fullName: nombre completo del titular de la cuenta en MAYÚSCULAS.',
  '  rfc: RFC del titular de la cuenta (12-13 caracteres). Si no hay match claro, usar null.',
  '  isJointAccount: true si es cuenta mancomunada / dos titulares, false si es individual, null si no es evidente.',
  '',
  '─── Banco (bank) ───',
  '  institutionName: nombre del banco (ej. BBVA, BANORTE, SANTANDER, CITIBANAMEX, HSBC, etc.).',
  '  accountNumber: número de cuenta (10-12 dígitos).',
  '  clabe: CLABE interbancaria (18 dígitos).',
  '',
  '─── Periodo del estado de cuenta (statementPeriod) ───',
  '  periodStartDate: fecha de inicio del periodo YYYY-MM-DD.',
  '  periodEndDate: fecha de fin del periodo YYYY-MM-DD.',
  '  cutoffDate: fecha de corte YYYY-MM-DD.',
  '  isClosedMonth: true si corresponde a un mes cerrado, false si es mes en curso.',
  '  isCurrentIncompleteMonth: true si el mes aún no cierra.',
  '  averageBalance: saldo promedio del periodo (número decimal sin $ ni comas).',
  '  endingBalance: saldo final al cierre del periodo (número decimal sin $ ni comas).',
  '',
  '─── Resumen de carátula (statementSummary) ───',
  '  totalDepositsAmount: total de abonos / depósitos en dinero reportado por el banco en la carátula.',
  '  totalDepositsCount: número de abonos o depósitos reportados.',
  '  totalWithdrawalsAmount: total de cargos / retiros en dinero reportado por el banco.',
  '  totalWithdrawalsCount: número de cargos o retiros reportados.',
  '  averageBalance: saldo promedio mensual reportado.',
  '  endingBalance: saldo final al corte reportado.',
  '',
  '─── Depósitos de nómina (payrollDeposits[]) ───',
  '  Si en la carátula se listan depósitos evidentes de nómina o abonos recurrentes, extraelos; si no, dejar arreglo vacío [].',
  '    date: YYYY-MM-DD.',
  '    amount: monto del depósito. Número decimal sin $ ni comas.',
  '    currency: "MXN", "USD", u "OTHER". Default "MXN" si no se especifica.',
  '    originalConcept: texto original del concepto tal como aparece (ej. "NOMINA", "ABONO NOMINA").',
  '    detectedEmployerOrPayerName: nombre del empleador/pagador detectado en el concepto.',
  '    detectedPayerRfc: RFC del pagador si se detecta en el concepto.',
  '      Pista de regex RFC: [A-ZÑ&]{3,4}\\d{6}[A-Z0-9]{3}',
  '      Buscar patrones de 12-13 caracteres alfanuméricos que comiencen con 3-4 letras.',
  '      Si no hay match claro, usar null.',
  '    isPayrollConcept: true si el concepto claramente indica nómina.',
  '    containsPayrollKeyword: true si el concepto contiene palabras como NOMINA, NÓMINA, SUELDO, PAGO.',
  '    possiblePayrollProvider: true si podría ser una pagadora externa (outsourcing/staffing).',
  '',
  '  matchCandidateForPayrollReceipt:',
  '    expectedPayrollReceiptId: null (se completará en conciliación posterior).',
  '    amountMatchesPayrollNetIncome: null (requiere comparación contra recibo).',
  '    dateMatchesPayrollPaymentDate: null (requiere comparación contra recibo).',
  '    conceptMatchesEmployer: null (requiere comparación contra recibo).',
  '    matchConfidence: null.',
  '',
  '─── Posibles pagadoras (possiblePayrollProviders[]) ───',
  '  Extraé ÚNICAMENTE depósitos recurrentes provenientes de Personas Morales (empresas) que podrían ser de un empleador/pagadora (outsourcing).',
  '  REGLAS CRÍTICAS DE DETECCIÓN (Aplicar estrictamente):',
  '  1. REGLA DE PERSONA MORAL: El emisor DEBE ser una empresa (Persona Moral).',
  '     - IGNORA transferencias de personas físicas (ej. "Transf a Alejandro", "Juan Perez").',
  '     - IGNORA transferencias entre cuentas propias.',
  '  2. REGLA DE CONCEPTOS CLAVE: El concepto debe ser relacionado a pagos laborales:',
  '     - Ejemplos: "nómina", "abono nómina", "pago de nómina", "remanente", "asimilados", "bonos", "compensación".',
  '  3. EXIGE RECURRENCIA:',
  '     - NO extraigas si es un pago aislado (no puede ser IRREGULAR).',
  '     - IGNORA conceptos genéricos de SPEI (ej. "BNET", "Traspaso", "SPEI") a menos que provengan claramente de una empresa con patrón de pago.',
  '  Para cada uno:',
  '    payerName: nombre del pagador detectado.',
  '    depositDate: YYYY-MM-DD.',
  '    amount: monto del depósito.',
  '    originalConcept: texto original del concepto.',
  '    detectedPayerRfc: RFC si detecta en el concepto (misma pista de regex).',
  '    receivingBank: banco receptor (usualmente el del estado de cuenta).',
  '    receivingAccount: cuenta receptora.',
  '    estimatedRecurrence: WEEKLY, BIWEEKLY, MONTHLY, IRREGULAR, UNKNOWN.',
  '    containsPayrollKeyword: true/false/null.',
  '',
  '─── Otros movimientos relevantes (otherRelevantMovements[]) ───',
  '  Extraé movimientos que NO son nómina pero son relevantes para el análisis:',
  '    depósitos grandes, transferencias entre cuentas, ingresos extraordinarios,',
  '    o depósitos que podrían confundirse con nómina.',
  '  Para cada uno:',
  '    date: YYYY-MM-DD.',
  '    amount: monto.',
  '    movementType: DEPOSIT, WITHDRAWAL, TRANSFER, CHARGE, UNKNOWN.',
  '    originalConcept: texto original.',
  '    trashDepositAnalysis:',
  '      isDiscardableTrashDeposit: true si es un depósito descartable (ej. transferencia entre propias,',
  '        reembolso, depósito de terceros no recurrente).',
  '      confidence: 0.0-1.0.',
  '      reason: breve explicación.',
  '      evidenceText: texto del concepto que evidencia la clasificación.',
  '    relevanceReason: por qué es relevante para el análisis.',
  '',
  '─── Contexto de requerimiento documental (documentRequirementContext) ───',
  '  incomeBehavior: FIXED, VARIABLE, o UNKNOWN según se pueda inferir de los depósitos.',
  '  requiredPayrollReceiptMonths: número de meses requeridos (3 fijo, 6 variable). null si desconocido.',
  '  requiredBankStatementMonths: número de meses de estado de cuenta requeridos (3 fijo, 6 variable).',
  '  detectedDocumentMonths: cuántos meses abarca el estado de cuenta detectado.',
  '  isRequirementSatisfied: true si detectedDocumentMonths >= requiredBankStatementMonths.',
  '  requirementNotes: notas sobre el cumplimiento del requerimiento.',
  '',
  '─── Detección de moneda ───',
  '  El campo currency admite "MXN", "USD" u "OTHER".',
  '  Default "MXN" si no se detecta símbolo o código de moneda distinto.',
  '  Si aparece $, MXN, pesos mexicanos → "MXN".',
  '  Si aparece US$, USD, dólares → "USD".',
  '  Cualquier otra moneda → "OTHER".',
  '  Moneda no MXN NO bloquea la extracción.',
  '',
  '─── Detección de saldo negativo ───',
  '  Si averageBalance o endingBalance son negativos (sobregiro), registrar el valor negativo tal cual.',
  '  NO se debe bloquear la extracción por saldo negativo.',
  '  El post-procesamiento generará una alerta si detecta saldo negativo.',
  '',
  '─── Detección de cuenta mancomunada ───',
  '  Si el estado de muestra múltiples titulares o texto indicativo de mancomunidad,',
  '  isJointAccount = true.',
  '  Cuando la titularidad no sea clara, usar null.',
  '',
  '─── Reglas de alertas ───',
  '  Generá las alertas que correspondan según los datos detectados.',
  '  NO generes alertas por campos que sí fueron detectados correctamente.',
  '  Las alertas serán validadas y filtradas en post-procesamiento.',
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
// Fast cover-only schema for ultra-fast Gemini metadata extraction (~1.2s)
// ---------------------------------------------------------------------------
const FAST_BANK_STATEMENT_COVER_SCHEMA = {
  accountHolder: {
    fullName: 'string | null',
    rfc: 'string | null',
    isJointAccount: 'boolean | null',
  },
  bank: {
    institutionName: 'string | null',
    accountNumber: 'string | null',
    clabe: 'string | null',
  },
  statementPeriod: {
    periodStartDate: 'YYYY-MM-DD | null',
    periodEndDate: 'YYYY-MM-DD | null',
    cutoffDate: 'YYYY-MM-DD | null',
    isClosedMonth: 'boolean | null',
    isCurrentIncompleteMonth: 'boolean | null',
    averageBalance: 'number | null',
    endingBalance: 'number | null',
  },
  statementSummary: {
    totalDepositsAmount: 'number | null',
    totalDepositsCount: 'number | null',
    totalWithdrawalsAmount: 'number | null',
    totalWithdrawalsCount: 'number | null',
    averageBalance: 'number | null',
    endingBalance: 'number | null',
  },
};

// ---------------------------------------------------------------------------
// Schema — output contract Gemini must fulfill (bank-statement.schema.md v1.2)
// ---------------------------------------------------------------------------
const BANK_STATEMENT_SCHEMA = {
  schemaVersion: '1.2',
  documentType: 'BANK_STATEMENT',
  extractionMetadata: {
    sourceDocumentId: null,
    mortgageCaseId: null,
    ocrProcessedAt: null,
    extractedAt: null,
    model: null,
    confidence: 0.0,
  },
  documentRequirementContext: {
    incomeBehavior: 'FIXED | VARIABLE | UNKNOWN',
    requiredPayrollReceiptMonths: 'number | null',
    requiredBankStatementMonths: 'number | null',
    detectedDocumentMonths: 'number | null',
    isRequirementSatisfied: 'boolean | null',
    requirementNotes: 'string | null',
  },
  accountHolder: {
    fullName: 'string | null',
    rfc: 'string | null',
    isJointAccount: 'boolean | null',
  },
  bank: {
    institutionName: 'string | null',
    accountNumber: 'string | null',
    clabe: 'string | null',
  },
  statementPeriod: {
    periodStartDate: 'YYYY-MM-DD | null',
    periodEndDate: 'YYYY-MM-DD | null',
    cutoffDate: 'YYYY-MM-DD | null',
    isClosedMonth: 'boolean | null',
    isCurrentIncompleteMonth: 'boolean | null',
    averageBalance: 'number | null',
    endingBalance: 'number | null',
  },
  statementSummary: {
    totalDepositsAmount: 'number | null',
    totalDepositsCount: 'number | null',
    totalWithdrawalsAmount: 'number | null',
    totalWithdrawalsCount: 'number | null',
    averageBalance: 'number | null',
    endingBalance: 'number | null',
  },
  allTransactions: [
    {
      date: 'YYYY-MM-DD | null',
      amount: 'number | null',
      currency: 'MXN | USD | OTHER',
      movementType: 'DEPOSIT | WITHDRAWAL | TRANSFER | CHARGE | UNKNOWN',
      originalConcept: 'string | null',
      payerOrBeneficiaryName: 'string | null',
      payerRfc: 'string | null',
      referenceNumber: 'string | null',
    },
  ],
  payrollDeposits: [
    {
      date: 'YYYY-MM-DD | null',
      amount: 'number | null',
      currency: 'MXN | USD | OTHER',
      originalConcept: 'string | null',
      detectedEmployerOrPayerName: 'string | null',
      detectedPayerRfc: 'string | null',
      isPayrollConcept: 'boolean | null',
      containsPayrollKeyword: 'boolean | null',
      possiblePayrollProvider: 'boolean | null',
      matchCandidateForPayrollReceipt: {
        expectedPayrollReceiptId: 'string | null',
        amountMatchesPayrollNetIncome: 'boolean | null',
        dateMatchesPayrollPaymentDate: 'boolean | null',
        conceptMatchesEmployer: 'boolean | null',
        matchConfidence: 'number | null',
      },
    },
  ],
  possiblePayrollProviders: [
    {
      payerName: 'string | null',
      depositDate: 'YYYY-MM-DD | null',
      amount: 'number | null',
      originalConcept: 'string | null',
      detectedPayerRfc: 'string | null',
      receivingBank: 'string | null',
      receivingAccount: 'string | null',
      estimatedRecurrence: 'WEEKLY | BIWEEKLY | MONTHLY | IRREGULAR | UNKNOWN',
      containsPayrollKeyword: 'boolean | null',
    },
  ],
  otherRelevantMovements: [
    {
      date: 'YYYY-MM-DD | null',
      amount: 'number | null',
      movementType: 'DEPOSIT | WITHDRAWAL | TRANSFER | CHARGE | UNKNOWN',
      originalConcept: 'string | null',
      trashDepositAnalysis: {
        isDiscardableTrashDeposit: 'boolean | null',
        confidence: 'number | null',
        reason: 'string | null',
        evidenceText: 'string | null',
      },
      relevanceReason: 'string | null',
    },
  ],
  financialDepuration: {
    integrityCheck: {
      bankReportedTotal: null,
      calculatedDepositsTotal: 0.0,
      discrepancy: 0.0,
      status: 'MATCHED | MINOR_DIFFERENCE | CRITICAL_DISCREPANCY',
      message: 'string',
    },
    depurationSummary: {
      totalGrossDeposits: 0.0,
      totalTrashDeposits: 0.0,
      totalValidIncome: 0.0,
      trashDepositsCount: 0,
      validDepositsCount: 0,
      needsReviewCount: 0,
      detectedSector: 'HEALTH_MEDICAL | PROFESSIONAL_SERVICES | FOOD_RESTAURANT | RENTAL | CONSTRUCTION_TRADE | GENERAL_COMMERCE',
    },
    cleanedDeposits: [],
    highImpactExceptions: [],
  },
  bankarizationValidationPreparation: {
    purpose: 'MATCH_PAYROLL_NET_INCOME_WITH_BANK_DEPOSIT',
    requiresPayrollReceiptComparison: true,
    notes:
      'Los depósitos detectados deben compararse contra el ingreso neto, fecha de pago y empleador de los recibos de nómina.',
  },
  missingFields: [],
  alerts: [],
};

// ---------------------------------------------------------------------------
// Observability: per-stage timings and source-of-truth traces
// ---------------------------------------------------------------------------

/** Wall-clock duration of each pipeline stage, in milliseconds. */
export interface BankStatementStageTimings {
  coverTextPrepMs: number;
  geminiMs: number;
  gridMs: number;
  cleanerMs: number;
  persistMs: number;
  totalMs: number;
}

/**
 * Full diagnostics for one extraction run. Populated only when
 * `collectDiagnostics` is requested (benchmark path). Never alters the
 * extraction result itself.
 */
export interface BankStatementDiagnostics {
  documentId: string;
  timings: BankStatementStageTimings;
  gemini: {
    success: boolean;
    durationMs: number | null;
    attempts: number | null;
    finishReason: string | null;
    promptChars: number | null;
    responseChars: number | null;
    errorCode: string | null;
  };
  rfc: {
    rawFromGemini: string | null;
    valueBeforeValidation: string | null;
    final: string | null;
    rejectedByRegex: boolean;
    usedCsfFallback: boolean;
  };
  grid: GridDiagnostics | null;
  transactions: {
    source: 'grid' | 'gemini-fallback' | 'none';
    count: number;
  };
  coverTextChars: number;
  coverPagesUsed: number;
}

/** Options controlling side effects and observability of `extract`. */
export interface BankStatementExtractOptions {
  /** When false, skip all DB writes (status transitions + final persist). Default true. */
  persist?: boolean;
  /** When true, collect and return per-run diagnostics. Default false. */
  collectDiagnostics?: boolean;
}

// ---------------------------------------------------------------------------
// Extraction result envelope
// ---------------------------------------------------------------------------
export interface BankStatementExtractionResult {
  success: boolean;
  documentId: string;
  extractedData: Record<string, unknown> | null;
  alerts: ExtractionAlert[];
  missingFields: string[];
  diagnostics?: BankStatementDiagnostics;
  error?: { code: string; message: string };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
@Injectable()
export class BankStatementExtractionService {
  private readonly logger = new Logger(BankStatementExtractionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geminiService: GeminiService,
    private readonly cleanerService: BankStatementCleanerService,
  ) {}

  static isBankStatementDocument(documentTypeCode: string): boolean {
    return BANK_STATEMENT_DOC_TYPES.includes(documentTypeCode);
  }

  async extract(
    caseId: string,
    documentId: string,
    options: BankStatementExtractOptions = {},
  ): Promise<BankStatementExtractionResult> {
    const persist = options.persist ?? true;
    const collectDiagnostics = options.collectDiagnostics ?? false;

    // Stage timing accumulators (ms). Populated as the pipeline advances.
    const startedAt = Date.now();
    const timings: BankStatementStageTimings = {
      coverTextPrepMs: 0,
      geminiMs: 0,
      gridMs: 0,
      cleanerMs: 0,
      persistMs: 0,
      totalMs: 0,
    };

    // ── 1. Fetch document with type + status + case ────────────────────
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        documentType: true,
        documentStatus: true,
        mortgageCase: true,
      },
    });
    if (!document || document.mortgageCaseId !== caseId) {
      throw new Error('Document not found');
    }

    // ── 2. Status gate: allow PROCESSED (first extraction) and EXTRACTION_ERROR (retry) ──
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

    // ── 3. Guard: document type must be BANK_STATEMENT ───────────────────
    if (document.documentType.code !== 'BANK_STATEMENT') {
      return {
        success: false,
        documentId,
        extractedData: null,
        alerts: [],
        missingFields: [],
        error: {
          code: 'DOCUMENT_TYPE_MISMATCH',
          message:
            'El documento no es un estado de cuenta bancario (BANK_STATEMENT).',
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

    // ── 6. Query CSF context if available ──────────────────────────────
    const csfDoc = await this.prisma.document.findFirst({
      where: {
        mortgageCaseId: caseId,
        documentType: { code: { in: ['CSF', 'TAX_SITUATION_PROOF'] } },
        documentStatus: { code: 'PROCESSED' },
      },
    });
    const csfData = csfDoc?.extractedData as Record<string, any> | null;
    const clientContext: ClientFiscalContext = {
      clientRfc: csfData?.taxpayer?.rfc || csfData?.rfc || null,
      clientFullName: csfData?.taxpayer?.fullName || csfData?.fullName || null,
      regimes: (csfData?.regimes || []).map((r: any) =>
        typeof r === 'string' ? r : r.description || '',
      ),
      economicActivities: (
        csfData?.activities ||
        csfData?.economicActivities ||
        []
      ).map((a: any) => (typeof a === 'string' ? a : a.description || '')),
    };

    // ── 7. Call Gemini with specialized instructions (Fast cover page extraction) ────
    // Send only cover page(s) to Gemini to extract metadata & summary in ~1.5s
    const coverPrepStart = Date.now();
    let textForGemini = document.ocrText;
    let coverPagesUsed = 0;
    const layout = (document as any).ocrLayout as OcrLayout | undefined;
    if (layout && Array.isArray(layout.pages) && layout.pages.length > 0) {
      // Cover page text (pages 1 and 2 for summary)
      const coverPages = layout.pages.slice(0, 2);
      coverPagesUsed = coverPages.length;
      const coverLines = coverPages
        .flatMap((p) => p.lines || [])
        .map((l) => l.text.trim())
        .filter(Boolean);
      if (coverLines.length > 0) {
        textForGemini = coverLines.join('\n');
      }
    }
    timings.coverTextPrepMs = Date.now() - coverPrepStart;
    const coverTextChars = textForGemini.length;

    const geminiStart = Date.now();
    const geminiResult = await this.geminiService.extractStructuredData(
      textForGemini,
      document.documentType.code,
      { ...FAST_BANK_STATEMENT_COVER_SCHEMA },
      BANK_STATEMENT_INSTRUCTIONS,
    );
    timings.geminiMs = Date.now() - geminiStart;

    if (!geminiResult.success) {
      this.logger.warn(
        `[BankStatement] Gemini extraction failed for doc ${documentId}: ${geminiResult.error?.code}`,
      );

      // Transition to EXTRACTION_ERROR so the UI can show the real state
      if (persist) {
        try {
          await this.prisma.document.update({
            where: { id: documentId },
            data: { documentStatusId: extractionErrorStatus.id },
          });
        } catch (dbError) {
          this.logger.error(
            `[BankStatement] Failed to set EXTRACTION_ERROR status for doc ${documentId}: ${(dbError as Error).message}`,
          );
        }
      }

      timings.totalMs = Date.now() - startedAt;
      const failureDiagnostics: BankStatementDiagnostics = {
        documentId,
        timings,
        gemini: {
          success: false,
          durationMs: geminiResult.timings?.durationMs ?? null,
          attempts: geminiResult.timings?.attempts ?? null,
          finishReason: geminiResult.timings?.finishReason ?? null,
          promptChars: geminiResult.timings?.promptChars ?? null,
          responseChars: geminiResult.timings?.responseChars ?? null,
          errorCode: geminiResult.error?.code ?? 'UNKNOWN',
        },
        rfc: {
          rawFromGemini: null,
          valueBeforeValidation: null,
          final: null,
          rejectedByRegex: false,
          usedCsfFallback: false,
        },
        grid: null,
        transactions: { source: 'none', count: 0 },
        coverTextChars,
        coverPagesUsed,
      };
      this.logDiagnostics(failureDiagnostics);

      return {
        success: false,
        documentId,
        extractedData: geminiResult.extractedData,
        alerts: [],
        missingFields: [],
        diagnostics: collectDiagnostics ? failureDiagnostics : undefined,
        error: geminiResult.error
          ? {
              code: geminiResult.error.code,
              message: geminiResult.error.message,
            }
          : { code: 'UNKNOWN', message: 'Extraction failed' },
      };
    }

    const data = geminiResult.extractedData as Record<string, any>;
    data.schemaVersion = '1.2';
    data.documentType = 'BANK_STATEMENT';
    data.payrollDeposits = data.payrollDeposits || [];
    data.possiblePayrollProviders = data.possiblePayrollProviders || [];
    data.otherRelevantMovements = data.otherRelevantMovements || [];

    // RFC trace: raw value as returned by Gemini (before any fallback/validation)
    const rfcRawFromGemini: string | null = data.accountHolder?.rfc ?? null;
    let rfcUsedCsfFallback = false;

    // Replace SAT generic placeholders from Gemini with the client's CSF RFC.
    // Gemini occasionally corrupts XAXX010101000 into XAX010101000; both are
    // placeholders and should never persist as the titular RFC.
    const shouldUseCsfRfcFallback =
      !data.accountHolder?.rfc ||
      this.isGenericPlaceholderRfc(data.accountHolder.rfc);
    if (shouldUseCsfRfcFallback && clientContext.clientRfc) {
      if (!data.accountHolder) {
        data.accountHolder = { fullName: null, rfc: null, isJointAccount: null };
      }
      data.accountHolder.rfc = clientContext.clientRfc;
      rfcUsedCsfFallback = true;
    } else if (data.accountHolder?.rfc && shouldUseCsfRfcFallback) {
      data.accountHolder.rfc = null;
    }

    // RFC trace: value entering validateRfc (after fallback, before regex cleanup)
    const rfcValueBeforeValidation: string | null =
      data.accountHolder?.rfc ?? null;

    // ── 8. Normalize bank-statement fields ───────────────────────────────
    this.normalizeBankStatement(data);

    // RFC trace: final value after validateRfc regex enforcement
    const rfcFinal: string | null = data.accountHolder?.rfc ?? null;
    const rfcRejectedByRegex =
      !!rfcValueBeforeValidation &&
      rfcValueBeforeValidation.trim() !== '' &&
      rfcFinal == null;

    // ── 9. Extract Transactions via Spatial Grid (Deterministic fallback to Gemini) ──
    const statementPeriod = (data.statementPeriod ?? {}) as Record<string, unknown>;
    const periodStart = statementPeriod.periodStartDate as string | undefined;
    const yearMatch = periodStart ? /^(\d{4})/.exec(periodStart) : null;
    const statementYear = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();

    let rawTransactions: RawTransaction[] = [];
    let gridDiagnostics: GridDiagnostics | null = null;
    let transactionSource: 'grid' | 'gemini-fallback' | 'none' = 'none';
    const gridStart = Date.now();
    if (layout && Array.isArray(layout.pages) && layout.pages.length > 0) {
      const gridOutput = BankStatementGridExtractor.extractWithDiagnostics(
        layout,
        statementYear,
      );
      gridDiagnostics = gridOutput.diagnostics;
      if (gridOutput.transactions.length > 0) {
        rawTransactions = gridOutput.transactions;
        data.allTransactions = gridOutput.transactions;
        transactionSource = 'grid';
      }
    }
    timings.gridMs = Date.now() - gridStart;

    // Fallback: if grid did not extract transactions, collect from Gemini output
    if (rawTransactions.length === 0) {
      rawTransactions = this.collectTransactions(data);
      if (rawTransactions.length > 0) {
        transactionSource = 'gemini-fallback';
      }
    }

    const statementSummary = (data.statementSummary ||
      data.statementPeriod ||
      {}) as StatementSummary;

    const cleanerStart = Date.now();
    const depurationResult = this.cleanerService.clean(
      rawTransactions,
      statementSummary,
      clientContext,
    );
    timings.cleanerMs = Date.now() - cleanerStart;
    data.financialDepuration = depurationResult;

    const isPfaeCase =
      (document as any)?.mortgageCase?.personType === 'PFAE' ||
      (clientContext.economicActivities &&
        clientContext.economicActivities.length > 0) ||
      (clientContext.regimes && clientContext.regimes.length > 0);

    // ── 10. Compute alerts from normalized data & depuration ─────────────
    const alerts = this.computeAlerts(data, isPfaeCase);
    this.appendDepurationAlerts(alerts, depurationResult);
    const missingFields = this.computeMissingFields(data);

    // ── 11. Merge + dedup + filter contradictions ───────────────────────
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

    // If PFAE profile / CSF active, suppress salaried payroll alerts
    if (isPfaeCase && Array.isArray(data.alerts)) {
      data.alerts = (data.alerts as ExtractionAlert[]).filter(
        (a) =>
          a.code !== 'BANK_NO_PAYROLL_DEPOSITS' &&
          a.code !== 'BANK_PAYROLL_MISMATCH',
      );
    }

    // ── 12. Persist extractedData + status atomically ────────────────────

    const persistStart = Date.now();
    if (persist) {
      await this.prisma.document.update({
        where: { id: documentId },
        data: {
          extractedData: data as any,
          documentStatusId: processedStatus.id,
        },
      });
    }
    timings.persistMs = Date.now() - persistStart;
    timings.totalMs = Date.now() - startedAt;

    const diagnostics: BankStatementDiagnostics = {
      documentId,
      timings,
      gemini: {
        success: true,
        durationMs: geminiResult.timings?.durationMs ?? null,
        attempts: geminiResult.timings?.attempts ?? null,
        finishReason: geminiResult.timings?.finishReason ?? null,
        promptChars: geminiResult.timings?.promptChars ?? null,
        responseChars: geminiResult.timings?.responseChars ?? null,
        errorCode: null,
      },
      rfc: {
        rawFromGemini: rfcRawFromGemini,
        valueBeforeValidation: rfcValueBeforeValidation,
        final: rfcFinal,
        rejectedByRegex: rfcRejectedByRegex,
        usedCsfFallback: rfcUsedCsfFallback,
      },
      grid: gridDiagnostics,
      transactions: {
        source: transactionSource,
        count: rawTransactions.length,
      },
      coverTextChars,
      coverPagesUsed,
    };
    this.logDiagnostics(diagnostics);

    return {
      success: true,
      documentId,
      extractedData: data,
      alerts: data.alerts as ExtractionAlert[],
      missingFields,
      diagnostics: collectDiagnostics ? diagnostics : undefined,
    };
  }

  // -----------------------------------------------------------------------
  // Private: structured diagnostics logging (one compact JSON line per run)
  // -----------------------------------------------------------------------
  private logDiagnostics(d: BankStatementDiagnostics): void {
    this.logger.log(
      `[BankStatementDiag] ${JSON.stringify({
        documentId: d.documentId,
        totalMs: d.timings.totalMs,
        geminiMs: d.timings.geminiMs,
        gridMs: d.timings.gridMs,
        cleanerMs: d.timings.cleanerMs,
        gemini: {
          ok: d.gemini.success,
          attempts: d.gemini.attempts,
          finishReason: d.gemini.finishReason,
          promptChars: d.gemini.promptChars,
          responseChars: d.gemini.responseChars,
          errorCode: d.gemini.errorCode,
        },
        rfc: {
          raw: d.rfc.rawFromGemini,
          final: d.rfc.final,
          rejectedByRegex: d.rfc.rejectedByRegex,
          usedCsfFallback: d.rfc.usedCsfFallback,
        },
        tx: {
          source: d.transactions.source,
          count: d.transactions.count,
          pagesWithHeader: d.grid?.pagesWithDepositHeader ?? null,
          headerAccentPages: d.grid
            ? d.grid.pages.filter((p) => p.depositHeaderHadAccent).length
            : null,
        },
      })}`,
    );
  }

  /**
   * Runs `extract` N times WITHOUT persisting, aggregating timing and
   * detection-rate statistics. DEV-only observability helper used to
   * quantify latency variance and non-determinism before optimizing.
   */
  async benchmark(
    caseId: string,
    documentId: string,
    runs: number,
  ): Promise<Record<string, unknown>> {
    const clampedRuns = Math.max(1, Math.min(20, Math.floor(runs) || 1));
    const runResults: BankStatementDiagnostics[] = [];

    for (let i = 0; i < clampedRuns; i++) {
      const result = await this.extract(caseId, documentId, {
        persist: false,
        collectDiagnostics: true,
      });
      if (result.diagnostics) {
        runResults.push(result.diagnostics);
      }
    }

    if (runResults.length === 0) {
      return {
        documentId,
        runs: clampedRuns,
        error: 'No diagnostics collected (all runs failed before diagnostics).',
      };
    }

    const totalMs = runResults.map((r) => r.timings.totalMs);
    const geminiMs = runResults.map((r) => r.timings.geminiMs);
    const gridMs = runResults.map((r) => r.timings.gridMs);
    const txCounts = runResults.map((r) => r.transactions.count);
    const rfcFinals = runResults.map((r) => r.rfc.final);

    const rfcDetected = rfcFinals.filter((v) => !!v).length;
    const rfcRejected = runResults.filter(
      (r) => r.rfc.rejectedByRegex,
    ).length;
    const csfFallbackUsed = runResults.filter(
      (r) => r.rfc.usedCsfFallback,
    ).length;
    const gridSource = runResults.filter(
      (r) => r.transactions.source === 'grid',
    ).length;
    const distinctTxCounts = [...new Set(txCounts)];

    return {
      documentId,
      runs: clampedRuns,
      timingsMs: {
        total: this.summarize(totalMs),
        gemini: this.summarize(geminiMs),
        grid: this.summarize(gridMs),
      },
      geminiAttempts: this.summarize(
        runResults.map((r) => r.gemini.attempts ?? 0),
      ),
      rfc: {
        detectionRate: `${rfcDetected}/${clampedRuns}`,
        rejectedByRegexCount: rfcRejected,
        csfFallbackCount: csfFallbackUsed,
        distinctValues: [...new Set(rfcFinals)],
      },
      transactions: {
        gridSourceRate: `${gridSource}/${clampedRuns}`,
        counts: txCounts,
        distinctCounts: distinctTxCounts,
        nonDeterministic: distinctTxCounts.length > 1,
        min: Math.min(...txCounts),
        max: Math.max(...txCounts),
      },
      perRun: runResults,
    };
  }

  /** Computes min/max/mean/p50/p95 for a numeric series. */
  private summarize(values: number[]): Record<string, number> {
    if (values.length === 0) {
      return { min: 0, max: 0, mean: 0, p50: 0, p95: 0 };
    }
    const sorted = [...values].sort((a, b) => a - b);
    const pct = (p: number) =>
      sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
    const sum = sorted.reduce((a, b) => a + b, 0);
    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: Math.round(sum / sorted.length),
      p50: pct(50),
      p95: pct(95),
    };
  }

  // -----------------------------------------------------------------------
  // Private: normalize bank-statement fields (RFC validation, currency, balance)
  // -----------------------------------------------------------------------

  private normalizeBankStatement(data: Record<string, unknown>): void {
    const payrollDeposits = data.payrollDeposits as
      | Record<string, unknown>[]
      | undefined;
    const possiblePayrollProviders = data.possiblePayrollProviders as
      | Record<string, unknown>[]
      | undefined;
    const statementPeriod = (data.statementPeriod ?? {}) as Record<
      string,
      unknown
    >;
    const accountHolder = (data.accountHolder ?? {}) as Record<string, unknown>;

    // ── RFC validation for accountHolder ───────────────────────────────────
    const accountRfc = accountHolder.rfc as string | undefined | null;
    if (accountRfc != null && accountRfc !== '') {
      accountHolder.rfc = this.validateRfc(accountRfc);
    } else if (accountRfc === '') {
      accountHolder.rfc = null;
    }

    // ── RFC validation for payrollDeposits[] ─────────────────────────────
    if (Array.isArray(payrollDeposits)) {
      for (const deposit of payrollDeposits) {
        const rfc = deposit.detectedPayerRfc as string | undefined | null;
        if (rfc != null && rfc !== '') {
          deposit.detectedPayerRfc = this.validateRfc(rfc);
        } else if (rfc === '') {
          deposit.detectedPayerRfc = null;
        }
      }
    }

    // ── RFC validation for possiblePayrollProviders[] ────────────────────
    if (Array.isArray(possiblePayrollProviders)) {
      for (const provider of possiblePayrollProviders) {
        const rfc = provider.detectedPayerRfc as string | undefined | null;
        if (rfc != null && rfc !== '') {
          provider.detectedPayerRfc = this.validateRfc(rfc);
        } else if (rfc === '') {
          provider.detectedPayerRfc = null;
        }
      }
    }

    // ── Strict filter for possiblePayrollProviders[] ────────────────────
    if (Array.isArray(possiblePayrollProviders)) {
      data.possiblePayrollProviders = possiblePayrollProviders.filter(provider => {
        const concept = (provider.originalConcept as string | undefined)?.toLowerCase() || '';
        const payer = (provider.payerName as string | undefined)?.toLowerCase() || '';
        
        const isGeneric = ['spei', 'bnet', 'traspaso', 'transferencia', 'transf'].some(k => concept.includes(k) || payer.includes(k));
        const hasPayrollKeyword = provider.containsPayrollKeyword === true || 
          ['nómina', 'nomina', 'sueldo', 'remanente', 'asimilados', 'bonos', 'compensacion', 'honorarios'].some(k => concept.includes(k));
        
        // Drop generic concepts that lack payroll keywords to avoid false positives
        if (isGeneric && !hasPayrollKeyword) {
          return false;
        }
        return true;
      });
    }

    // ── Currency normalization for payrollDeposits[] ─────────────────────
    if (Array.isArray(payrollDeposits)) {
      for (const deposit of payrollDeposits) {
        const currency = (deposit.currency as string | undefined) ?? null;
        if (!currency || currency.trim() === '') {
          deposit.currency = 'MXN';
        } else {
          const normalized = currency.toUpperCase().trim();
          if (!['MXN', 'USD', 'OTHER'].includes(normalized)) {
            deposit.currency = 'OTHER';
          } else {
            deposit.currency = normalized;
          }
        }
      }
    }

    // ── Balance sanity: clamp negatives but keep the value for alert ─────
    // We keep the negative value in data (per spec BAL-001..004) but the
    // alert computation will flag it. No clamping needed here.

    data.statementPeriod = statementPeriod;
  }

  // -----------------------------------------------------------------------
  // Private: RFC validation via regex (post-Gemini deterministic cleanup)
  // -----------------------------------------------------------------------

  private validateRfc(rfc: string): string | null {
    const trimmed = String(rfc).trim().toUpperCase();
    if (!trimmed) return null;
    if (RFC_REGEX.test(trimmed)) {
      return trimmed;
    }
    return null;
  }

  /**
   * Detects SAT generic placeholder RFCs, including the corrupted variant
   * observed from Gemini (`XAX010101000` missing one X).
   */
  private isGenericPlaceholderRfc(rfc: string | null | undefined): boolean {
    if (!rfc) return false;
    const normalized = String(rfc)
      .trim()
      .toUpperCase()
      .replace(RFC_GENERIC_NORMALIZE_REGEX, '');
    return RFC_GENERIC_PLACEHOLDER_REGEX.test(normalized);
  }

  // -----------------------------------------------------------------------
  // Private: alert computation (post-normalization) — 10 BANK_ codes
  // -----------------------------------------------------------------------

  private computeAlerts(
    data: Record<string, unknown>,
    isPfaeCase = false,
  ): ExtractionAlert[] {
    const alerts: ExtractionAlert[] = [];

    const payrollDeposits = data.payrollDeposits as
      | Record<string, unknown>[]
      | undefined;
    const statementPeriod = (data.statementPeriod ?? {}) as Record<
      string,
      unknown
    >;
    const accountHolder = (data.accountHolder ?? {}) as Record<string, unknown>;
    const documentRequirementContext = (data.documentRequirementContext ??
      {}) as Record<string, unknown>;

    // ── BANK_NO_PAYROLL_DEPOSITS — payrollDeposits[] empty (salaried only) ────
    const hasPayrollDeposits =
      Array.isArray(payrollDeposits) && payrollDeposits.length > 0;
    if (!hasPayrollDeposits && !isPfaeCase) {
      alerts.push({
        code: 'BANK_NO_PAYROLL_DEPOSITS',
        severity: 'WARNING',
        category: 'BANK_STATEMENT',
        message: 'No se detectaron depósitos de nómina en el estado de cuenta.',
        field: 'payrollDeposits',
        requiresManualReview: true,
      });
    }

    // ── BANK_NON_MXN_CURRENCY — any deposit currency !== "MXN" ────────────
    if (Array.isArray(payrollDeposits)) {
      const nonMxnCurrencies = new Set<string>();
      for (const deposit of payrollDeposits) {
        const currency = (deposit.currency as string) ?? 'MXN';
        if (currency !== 'MXN') {
          nonMxnCurrencies.add(currency);
        }
      }
      if (nonMxnCurrencies.size > 0) {
        const currencies = [...nonMxnCurrencies].join(', ');
        alerts.push({
          code: 'BANK_NON_MXN_CURRENCY',
          severity: 'WARNING',
          category: 'BANK_STATEMENT',
          message: `Se detectaron depósitos en moneda no MXN (${currencies}). Verificar impacto en el análisis de ingresos.`,
          field: 'payrollDeposits[].currency',
          requiresManualReview: true,
        });
      }
    }

    // ── BANK_NEGATIVE_BALANCE — averageBalance or endingBalance < 0 ──────
    const averageBalance = statementPeriod.averageBalance as
      | number
      | undefined
      | null;
    const endingBalance = statementPeriod.endingBalance as
      | number
      | undefined
      | null;
    const avgNegative =
      averageBalance != null &&
      typeof averageBalance === 'number' &&
      averageBalance < 0;
    const endNegative =
      endingBalance != null &&
      typeof endingBalance === 'number' &&
      endingBalance < 0;
    if (avgNegative || endNegative) {
      const fields: string[] = [];
      if (avgNegative) fields.push('averageBalance');
      if (endNegative) fields.push('endingBalance');
      alerts.push({
        code: 'BANK_NEGATIVE_BALANCE',
        severity: 'WARNING',
        category: 'BANK_STATEMENT',
        message: `Saldo(s) negativo(s) detectado(s): ${fields.join(', ')}. La cuenta presenta sobregiro.`,
        field: 'statementPeriod',
        requiresManualReview: true,
      });
    }

    // ── BANK_JOINT_ACCOUNT — isJointAccount === true ─────────────────────
    if (accountHolder.isJointAccount === true) {
      alerts.push({
        code: 'BANK_JOINT_ACCOUNT',
        severity: 'WARNING',
        category: 'BANK_STATEMENT',
        message:
          'Se detectó cuenta mancomunada. Las cuentas mancomunadas pueden mostrar nómina de dos empleadores.',
        field: 'accountHolder.isJointAccount',
        requiresManualReview: true,
      });
    }

    // ── BANK_INCOMPLETE_MONTH — isCurrentIncompleteMonth === true ────────
    if (statementPeriod.isCurrentIncompleteMonth === true) {
      alerts.push({
        code: 'BANK_INCOMPLETE_MONTH',
        severity: 'INFO',
        category: 'BANK_STATEMENT',
        message:
          'El estado de cuenta corresponde al mes en curso incompleto. Considerar solicitar un mes cerrado.',
        field: 'statementPeriod.isCurrentIncompleteMonth',
        requiresManualReview: false,
      });
    }

    // ── BANK_MISSING_PERIOD — periodStartDate or periodEndDate null ──────
    const periodStart = statementPeriod.periodStartDate as
      | string
      | undefined
      | null;
    const periodEnd = statementPeriod.periodEndDate as
      | string
      | undefined
      | null;
    if (!periodStart || !periodEnd) {
      alerts.push({
        code: 'BANK_MISSING_PERIOD',
        severity: 'WARNING',
        category: 'BANK_STATEMENT',
        message:
          'No se detectó el periodo completo del estado de cuenta (fecha inicio o fin faltante).',
        field: 'statementPeriod',
        requiresManualReview: true,
      });
    }

    // ── BANK_TITULAR_MISMATCH — reserved for Sprint 3 client-name cross-check ──
    // Implemented when client name is available for comparison.
    // Placeholder: if fullName is null, alert (soft check)
    const fullName = accountHolder.fullName as string | undefined | null;
    if (!fullName || fullName.trim() === '') {
      alerts.push({
        code: 'BANK_TITULAR_MISMATCH',
        severity: 'WARNING',
        category: 'IDENTITY',
        message:
          'No se pudo extraer el nombre del titular. No es posible validar coincidencia con el cliente.',
        field: 'accountHolder.fullName',
        requiresManualReview: true,
      });
    }

    // ── BANK_NO_TITULAR_RFC — accountHolder.rfc is null (Sprint 3 identity validation) ──
    const accountRfc = accountHolder.rfc as string | undefined | null;
    if (!accountRfc || String(accountRfc).trim() === '') {
      alerts.push({
        code: 'BANK_NO_TITULAR_RFC',
        severity: 'WARNING',
        category: 'IDENTITY',
        message:
          'No se detectó el RFC del titular en el estado de cuenta. La validación de identidad contra INE, nómina y buró quedará incompleta.',
        field: 'accountHolder.rfc',
        requiresManualReview: true,
      });
    }

    // ── BANK_FEWER_MONTHS_THAN_REQUIRED — detectedDocumentMonths < required ──
    const detectedMonths = documentRequirementContext.detectedDocumentMonths as
      | number
      | undefined
      | null;
    const requiredMonths =
      documentRequirementContext.requiredBankStatementMonths as
        | number
        | undefined
        | null;
    if (
      detectedMonths != null &&
      typeof detectedMonths === 'number' &&
      requiredMonths != null &&
      typeof requiredMonths === 'number' &&
      detectedMonths < requiredMonths
    ) {
      alerts.push({
        code: 'BANK_FEWER_MONTHS_THAN_REQUIRED',
        severity: 'WARNING',
        category: 'REQUIREMENT',
        message: `Se detectaron ${detectedMonths} mes(es) de estado de cuenta pero se requieren ${requiredMonths}.`,
        field: 'documentRequirementContext.detectedDocumentMonths',
        requiresManualReview: true,
      });
    }

    // ── BANK_NO_RFC_DETECTED — all detectedPayerRfc are null ─────────────
    if (Array.isArray(payrollDeposits) && payrollDeposits.length > 0) {
      const allRfcNull = payrollDeposits.every(
        (d) =>
          d.detectedPayerRfc == null ||
          (d.detectedPayerRfc as string)?.trim() === '',
      );
      if (allRfcNull) {
        alerts.push({
          code: 'BANK_NO_RFC_DETECTED',
          severity: 'INFO',
          category: 'BANK_STATEMENT',
          message:
            'No se detectó RFC de pagador en ningún depósito de nómina. La conciliación usará fallback Nombre + Monto + Fecha.',
          field: 'payrollDeposits[].detectedPayerRfc',
          requiresManualReview: false,
        });
      }
    }

    // ── BANK_PAYROLL_MISMATCH — reserved for Sprint 3 payroll cross-match ──
    // Implemented when matchCandidateForPayrollReceipt data is populated
    // during reconciliation against payroll receipts.
    if (Array.isArray(payrollDeposits)) {
      const anyMismatch = payrollDeposits.some((d) => {
        const match = (d.matchCandidateForPayrollReceipt ?? {}) as Record<
          string,
          unknown
        >;
        const amountMatch = match.amountMatchesPayrollNetIncome;
        const dateMatch = match.dateMatchesPayrollPaymentDate;
        // Only flag when match data is present AND explicitly false
        return amountMatch === false || dateMatch === false;
      });
      if (anyMismatch) {
        alerts.push({
          code: 'BANK_PAYROLL_MISMATCH',
          severity: 'WARNING',
          category: 'BANK_STATEMENT',
          message:
            'Se detectaron discrepancias entre los depósitos bancarios y los recibos de nómina (monto o fecha).',
          field: 'payrollDeposits[].matchCandidateForPayrollReceipt',
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
    const accountHolder = (data.accountHolder ?? {}) as Record<string, unknown>;
    const bank = (data.bank ?? {}) as Record<string, unknown>;
    const statementPeriod = (data.statementPeriod ?? {}) as Record<
      string,
      unknown
    >;

    // Account holder
    if (
      !accountHolder.fullName ||
      (accountHolder.fullName as string)?.trim() === ''
    ) {
      missing.push('accountHolder.fullName');
    }
    if (
      !accountHolder.rfc ||
      (accountHolder.rfc as string)?.trim() === ''
    ) {
      missing.push('accountHolder.rfc');
    }

    // Bank info
    if (
      !bank.institutionName ||
      (bank.institutionName as string)?.trim() === ''
    ) {
      missing.push('bank.institutionName');
    }
    if (!bank.accountNumber || (bank.accountNumber as string)?.trim() === '') {
      missing.push('bank.accountNumber');
    }

    // Statement period
    if (!statementPeriod.periodStartDate) {
      missing.push('statementPeriod.periodStartDate');
    }
    if (!statementPeriod.periodEndDate) {
      missing.push('statementPeriod.periodEndDate');
    }

    return missing;
  }

  // -----------------------------------------------------------------------
  // Private: normalize alerts to Spanish
  // -----------------------------------------------------------------------

  private normalizeAlerts(alerts: ExtractionAlert[]): ExtractionAlert[] {
    return alerts.map((a) => {
      const map: Record<string, string> = {
        'No payroll deposits found.': 'No se detectaron depósitos de nómina.',
        'Non-MXN currency detected.': 'Se detectó moneda no MXN.',
        'Negative balance detected.': 'Se detectó saldo negativo.',
        'Joint account detected.': 'Se detectó cuenta mancomunada.',
      };
      const tr = map[a.message];
      return tr ? { ...a, message: tr } : a;
    });
  }

  // -----------------------------------------------------------------------
  // Private: normalize Gemini alert codes to backend-standard BANK_ codes
  // Ensures the dedup in Step 9 works when Gemini uses non-standard codes.
  // -----------------------------------------------------------------------

  private normalizeGeminiAlertCodes(data: Record<string, unknown>): void {
    if (!Array.isArray(data.alerts)) return;

    const codeMap: Record<string, string> = {
      // No payroll deposits
      NO_PAYROLL_DEPOSITS: 'BANK_NO_PAYROLL_DEPOSITS',
      no_payroll_deposits: 'BANK_NO_PAYROLL_DEPOSITS',
      EMPTY_PAYROLL_DEPOSITS: 'BANK_NO_PAYROLL_DEPOSITS',
      // Non-MXN currency
      NON_MXN_CURRENCY: 'BANK_NON_MXN_CURRENCY',
      non_mxn_currency: 'BANK_NON_MXN_CURRENCY',
      FOREIGN_CURRENCY: 'BANK_NON_MXN_CURRENCY',
      // Negative balance
      NEGATIVE_BALANCE: 'BANK_NEGATIVE_BALANCE',
      negative_balance: 'BANK_NEGATIVE_BALANCE',
      // Joint account
      JOINT_ACCOUNT: 'BANK_JOINT_ACCOUNT',
      joint_account: 'BANK_JOINT_ACCOUNT',
      // Incomplete month
      INCOMPLETE_MONTH: 'BANK_INCOMPLETE_MONTH',
      incomplete_month: 'BANK_INCOMPLETE_MONTH',
      // Missing period
      MISSING_PERIOD: 'BANK_MISSING_PERIOD',
      missing_period: 'BANK_MISSING_PERIOD',
      // Titular mismatch
      TITULAR_MISMATCH: 'BANK_TITULAR_MISMATCH',
      titular_mismatch: 'BANK_TITULAR_MISMATCH',
      MISSING_TITULAR: 'BANK_TITULAR_MISMATCH',
      // Fewer months
      FEWER_MONTHS: 'BANK_FEWER_MONTHS_THAN_REQUIRED',
      fewer_months: 'BANK_FEWER_MONTHS_THAN_REQUIRED',
      INSUFFICIENT_MONTHS: 'BANK_FEWER_MONTHS_THAN_REQUIRED',
      // No RFC
      NO_RFC_DETECTED: 'BANK_NO_RFC_DETECTED',
      no_rfc: 'BANK_NO_RFC_DETECTED',
      MISSING_RFC: 'BANK_NO_RFC_DETECTED',
      // Payroll mismatch
      PAYROLL_MISMATCH: 'BANK_PAYROLL_MISMATCH',
      payroll_mismatch: 'BANK_PAYROLL_MISMATCH',
      // No titular RFC
      NO_TITULAR_RFC: 'BANK_NO_TITULAR_RFC',
      no_titular_rfc: 'BANK_NO_TITULAR_RFC',
      MISSING_TITULAR_RFC: 'BANK_NO_TITULAR_RFC',
    };

    for (const a of data.alerts as ExtractionAlert[]) {
      if (a.code && codeMap[a.code]) {
        a.code = codeMap[a.code];
      }
    }
  }

  // -----------------------------------------------------------------------
  // Private: collect all transactions from extractedData
  // -----------------------------------------------------------------------
  private collectTransactions(
    data: Record<string, unknown>,
  ): RawTransaction[] {
    const transactions: RawTransaction[] = [];

    // 1. Check allTransactions array
    if (Array.isArray(data.allTransactions) && data.allTransactions.length > 0) {
      for (const t of data.allTransactions as Record<string, any>[]) {
        transactions.push({
          date: t.date || null,
          amount: typeof t.amount === 'number' ? t.amount : null,
          currency: t.currency || 'MXN',
          movementType: t.movementType || 'DEPOSIT',
          originalConcept: t.originalConcept || '',
          payerOrBeneficiaryName: t.payerOrBeneficiaryName || null,
          payerRfc: t.payerRfc || null,
          referenceNumber: t.referenceNumber || null,
        });
      }
      return transactions;
    }

    // 2. Fallback: consolidate from payrollDeposits & otherRelevantMovements
    if (Array.isArray(data.payrollDeposits)) {
      for (const p of data.payrollDeposits as Record<string, any>[]) {
        transactions.push({
          date: p.date || null,
          amount: typeof p.amount === 'number' ? p.amount : null,
          currency: p.currency || 'MXN',
          movementType: 'DEPOSIT',
          originalConcept: p.originalConcept || '',
          payerOrBeneficiaryName: p.detectedEmployerOrPayerName || null,
          payerRfc: p.detectedPayerRfc || null,
        });
      }
    }

    if (Array.isArray(data.otherRelevantMovements)) {
      for (const o of data.otherRelevantMovements as Record<string, any>[]) {
        transactions.push({
          date: o.date || null,
          amount: typeof o.amount === 'number' ? o.amount : null,
          currency: 'MXN',
          movementType: o.movementType || 'DEPOSIT',
          originalConcept: o.originalConcept || '',
        });
      }
    }

    return transactions;
  }

  // -----------------------------------------------------------------------
  // Private: append depuration alerts
  // -----------------------------------------------------------------------
  private appendDepurationAlerts(
    alerts: ExtractionAlert[],
    depurationResult: any,
  ): void {
    if (!depurationResult) return;

    // Critical mathematical discrepancy
    if (
      depurationResult.integrityCheck?.status === 'CRITICAL_DISCREPANCY'
    ) {
      alerts.push({
        code: 'STATEMENT_MATHEMATICAL_DISCREPANCY_CRITICAL',
        severity: 'CRITICAL',
        category: 'BANK_STATEMENT',
        message: depurationResult.integrityCheck.message,
        field: 'statementSummary.totalDepositsAmount',
        requiresManualReview: true,
      });
    } else if (
      depurationResult.integrityCheck?.status === 'MINOR_DIFFERENCE'
    ) {
      alerts.push({
        code: 'STATEMENT_MATHEMATICAL_DISCREPANCY_MINOR',
        severity: 'INFO',
        category: 'BANK_STATEMENT',
        message: depurationResult.integrityCheck.message,
        field: 'statementSummary.totalDepositsAmount',
        requiresManualReview: false,
      });
    }

    // High impact outliers
    if (
      Array.isArray(depurationResult.highImpactExceptions) &&
      depurationResult.highImpactExceptions.length > 0
    ) {
      alerts.push({
        code: 'STATEMENT_HIGH_IMPACT_OUTLIER_DETECTED',
        severity: 'WARNING',
        category: 'INCOME',
        message: `Se detectaron ${depurationResult.highImpactExceptions.length} depósito(s) atípico(s) de alto impacto que requieren confirmación rápida.`,
        field: 'financialDepuration.highImpactExceptions',
        requiresManualReview: true,
      });
    }
  }

  /**
   * Allows an analyst to manually approve (VALID) or discard (TRASH)
   * a single deposit transaction within financialDepuration, recalculating totals instantly.
   */
  async updateDepositClassification(
    documentId: string,
    depositIndex: number,
    body: {
      classification: 'VALID' | 'TRASH';
      reason?: string;
      trashCategory?: string;
    },
  ) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new Error(`Document ${documentId} not found`);
    }

    const data = (document.extractedData || {}) as Record<string, any>;
    const depuration = data.financialDepuration;

    if (!depuration || !Array.isArray(depuration.cleanedDeposits)) {
      throw new Error('No financial depuration data found on document');
    }

    if (depositIndex < 0 || depositIndex >= depuration.cleanedDeposits.length) {
      throw new Error(`Deposit index ${depositIndex} out of range`);
    }

    const dep = depuration.cleanedDeposits[depositIndex];
    dep.classification = body.classification;
    dep.isHighImpactOutlier = false;

    if (body.classification === 'VALID') {
      dep.validCategory = 'CONFIRMED_BY_ANALYST';
      dep.trashCategory = undefined;
      dep.reason = body.reason || 'Aprobado manualmente por la asesora';
    } else {
      dep.trashCategory = (body.trashCategory as any) || 'OTHER_NON_BUSINESS';
      dep.validCategory = undefined;
      dep.reason = body.reason || 'Descartado manualmente por la asesora';
    }

    // Recalculate totals
    let totalTrash = 0;
    let totalValid = 0;
    let trashCount = 0;
    let validCount = 0;
    let needsReviewCount = 0;
    const remainingExceptions: any[] = [];

    for (const d of depuration.cleanedDeposits) {
      if (d.classification === 'TRASH') {
        totalTrash += d.amount || 0;
        trashCount++;
      } else if (d.classification === 'VALID') {
        totalValid += d.amount || 0;
        validCount++;
      } else {
        needsReviewCount++;
      }

      if (d.classification === 'NEEDS_REVIEW' || d.isHighImpactOutlier) {
        remainingExceptions.push(d);
      }
    }

    depuration.depurationSummary = {
      ...depuration.depurationSummary,
      totalTrashDeposits: Math.round(totalTrash * 100) / 100,
      totalValidIncome: Math.round(totalValid * 100) / 100,
      trashDepositsCount: trashCount,
      validDepositsCount: validCount,
      needsReviewCount,
    };
    depuration.highImpactExceptions = remainingExceptions;

    // Update alerts: remove or update STATEMENT_HIGH_IMPACT_OUTLIER_DETECTED
    if (Array.isArray(data.alerts)) {
      data.alerts = data.alerts.filter(
        (a: any) => a.code !== 'STATEMENT_HIGH_IMPACT_OUTLIER_DETECTED',
      );
      if (remainingExceptions.length > 0) {
        data.alerts.push({
          code: 'STATEMENT_HIGH_IMPACT_OUTLIER_DETECTED',
          severity: 'WARNING',
          category: 'INCOME',
          message: `Se detectaron ${remainingExceptions.length} depósito(s) atípico(s) de alto impacto que requieren confirmación rápida.`,
          field: 'financialDepuration.highImpactExceptions',
          requiresManualReview: true,
        });
      }
    }

    const updated = await this.prisma.document.update({
      where: { id: documentId },
      data: { extractedData: data },
    });

    return updated.extractedData;
  }
}
