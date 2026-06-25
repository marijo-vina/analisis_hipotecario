import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiService, GeminiErrorCode } from './gemini.service';

// ---------------------------------------------------------------------------
// Document type codes that trigger payroll-receipt extraction
// ---------------------------------------------------------------------------
const PAYROLL_DOC_TYPES = ['PAYROLL_RECEIPT'];

// ---------------------------------------------------------------------------
// Specialized instructions — format-agnostic, alias-aware
// ---------------------------------------------------------------------------
const PAYROLL_INSTRUCTIONS = [
  'Recibo de nómina mexicano (CFDI de nómina).',

  'El documento puede tener CUALQUIER formato, layout, nombres de campos o posiciones.',
  'NO asumas que todos los recibos usan los mismos nombres. Analizá TODO el texto OCR.',

  '─── REGLA DE ORO ───',
  'NO inventes datos. Ante cualquier duda, usá null.',
  'Extraé ÚNICAMENTE de la información presente en el OCR.',
  'Para cada campo que extraigas, guardá el texto original en el bloque "evidence" (opcional pero recomendado).',

  '─── Empleado (employee) ───',
  '  fullName: nombre completo del trabajador. Buscar: NOMBRE, EMPLEADO, TRABAJADOR, NOMBRE DEL TRABAJADOR. Normalizar a MAYÚSCULAS.',
  '  rfc: RFC del trabajador (13 caracteres). Buscar: RFC, RFC EMPLEADO, RFC TRABAJADOR.',
  '  curp: CURP del trabajador (18 caracteres). Buscar: CURP.',

  '─── Empleador (employer) ───',
  '  legalName: razón social. Buscar: EMPLEADOR, PATRÓN, RAZÓN SOCIAL, NOMBRE DEL PATRÓN, EMISOR, NOMBRE DEL EMISOR. Normalizar a MAYÚSCULAS.',
  '  rfc: RFC del patrón (12 caracteres). Buscar: RFC, RFC EMPLEADOR, RFC PATRÓN, RFC EMISOR.',
  '  possiblePayrollProvider: true si la razón social sugiere pagadora externa (contiene SERVICIOS, OUTSOURCING, ADMINISTRADORA, o no coincide con empleador real).',

  '─── Periodo de pago (payrollPeriod) ───',
  '  El periodo puede aparecer en MUCHOS formatos. Aceptá cualquiera:',
  '    - Rango: "Del 01/05/2025 al 15/05/2025", "01/05/2025 - 15/05/2025", "2025-05-01 a 2025-05-15"',
  '    - Operativo: "1A-MAY-2025", "Qna: 09/2025", "Semana 18", "Mayo 2025", "Segunda quincena mayo 2025"',
  '    - Período de pago: "1A-MAY-2025", "Periodo de pago: 1A-MAY-2025"',
  '  - periodStartDate: fecha inicio YYYY-MM-DD. null si no hay fecha explícita.',
  '  - periodEndDate: fecha fin YYYY-MM-DD. null si no hay fecha explícita.',
  '  - periodRaw: el texto original del periodo tal cual aparece (ej. "1A-MAY-2025", "Qna: 09/2025").',
  '  - periodLabel: una etiqueta para mostrar en UI (ej. "1A Quincena Mayo 2025").',
  '  - paymentDate: fecha de pago YYYY-MM-DD. Buscar: FECHA DE PAGO, FECHA PAGO, FECHA DE EMISIÓN.',
  '    ⚠️ NO uses la fecha de certificación/timbrado como paymentDate a menos que el recibo diga explícitamente que es la fecha de pago.',
  '  - periodicity: WEEKLY, BIWEEKLY, MONTHLY, OTHER, UNKNOWN.',

  '─── Ingresos (income) ───',
  '  Buscar ingreso BRUTO bajo CUALQUIERA de estos alias:',
  '    Total percepciones, Percepciones, Total devengado, Total ingresos, Total haberes,',
  '    Sueldo bruto, Bruto, Ingreso bruto, Total bruto, Importe bruto.',
  '  - grossIncome: número decimal, sin $ ni comas.',

  '  Buscar ingreso NETO bajo CUALQUIERA de estos alias:',
  '    Líquido, Neto, Neto pagado, Total neto, Importe neto, Neto a pagar,',
  '    Pago neto, Total a pagar, Total depositado, Alcance líquido, Alcance neto, Depósito.',
  '  - netIncome: número decimal, sin $ ni comas.',

  '  Buscar deducciones bajo CUALQUIERA de estos alias:',
  '    Total deducciones, Deducciones, Descuentos, Retenciones, Total descuentos, Importe deducciones.',
  '  - totalDeductions: número decimal.',
  '  - currency: "MXN".',
  '  - incomeBehaviorDetected: FIXED, VARIABLE, UNKNOWN.',

  '  ─── Percepciones (desglose) ───',
  '  Clasificá CADA percepción en una de estas categorías:',
  '    BASE (fija): sueldo base, sueldo ordinario, salario, sueldo fijo, salario base.',
  '    VARIABLE: bono, comisión, compensación, horas extra, prima vacacional, incentivo, estímulo,',
  '              premio, gratificación, PTU, ayuda extraordinaria, sobresueldo, productividad,',
  '              puntualidad, asistencia, bonificación.',
  '    SPECIAL: atención integral contínua, bonificación seguro médico, vales, fondo de ahorro,',
  '             ayuda de transporte (si no es parte del sueldo base).',
  '    UNCLASSIFIED: si no estás seguro, marcalo como UNCLASSIFIED.',
  '  - variablePerceptions: array con type (BONUS, COMMISSION, COMPENSATION, OVERTIME, VACATION_BONUS,',
  '    INCENTIVE, PTU, OTHER), description, amount, y classification (BASE, VARIABLE, SPECIAL, UNCLASSIFIED).',
  '  - isVariableIncome: true si hay percepciones clasificadas como VARIABLE o SPECIAL.',

  '  ─── Deducciones (desglose) ───',
  '  Cada deducción: type (TAX, IMSS, INFONAVIT, FONACOT, MORTGAGE_LOAN, ALIMONY, EMPLOYEE_LOAN, OTHER,',
  '  UNKNOWN), description, amount, requiresAlert.',
  '  Buscar deducciones bajo alias: ISR, IMPUESTO, IMSS, SEGURIDAD SOCIAL, INFONAVIT, FONACOT,',
  '  CRÉDITO, CRÉDITO HIPOTECARIO, PRÉSTAMO, PENSIÓN, PENSIÓN ALIMENTICIA, DESCUENTO JUDICIAL,',
  '  FALTAS, FONDO DE JUBILACIÓN, CUOTA SINDICAL, CAJA DE AHORRO.',

  '─── Timbrado fiscal (fiscalStamp) ───',
  '  Considerá timbrado detectado si aparece CUALQUIERA de:',
  '    QR, Folio fiscal, UUID, CFDI, Sello digital del CFDI, Sello digital del SAT,',
  '    Cadena original, Certificado SAT, Fecha y hora de certificación,',
  '    complemento de certificación digital, No. de Serie del Certificado del SAT.',
  '  - hasQrCode: true si QR detectable.',
  '  - hasSatDigitalSeal: true si sello digital SAT.',
  '  - hasCfdiStamp: true si CFDI, cadena original, sello CFDI o No. Serie.',
  '  - fiscalFolio: UUID o folio fiscal.',
  '  - certificationDate: fecha y hora de certificación (ISO 8601).',

  '─── Employment ───',
  '  Buscar fecha de ingreso / antigüedad bajo CUALQUIERA de estos alias:',
  '    Fecha de ingreso, Fecha ingreso, Fecha de alta, Fecha alta, Antigüedad,',
  '    Antigüedad efectiva, Fecha inicio laboral, Ingreso a la empresa, Alta IMSS.',
  '  - hireDate: YYYY-MM-DD. Si la fecha original es "15/01/2015", normalizar a "2015-01-15".',
  '  - seniorityText: texto original de antigüedad ("10 AÑOS").',
  '  - hasMinimumSeniority: null (el backend lo calculará).',

  '  Buscar evidencia de cotización IMSS. Marcar contributesToImss = true si aparece CUALQUIERA de:',
  '    NSS, No. Seguridad Social, Número de seguridad social, Registro patronal, IMSS,',
  '    cuotas IMSS, patrón registrado, fecha de alta IMSS, salario base de cotización,',
  '    SBC, SDI, trabajador subordinado, régimen sueldos y salarios.',
  '    Para recibos cuyo EMISOR es el IMSS (Instituto Mexicano del Seguro Social): marcar true.',
  '  Marcar false SOLO si hay evidencia clara de que NO cotiza: asimilados a salarios,',
  '    honorarios, prestación de servicios, pago por servicios profesionales.',
  '  Si no hay evidencia suficiente, dejar null.',
  '  - contributesToImss: true / false / null.',
  '  - imssEvidence: texto breve con la evidencia encontrada.',
  '  - imssSignals: array de strings con las señales detectadas (ej. ["NSS", "registro patronal", "emisor IMSS"]).',

  '─── Evidencia textual (evidence) ───',
  '  Para cada campo importante, cuando sea posible, guardá el texto original usado:',
  '    netIncome: "Líquido 20,000.00"',
  '    grossIncome: "Total Percepciones 25,000.00"',
  '    totalDeductions: "Total Deducciones 5,000.00"',
  '    period: "Período de pago: 1A-MAY-2025"',
  '    hireDate: "Fecha de Ingreso: 15/01/2015"',
  '    fiscalStamp: "Folio Fiscal: 11111111-2222-4333-8444-555555555555"',

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
  | 'IDENTITY' | 'ADDRESS' | 'INCOME' | 'CREDIT_BUREAU'
  | 'BANK_STATEMENT' | 'DOCUMENT_QUALITY' | 'MANUAL_VALIDATION' | 'REQUIREMENT';

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
    sourceDocumentId: null, mortgageCaseId: null, ocrProcessedAt: null,
    extractedAt: null, model: null, confidence: 0.0,
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
    fullName: 'string | null', rfc: 'string | null', curp: 'string | null',
  },
  employer: {
    legalName: 'string | null', rfc: 'string | null',
    possiblePayrollProvider: 'boolean | null',
  },
  payrollPeriod: {
    periodStartDate: 'YYYY-MM-DD | null', periodEndDate: 'YYYY-MM-DD | null',
    paymentDate: 'YYYY-MM-DD | null',
    periodRaw: 'string | null', periodLabel: 'string | null',
    periodicity: 'WEEKLY | BIWEEKLY | MONTHLY | OTHER | UNKNOWN',
    isClosedPeriod: 'boolean | null',
  },
  income: {
    grossIncome: 'number | null', totalDeductions: 'number | null',
    netIncome: 'number | null', currency: 'MXN',
    incomeBehaviorDetected: 'FIXED | VARIABLE | UNKNOWN',
    isVariableIncome: 'boolean | null',
    variablePerceptions: [{
      type: 'BONUS | COMMISSION | COMPENSATION | OVERTIME | VACATION_BONUS | INCENTIVE | PTU | OTHER',
      description: 'string | null', amount: 'number | null',
      classification: 'BASE | VARIABLE | SPECIAL | UNCLASSIFIED',
    }],
  },
  deductions: [{
    type: 'TAX | IMSS | INFONAVIT | FONACOT | MORTGAGE_LOAN | ALIMONY | EMPLOYEE_LOAN | OTHER | UNKNOWN',
    description: 'string | null', amount: 'number | null', requiresAlert: 'boolean',
  }],
  fiscalStamp: {
    hasQrCode: 'boolean | null', hasSatDigitalSeal: 'boolean | null',
    hasCfdiStamp: 'boolean | null',
    fiscalFolio: 'string | null', certificationDate: 'datetime | null',
  },
  employment: {
    hireDate: 'YYYY-MM-DD | null', seniorityText: 'string | null',
    hasMinimumSeniority: 'boolean | null',
    contributesToImss: 'boolean | null', imssEvidence: 'string | null',
    imssSignals: ['string'],
  },
  evidence: {
    netIncome: 'string | null', grossIncome: 'string | null',
    totalDeductions: 'string | null', period: 'string | null',
    paymentDate: 'string | null', hireDate: 'string | null',
    fiscalStamp: 'string | null',
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

  static isPayrollDocument(documentTypeCode: string): boolean {
    return PAYROLL_DOC_TYPES.includes(documentTypeCode);
  }

  async extract(caseId: string, documentId: string): Promise<PayrollExtractionResult> {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { documentType: true, documentStatus: true },
    });
    if (!document || document.mortgageCaseId !== caseId) throw new Error('Document not found');

    if (document.documentStatus.code !== 'PROCESSED') {
      return { success: false, documentId, extractedData: null, alerts: [], missingFields: [],
        error: { code: 'DOCUMENT_NOT_PROCESSED', message: 'El documento debe estar procesado (OCR) antes de la extracción.' } };
    }
    if (!document.ocrText || document.ocrText.trim() === '') {
      return { success: false, documentId, extractedData: null, alerts: [], missingFields: [],
        error: { code: GeminiErrorCode.OCR_TEXT_EMPTY, message: 'El documento no tiene texto OCR extraído.' } };
    }

    const geminiResult = await this.geminiService.extractStructuredData(
      document.ocrText, document.documentType.code, { ...PAYROLL_SCHEMA }, PAYROLL_INSTRUCTIONS,
    );
    if (!geminiResult.success) {
      this.logger.warn(`[Payroll] Gemini extraction failed for doc ${documentId}: ${geminiResult.error?.code}`);
      return { success: false, documentId, extractedData: geminiResult.extractedData, alerts: [], missingFields: [],
        error: geminiResult.error ? { code: geminiResult.error.code, message: geminiResult.error.message } : { code: 'UNKNOWN', message: 'Extraction failed' } };
    }

    const data = geminiResult.extractedData as Record<string, unknown>;

    // ── Step 3: Normalize canonical fields ──────────────────────────
    this.normalizeCanonicalFields(data);

    // ── Step 4: Deterministic inferences ────────────────────────────
    this.applyDeterministicInferences(data);

    // ── Step 5: Compute alerts from normalized data ──────────────────
    const alerts = this.computeAlerts(data);
    const missingFields = this.computeMissingFields(data);

    // ── Step 6: Merge + dedup + filter contradictions ────────────────
    const existingCodes = new Set<string>();
    if (Array.isArray(data.alerts)) {
      for (const a of data.alerts as ExtractionAlert[]) { if (a.code) existingCodes.add(a.code); }
      const newAlerts = alerts.filter((a) => !existingCodes.has(a.code));
      data.alerts = [...(data.alerts as ExtractionAlert[]), ...newAlerts];
    } else { data.alerts = alerts; }

    if (Array.isArray(data.missingFields)) {
      const existingFields: string[] = (data.missingFields as unknown[]).filter((f): f is string => typeof f === 'string');
      data.missingFields = [...existingFields, ...missingFields.filter((f) => !existingFields.includes(f))];
    } else { data.missingFields = missingFields; }

    data.alerts = this.normalizeAlerts((data.alerts as ExtractionAlert[]) ?? []);

    // ── Step 7: Filter contradictory alerts ─────────────────────────
    data.alerts = this.filterContradictoryAlerts(data.alerts as ExtractionAlert[], data);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await this.prisma.document.update({ where: { id: documentId }, data: { extractedData: data as any } });
    } catch (dbError) {
      this.logger.error(`[Payroll] Failed to persist extractedData for doc ${documentId}: ${(dbError as Error).message}`);
    }

    return { success: true, documentId, extractedData: data, alerts: data.alerts as ExtractionAlert[], missingFields };
  }

  // -----------------------------------------------------------------------
  // Private: normalize canonical fields (fill gaps, apply defaults)
  // -----------------------------------------------------------------------

  private normalizeCanonicalFields(data: Record<string, unknown>): void {
    const income = (data.income ?? {}) as Record<string, unknown>;
    const employee = (data.employee ?? {}) as Record<string, unknown>;
    const employment = (data.employment ?? {}) as Record<string, unknown>;

    // Pull employee fields into employment for consistency
    if (!employment.hireDate && employee.employmentStartDate) {
      employment.hireDate = employee.employmentStartDate;
    }
    if (!employment.seniorityText && employee.employmentSeniorityText) {
      employment.seniorityText = employee.employmentSeniorityText;
    }
    if (employment.contributesToImss == null && employee.contributesToImss != null) {
      employment.contributesToImss = employee.contributesToImss;
    }
    if (!employment.imssEvidence && employee.imssEvidence) {
      employment.imssEvidence = employee.imssEvidence;
    }
    data.employment = employment;
  }

  // -----------------------------------------------------------------------
  // Private: deterministic inferences (post-Gemini, pre-alert)
  // -----------------------------------------------------------------------

  private applyDeterministicInferences(data: Record<string, unknown>): void {
    const employment = (data.employment ?? {}) as Record<string, unknown>;
    const income = (data.income ?? {}) as Record<string, unknown>;
    const fiscalStamp = (data.fiscalStamp ?? {}) as Record<string, unknown>;
    const employer = (data.employer ?? {}) as Record<string, unknown>;

    // ── isStamped ────────────────────────────────────────────────────
    const isStamped = this.computeIsStamped(fiscalStamp);
    (data as Record<string, unknown>)._isStamped = isStamped;

    // ── hasMinimumSeniority ──────────────────────────────────────────
    const hireDate = employment.hireDate as string | undefined | null;
    const seniorityText = employment.seniorityText as string | undefined | null;
    if (employment.hasMinimumSeniority == null) {
      if (hireDate) {
        const parsed = new Date(hireDate);
        if (!isNaN(parsed.getTime())) {
          const monthsDiff = (new Date().getFullYear() - parsed.getFullYear()) * 12 + (new Date().getMonth() - parsed.getMonth());
          employment.hasMinimumSeniority = monthsDiff >= 6;
        } else {
          employment.hasMinimumSeniority = null;
        }
      } else if (seniorityText) {
        const yearMatch = /(\d+)\s*A[ÑN]OS?/i.exec(seniorityText);
        if (yearMatch && parseInt(yearMatch[1], 10) >= 1) {
          employment.hasMinimumSeniority = true;
        } else {
          employment.hasMinimumSeniority = null;
        }
      } else {
        employment.hasMinimumSeniority = null;
      }
    }

    // ── contributesToImss — infer from signals if not explicit ──────
    if (employment.contributesToImss == null) {
      const signals = employment.imssSignals as string[] | undefined;
      const evidence = employment.imssEvidence as string | undefined;
      const employerName = (employer.legalName as string) ?? '';
      const employerRfc = (employer.rfc as string) ?? '';

      // Check if employer IS the IMSS
      if (/INSTITUTO MEXICANO DEL SEGURO SOCIAL|IMSS/i.test(employerName) ||
          /^IMS\d{6}/i.test(employerRfc)) {
        employment.contributesToImss = true;
        if (!evidence) employment.imssEvidence = 'Emisor es el IMSS';
      } else if (signals && signals.length > 0) {
        employment.contributesToImss = true;
        if (!evidence) employment.imssEvidence = signals.join(', ');
      } else if (evidence && /NSS|IMSS|registro patronal|seguridad social|sueldos y salarios/i.test(evidence)) {
        employment.contributesToImss = true;
      }
    }

    // ── isVariableIncome ─────────────────────────────────────────────
    if (income.isVariableIncome == null) {
      const variablePerceptions = income.variablePerceptions as Record<string, unknown>[] | undefined;
      if (Array.isArray(variablePerceptions) && variablePerceptions.length > 0) {
        const hasVariable = variablePerceptions.some(
          (p) => (p.classification as string) === 'VARIABLE' || (p.classification as string) === 'SPECIAL',
        );
        income.isVariableIncome = hasVariable || variablePerceptions.length > 0;
      }
    }

    data.employment = employment;
    data.income = income;
  }

  /**
   * Determines whether the receipt is properly stamped.
   * True if ANY stamp evidence is detected.
   */
  private computeIsStamped(fiscalStamp: Record<string, unknown>): boolean {
    return (
      fiscalStamp.hasQrCode === true ||
      fiscalStamp.hasSatDigitalSeal === true ||
      fiscalStamp.hasCfdiStamp === true ||
      (!!fiscalStamp.fiscalFolio && String(fiscalStamp.fiscalFolio).trim() !== '') ||
      (!!fiscalStamp.certificationDate && String(fiscalStamp.certificationDate).trim() !== '')
    );
  }

  // -----------------------------------------------------------------------
  // Private: alert computation (post-normalization)
  // -----------------------------------------------------------------------

  private computeAlerts(data: Record<string, unknown>): ExtractionAlert[] {
    const alerts: ExtractionAlert[] = [];
    const employee = (data.employee ?? {}) as Record<string, unknown>;
    const employer = (data.employer ?? {}) as Record<string, unknown>;
    const payrollPeriod = (data.payrollPeriod ?? {}) as Record<string, unknown>;
    const income = (data.income ?? {}) as Record<string, unknown>;
    const employment = (data.employment ?? {}) as Record<string, unknown>;
    const fiscalStamp = (data.fiscalStamp ?? {}) as Record<string, unknown>;
    const deductions = data.deductions as Record<string, unknown>[] | undefined;
    const variablePerceptions = income.variablePerceptions as Record<string, unknown>[] | undefined;
    const isStamped = (data as Record<string, unknown>)._isStamped === true;

    // ── Missing net income ──────────────────────────────────────────
    if (income.netIncome == null) {
      alerts.push({ code: 'PAYROLL_MISSING_NET_INCOME', severity: 'CRITICAL', category: 'INCOME',
        message: 'No se pudo extraer el ingreso neto del recibo de nómina.', field: 'income.netIncome', requiresManualReview: true });
    }

    // ── Missing employee RFC ────────────────────────────────────────
    const employeeRfc = employee.rfc as string | undefined | null;
    if (!employeeRfc || employeeRfc.trim() === '') {
      alerts.push({ code: 'PAYROLL_MISSING_EMPLOYEE_RFC', severity: 'WARNING', category: 'INCOME',
        message: 'No se detectó el RFC del empleado.', field: 'employee.rfc', requiresManualReview: true });
    }

    // ── Missing employee name ───────────────────────────────────────
    const employeeName = employee.fullName as string | undefined | null;
    if (!employeeName || employeeName.trim() === '') {
      alerts.push({ code: 'PAYROLL_MISSING_EMPLOYEE_NAME', severity: 'WARNING', category: 'INCOME',
        message: 'No se detectó el nombre del empleado.', field: 'employee.fullName', requiresManualReview: true });
    }

    // ── Missing payroll period (flexible: alert only if no date range AND no periodRaw) ──
    const periodStart = payrollPeriod.periodStartDate as string | undefined | null;
    const periodEnd = payrollPeriod.periodEndDate as string | undefined | null;
    const periodRaw = payrollPeriod.periodRaw as string | undefined | null;
    if (!periodStart && !periodEnd && (!periodRaw || periodRaw.trim() === '')) {
      alerts.push({ code: 'PAYROLL_MISSING_PERIOD', severity: 'WARNING', category: 'INCOME',
        message: 'No se detectó el periodo del recibo de nómina.', field: 'payrollPeriod', requiresManualReview: true });
    }

    // ── Missing payment date (only if no period data and no fiscal stamp) ──
    const paymentDate = payrollPeriod.paymentDate as string | undefined | null;
    if (!paymentDate || paymentDate.trim() === '') {
      const hasPeriodData = !!(periodStart || periodEnd || (periodRaw && periodRaw.trim() !== ''));
      const hasFiscalEvidence = isStamped || !!(fiscalStamp.certificationDate as string | undefined);
      if (!hasPeriodData && !hasFiscalEvidence) {
        alerts.push({ code: 'PAYROLL_MISSING_PAYMENT_DATE', severity: 'WARNING', category: 'INCOME',
          message: 'No se detectó la fecha de pago del recibo de nómina.', field: 'payrollPeriod.paymentDate', requiresManualReview: true });
      }
    }

    // ── No fiscal stamp (only if isStamped is false) ─────────────────
    if (!isStamped) {
      alerts.push({ code: 'PAYROLL_NO_FISCAL_STAMP', severity: 'WARNING', category: 'DOCUMENT_QUALITY',
        message: 'No se detectó timbrado fiscal (QR, sello digital SAT, CFDI o folio fiscal) en el recibo.',
        field: 'fiscalStamp', requiresManualReview: true });
    }

    // ── Relevant deductions ─────────────────────────────────────────
    const relevantDeductionTypes = ['MORTGAGE_LOAN', 'ALIMONY', 'INFONAVIT', 'FONACOT'];
    if (Array.isArray(deductions)) {
      for (const ded of deductions) {
        const dType = (ded.type as string) ?? '';
        if (relevantDeductionTypes.includes(dType) && ded.requiresAlert === true) {
          const desc = (ded.description as string) ?? dType;
          const amount = ded.amount as number | undefined;
          alerts.push({ code: `PAYROLL_DEDUCTION_${dType}`, severity: 'WARNING', category: 'INCOME',
            message: `Deducción por ${desc} detectada${amount != null ? `: $${amount.toLocaleString('es-MX')}` : ''}. Puede afectar la capacidad de pago.`,
            field: `deductions[${dType}]`, requiresManualReview: true });
        }
      }
    }

    // ── Missing employment seniority ─────────────────────────────────
    const hireDate = employment.hireDate as string | undefined | null;
    const seniorityText = employment.seniorityText as string | undefined | null;
    if ((!hireDate || hireDate.trim() === '') && (!seniorityText || seniorityText.trim() === '')) {
      alerts.push({ code: 'PAYROLL_NO_SENIORITY', severity: 'WARNING', category: 'INCOME',
        message: 'No se detectó fecha de ingreso ni antigüedad laboral. Solicitar al cliente una nómina antigua para validar al menos 6 meses de antigüedad.',
        field: 'employment.hireDate', requiresManualReview: true });
    }

    // ── Variable income ─────────────────────────────────────────────
    const isVariableIncome = income.isVariableIncome === true;
    const hasVarPerceptions = Array.isArray(variablePerceptions) && variablePerceptions.length > 0;
    if (hasVarPerceptions || isVariableIncome) {
      alerts.push({ code: 'PAYROLL_VARIABLE_INCOME', severity: 'WARNING', category: 'INCOME',
        message: 'El recibo contiene percepciones variables o conceptos especiales. La asesora debe revisar si se requieren 6 meses de recibos para promediar ingresos.',
        field: 'income.variablePerceptions', requiresManualReview: true });
    }

    // ── Possible payroll provider ───────────────────────────────────
    if (employer.possiblePayrollProvider === true) {
      const empName = (employer.legalName as string) ?? 'desconocido';
      alerts.push({ code: 'PAYROLL_POSSIBLE_PROVIDER', severity: 'WARNING', category: 'INCOME',
        message: `La razón social "${empName}" podría ser una pagadora externa. Verificar relación laboral.`,
        field: 'employer.possiblePayrollProvider', requiresManualReview: true });
    }

    return alerts;
  }

  // -----------------------------------------------------------------------
  // Private: filter contradictory alerts
  // -----------------------------------------------------------------------

  private filterContradictoryAlerts(alerts: ExtractionAlert[], data: Record<string, unknown>): ExtractionAlert[] {
    const isStamped = (data as Record<string, unknown>)._isStamped === true;
    const payrollPeriod = (data.payrollPeriod ?? {}) as Record<string, unknown>;
    const employment = (data.employment ?? {}) as Record<string, unknown>;
    const periodStart = payrollPeriod.periodStartDate as string | undefined | null;
    const periodEnd = payrollPeriod.periodEndDate as string | undefined | null;
    const periodRaw = payrollPeriod.periodRaw as string | undefined | null;
    const hireDate = employment.hireDate as string | undefined | null;
    const seniorityText = employment.seniorityText as string | undefined | null;

    return alerts.filter((a) => {
      // If stamped, remove any timbrado-faltante alert
      if (isStamped && a.code === 'PAYROLL_NO_FISCAL_STAMP') return false;
      // If period data exists, remove period-missing alert
      if ((periodStart || periodEnd || periodRaw) && a.code === 'PAYROLL_MISSING_PERIOD') return false;
      // If hire date or seniority exists, remove seniority-missing alert
      if ((hireDate || seniorityText) && a.code === 'PAYROLL_NO_SENIORITY') return false;
      return true;
    });
  }

  // -----------------------------------------------------------------------
  // Private: missing field detection
  // -----------------------------------------------------------------------

  private computeMissingFields(data: Record<string, unknown>): string[] {
    const missing: string[] = [];
    const employee = (data.employee ?? {}) as Record<string, unknown>;
    const income = (data.income ?? {}) as Record<string, unknown>;
    const employment = (data.employment ?? {}) as Record<string, unknown>;
    const payrollPeriod = (data.payrollPeriod ?? {}) as Record<string, unknown>;

    if (!employee.fullName || (employee.fullName as string)?.trim() === '') missing.push('employee.fullName');
    if (!employee.rfc || (employee.rfc as string)?.trim() === '') missing.push('employee.rfc');
    if (income.netIncome == null) missing.push('income.netIncome');
    if (income.grossIncome == null) missing.push('income.grossIncome');
    if (!payrollPeriod.periodStartDate && !payrollPeriod.periodEndDate && !payrollPeriod.periodRaw) missing.push('payrollPeriod');
    if (!payrollPeriod.paymentDate || (payrollPeriod.paymentDate as string)?.trim() === '') missing.push('payrollPeriod.paymentDate');
    const hireDate = employment.hireDate as string | undefined | null;
    const seniorityText = employment.seniorityText as string | undefined | null;
    if ((!hireDate || hireDate.trim() === '') && (!seniorityText || seniorityText.trim() === '')) missing.push('employment.hireDate');

    return missing;
  }

  // -----------------------------------------------------------------------
  // Private: normalize alerts to Spanish
  // -----------------------------------------------------------------------

  private normalizeAlerts(alerts: ExtractionAlert[]): ExtractionAlert[] {
    return alerts.map((a) => {
      const map: Record<string, string> = {
        'Variable income detected.': 'Se detectaron percepciones variables en el recibo de nómina.',
        'Missing employee RFC.': 'No se detectó el RFC del empleado.',
        'Missing employee name.': 'No se detectó el nombre del empleado.',
      };
      const tr = map[a.message];
      return tr ? { ...a, message: tr } : a;
    });
  }
}
