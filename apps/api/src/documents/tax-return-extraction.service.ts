import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiService, GeminiErrorCode } from './gemini.service';

// ---------------------------------------------------------------------------
// Document type codes that trigger Tax Return extraction
// ---------------------------------------------------------------------------
const TAX_RETURN_DOC_TYPES = ['TAX_RETURN'];

// ---------------------------------------------------------------------------
// Specialized instructions for Declaración Anual de Personas Físicas (SAT México)
// ---------------------------------------------------------------------------
const TAX_RETURN_INSTRUCTIONS = [
  'Declaración Anual de Impuestos Federales - Personas Físicas (SAT México).',
  '',
  'El documento contiene el Acuse de Recibo oficial del SAT y las secciones de desglose de ingresos por régimen (Sueldos y Salarios, Actividad Empresarial y Servicios Profesionales / Honorarios, RESICO, etc.).',
  'Analizá TODO el texto OCR con estricto rigor y normalizá montos numéricos.',
  '',
  '─── REGLA DE ORO ───',
  'NO inventes datos. Ante cualquier duda, usá null.',
  'Extraé ÚNICAMENTE de la información presente en el OCR.',
  '',
  '─── Acuse de Recibo del SAT (satReceipt) ───',
  '  - rfc: RFC del contribuyente con homoclave (13 caracteres).',
  '  - taxpayerName: Nombre completo del contribuyente.',
  '  - declarationType: Tipo de declaración (ej. "Normal", "Complementaria").',
  '  - periodDescription: Periodo de la declaración (ej. "Del Ejercicio").',
  '  - taxYear: Ejercicio fiscal declarado como número entero (ej. 2025, 2024, 2022).',
  '  - presentationDate: Fecha y hora de presentación (YYYY-MM-DD o YYYY-MM-DD HH:mm, ej. "2023-08-21 19:48").',
  '  - operationNumber: Número de operación oficial del SAT (ej. "230010729221").',
  '  - presentationMedium: Medio de presentación (ej. "Internet").',
  '',
  '─── Impuestos y Determinación (taxPayment) ───',
  '  - paymentConcept: Concepto de pago (ej. "ISR PERSONAS FÍSICAS", "ISR PERSONAS FÍSICAS RÉGIMEN SIMPLIFICADO DE CONFIANZA").',
  '  - amountInFavor: Cantidad a favor (número decimal o null).',
  '  - amountDue: Cantidad a cargo (número decimal o null).',
  '  - amountToPay: Cantidad a pagar (número decimal o null).',
  '',
  '─── Regímenes que Declara (declaredRegimes) ───',
  '  Lista de regímenes declarados en la sección "INGRESOS QUE DECLARA":',
  '  Ejemplos: "Sueldos, salarios y asimilados", "Actividad Empresarial y Servicios profesionales (Honorarios)", "Régimen Simplificado de Confianza".',
  '',
  '─── Desglose: Sueldos y Salarios (salariedIncome) ───',
  '  Si incluye la sección "SUELDOS Y SALARIOS":',
  '  - annualGrossIncome: Ingreso anual bruto declarado (número decimal).',
  '  - exemptIncome: Ingreso exento.',
  '  - employmentSubsidy: Subsidio para el empleo.',
  '  - taxWithheld: Retenciones de ISR.',
  '  - retainers: Array de retenedores con rfc, legalName, annualIncome, exemptIncome, taxWithheld.',
  '',
  '─── Desglose: Actividad Empresarial y Servicios Profesionales / Honorarios (businessOrProfessionalIncome) ───',
  '  Si incluye la sección "ACTIVIDAD EMPRESARIAL Y SERVICIOS PROFESIONALES (HONORARIOS)":',
  '  - totalIncome: Total de ingresos percibidos.',
  '  - detailedIncome: Array de desglose con concept (ej. "SERVICIOS PROFESIONALES (HONORARIOS)") y amount.',
  '  - taxWithheld: Retenciones de ISR por personas morales.',
  '  - authorizedDeductions: Deducciones autorizadas (si aparecen).',
  '',
  '─── Desglose: Régimen Simplificado de Confianza - RESICO (resicoIncome) ───',
  '  Si incluye la sección "RÉGIMEN SIMPLIFICADO DE CONFIANZA":',
  '  - totalEffectiveIncome: Total de ingresos efectivamente cobrados.',
  '  - totalInvoicedIncome: Total de ingresos amparados por comprobantes fiscales efectivamente cobrados.',
  '  - totalActivityIncome: Total de ingresos percibidos por la actividad.',
  '  - taxWithheld: Retenciones de ISR aplicadas.',
  '',
  '─── Determinación del Resultado Fiscal (fiscalResult) ───',
  '  - accumulableIncomeTotal: Total general de ingresos acumulables / efectivamente percibidos.',
  '  - fiscalProfit: Utilidad fiscal declarada (número positivo, o 0 si no hubo).',
  '  - fiscalLoss: Pérdida fiscal declarada (número positivo si hubo pérdida, o 0).',
  '  - taxResult: Resultado fiscal neto (número positivo si es utilidad, negativo si es pérdida).',
].join('\n');

