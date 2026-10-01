import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiService, GeminiErrorCode } from './gemini.service';
import { pickPrimaryIndependentActivity } from './csf-independent-activity';

// ---------------------------------------------------------------------------
// Document type codes that trigger CSF extraction
// ---------------------------------------------------------------------------
const CSF_DOC_TYPES = ['CSF'];

// ---------------------------------------------------------------------------
// Specialized instructions for Constancia de Situación Fiscal (SAT México)
// ---------------------------------------------------------------------------
const CSF_INSTRUCTIONS = [
  'Constancia de Situación Fiscal mexicana (SAT - Servicio de Administración Tributaria).',
  '',
  'El documento consta típicamente de 2 a 3 páginas con tablas de datos de identificación, domicilio, actividades económicas y regímenes.',
  'Analizá TODO el texto OCR con estricto apego al contenido.',
  '',
  '─── REGLA DE ORO ───',
  'NO inventes datos. Ante cualquier duda, usá null.',
  'Extraé ÚNICAMENTE de la información presente en el OCR.',
  '',
  '─── Lugar y Fecha de Emisión (issuance) ───',
  '  - issuanceDateRaw: texto tal cual de lugar y fecha (ej. "CIUDAD DE MEXICO A 15 DE ENERO DE 2024").',
  '  - issuanceDate: fecha normalizada a ISO YYYY-MM-DD (ej. "2025-08-05").',
  '  - issuanceLocation: ciudad / estado de emisión (ej. "CIUDAD DE MEXICO").',
  '  - idCIF: número identificador del CIF (ej. "12345678901").',
  '',
  '─── Datos de Identificación del Contribuyente (taxpayer) ───',
  '  - rfc: RFC del contribuyente con homoclave (13 caracteres para persona física).',
  '  - curp: CURP (18 caracteres).',
  '  - firstName: Nombre(s) (ej. "JUAN PEREZ").',
  '  - firstLastName: Primer Apellido (ej. "PEREZ").',
  '  - secondLastName: Segundo Apellido (ej. "GARCIA").',
  '  - fullName: Nombre completo ordenado NOMBRE + APELLIDOS (ej. "JUAN PEREZ GARCIA").',
  '  - operationsStartDate: Fecha inicio de operaciones general (normalizar a YYYY-MM-DD, ej. "2010-01-15").',
  '  - statusInPadron: Estatus en el padrón (ej. "ACTIVO", "REACTIVADO", "SUSPENDIDO").',
  '  - lastStatusChangeDate: Fecha de último cambio de estado (YYYY-MM-DD o null).',
  '  - commercialName: Nombre Comercial (o null).',
  '',
  '─── Datos del Domicilio Registrado (fiscalAddress) ───',
  '  - postalCode: Código Postal (ej. "01000").',
  '  - streetType: Tipo de vialidad (ej. "CALLE", "AVENIDA").',
  '  - streetName: Nombre de vialidad (ej. "REFORMA").',
  '  - exteriorNumber: Número exterior (ej. "100").',
  '  - interiorNumber: Número interior (ej. "INT 1" o null).',
  '  - neighborhood: Colonia / Fraccionamiento (ej. "COLONIA JUAREZ").',
  '  - locality: Localidad (o null).',
  '  - municipality: Municipio o Demarcación Territorial (ej. "CUAUHTEMOC").',
  '  - state: Entidad Federativa (ej. "CIUDAD DE MEXICO").',
  '  - betweenStreets: Entre calles (ej. "CALLE A Y CALLE B" o null).',
  '',
  '─── Actividades Económicas (activities) ───',
  '  Extraé cada fila de la tabla "Actividades Económicas":',
  '  - order: número de orden (1, 2, etc.).',
  '  - description: descripción textual de la actividad económica.',
  '  - percentage: porcentaje de ingresos (número entero o decimal, ej. 70, 30).',
  '  - startDate: fecha de inicio normalizada YYYY-MM-DD (ej. "2011-03-01").',
  '  - endDate: fecha de fin (YYYY-MM-DD o null si sigue activa).',
  '',
  '─── Regímenes Fiscales (regimes) ───',
  '  Extraé cada fila de la tabla "Regímenes":',
  '  - description: nombre completo del régimen (ej. "Régimen de las Personas Físicas con Actividades Empresariales y Profesionales", "Régimen de Sueldos y Salarios e Ingresos Asimilados a Salarios", "Régimen Simplificado de Confianza").',
  '  - startDate: fecha de inicio normalizada YYYY-MM-DD (ej. "2003-10-01").',
  '  - endDate: fecha de fin (YYYY-MM-DD o null si sigue activo).',
  '',
  '─── Obligaciones Fiscales (obligations) ───',
  '  Extraé cada fila de la tabla "Obligaciones":',
  '  - description: descripción de la obligación.',
  '  - dueDescription: descripción del vencimiento.',
  '  - startDate: fecha de inicio (YYYY-MM-DD).',
  '  - endDate: fecha de fin (YYYY-MM-DD o null).',
  '',
  '─── Sellos y Validación (digitalStamp) ───',
  '  - originalChain: cadena original del sello (o null).',
  '  - digitalStamp: sello digital (o null).',
].join('\n');

