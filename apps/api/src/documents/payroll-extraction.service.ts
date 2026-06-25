import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiService, GeminiErrorCode } from './gemini.service';

// ---------------------------------------------------------------------------
// Document type codes that trigger payroll-receipt extraction
// ---------------------------------------------------------------------------
const PAYROLL_DOC_TYPES = ['PAYROLL_RECEIPT'];

// ---------------------------------------------------------------------------
// Specialized instructions for payroll receipt extraction (appended to the
// base SYSTEM_INSTRUCTION inside GeminiService).
// ---------------------------------------------------------------------------
const PAYROLL_INSTRUCTIONS = [
  'Recibo de nómina mexicano (CFDI de nómina).',

  'El documento debe contener los datos fiscales del comprobante.',
  'Analizá TODO el texto OCR; los datos del empleado, empleador, periodo, percepciones y deducciones.',
  '',
  'Empleado (employee):',
  '  - fullName: nombre completo del trabajador. Normalizar a MAYÚSCULAS.',
  '  - rfc: RFC del trabajador (13 caracteres para persona física).',
  '  - curp: CURP del trabajador (18 caracteres).',
  '  - employmentStartDate: fecha de ingreso o antigüedad (YYYY-MM-DD).',
  '  - employmentSeniorityText: texto de antigüedad tal cual aparece (ej. "2 AÑOS 5 MESES").',
  '  - contributesToImss: true si el recibo muestra retención IMSS, false si no.',
  '',
  'Empleador (employer):',
  '  - legalName: razón social del patrón. Normalizar a MAYÚSCULAS.',
  '  - rfc: RFC del patrón (12 caracteres para persona moral).',
  '  - possiblePayrollProvider: true si la razón social sugiere ser pagadora externa (ej. contiene "SERVICIOS", "OUTSOURCING", "ADMINISTRADORA" sin ser el empleador real).',
  '',
  'Periodo (payrollPeriod):',
  '  - periodStartDate: fecha de inicio del periodo (YYYY-MM-DD).',
  '  - periodEndDate: fecha de fin del periodo (YYYY-MM-DD).',
  '  - paymentDate: fecha de pago (YYYY-MM-DD).',
  '  - periodicity: periodicidad: WEEKLY, BIWEEKLY (quincenal), MONTHLY, OTHER, UNKNOWN.',
  '  - isClosedPeriod: true si el periodo ya finalizó.',
  '',
  'Ingresos (income):',
  '  - grossIncome: ingreso bruto total (número decimal, sin $ ni comas).',
  '  - totalDeductions: total de deducciones (número decimal).',
  '  - netIncome: ingreso neto = grossIncome - totalDeductions.',
  '  - currency: "MXN".',
  '  - incomeBehaviorDetected: FIXED si el ingreso es constante entre recibos, VARIABLE si hay comisiones/bonos/PTU, UNKNOWN si no se puede determinar.',
  '  - variablePerceptions: lista de percepciones variables (BONUS, COMMISSION, COMPENSATION, OVERTIME, PTU, OTHER) con description y amount.',
  '',
  'Deducciones (deductions):',
  '  - Lista de deducciones con type (TAX, IMSS, INFONAVIT, FONACOT, MORTGAGE_LOAN, ALIMONY, EMPLOYEE_LOAN, OTHER, UNKNOWN), description, amount.',
  '  - requiresAlert: true si la deducción es relevante para análisis de capacidad de pago (INFONAVIT, FONACOT, MORTGAGE_LOAN, ALIMONY).',
  '',
  'Timbrado fiscal (fiscalStamp):',
  '  - hasQrCode: true si el recibo tiene código QR detectable.',
  '  - hasSatDigitalSeal: true si tiene sello digital SAT.',
  '  - uuid: UUID del CFDI (36 caracteres con guiones).',
  '  - stampDate: fecha y hora de timbrado (ISO 8601).',
  '',
  'Preparación de cruce (crossCheckPreparation):',
  '  - expectedBankDepositAmount: monto neto esperado como depósito bancario.',
  '  - expectedBankDepositDate: fecha esperada del depósito.',
  '  - expectedEmployerName: nombre del empleador para cruce con depósitos.',
  '  - requiresBankStatementMatch: true.',
  '',
  'Contexto de requerimiento documental (documentRequirementContext):',
  '  - incomeBehavior: FIXED o VARIABLE (según lo detectado en income.incomeBehaviorDetected).',
  '  - requiredPayrollReceiptMonths: 3 para ingreso fijo, 6 para ingreso variable.',
  '  - requiredBankStatementMonths: mismo valor que requiredPayrollReceiptMonths.',
  '  - detectedDocumentMonths: null (el servicio lo calculará en post-procesamiento).',
  '  - isRequirementSatisfied: null (el servicio lo evaluará).',
  '  - requirementNotes: null.',
  '',
  'Reglas de alertas:',
  '  - Si falta netIncome, generar alerta CRITICAL PAYROLL_MISSING_NET_INCOME.',
  '  - Si falta employee.rfc, generar alerta WARNING PAYROLL_MISSING_EMPLOYEE_RFC.',
  '  - Si falta employee.fullName, generar alerta WARNING PAYROLL_MISSING_EMPLOYEE_NAME.',
  '  - Si falta payrollPeriod (periodStartDate o periodEndDate), generar alerta WARNING PAYROLL_MISSING_PERIOD.',
  '  - Si falta paymentDate, generar alerta WARNING PAYROLL_MISSING_PAYMENT_DATE.',
  '  - Si fiscalStamp.hasQrCode = false o fiscalStamp.hasSatDigitalSeal = false, generar alerta WARNING PAYROLL_NO_FISCAL_STAMP.',
  '  - Si hay deducciones de tipo MORTGAGE_LOAN, ALIMONY, INFONAVIT o FONACOT con requiresAlert = true, generar alerta WARNING por cada una.',
  '  - Si no se detecta employmentStartDate ni employmentSeniorityText, generar alerta WARNING PAYROLL_NO_SENIORITY.',
  '  - Si hay percepciones variables (variablePerceptions no vacío) y incomeBehavior = VARIABLE, generar alerta INFO (el post-procesamiento la convertirá en CRITICAL si hay < 6 meses).',
  '',
  'Regla de oro: NO inventes datos. Ante cualquier duda, usá null.',
].join('\n');