// ---------------------------------------------------------------------------
// JSON Schema for Gemini structured response
// ---------------------------------------------------------------------------
const TAX_RETURN_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    satReceipt: {
      type: 'object',
      properties: {
        rfc: { type: 'string', nullable: true },
        taxpayerName: { type: 'string', nullable: true },
        declarationType: { type: 'string', nullable: true },
        periodDescription: { type: 'string', nullable: true },
        taxYear: { type: 'number', nullable: true },
        presentationDate: { type: 'string', nullable: true },
        operationNumber: { type: 'string', nullable: true },
        presentationMedium: { type: 'string', nullable: true },
      },
      required: ['rfc', 'taxYear'],
    },
    taxPayment: {
      type: 'object',
      properties: {
        paymentConcept: { type: 'string', nullable: true },
        amountInFavor: { type: 'number', nullable: true },
        amountDue: { type: 'number', nullable: true },
        amountToPay: { type: 'number', nullable: true },
      },
    },
    declaredRegimes: {
      type: 'array',
      items: { type: 'string' },
    },
    salariedIncome: {
      type: 'object',
      properties: {
        annualGrossIncome: { type: 'number', nullable: true },
        exemptIncome: { type: 'number', nullable: true },
        employmentSubsidy: { type: 'number', nullable: true },
        taxWithheld: { type: 'number', nullable: true },
        retainers: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              rfc: { type: 'string', nullable: true },
              legalName: { type: 'string', nullable: true },
              annualIncome: { type: 'number', nullable: true },
              exemptIncome: { type: 'number', nullable: true },
              taxWithheld: { type: 'number', nullable: true },
            },
          },
        },
      },
    },
    businessOrProfessionalIncome: {
      type: 'object',
      properties: {
        totalIncome: { type: 'number', nullable: true },
        detailedIncome: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              concept: { type: 'string' },
              amount: { type: 'number' },
            },
          },
        },
        taxWithheld: { type: 'number', nullable: true },
        authorizedDeductions: { type: 'number', nullable: true },
      },
    },
    resicoIncome: {
      type: 'object',
      properties: {
        totalEffectiveIncome: { type: 'number', nullable: true },
        totalInvoicedIncome: { type: 'number', nullable: true },
        totalActivityIncome: { type: 'number', nullable: true },
        taxWithheld: { type: 'number', nullable: true },
      },
    },
    fiscalResult: {
      type: 'object',
      properties: {
        accumulableIncomeTotal: { type: 'number', nullable: true },
        fiscalProfit: { type: 'number', nullable: true },
        fiscalLoss: { type: 'number', nullable: true },
        taxResult: { type: 'number', nullable: true },
      },
    },
    alerts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          severity: { type: 'string', enum: ['INFO', 'WARNING', 'ERROR'] },
          message: { type: 'string' },
          field: { type: 'string', nullable: true },
        },
        required: ['code', 'severity', 'message'],
      },
    },
  },
  required: ['satReceipt', 'fiscalResult'],
};

