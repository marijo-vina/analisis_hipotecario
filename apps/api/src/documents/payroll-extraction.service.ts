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
  '     Buscar explícitamente: "Fecha de Ingreso", "Fecha ingreso", "Ingreso", "Antigüedad".',
  '     Normalizar a YYYY-MM-DD. Ej: "20/12/2001" → "2001-12-20".',
  '  - employmentSeniorityText: texto de antigüedad tal cual aparece (ej. "21 AÑOS 7 QNAS 10 DIAS", "2 AÑOS 5 MESES").',
  '     Buscar: "Antigüedad efectiva", "Antigüedad", "Antigüedad laboral".',
  '  - contributesToImss: true si el recibo muestra evidencia de cotización al IMSS.',
  '     Evidencia incluye: NSS (Número de Seguridad Social), Registro Patronal,',
  '     emisor relacionado con IMSS, deducciones de seguridad social,',
  '     CFDI de nómina timbrado con régimen de sueldos y salarios.',
  '     Para recibos del IMSS como empleador: marcar true.',
  '  - imssEvidence: texto breve con la evidencia encontrada (ej. "NSS y registro patronal detectados", "Emisor IMSS").',
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
  '     La UI traducirá estos códigos a español. No escribas etiquetas en español aquí.',
  '  - isClosedPeriod: true si el periodo ya finalizó.',
  '',
  'Ingresos (income):',
  '  - grossIncome: ingreso bruto total (número decimal, sin $ ni comas).',
  '  - totalDeductions: total de deducciones (número decimal).',
  '  - netIncome: ingreso neto = grossIncome - totalDeductions.',
  '  - currency: "MXN".',
  '  - incomeBehaviorDetected: FIXED si el ingreso es constante entre recibos, VARIABLE si hay comisiones/bonos/PTU, UNKNOWN si no se puede determinar.',
  '  - isVariableIncome: true si se detectan percepciones variables o conceptos no base.',
  '  - variablePerceptions: lista de percepciones variables o no base.',
  '     Identificar conceptos como: BONUS, COMMISSION (comisiones), COMPENSATION,',
  '     OVERTIME (horas extra), VACATION_BONUS (prima vacacional),',
  '     INCENTIVE (estímulos, bonificaciones), OTHER (ayudas, sobresueldos).',
  '     Incluir también: prima vacacional, estímulo por puntualidad,',
  '     bonificación seguro médico, atención integral contínua,',
  '     ayudas extraordinarias, o cualquier concepto que no sea sueldo base fijo.',
  '     Cada entrada: type, description y amount.',
  '',
  'Deducciones (deductions):',
  '  - Lista de deducciones con type (TAX, IMSS, INFONAVIT, FONACOT, MORTGAGE_LOAN, ALIMONY, EMPLOYEE_LOAN, OTHER, UNKNOWN), description, amount.',
  '  - requiresAlert: true si la deducción es relevante para análisis de capacidad de pago (INFONAVIT, FONACOT, MORTGAGE_LOAN, ALIMONY).',
  '',
  'Timbrado fiscal (fiscalStamp):',
  '  - hasQrCode: true si el recibo tiene código QR detectable.',
  '  - hasSatDigitalSeal: true si tiene sello digital SAT.',
  '  - hasCfdiStamp: true si tiene cadena original, sello CFDI, o No. de Serie del Certificado SAT.',
  '  - fiscalFolio: UUID del CFDI o folio fiscal (36 caracteres con guiones).',
  '  - certificationDate: fecha y hora de certificación (ISO 8601).',
  '',
  'Preparación de cruce (crossCheckPreparation):',
  '  - expectedBankDepositAmount: monto neto esperado como depósito bancario.',
  '  - expectedBankDepositDate: fecha esperada del depósito.',
  '  - expectedEmployerName: nombre del empleador para cruce con depósitos.',
  '  - requiresBankStatementMatch: true.',
  '',
  'Contexto de requerimiento documental (documentRequirementContext):',
  '  - incomeBehavior: FIXED o VARIABLE.',
  '  - requiredPayrollReceiptMonths: 3 para ingreso fijo, 6 para ingreso variable.',
  '  - requiredBankStatementMonths: mismo valor que requiredPayrollReceiptMonths.',
  '  - detectedDocumentMonths: null.',
  '  - isRequirementSatisfied: null.',
  '  - requirementNotes: null.',
  '',
  'Employment (employment):',
  '  - hireDate: fecha de ingreso normalizada a YYYY-MM-DD.',
  '  - seniorityText: texto original de antigüedad.',
  '  - hasMinimumSeniority: true si la antigüedad o fecha de ingreso indican >= 6 meses. null si no se puede determinar.',
  '  - contributesToImss: true si hay evidencia de cotización IMSS.',
  '  - imssEvidence: texto breve con la evidencia encontrada.',
  '',
  'Reglas de alertas:',
  '  - Si falta netIncome, generar alerta CRITICAL PAYROLL_MISSING_NET_INCOME.',
  '  - Si falta employee.rfc, generar alerta WARNING PAYROLL_MISSING_EMPLOYEE_RFC.',
  '  - Si falta employee.fullName, generar alerta WARNING PAYROLL_MISSING_EMPLOYEE_NAME.',
  '  - Si falta payrollPeriod, generar alerta WARNING PAYROLL_MISSING_PERIOD.',
  '  - Si falta paymentDate, generar alerta WARNING PAYROLL_MISSING_PAYMENT_DATE.',
  '  - Si NO hay evidencia de timbrado (sin QR, sin sello SAT, sin CFDI, sin folio fiscal, sin fecha certificación), generar alerta WARNING PAYROLL_NO_FISCAL_STAMP.',
  '  - Si hay deducciones de tipo MORTGAGE_LOAN, ALIMONY, INFONAVIT o FONACOT con requiresAlert = true, generar alerta WARNING por cada una.',
  '  - Si no se detecta hireDate ni seniorityText, generar alerta WARNING PAYROLL_NO_SENIORITY.',
  '  - Si hay percepciones variables o isVariableIncome = true, generar alerta WARNING PAYROLL_VARIABLE_INCOME.',
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
    imssEvidence: 'string | null',
  },
  employment: {
    hireDate: 'YYYY-MM-DD | null',
    seniorityText: 'string | null',
    hasMinimumSeniority: 'boolean | null',
    contributesToImss: 'boolean | null',
    imssEvidence: 'string | null',
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
    isVariableIncome: 'boolean | null',
    variablePerceptions: [
      {
        type: 'BONUS | COMMISSION | COMPENSATION | OVERTIME | VACATION_BONUS | INCENTIVE | OTHER',
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
    hasCfdiStamp: 'boolean | null',
    fiscalFolio: 'string | null',
    certificationDate: 'datetime | null',
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

  /** Returns true when the document type should trigger payroll extraction. */
  static isPayrollDocument(documentTypeCode: string): boolean {
    return PAYROLL_DOC_TYPES.includes(documentTypeCode);
  }

  async extract(
    caseId: string,
    documentId: string,
  ): Promise<PayrollExtractionResult> {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { documentType: true, documentStatus: true },
    });

    if (!document || document.mortgageCaseId !== caseId) {
      throw new Error('Document not found');
    }

    if (document.documentStatus.code !== 'PROCESSED') {
      return {
        success: false,
        documentId,
        extractedData: null,
        alerts: [],
        missingFields: [],
        error: {
          code: 'DOCUMENT_NOT_PROCESSED',
          message: 'El documento debe estar procesado (OCR) antes de la extracción.',
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

    const promptSchema = { ...PAYROLL_SCHEMA };
    const geminiResult = await this.geminiService.extractStructuredData(
      document.ocrText,
      document.documentType.code,
      promptSchema,
      PAYROLL_INSTRUCTIONS,
    );

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
          ? { code: geminiResult.error.code, message: geminiResult.error.message }
          : { code: 'UNKNOWN', message: 'Extraction failed' },
      };
    }

    const data = geminiResult.extractedData as Record<string, unknown>;

    const alerts = this.computeAlerts(data);
    const missingFields = this.computeMissingFields(data);

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
      const existingFields: string[] = (data.missingFields as unknown[])
        .filter((f): f is string => typeof f === 'string');
      data.missingFields = [
        ...existingFields,
        ...missingFields.filter((f) => !existingFields.includes(f)),
      ];
    } else {
      data.missingFields = missingFields;
    }

    data.alerts = this.normalizeAlerts((data.alerts as ExtractionAlert[]) ?? []);

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

    const employee = (data.employee as Record<string, unknown> | undefined) ?? {};
    const employment = (data.employment as Record<string, unknown> | undefined) ?? {};
    const employer = (data.employer as Record<string, unknown> | undefined) ?? {};
    const payrollPeriod = (data.payrollPeriod as Record<string, unknown> | undefined) ?? {};
    const income = (data.income as Record<string, unknown> | undefined) ?? {};
    const fiscalStamp = (data.fiscalStamp as Record<string, unknown> | undefined) ?? {};
    const deductions = data.deductions as Record<string, unknown>[] | undefined;
    const variablePerceptions = income.variablePerceptions as Record<string, unknown>[] | undefined;

    // --- Missing net income ---
    if (income.netIncome == null) {
      alerts.push({
        code: 'PAYROLL_MISSING_NET_INCOME',
        severity: 'CRITICAL',
        category: 'INCOME',
        message: 'No se pudo extraer el ingreso neto del recibo de nómina.',
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
        message: 'No se detectó el RFC del empleado en el recibo de nómina.',
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
        message: 'No se detectó el nombre del empleado en el recibo de nómina.',
        field: 'employee.fullName',
        requiresManualReview: true,
      });
    }

    // --- Missing payroll period ---
    const periodStart = payrollPeriod.periodStartDate as string | undefined | null;
    const periodEnd = payrollPeriod.periodEndDate as string | undefined | null;
    if (!periodStart && !periodEnd) {
      alerts.push({
        code: 'PAYROLL_MISSING_PERIOD',
        severity: 'WARNING',
        category: 'INCOME',
        message: 'No se detectó el periodo del recibo de nómina.',
        field: 'payrollPeriod',
        requiresManualReview: true,
      });
    }

    // --- Missing payment date ---
    const paymentDate = payrollPeriod.paymentDate as string | undefined | null;
    if (!paymentDate || paymentDate.trim() === '') {
      alerts.push({
        code: 'PAYROLL_MISSING_PAYMENT_DATE',
        severity: 'WARNING',
        category: 'INCOME',
        message: 'No se detectó la fecha de pago del recibo de nómina.',
        field: 'payrollPeriod.paymentDate',
        requiresManualReview: true,
      });
    }

    // --- No fiscal stamp — use isStamped logic ────────────────────────
    if (!this.isStamped(fiscalStamp)) {
      alerts.push({
        code: 'PAYROLL_NO_FISCAL_STAMP',
        severity: 'WARNING',
        category: 'DOCUMENT_QUALITY',
        message: 'No se detectó timbrado fiscal (QR, sello digital SAT, CFDI o folio fiscal) en el recibo.',
        field: 'fiscalStamp',
        requiresManualReview: true,
      });
    }

    // --- Relevant deductions (mortgage, alimony, INFONAVIT, FONACOT) ---
    const relevantDeductionTypes = ['MORTGAGE_LOAN', 'ALIMONY', 'INFONAVIT', 'FONACOT'];
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

    // --- Missing employment seniority ─────────────────────────────────
    const hireDate = (employment.hireDate ?? employee.employmentStartDate) as string | undefined | null;
    const seniorityText = (employment.seniorityText ?? employee.employmentSeniorityText) as string | undefined | null;
    if (
      (!hireDate || hireDate.trim() === '') &&
      (!seniorityText || seniorityText.trim() === '')
    ) {
      alerts.push({
        code: 'PAYROLL_NO_SENIORITY',
        severity: 'WARNING',
        category: 'INCOME',
        message: 'No se detectó fecha de ingreso ni antigüedad laboral. Solicitar al cliente una nómina antigua para validar al menos 6 meses de antigüedad.',
        field: 'employment.hireDate',
        requiresManualReview: true,
      });
    }

    // --- Variable income detected ─────────────────────────────────────
    const isVariableIncome = income.isVariableIncome === true;
    const hasVariablePerceptions = Array.isArray(variablePerceptions) && variablePerceptions.length > 0;
    const incomeBehavior = income.incomeBehaviorDetected as string | undefined;
    if (hasVariablePerceptions || isVariableIncome || (incomeBehavior && incomeBehavior !== 'FIXED' && incomeBehavior !== 'UNKNOWN')) {
      alerts.push({
        code: 'PAYROLL_VARIABLE_INCOME',
        severity: 'WARNING',
        category: 'INCOME',
        message: 'El recibo contiene percepciones variables o conceptos no base. La asesora debe revisar si se requieren 6 meses de recibos para promediar ingresos.',
        field: 'income.variablePerceptions',
        requiresManualReview: true,
      });
    }

    // --- Possible payroll provider (outsourcing) ---
    const possibleProvider = employer.possiblePayrollProvider as boolean | undefined | null;
    if (possibleProvider === true) {
      const empName = (employer.legalName as string) ?? 'desconocido';
      alerts.push({
        code: 'PAYROLL_POSSIBLE_PROVIDER',
        severity: 'WARNING',
        category: 'INCOME',
        message: `La razón social "${empName}" podría ser una pagadora externa y no el empleador real. Verificar relación laboral.`,
        field: 'employer.possiblePayrollProvider',
        requiresManualReview: true,
      });
    }

    return alerts;
  }

  /**
   * Determines whether the fiscal stamp evidence indicates the receipt
   * is properly stamped. True if ANY of these are detected:
   * QR, SAT digital seal, CFDI stamp, fiscal folio/UUID, or certification date.
   */
  private isStamped(fiscalStamp: Record<string, unknown>): boolean {
    const hasQr = fiscalStamp.hasQrCode === true;
    const hasSeal = fiscalStamp.hasSatDigitalSeal === true;
    const hasCfdi = fiscalStamp.hasCfdiStamp === true;
    const hasFolio = !!fiscalStamp.fiscalFolio && String(fiscalStamp.fiscalFolio).trim() !== '';
    const hasCertDate = !!fiscalStamp.certificationDate && String(fiscalStamp.certificationDate).trim() !== '';
    return hasQr || hasSeal || hasCfdi || hasFolio || hasCertDate;
  }

  // -----------------------------------------------------------------------
  // Private: missing field detection
  // -----------------------------------------------------------------------

  private computeMissingFields(data: Record<string, unknown>): string[] {
    const missing: string[] = [];
    const employee = (data.employee as Record<string, unknown> | undefined) ?? {};
    const income = (data.income as Record<string, unknown> | undefined) ?? {};
    const payrollPeriod = (data.payrollPeriod as Record<string, unknown> | undefined) ?? {};
    const employment = (data.employment as Record<string, unknown> | undefined) ?? {};

    if (!employee.fullName || (employee.fullName as string)?.trim() === '') {
      missing.push('employee.fullName');
    }
    if (!employee.rfc || (employee.rfc as string)?.trim() === '') {
      missing.push('employee.rfc');
    }
    if (income.netIncome == null) {
      missing.push('income.netIncome');
    }
    if (income.grossIncome == null) {
      missing.push('income.grossIncome');
    }
    if (!payrollPeriod.periodStartDate && !payrollPeriod.periodEndDate) {
      missing.push('payrollPeriod');
    }
    if (!payrollPeriod.paymentDate || (payrollPeriod.paymentDate as string)?.trim() === '') {
      missing.push('payrollPeriod.paymentDate');
    }
    // Employment
    const hireDate = (employment.hireDate ?? employee.employmentStartDate) as string | undefined | null;
    const seniorityText = (employment.seniorityText ?? employee.employmentSeniorityText) as string | undefined | null;
    if ((!hireDate || hireDate.trim() === '') && (!seniorityText || seniorityText.trim() === '')) {
      missing.push('employment.hireDate');
    }

    return missing;
  }

  // -----------------------------------------------------------------------
  // Private: normalize alerts to Spanish
  // -----------------------------------------------------------------------

  private normalizeAlerts(alerts: ExtractionAlert[]): ExtractionAlert[] {
    return alerts.map((a) => {
      const englishToSpanish: Record<string, string> = {
        'Variable income detected.': 'Se detectaron percepciones variables en el recibo de nómina.',
        'Missing employee RFC.': 'No se detectó el RFC del empleado en el recibo de nómina.',
        'Missing employee name.': 'No se detectó el nombre del empleado en el recibo de nómina.',
      };
      const translated = englishToSpanish[a.message];
      if (translated) return { ...a, message: translated };
      return a;
    });
  }
}