// ---------------------------------------------------------------------------
// Alert severity and category enums (matching common.schema.md)
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
// Schema — output contract Gemini must fulfill.
// ---------------------------------------------------------------------------
const PAYROLL_SCHEMA = {
  schemaVersion: '1.0',
  documentType: 'PAYROLL_RECEIPT',
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
  employee: {
    fullName: 'string | null',
    rfc: 'string | null',
    curp: 'string | null',
    employmentStartDate: 'YYYY-MM-DD | null',
    employmentSeniorityText: 'string | null',
    contributesToImss: 'boolean | null',
  },
  employer: {
    legalName: 'string | null',
    rfc: 'string | null',
    possiblePayrollProvider: 'boolean | null',
  },
  payrollPeriod: {
    periodStartDate: 'YYYY-MM-DD | null',
    periodEndDate: 'YYYY-MM-DD | null',
    paymentDate: 'YYYY-MM-DD | null',
    periodicity: 'WEEKLY | BIWEEKLY | MONTHLY | OTHER | UNKNOWN',
    isClosedPeriod: 'boolean | null',
  },
  income: {
    grossIncome: 'number | null',
    totalDeductions: 'number | null',
    netIncome: 'number | null',
    currency: 'MXN',
    incomeBehaviorDetected: 'FIXED | VARIABLE | UNKNOWN',
    variablePerceptions: [
      {
        type: 'BONUS | COMMISSION | COMPENSATION | OVERTIME | PTU | OTHER',
        description: 'string | null',
        amount: 'number | null',
      },
    ],
  },
  deductions: [
    {
      type: 'TAX | IMSS | INFONAVIT | FONACOT | MORTGAGE_LOAN | ALIMONY | EMPLOYEE_LOAN | OTHER | UNKNOWN',
      description: 'string | null',
      amount: 'number | null',
      requiresAlert: 'boolean',
    },
  ],
  fiscalStamp: {
    hasQrCode: 'boolean | null',
    hasSatDigitalSeal: 'boolean | null',
    uuid: 'string | null',
    stampDate: 'datetime | null',
  },
  crossCheckPreparation: {
    expectedBankDepositAmount: 'number | null',
    expectedBankDepositDate: 'YYYY-MM-DD | null',
    expectedEmployerName: 'string | null',
    requiresBankStatementMatch: true,
  },
  missingFields: [],
  alerts: [],
};

