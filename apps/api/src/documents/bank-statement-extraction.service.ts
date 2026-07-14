import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiService, GeminiErrorCode } from './gemini.service';

// ---------------------------------------------------------------------------
// Document type codes that trigger bank-statement extraction
// ---------------------------------------------------------------------------
const BANK_STATEMENT_DOC_TYPES = ['BANK_STATEMENT'];

// ---------------------------------------------------------------------------
// RFC validation regex — post-Gemini deterministic cleanup
// ---------------------------------------------------------------------------
const RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

// ---------------------------------------------------------------------------
// Specialized instructions for bank-statement extraction
// ---------------------------------------------------------------------------
const BANK_STATEMENT_INSTRUCTIONS = [
  'Estado de cuenta bancario mexicano para análisis hipotecario.',
  '',
  'El documento puede tener CUALQUIER formato, layout, nombres de campos o posiciones.',
  'NO asumas que todos los estados de cuenta usan los mismos nombres. Analizá TODO el texto OCR.',
  '',
  '─── REGLA DE ORO ───',
  'NO inventes datos. Ante cualquier duda, usá null.',
  'Extraé ÚNICAMENTE de la información presente en el OCR.',
  '',
  '─── Titular (accountHolder) ───',
  '  fullName: nombre completo del titular de la cuenta. Buscar: TITULAR, NOMBRE DEL TITULAR,',
  '    NOMBRE, Cuenta de. Normalizar a MAYÚSCULAS.',
  '  rfc: RFC del titular de la cuenta (12-13 caracteres). Buscar: RFC, RFC TITULAR,',
  '    RFC CUENTAHABIENTE, RFC CLIENTE. Puede aparecer en el encabezado o junto al nombre.',
  '    Pista de regex RFC: [A-ZÑ&]{3,4}\\d{6}[A-Z0-9]{3}. Si no hay match claro, usar null.',
  '  isJointAccount: true si el estado de cuenta muestra dos o más titulares, "cuenta mancomunada",',
  '    "cuenta conjunta", o múltiples nombres con "Y" entre ellos. false si hay un solo titular claro.',
  '    null si no es evidente.',
  '',
  '─── Banco (bank) ───',
  '  institutionName: nombre del banco. Buscar: BANCO, INSTITUCIÓN, NOMBRE DEL BANCO.',
  '    Ejemplos: BBVA, BANORTE, SANTANDER, BANCOMER, HSBC, CITIBANAMEX, BANREGIO, etc.',
  '  accountNumber: número de cuenta (NO la CLABE). Suele tener 10-12 dígitos.',
  '  clabe: CLABE interbancaria (18 dígitos). Buscar: CLABE, CLABE INTERBANCARIA.',
  '',
  '─── Periodo del estado de cuenta (statementPeriod) ───',
  '  periodStartDate: fecha de inicio del periodo YYYY-MM-DD. Buscar: PERIODO, DESDE, FECHA INICIO.',
  '  periodEndDate: fecha de fin del periodo YYYY-MM-DD. Buscar: HASTA, FECHA FIN, FECHA DE CORTE.',
  '  cutoffDate: fecha de corte YYYY-MM-DD. Puede coincidir con periodEndDate.',
  '  isClosedMonth: true si corresponde a un mes cerrado (ej. mayo 2026 con fecha de corte 31/05).',
  '  isCurrentIncompleteMonth: true si corresponde al mes en curso que aún no cierra.',
  '  averageBalance: saldo promedio del periodo. Número decimal sin $ ni comas.',
  '  endingBalance: saldo final al cierre del periodo. Número decimal sin $ ni comas.',
  '',
  '─── Depósitos de nómina (payrollDeposits[]) ───',
  '  Extraé TODOS los depósitos que parezcan de nómina, pagos quincenales o mensuales del empleador.',
  '  Para cada depósito:',
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
  '  Extraé depósitos recurrentes que podrían ser de un empleador pero no tienen keyword de nómina claro.',
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
// Schema — output contract Gemini must fulfill (bank-statement.schema.md v1.1)
// ---------------------------------------------------------------------------
const BANK_STATEMENT_SCHEMA = {
  schemaVersion: '1.1',
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
// Extraction result envelope
// ---------------------------------------------------------------------------
export interface BankStatementExtractionResult {
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
export class BankStatementExtractionService {
  private readonly logger = new Logger(BankStatementExtractionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geminiService: GeminiService,
  ) {}

  static isBankStatementDocument(documentTypeCode: string): boolean {
    return BANK_STATEMENT_DOC_TYPES.includes(documentTypeCode);
  }

  async extract(
    caseId: string,
    documentId: string,
  ): Promise<BankStatementExtractionResult> {
    // ── 1. Fetch document with type + status ───────────────────────────
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { documentType: true, documentStatus: true },
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

    // ── 6. Call Gemini with specialized instructions ────────────────────
    const geminiResult = await this.geminiService.extractStructuredData(
      document.ocrText,
      document.documentType.code,
      { ...BANK_STATEMENT_SCHEMA },
      BANK_STATEMENT_INSTRUCTIONS,
    );

    if (!geminiResult.success) {
      this.logger.warn(
        `[BankStatement] Gemini extraction failed for doc ${documentId}: ${geminiResult.error?.code}`,
      );

      // Transition to EXTRACTION_ERROR so the UI can show the real state
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

    // ── 7. Normalize bank-statement fields ───────────────────────────────
    this.normalizeBankStatement(data);

    // ── 8. Compute alerts from normalized data ───────────────────────────
    const alerts = this.computeAlerts(data);
    const missingFields = this.computeMissingFields(data);

    // ── 9. Merge + dedup + filter contradictions ────────────────────────
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

  // -----------------------------------------------------------------------
  // Private: alert computation (post-normalization) — 10 BANK_ codes
  // -----------------------------------------------------------------------

  private computeAlerts(data: Record<string, unknown>): ExtractionAlert[] {
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

    // ── BANK_NO_PAYROLL_DEPOSITS — payrollDeposits[] empty ────────────────
    const hasPayrollDeposits =
      Array.isArray(payrollDeposits) && payrollDeposits.length > 0;
    if (!hasPayrollDeposits) {
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
}