export interface TaxReturnAlert {
  code: string;
  severity: 'INFO' | 'WARNING' | 'ERROR';
  category: 'TAX_YEAR' | 'FINANCIAL_HEALTH' | 'AUTHENTICITY' | 'REGIME';
  message: string;
  field?: string;
  requiresManualReview?: boolean;
}

export interface TaxReturnExtractionPayload {
  documentType: 'TAX_RETURN';
  satReceipt: {
    rfc: string | null;
    taxpayerName: string | null;
    declarationType: string | null;
    periodDescription: string | null;
    taxYear: number | null;
    presentationDate: string | null;
    operationNumber: string | null;
    presentationMedium: string | null;
  };
  taxPayment?: {
    paymentConcept: string | null;
    amountInFavor: number | null;
    amountDue: number | null;
    amountToPay: number | null;
  };
  declaredRegimes: string[];
  salariedIncome?: {
    annualGrossIncome: number | null;
    exemptIncome: number | null;
    employmentSubsidy: number | null;
    taxWithheld: number | null;
    retainers?: Array<{
      rfc: string | null;
      legalName: string | null;
      annualIncome: number | null;
      exemptIncome: number | null;
      taxWithheld: number | null;
    }>;
  };
  businessOrProfessionalIncome?: {
    totalIncome: number | null;
    detailedIncome?: Array<{
      concept: string;
      amount: number;
    }>;
    taxWithheld: number | null;
    authorizedDeductions: number | null;
  };
  resicoIncome?: {
    totalEffectiveIncome: number | null;
    totalInvoicedIncome: number | null;
    totalActivityIncome: number | null;
    taxWithheld: number | null;
  };
  fiscalResult: {
    accumulableIncomeTotal: number | null;
    fiscalProfit: number | null;
    fiscalLoss: number | null;
    taxResult: number | null;
  };
  // Computed Business Metrics
  isValidTaxYear: boolean;
  hasTaxLoss: boolean;
  isMixedDeclaration: boolean;
  hasOfficialReceipt: boolean;
  alerts: TaxReturnAlert[];
  extractionTimestamp: string;
}

@Injectable()
export class TaxReturnExtractionService {
  private readonly logger = new Logger(TaxReturnExtractionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geminiService: GeminiService,
  ) {}

  static isTaxReturnDocument(code?: string | null): boolean {
    if (!code) return false;
    return TAX_RETURN_DOC_TYPES.includes(code.toUpperCase());
  }