// ---------------------------------------------------------------------------
// Extraction result envelope
// ---------------------------------------------------------------------------
export interface PayrollExtractionResult {
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
export class PayrollExtractionService {
  private readonly logger = new Logger(PayrollExtractionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geminiService: GeminiService,
  ) {}

  // -----------------------------------------------------------------------
  // Public: document-type guard
  // -----------------------------------------------------------------------

  /** Returns true when the document type should trigger payroll extraction. */
  static isPayrollDocument(documentTypeCode: string): boolean {
    return PAYROLL_DOC_TYPES.includes(documentTypeCode);
  }

  // -----------------------------------------------------------------------
  // Public: main extraction method
  // -----------------------------------------------------------------------

  async extract(
    caseId: string,
    documentId: string,
  ): Promise<PayrollExtractionResult> {
    // 1. Fetch document with type + status
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { documentType: true, documentStatus: true },
    });

    if (!document || document.mortgageCaseId !== caseId) {
      throw new Error('Document not found');
    }

    // 2. Guard: must be PROCESSED (have OCR text)
    if (document.documentStatus.code !== 'PROCESSED') {
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

    // 3. Call Gemini with specialized instructions
    const promptSchema = { ...PAYROLL_SCHEMA };
    const geminiResult = await this.geminiService.extractStructuredData(
      document.ocrText,
      document.documentType.code,
      promptSchema,
      PAYROLL_INSTRUCTIONS,
    );

    // 4. Handle Gemini errors
    if (!geminiResult.success) {
      this.logger.warn(
        `[Payroll] Gemini extraction failed for doc ${documentId}: ${geminiResult.error?.code}`,
      );
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

    // 5. Post-process: compute alerts and missing fields
    const alerts = this.computeAlerts(data);
    const missingFields = this.computeMissingFields(data);

    // 6. Merge alerts into extractedData (dedup by code)
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

    // Merge missingFields
    if (Array.isArray(data.missingFields)) {
      const existingFields: string[] = (data.missingFields as unknown[])
        .filter((f): f is string => typeof f === 'string');
      data.missingFields = [
        ...existingFields,
        ...missingFields.filter((f) => !existingFields.includes(f)),
      ];
    } else {
      data.missingFields = missingFields;
    }

    // 7. Normalize alerts to Spanish
    data.alerts = this.normalizeAlerts(
      (data.alerts as ExtractionAlert[]) ?? [],
    );

    // 8. Persist extractedData to DB
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await this.prisma.document.update({
        where: { id: documentId },
        data: { extractedData: data as any },
      });
    } catch (dbError) {
      this.logger.error(
        `[Payroll] Failed to persist extractedData for doc ${documentId}: ${(dbError as Error).message}`,
      );
      // Non-blocking — return the data even if persistence fails
    }

    return {
      success: true,
      documentId,
      extractedData: data,
      alerts,
      missingFields,
    };
  }

  // -----------------------------------------------------------------------
  // Private: alert computation
  // -----------------------------------------------------------------------