// ---------------------------------------------------------------------------
// JSON Schema for Gemini structured response
// ---------------------------------------------------------------------------
const CSF_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    issuance: {
      type: 'object',
      properties: {
        issuanceDateRaw: { type: 'string', nullable: true },
        issuanceDate: { type: 'string', nullable: true },
        issuanceLocation: { type: 'string', nullable: true },
        idCIF: { type: 'string', nullable: true },
      },
    },
    taxpayer: {
      type: 'object',
      properties: {
        rfc: { type: 'string', nullable: true },
        curp: { type: 'string', nullable: true },
        firstName: { type: 'string', nullable: true },
        firstLastName: { type: 'string', nullable: true },
        secondLastName: { type: 'string', nullable: true },
        fullName: { type: 'string', nullable: true },
        operationsStartDate: { type: 'string', nullable: true },
        statusInPadron: { type: 'string', nullable: true },
        lastStatusChangeDate: { type: 'string', nullable: true },
        commercialName: { type: 'string', nullable: true },
      },
      required: ['rfc', 'fullName'],
    },
    fiscalAddress: {
      type: 'object',
      properties: {
        postalCode: { type: 'string', nullable: true },
        streetType: { type: 'string', nullable: true },
        streetName: { type: 'string', nullable: true },
        exteriorNumber: { type: 'string', nullable: true },
        interiorNumber: { type: 'string', nullable: true },
        neighborhood: { type: 'string', nullable: true },
        locality: { type: 'string', nullable: true },
        municipality: { type: 'string', nullable: true },
        state: { type: 'string', nullable: true },
        betweenStreets: { type: 'string', nullable: true },
      },
    },
    activities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          order: { type: 'number', nullable: true },
          description: { type: 'string' },
          percentage: { type: 'number', nullable: true },
          startDate: { type: 'string', nullable: true },
          endDate: { type: 'string', nullable: true },
        },
        required: ['description'],
      },
    },
    regimes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          startDate: { type: 'string', nullable: true },
          endDate: { type: 'string', nullable: true },
        },
        required: ['description'],
      },
    },
    obligations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          dueDescription: { type: 'string', nullable: true },
          startDate: { type: 'string', nullable: true },
          endDate: { type: 'string', nullable: true },
        },
        required: ['description'],
      },
    },
    digitalStamp: {
      type: 'object',
      properties: {
        originalChain: { type: 'string', nullable: true },
        digitalStamp: { type: 'string', nullable: true },
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
  required: ['taxpayer', 'regimes', 'activities'],
};

export interface CsfAlert {
  code: string;
  severity: 'INFO' | 'WARNING' | 'ERROR';
  category: 'IDENTITY' | 'TAX_REGIME' | 'VALIDITY' | 'TENURE' | 'DOCUMENT_QUALITY';
  message: string;
  field?: string;
  requiresManualReview?: boolean;
}

export interface CsfExtractionPayload {
  documentType: 'CSF';
  taxpayer: {
    rfc: string | null;
    curp: string | null;
    firstName: string | null;
    firstLastName: string | null;
    secondLastName: string | null;
    fullName: string | null;
    operationsStartDate: string | null;
    statusInPadron: string | null;
    lastStatusChangeDate: string | null;
    commercialName: string | null;
  };
  issuance: {
    issuanceDateRaw: string | null;
    issuanceDate: string | null;
    issuanceLocation: string | null;
    idCIF: string | null;
    isOlderThan3Months: boolean;
  };
  fiscalAddress: {
    postalCode: string | null;
    streetType: string | null;
    streetName: string | null;
    exteriorNumber: string | null;
    interiorNumber: string | null;
    neighborhood: string | null;
    locality: string | null;
    municipality: string | null;
    state: string | null;
    betweenStreets: string | null;
  };
  activities: Array<{
    order?: number | null;
    description: string;
    percentage: number | null;
    startDate: string | null;
    endDate: string | null;
  }>;
  regimes: Array<{
    description: string;
    startDate: string | null;
    endDate: string | null;
  }>;
  obligations?: Array<{
    description: string;
    dueDescription?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  }>;
  digitalStamp?: {
    originalChain: string | null;
    digitalStamp: string | null;
  };
  // Computed Business Metrics
  activityStartDate: string | null;
  tenureMonths: number | null;
  hasSalariedRegime: boolean;
  hasIndependentRegime: boolean;
  isSolelySalaried: boolean;
  alerts: CsfAlert[];
  extractionTimestamp: string;
}

@Injectable()
export class CsfExtractionService {
  private readonly logger = new Logger(CsfExtractionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geminiService: GeminiService,
  ) {}

  static isCsfDocument(code?: string | null): boolean {
    if (!code) return false;
    return CSF_DOC_TYPES.includes(code.toUpperCase());
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

    if (!CsfExtractionService.isCsfDocument(document.documentType?.code)) {
      throw new Error(`Document type ${document.documentType?.code} is not a valid CSF document`);
    }

    if (!document.ocrText || document.ocrText.trim() === '') {
      throw new Error(`Document ${documentId} has no OCR text. Ensure Document AI has processed it.`);
    }

    // Call Gemini with specialized CSF instructions and schema
    const result = await this.geminiService.extractStructuredData(
      document.ocrText,
      document.documentType.code,
      CSF_RESPONSE_SCHEMA,
      CSF_INSTRUCTIONS,
    );

    if (!result.success || !result.extractedData) {
      const errCode = result.error?.code ?? GeminiErrorCode.GEMINI_REQUEST_ERROR;
      const errMsg = result.error?.message ?? 'Gemini CSF extraction failed';
      this.logger.error(`[CSF] Extraction failed for doc ${documentId}: ${errCode} - ${errMsg}`);
      throw new Error(`${errCode}: ${errMsg}`);
    }

    const rawData = result.extractedData;

    // Post-process and compute business rules & alerts
    const payload = this.postProcessCsf(rawData);

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

    this.logger.log(`[CSF] Successfully extracted and saved CSF data for doc ${documentId}`);
    return payload as unknown as Record<string, unknown>;
  }

  /**
   * Post-processes raw Gemini output: normalizes fields, computes tenure and generates business alerts.
   */
  postProcessCsf(rawData: Record<string, unknown>): CsfExtractionPayload {
    const taxpayer = (rawData.taxpayer ?? {}) as Record<string, unknown>;
    const issuance = (rawData.issuance ?? {}) as Record<string, unknown>;
    const fiscalAddress = (rawData.fiscalAddress ?? {}) as Record<string, unknown>;
    const rawActivities = Array.isArray(rawData.activities) ? rawData.activities : [];
    const rawRegimes = Array.isArray(rawData.regimes) ? rawData.regimes : [];
    const rawObligations = Array.isArray(rawData.obligations) ? rawData.obligations : [];
    const digitalStamp = (rawData.digitalStamp ?? {}) as Record<string, unknown>;

    // 1. Process Taxpayer & Full Name
    const firstName = (taxpayer.firstName as string) ?? null;
    const firstLastName = (taxpayer.firstLastName as string) ?? null;
    const secondLastName = (taxpayer.secondLastName as string) ?? null;
    let fullName = (taxpayer.fullName as string) ?? null;

    if (!fullName && firstName && firstLastName) {
      fullName = [firstName, firstLastName, secondLastName].filter(Boolean).join(' ').trim();
    }
    if (fullName) {
      fullName = fullName.toUpperCase().replace(/\s+/g, ' ').trim();
    }

    const rfc = (taxpayer.rfc as string)?.toUpperCase()?.replace(/[^A-Z0-9&Ñ]/g, '') ?? null;
    const curp = (taxpayer.curp as string)?.toUpperCase()?.replace(/[^A-Z0-9]/g, '') ?? null;
    const operationsStartDate = (taxpayer.operationsStartDate as string) ?? null;

    // 2. Process Regimes & Activities
    const regimes = rawRegimes.map((r: Record<string, unknown>) => ({
      description: String(r.description ?? '').trim(),
      startDate: (r.startDate as string) ?? null,
      endDate: (r.endDate as string) ?? null,
    }));

    const activities = rawActivities.map((a: Record<string, unknown>) => ({
      order: typeof a.order === 'number' ? a.order : Number(a.order) || null,
      description: String(a.description ?? '').trim(),
      percentage: typeof a.percentage === 'number' ? a.percentage : Number(a.percentage) || null,
      startDate: (a.startDate as string) ?? null,
      endDate: (a.endDate as string) ?? null,
    }));

    // 3. Detect Regime Types
    const hasSalariedRegime = regimes.some((r) =>
      /sueldos|salarios|asimilados|asalariado/i.test(r.description) && !r.endDate,
    ) || activities.some((a) => /asalariado|sueldos/i.test(a.description) && !a.endDate);

    const hasIndependentRegime = regimes.some((r) =>
      /actividades empresariales|servicios profesionales|profesionales|resico|simplificado de confianza|arrendamiento|honorarios/i.test(
        r.description,
      ) && !r.endDate,
    ) || activities.some((a) => !/asalariado|sueldos/i.test(a.description) && !a.endDate);

    const isSolelySalaried = hasSalariedRegime && !hasIndependentRegime;

    // 4. Compute Activity Start Date & Tenure (Arraigo)
    // Use the primary independent *economic activity* start date — never the
    // tax-regime row (e.g. PFAE regime 2003-10-01 vs consultorio 2011-03-01).
    const activityStartDate =
      pickPrimaryIndependentActivity(activities)?.startDate ?? null;

    const tenureMonths = activityStartDate ? this.computeMonthsSince(activityStartDate) : null;

    // 5. Validity Check (Vigencia <= 3 months)
    const issuanceDate = (issuance.issuanceDate as string) ?? null;
    const isOlderThan3Months = issuanceDate ? this.computeDaysSince(issuanceDate) > 90 : false;

    // 6. Generate Alerts
    const alerts: CsfAlert[] = [];

    // Alert: Validity > 3 months (Warning, non-blocking)
    if (isOlderThan3Months) {
      alerts.push({
        code: 'VIGENCIA_MAYOR_3_MESES',
        severity: 'WARNING',
        category: 'VALIDITY',
        message: 'La Constancia de Situación Fiscal tiene una fecha de emisión mayor a 3 meses. Solicitar actualización antes de enviar al banco.',
        field: 'issuance.issuanceDate',
        requiresManualReview: true,
      });
    }

    // Alert: Mixed Income candidate (Sueldos y Salarios + Independiente)
    if (hasSalariedRegime && hasIndependentRegime) {
      alerts.push({
        code: 'REGIMEN_SUELDOS_Y_SALARIOS_AVISO_MIXTO',
        severity: 'INFO',
        category: 'TAX_REGIME',
        message: 'El contribuyente registra ingresos por Sueldos y Salarios además de Actividad Independiente. Considere perfilarlo como ingresos mixtos.',
        field: 'regimes',
        requiresManualReview: false,
      });
    }

    // Alert: Solely Salaried (Gate / Knockout for PFAE)
    if (isSolelySalaried) {
      alerts.push({
        code: 'REGIMEN_EXCLUSIVAMENTE_ASALARIADO',
        severity: 'ERROR',
        category: 'TAX_REGIME',
        message: 'La CSF solo registra régimen de Sueldos y Salarios. El solicitante debe comprobar ingresos como Asalariado con recibos de nómina.',
        field: 'regimes',
        requiresManualReview: true,
      });
    }

    // Alert: Insufficient Tenure (Arraigo)
    if (tenureMonths != null && tenureMonths < 24) {
      alerts.push({
        code: 'ARRAIGO_INSUFICIENTE',
        severity: 'WARNING',
        category: 'TENURE',
        message: `Antigüedad en la actividad independiente de ${tenureMonths} meses (mínimo general exigido: 24 meses; Banorte: 12 meses).`,
        field: 'activityStartDate',
        requiresManualReview: true,
      });
    }

    // Alert: Missing RFC or CURP
    if (!rfc) {
      alerts.push({
        code: 'CSF_MISSING_RFC',
        severity: 'ERROR',
        category: 'IDENTITY',
        message: 'No se detectó el RFC del contribuyente en la CSF.',
        field: 'taxpayer.rfc',
        requiresManualReview: true,
      });
    }

    return {
      documentType: 'CSF',
      taxpayer: {
        rfc,
        curp,
        firstName,
        firstLastName,
        secondLastName,
        fullName,
        operationsStartDate,
        statusInPadron: (taxpayer.statusInPadron as string) ?? null,
        lastStatusChangeDate: (taxpayer.lastStatusChangeDate as string) ?? null,
        commercialName: (taxpayer.commercialName as string) ?? null,
      },
      issuance: {
        issuanceDateRaw: (issuance.issuanceDateRaw as string) ?? null,
        issuanceDate,
        issuanceLocation: (issuance.issuanceLocation as string) ?? null,
        idCIF: (issuance.idCIF as string) ?? null,
        isOlderThan3Months,
      },
      fiscalAddress: {
        postalCode: (fiscalAddress.postalCode as string) ?? null,
        streetType: (fiscalAddress.streetType as string) ?? null,
        streetName: (fiscalAddress.streetName as string) ?? null,
        exteriorNumber: (fiscalAddress.exteriorNumber as string) ?? null,
        interiorNumber: (fiscalAddress.interiorNumber as string) ?? null,
        neighborhood: (fiscalAddress.neighborhood as string) ?? null,
        locality: (fiscalAddress.locality as string) ?? null,
        municipality: (fiscalAddress.municipality as string) ?? null,
        state: (fiscalAddress.state as string) ?? null,
        betweenStreets: (fiscalAddress.betweenStreets as string) ?? null,
      },
      activities,
      regimes,
      obligations: rawObligations.map((o: Record<string, unknown>) => ({
        description: String(o.description ?? ''),
        dueDescription: (o.dueDescription as string) ?? null,
        startDate: (o.startDate as string) ?? null,
        endDate: (o.endDate as string) ?? null,
      })),
      digitalStamp: {
        originalChain: (digitalStamp.originalChain as string) ?? null,
        digitalStamp: (digitalStamp.digitalStamp as string) ?? null,
      },
      activityStartDate,
      tenureMonths,
      hasSalariedRegime,
      hasIndependentRegime,
      isSolelySalaried,
      alerts,
      extractionTimestamp: new Date().toISOString(),
    };
  }

  private computeMonthsSince(isoDate: string): number {
    try {
      const start = new Date(isoDate);
      const now = new Date();
      if (isNaN(start.getTime())) return 0;
      const years = now.getFullYear() - start.getFullYear();
      const months = now.getMonth() - start.getMonth();
      const total = years * 12 + months;
      return Math.max(0, total);
    } catch {
      return 0;
    }
  }

  private computeDaysSince(isoDate: string): number {
    try {
      const date = new Date(isoDate);
      const now = new Date();
      if (isNaN(date.getTime())) return 0;
      const diffTime = Math.abs(now.getTime() - date.getTime());
      return Math.floor(diffTime / (1000 * 60 * 60 * 24));
    } catch {
      return 0;
    }
  }
}