  async extract(caseId: string, documentId: string): Promise<Record<string, unknown>> {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        documentType: true,
        documentStatus: true,
        mortgageCase: true,
      },
    });

    if (!document) {
      throw new Error(`Document ${documentId} not found`);
    }

    if (document.mortgageCaseId !== caseId) {
      throw new Error(`Document ${documentId} does not belong to case ${caseId}`);
    }

    if (!TaxReturnExtractionService.isTaxReturnDocument(document.documentType?.code)) {
      throw new Error(`Document type ${document.documentType?.code} is not a valid TAX_RETURN document`);
    }

    if (!document.ocrText || document.ocrText.trim() === '') {
      throw new Error(`Document ${documentId} has no OCR text. Ensure Document AI has processed it.`);
    }

    // Call Gemini with specialized instructions and schema
    const result = await this.geminiService.extractStructuredData(
      document.ocrText,
      document.documentType.code,
      TAX_RETURN_RESPONSE_SCHEMA,
      TAX_RETURN_INSTRUCTIONS,
    );

    if (!result.success || !result.extractedData) {
      const errCode = result.error?.code ?? GeminiErrorCode.GEMINI_REQUEST_ERROR;
      const errMsg = result.error?.message ?? 'Gemini Tax Return extraction failed';
      this.logger.error(`[TAX_RETURN] Extraction failed for doc ${documentId}: ${errCode} - ${errMsg}`);
      throw new Error(`${errCode}: ${errMsg}`);
    }

    const rawData = result.extractedData;

    // Post-process and compute business rules & alerts
    const payload = this.postProcessTaxReturn(rawData);

    // Save extractedData to database
    const extractionReadyStatus = await this.prisma.documentStatus.findUnique({
      where: { code: 'PROCESSED' },
    });

    await this.prisma.document.update({
      where: { id: documentId },
      data: {
        extractedData: payload as unknown as object,
        documentStatusId: extractionReadyStatus ? extractionReadyStatus.id : document.documentStatusId,
      },
    });

    this.logger.log(`[TAX_RETURN] Successfully extracted and saved Tax Return data for doc ${documentId}`);
    return payload as unknown as Record<string, unknown>;
  }

  /**
   * Post-processes raw Gemini output: validates tax year, evaluates fiscal profit/loss, and generates alerts.
   */
  postProcessTaxReturn(rawData: Record<string, unknown>): TaxReturnExtractionPayload {
    const satReceipt = (rawData.satReceipt ?? {}) as Record<string, unknown>;
    const taxPayment = (rawData.taxPayment ?? {}) as Record<string, unknown>;
    const declaredRegimes = Array.isArray(rawData.declaredRegimes)
      ? (rawData.declaredRegimes as string[])
      : [];
    const salariedIncome = (rawData.salariedIncome ?? {}) as Record<string, unknown>;
    const businessOrProfessionalIncome = (rawData.businessOrProfessionalIncome ?? {}) as Record<
      string,
      unknown
    >;
    const resicoIncome = (rawData.resicoIncome ?? {}) as Record<string, unknown>;
    const fiscalResult = (rawData.fiscalResult ?? {}) as Record<string, unknown>;

    // 1. Process Acuse & Tax Year
    const rfc = (satReceipt.rfc as string)?.toUpperCase()?.replace(/[^A-Z0-9&Ñ]/g, '') ?? null;
    const taxpayerName = (satReceipt.taxpayerName as string)?.toUpperCase()?.trim() ?? null;
    const taxYear = typeof satReceipt.taxYear === 'number' ? satReceipt.taxYear : Number(satReceipt.taxYear) || null;
    const operationNumber = (satReceipt.operationNumber as string)?.trim() ?? null;

    // Tax Year Validity (Target immediate prior year: e.g., 2025 in 2026)
    // Accept current year - 1 as the mandatory annual support
    const currentYear = new Date().getFullYear();
    const expectedTaxYear = currentYear - 1; // 2025 in 2026
    const isValidTaxYear = taxYear != null && taxYear >= expectedTaxYear;

    // 2. Process Fiscal Profit / Loss
    const fiscalProfit = typeof fiscalResult.fiscalProfit === 'number'
      ? fiscalResult.fiscalProfit
      : Number(fiscalResult.fiscalProfit) || null;

    const fiscalLoss = typeof fiscalResult.fiscalLoss === 'number'
      ? fiscalResult.fiscalLoss
      : Number(fiscalResult.fiscalLoss) || null;

    let accumulableIncomeTotal = typeof fiscalResult.accumulableIncomeTotal === 'number'
      ? fiscalResult.accumulableIncomeTotal
      : Number(fiscalResult.accumulableIncomeTotal) || null;

    // Fallback accumulable income from regime details if not directly present
    if (accumulableIncomeTotal == null || accumulableIncomeTotal === 0) {
      const resicoTotal = Number(resicoIncome.totalEffectiveIncome || resicoIncome.totalActivityIncome) || 0;
      const businessTotal = Number(businessOrProfessionalIncome.totalIncome) || 0;
      const salariedTotal = Number(salariedIncome.annualGrossIncome) || 0;
      const sum = resicoTotal + businessTotal + salariedTotal;
      if (sum > 0) accumulableIncomeTotal = sum;
    }

    // Determine if tax loss exists
    const hasTaxLoss = (fiscalLoss != null && fiscalLoss > 0) ||
      (fiscalResult.taxResult != null && Number(fiscalResult.taxResult) < 0);

    // 3. Mixed Income Detection
    const hasSalaried = declaredRegimes.some((r) => /sueldos|salarios/i.test(r)) ||
      (salariedIncome.annualGrossIncome != null && Number(salariedIncome.annualGrossIncome) > 0);

    const hasIndependent = declaredRegimes.some((r) =>
      /actividad empresarial|servicios profesionales|honorarios|resico|simplificado/i.test(r),
    ) || (businessOrProfessionalIncome.totalIncome != null || resicoIncome.totalEffectiveIncome != null);

    const isMixedDeclaration = hasSalaried && hasIndependent;
    const hasOfficialReceipt = !!operationNumber;

    // 4. Generate Alerts
    const alerts: TaxReturnAlert[] = [];

    // Alert: Obsolete Tax Year (e.g. 2024 when 2025 is required)
    if (taxYear != null && taxYear < expectedTaxYear) {
      alerts.push({
        code: 'EJERCICIO_FISCAL_OBSOLETO',
        severity: 'WARNING',
        category: 'TAX_YEAR',
        message: `La Declaración Anual corresponde al Ejercicio ${taxYear}. La banca exige la Declaración Anual del Ejercicio ${expectedTaxYear} (año inmediato anterior).`,
        field: 'satReceipt.taxYear',
        requiresManualReview: true,
      });
    }

    // Alert: Tax Loss Knockout (CRITICAL / KNOCKOUT)
    if (hasTaxLoss) {
      alerts.push({
        code: 'PERDIDA_FISCAL_KNOCKOUT_DECLARACION',
        severity: 'ERROR',
        category: 'FINANCIAL_HEALTH',
        message: `El contribuyente registró PÉRDIDA FISCAL en el ejercicio ${taxYear ?? ''}. Descarte inmediato del camino de comprobación fiscal: se debe respaldar 100% por Estados de Cuenta Bancarios para evitar rechazo en mesa de control.`,
        field: 'fiscalResult.fiscalLoss',
        requiresManualReview: true,
      });
    }

    // Alert: Missing Official SAT Receipt / Operation Number
    if (!hasOfficialReceipt) {
      alerts.push({
        code: 'DECLARACION_SIN_ACUSE_SAT',
        severity: 'WARNING',
        category: 'AUTHENTICITY',
        message: 'No se detectó el Acuse de Recibo oficial del SAT con número de operación o sello digital.',
        field: 'satReceipt.operationNumber',
        requiresManualReview: true,
      });
    }

    // Alert: Mixed Income Info
    if (isMixedDeclaration) {
      alerts.push({
        code: 'DECLARACION_INGRESOS_MIXTOS',
        severity: 'INFO',
        category: 'REGIME',
        message: 'La Declaración Anual combina ingresos por Sueldos y Salarios con Actividad Empresarial/Profesional.',
        field: 'declaredRegimes',
        requiresManualReview: false,
      });
    }

    return {
      documentType: 'TAX_RETURN',
      satReceipt: {
        rfc,
        taxpayerName,
        declarationType: (satReceipt.declarationType as string) ?? null,
        periodDescription: (satReceipt.periodDescription as string) ?? null,
        taxYear,
        presentationDate: (satReceipt.presentationDate as string) ?? null,
        operationNumber,
        presentationMedium: (satReceipt.presentationMedium as string) ?? null,
      },
      taxPayment: {
        paymentConcept: (taxPayment.paymentConcept as string) ?? null,
        amountInFavor: typeof taxPayment.amountInFavor === 'number' ? taxPayment.amountInFavor : null,
        amountDue: typeof taxPayment.amountDue === 'number' ? taxPayment.amountDue : null,
        amountToPay: typeof taxPayment.amountToPay === 'number' ? taxPayment.amountToPay : null,
      },
      declaredRegimes,
      salariedIncome: hasSalaried
        ? {
            annualGrossIncome: typeof salariedIncome.annualGrossIncome === 'number'
              ? salariedIncome.annualGrossIncome
              : Number(salariedIncome.annualGrossIncome) || null,
            exemptIncome: typeof salariedIncome.exemptIncome === 'number'
              ? salariedIncome.exemptIncome
              : Number(salariedIncome.exemptIncome) || null,
            employmentSubsidy: typeof salariedIncome.employmentSubsidy === 'number'
              ? salariedIncome.employmentSubsidy
              : Number(salariedIncome.employmentSubsidy) || null,
            taxWithheld: typeof salariedIncome.taxWithheld === 'number'
              ? salariedIncome.taxWithheld
              : Number(salariedIncome.taxWithheld) || null,
            retainers: Array.isArray(salariedIncome.retainers)
              ? salariedIncome.retainers.map((ret: Record<string, unknown>) => ({
                  rfc: (ret.rfc as string) ?? null,
                  legalName: (ret.legalName as string) ?? null,
                  annualIncome: typeof ret.annualIncome === 'number' ? ret.annualIncome : Number(ret.annualIncome) || null,
                  exemptIncome: typeof ret.exemptIncome === 'number' ? ret.exemptIncome : Number(ret.exemptIncome) || null,
                  taxWithheld: typeof ret.taxWithheld === 'number' ? ret.taxWithheld : Number(ret.taxWithheld) || null,
                }))
              : [],
          }
        : undefined,
      businessOrProfessionalIncome: businessOrProfessionalIncome.totalIncome != null
        ? {
            totalIncome: typeof businessOrProfessionalIncome.totalIncome === 'number'
              ? businessOrProfessionalIncome.totalIncome
              : Number(businessOrProfessionalIncome.totalIncome) || null,
            detailedIncome: Array.isArray(businessOrProfessionalIncome.detailedIncome)
              ? businessOrProfessionalIncome.detailedIncome.map((d: Record<string, unknown>) => ({
                  concept: String(d.concept ?? ''),
                  amount: typeof d.amount === 'number' ? d.amount : Number(d.amount) || 0,
                }))
              : [],
            taxWithheld: typeof businessOrProfessionalIncome.taxWithheld === 'number'
              ? businessOrProfessionalIncome.taxWithheld
              : Number(businessOrProfessionalIncome.taxWithheld) || null,
            authorizedDeductions: typeof businessOrProfessionalIncome.authorizedDeductions === 'number'
              ? businessOrProfessionalIncome.authorizedDeductions
              : Number(businessOrProfessionalIncome.authorizedDeductions) || null,
          }
        : undefined,
      resicoIncome: resicoIncome.totalEffectiveIncome != null || resicoIncome.totalActivityIncome != null
        ? {
            totalEffectiveIncome: typeof resicoIncome.totalEffectiveIncome === 'number'
              ? resicoIncome.totalEffectiveIncome
              : Number(resicoIncome.totalEffectiveIncome) || null,
            totalInvoicedIncome: typeof resicoIncome.totalInvoicedIncome === 'number'
              ? resicoIncome.totalInvoicedIncome
              : Number(resicoIncome.totalInvoicedIncome) || null,
            totalActivityIncome: typeof resicoIncome.totalActivityIncome === 'number'
              ? resicoIncome.totalActivityIncome
              : Number(resicoIncome.totalActivityIncome) || null,
            taxWithheld: typeof resicoIncome.taxWithheld === 'number'
              ? resicoIncome.taxWithheld
              : Number(resicoIncome.taxWithheld) || null,
          }
        : undefined,
      fiscalResult: {
        accumulableIncomeTotal,
        fiscalProfit,
        fiscalLoss,
        taxResult: typeof fiscalResult.taxResult === 'number' ? fiscalResult.taxResult : null,
      },
      isValidTaxYear,
      hasTaxLoss,
      isMixedDeclaration,
      hasOfficialReceipt,
      alerts,
      extractionTimestamp: new Date().toISOString(),
    };
  }
}