  private computeAlerts(data: Record<string, unknown>): ExtractionAlert[] {
    const alerts: ExtractionAlert[] = [];

    const employee =
      (data.employee as Record<string, unknown> | undefined) ?? {};
    const employer =
      (data.employer as Record<string, unknown> | undefined) ?? {};
    const payrollPeriod =
      (data.payrollPeriod as Record<string, unknown> | undefined) ?? {};
    const income =
      (data.income as Record<string, unknown> | undefined) ?? {};
    const fiscalStamp =
      (data.fiscalStamp as Record<string, unknown> | undefined) ?? {};
    const deductions = data.deductions as Record<string, unknown>[] | undefined;
    const variablePerceptions = income.variablePerceptions as
      | Record<string, unknown>[]
      | undefined;

    // --- Missing net income ---
    const netIncome = income.netIncome as number | undefined | null;
    if (netIncome == null) {
      alerts.push({
        code: 'PAYROLL_MISSING_NET_INCOME',
        severity: 'CRITICAL',
        category: 'INCOME',
        message:
          'No se pudo extraer el ingreso neto del recibo de nómina.',
        field: 'income.netIncome',
        requiresManualReview: true,
      });
    }

    // --- Missing employee RFC ---
    const employeeRfc = employee.rfc as string | undefined | null;
    if (!employeeRfc || employeeRfc.trim() === '') {
      alerts.push({
        code: 'PAYROLL_MISSING_EMPLOYEE_RFC',
        severity: 'WARNING',
        category: 'INCOME',
        message:
          'No se detectó el RFC del empleado en el recibo de nómina.',
        field: 'employee.rfc',
        requiresManualReview: true,
      });
    }

    // --- Missing employee name ---
    const employeeName = employee.fullName as string | undefined | null;
    if (!employeeName || employeeName.trim() === '') {
      alerts.push({
        code: 'PAYROLL_MISSING_EMPLOYEE_NAME',
        severity: 'WARNING',
        category: 'INCOME',
        message:
          'No se detectó el nombre del empleado en el recibo de nómina.',
        field: 'employee.fullName',
        requiresManualReview: true,
      });
    }

    // --- Missing payroll period ---
    const periodStart = payrollPeriod.periodStartDate as
      | string
      | undefined
      | null;
    const periodEnd = payrollPeriod.periodEndDate as
      | string
      | undefined
      | null;
    if (!periodStart && !periodEnd) {
      alerts.push({
        code: 'PAYROLL_MISSING_PERIOD',
        severity: 'WARNING',
        category: 'INCOME',
        message:
          'No se detectó el periodo del recibo de nómina.',
        field: 'payrollPeriod',
        requiresManualReview: true,
      });
    }

    // --- Missing payment date ---
    const paymentDate = payrollPeriod.paymentDate as
      | string
      | undefined
      | null;
    if (!paymentDate || paymentDate.trim() === '') {
      alerts.push({
        code: 'PAYROLL_MISSING_PAYMENT_DATE',
        severity: 'WARNING',
        category: 'INCOME',
        message:
          'No se detectó la fecha de pago del recibo de nómina.',
        field: 'payrollPeriod.paymentDate',
        requiresManualReview: true,
      });
    }

    // --- No fiscal stamp ---
    const hasQr = fiscalStamp.hasQrCode as boolean | undefined | null;
    const hasSeal = fiscalStamp.hasSatDigitalSeal as
      | boolean
      | undefined
      | null;
    if (hasQr === false || hasSeal === false) {
      alerts.push({
        code: 'PAYROLL_NO_FISCAL_STAMP',
        severity: 'WARNING',
        category: 'DOCUMENT_QUALITY',
        message:
          'No se detectó timbrado fiscal (QR o sello digital SAT) en el recibo.',
        field: 'fiscalStamp',
        requiresManualReview: true,
      });
    }

    // --- Relevant deductions (mortgage, alimony, INFONAVIT, FONACOT) ---
    const relevantDeductionTypes = [
      'MORTGAGE_LOAN',
      'ALIMONY',
      'INFONAVIT',
      'FONACOT',
    ];
    if (Array.isArray(deductions)) {
      for (const ded of deductions) {
        const dType = (ded.type as string) ?? '';
        const requiresAlert = ded.requiresAlert === true;
        if (relevantDeductionTypes.includes(dType) && requiresAlert) {
          const desc = (ded.description as string) ?? dType;
          const amount = ded.amount as number | undefined;
          alerts.push({
            code: `PAYROLL_DEDUCTION_${dType}`,
            severity: 'WARNING',
            category: 'INCOME',
            message: `Deducción por ${desc} detectada${amount != null ? `: $${amount.toLocaleString('es-MX')}` : ''}. Puede afectar la capacidad de pago.`,
            field: `deductions[${dType}]`,
            requiresManualReview: true,
          });
        }
      }
    }

    // --- Missing employment seniority ---
    const employmentStart = employee.employmentStartDate as
      | string
      | undefined
      | null;
    const seniorityText = employee.employmentSeniorityText as
      | string
      | undefined
      | null;
    if (
      (!employmentStart || employmentStart.trim() === '') &&
      (!seniorityText || seniorityText.trim() === '')
    ) {
      alerts.push({
        code: 'PAYROLL_NO_SENIORITY',
        severity: 'WARNING',
        category: 'INCOME',
        message:
          'No se detectó fecha de ingreso ni antigüedad laboral. Si se requiere comprobar antigüedad, solicitar nómina antigua de al menos 7 meses.',
        field: 'employee.employmentStartDate',
        requiresManualReview: true,
      });
    }

    // --- Variable income detected ---
    const hasVariablePerceptions =
      Array.isArray(variablePerceptions) &&
      variablePerceptions.length > 0;
    const incomeBehavior = income.incomeBehaviorDetected as
      | string
      | undefined;
    if (hasVariablePerceptions && incomeBehavior !== 'FIXED') {
      alerts.push({
        code: 'PAYROLL_VARIABLE_INCOME_DETECTED',
        severity: 'INFO',
        category: 'INCOME',
        message:
          'Se detectaron percepciones variables en el recibo de nómina.',
        field: 'income.variablePerceptions',
        requiresManualReview: false,
      });
    }

    // --- Possible payroll provider (outsourcing) ---
    const possibleProvider = employer.possiblePayrollProvider as
      | boolean
      | undefined
      | null;
    if (possibleProvider === true) {
      const employerName =
        (employer.legalName as string) ?? 'desconocido';
      alerts.push({
        code: 'PAYROLL_POSSIBLE_PROVIDER',
        severity: 'WARNING',
        category: 'INCOME',
        message: `La razón social "${employerName}" podría ser una pagadora externa y no el empleador real. Verificar relación laboral.`,
        field: 'employer.possiblePayrollProvider',
        requiresManualReview: true,
      });
    }

    return alerts;
  }

  // -----------------------------------------------------------------------
  // Private: missing field detection
  // -----------------------------------------------------------------------

  private computeMissingFields(data: Record<string, unknown>): string[] {
    const missing: string[] = [];
    const employee =
      (data.employee as Record<string, unknown> | undefined) ?? {};
    const income =
      (data.income as Record<string, unknown> | undefined) ?? {};
    const payrollPeriod =
      (data.payrollPeriod as Record<string, unknown> | undefined) ?? {};

    // Employee fields
    if (
      !employee.fullName ||
      (employee.fullName as string)?.trim() === ''
    ) {
      missing.push('employee.fullName');
    }
    if (!employee.rfc || (employee.rfc as string)?.trim() === '') {
      missing.push('employee.rfc');
    }

    // Income fields
    if (income.netIncome == null) {
      missing.push('income.netIncome');
    }
    if (income.grossIncome == null) {
      missing.push('income.grossIncome');
    }

    // Period fields
    if (!payrollPeriod.periodStartDate && !payrollPeriod.periodEndDate) {
      missing.push('payrollPeriod');
    }
    if (
      !payrollPeriod.paymentDate ||
      (payrollPeriod.paymentDate as string)?.trim() === ''
    ) {
      missing.push('payrollPeriod.paymentDate');
    }

    return missing;
  }

  // -----------------------------------------------------------------------
  // Private: normalize alerts to Spanish
  // -----------------------------------------------------------------------

  private normalizeAlerts(alerts: ExtractionAlert[]): ExtractionAlert[] {
    return alerts.map((a) => {
      const englishToSpanish: Record<string, string> = {
        'Variable income detected.':
          'Se detectaron percepciones variables en el recibo de nómina.',
        'Missing employee RFC.':
          'No se detectó el RFC del empleado en el recibo de nómina.',
        'Missing employee name.':
          'No se detectó el nombre del empleado en el recibo de nómina.',
      };
      const translated = englishToSpanish[a.message];
      if (translated) {
        return { ...a, message: translated };
      }
      return a;
    });
  }
}
