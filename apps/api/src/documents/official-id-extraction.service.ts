import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiService, GeminiErrorCode } from './gemini.service';

// ---------------------------------------------------------------------------
// Document type codes that trigger official-ID extraction
// ---------------------------------------------------------------------------
const OFFICIAL_ID_DOC_TYPES = ['INE', 'PASSPORT', 'OFFICIAL_ID'];

// ---------------------------------------------------------------------------
// Specialized instructions for INE / passport extraction (appended to the
// base SYSTEM_INSTRUCTION inside GeminiService).
// ---------------------------------------------------------------------------
const OFFICIAL_ID_INSTRUCTIONS = [
  'Identificación oficial mexicana (INE o pasaporte).',
  '',
  'El documento puede contener ambos lados de la credencial en un solo PDF.',
  'Analizá TODO el texto OCR; los datos relevantes pueden estar tanto en el anverso como en el reverso.',
  '',
  'Para INE:',
  '  - fullName aparece como "NOMBRE" o "NOMBRE COMPLETO" en el anverso.',
  '  - birthDate aparece como "FECHA DE NACIMIENTO".',
  '  - curp (Clave Única de Registro de Población) tiene 18 caracteres alfanuméricos.',
  '  - voterKey (clave de elector) aparece en el anverso como cadena alfanumérica.',
  '  - visibleExpirationDate aparece como "VIGENCIA" o "VÁLIDA HASTA". Normalizar a YYYY-MM-DD.',
  '  - Si la fecha de vigencia visible es anterior a la fecha actual, isExpiredByVisibleDate = true.',
  '  - NO intentes clasificar el modelo exacto de INE (E, F, G, H, I, J). No se requiere.',
  '',
  '  Bloque ineValidation (solo para INE):',
  '  - Buscá en el reverso de la INE líneas que empiezan con IDMEX.',
  '  - El CIC suele aparecer inmediatamente después de IDMEX, como un número de 9+ dígitos.',
  '  - El Identificador del Ciudadano suele aparecer después de los separadores << y dígitos intermedios.',
  '  - Ejemplo de línea: IDMEX123456789<<0<<1234<<5678<<9',
  '  - cic: extraer como texto, conservar ceros iniciales. Si no se detecta claramente, usar null.',
  '  - citizenIdentifier: extraer como texto. Si no se detecta claramente, usar null.',
  '  - NO confundas voterKey (clave de elector del anverso) con cic (CIC del reverso).',
  '  - NO necesitas determinar fecha de emisión ni año de emisión para esta validación.',
  '  - issueDate, issueYear, isPost2014Credential, validationMethod, notes: usar valores por defecto (null, null, null, null, []).',
  '  - requiresManualValidation: true.',
  '',
  'Para pasaporte:',
  '  - idNumber es el número de pasaporte (alfanumérico, usualmente en la parte superior).',
  '  - fullName: unir "APELLIDOS / SURNAMES" + "NOMBRES / GIVEN NAMES" en orden NOMBRE + APELLIDOS.',
  '  - birthDate bajo "FECHA DE NACIMIENTO / DATE OF BIRTH".',
  '  - visibleExpirationDate bajo "FECHA DE EXPIRACIÓN / DATE OF EXPIRY".',
  '  - curp bajo "CURP" si es pasaporte mexicano.',
  '  - voterKey NO aplica para pasaporte; usar null.',
  '  - hasPhoto = true por defecto para pasaporte.',
  '  - ineValidation NO aplica para pasaporte; usar null.',
  '',
  'Si el tipo de documento no puede determinarse con certeza, usar idType = "UNKNOWN".',
  '',
  'externalValidation:',
  '  - Si idType = INE, required = true, method = MANUAL_INE_PAGE.',
  '  - Si idType = PASSPORT, required = false, method = NOT_APPLICABLE.',
  '  - status siempre = NOT_VALIDATED.',
  '',
  'Reglas de alertas:',
  '  - Si falta fullName, birthDate, o no se detecta ni curp ni idNumber, generar alerta CRITICAL de categoría IDENTITY.',
  '  - Si isExpiredByVisibleDate = true, generar alerta WARNING.',
  '  - Si idType = INE, generar UNA SOLA alerta WARNING de MANUAL_VALIDATION con código INE_MANUAL_VALIDATION_REQUIRED.',
  '  - Si no se detecta CIC o citizenIdentifier en ineValidation, generar alerta WARNING.',
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
const OFFICIAL_ID_SCHEMA = {
  schemaVersion: '1.0',
  documentType: 'OFFICIAL_ID',
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
  identity: {
    idType: 'INE | PASSPORT | UNKNOWN',
    fullName: 'string | null',
    birthDate: 'YYYY-MM-DD | null',
    curp: 'string | null',
    voterKey: 'string | null',
    idNumber: 'string | null',
    visibleExpirationDate: 'YYYY-MM-DD | null',
    isExpiredByVisibleDate: 'boolean | null',
    hasSignature: 'boolean | null',
    hasPhoto: 'boolean | null',
  },
  ineValidation: {
    cic: 'string | null',
    citizenIdentifier: 'string | null',
    requiresManualValidation: true,
  },
  externalValidation: {
    required: 'boolean',
    status: 'NOT_VALIDATED | VALID | NOT_VALID | MANUAL_REVIEW | NOT_APPLICABLE',
    method: 'MANUAL_INE_PAGE | MANUAL_REVIEW | NOT_APPLICABLE',
    validatedAt: 'datetime | null',
    validatedBy: 'string | null',
    notes: 'string | null',
  },
  missingFields: [],
  alerts: [],
};

// ---------------------------------------------------------------------------
// Extraction result envelope
// ---------------------------------------------------------------------------
export interface OfficialIdExtractionResult {
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
export class OfficialIdExtractionService {
  private readonly logger = new Logger(OfficialIdExtractionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geminiService: GeminiService,
  ) {}

  // -----------------------------------------------------------------------
  // Public: document-type guard
  // -----------------------------------------------------------------------

  /** Returns true when the document type should trigger official-ID extraction. */
  static isOfficialIdDocument(documentTypeCode: string): boolean {
    return OFFICIAL_ID_DOC_TYPES.includes(documentTypeCode);
  }

  // -----------------------------------------------------------------------
  // Public: main extraction method
  // -----------------------------------------------------------------------

  async extract(
    caseId: string,
    documentId: string,
  ): Promise<OfficialIdExtractionResult> {
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
    const promptSchema = { ...OFFICIAL_ID_SCHEMA };
    const geminiResult = await this.geminiService.extractStructuredData(
      document.ocrText,
      document.documentType.code,
      promptSchema,
      OFFICIAL_ID_INSTRUCTIONS,
    );

    // 4. Handle Gemini errors
    if (!geminiResult.success) {
      this.logger.warn(
        `[OfficialId] Gemini extraction failed for doc ${documentId}: ${geminiResult.error?.code}`,
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

    // 5. Normalize ineValidation BEFORE computing alerts
    const data = geminiResult.extractedData as Record<string, unknown>;
    if (document.ocrText) {
      const geminiCic =
        (data.ineValidation as Record<string, unknown> | undefined)
          ?.cic as string | undefined | null;
      const geminiCid =
        (data.ineValidation as Record<string, unknown> | undefined)
          ?.citizenIdentifier as string | undefined | null;

      const normalized = normalizeIneValidationFields({
        ocrText: document.ocrText,
        cic: geminiCic ?? null,
        citizenIdentifier: geminiCid ?? null,
      });

      data.ineValidation = {
        cic: normalized.cic,
        citizenIdentifier: normalized.citizenIdentifier,
        requiresManualValidation: true,
      };
    }

    // 6. Post-process: compute alerts (after normalization)
    const alerts = this.computeAlerts(data);
    const missingFields = this.computeMissingFields(data);

    // 6. Merge alerts into extractedData (dedup by code)
    const existingCodes = new Set<string>();
    if (Array.isArray(data.alerts)) {
      for (const a of data.alerts as ExtractionAlert[]) {
        if (a.code) existingCodes.add(a.code);
      }
      const newAlerts = alerts.filter((a) => !existingCodes.has(a.code));
      data.alerts = [...data.alerts, ...newAlerts];
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

    // 7. Normalize alerts to Spanish (replace any English leftovers)
    data.alerts = this.normalizeAlerts(
      (data.alerts as ExtractionAlert[]) ?? [],
    );

    // 7. Persist extractedData to DB
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await this.prisma.document.update({
        where: { id: documentId },
        data: { extractedData: data as any },
      });
    } catch (dbError) {
      this.logger.error(
        `[OfficialId] Failed to persist extractedData for doc ${documentId}: ${(dbError as Error).message}`,
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
    const identity =
      (data.identity as Record<string, unknown> | undefined) ?? {};
    const ineVal =
      (data.ineValidation as Record<string, unknown> | undefined) ?? {};

    const idType = identity.idType as string | undefined;
    const fullName = identity.fullName as string | undefined | null;
    const birthDate = identity.birthDate as string | undefined | null;
    const curp = identity.curp as string | undefined | null;
    const idNumber = identity.idNumber as string | undefined | null;
    const isExpired = identity.isExpiredByVisibleDate as boolean | undefined | null;

    // --- Expiration check ---
    if (isExpired === true) {
      alerts.push({
        code: 'OFFICIAL_ID_EXPIRED',
        severity: 'WARNING',
        category: 'IDENTITY',
        message: 'El documento de identificación parece estar vencido según la fecha visible.',
        field: 'identity.visibleExpirationDate',
        requiresManualReview: true,
      });
    }

    // --- Missing fullName ---
    if (!fullName || fullName.trim() === '') {
      alerts.push({
        code: 'OFFICIAL_ID_MISSING_NAME',
        severity: 'CRITICAL',
        category: 'IDENTITY',
        message: 'No se pudo extraer el nombre completo de la identificación.',
        field: 'identity.fullName',
        requiresManualReview: true,
      });
    }

    // --- Missing birthDate ---
    if (!birthDate) {
      alerts.push({
        code: 'OFFICIAL_ID_MISSING_BIRTH_DATE',
        severity: 'CRITICAL',
        category: 'IDENTITY',
        message:
          'No se pudo extraer la fecha de nacimiento de la identificación.',
        field: 'identity.birthDate',
        requiresManualReview: true,
      });
    }

    // --- Missing identification number (CURP or idNumber) ---
    const hasCurp = curp && (curp as string).trim() !== '';
    const hasIdNumber = idNumber && (idNumber as string).trim() !== '';

    if (!hasCurp && !hasIdNumber) {
      alerts.push({
        code: 'OFFICIAL_ID_MISSING_ID_NUMBER',
        severity: 'CRITICAL',
        category: 'IDENTITY',
        message:
          'No se pudo extraer CURP ni número de identificación del documento.',
        field: 'identity.curp',
        requiresManualReview: true,
      });
    }

    // --- INE manual validation required ---
    if (idType === 'INE') {
      alerts.push({
        code: 'INE_MANUAL_VALIDATION_REQUIRED',
        severity: 'WARNING',
        category: 'MANUAL_VALIDATION',
        message:
          'El INE requiere validación manual en Lista Nominal por la asesora.',
        field: 'externalValidation.status',
        requiresManualReview: true,
      });
    }

    // --- INE validation: missing CIC ---
    if (idType === 'INE' && ineVal) {
      const cic = ineVal.cic as string | undefined | null;
      if (!cic || (cic as string).trim() === '') {
        alerts.push({
          code: 'INE_MISSING_CIC',
          severity: 'WARNING',
          category: 'MANUAL_VALIDATION',
          message:
            'No se detectó el CIC de la credencial. La asesora deberá localizarlo manualmente.',
          field: 'ineValidation.cic',
          requiresManualReview: true,
        });
      }
    }

    // --- INE validation: missing citizenIdentifier ---
    if (idType === 'INE' && ineVal) {
      const cid = ineVal.citizenIdentifier as string | undefined | null;
      if (!cid || (cid as string).trim() === '') {
        alerts.push({
          code: 'INE_MISSING_CITIZEN_ID',
          severity: 'WARNING',
          category: 'MANUAL_VALIDATION',
          message:
            'No se detectó el Identificador del Ciudadano. La asesora deberá localizarlo manualmente.',
          field: 'ineValidation.citizenIdentifier',
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
    const identity =
      (data.identity as Record<string, unknown> | undefined) ?? {};

    if (!identity.fullName || (identity.fullName as string)?.trim() === '') {
      missing.push('identity.fullName');
    }
    if (!identity.birthDate) {
      missing.push('identity.birthDate');
    }
    const hasCurp =
      identity.curp && (identity.curp as string).trim() !== '';
    const hasIdNumber =
      identity.idNumber && (identity.idNumber as string).trim() !== '';
    if (!hasCurp && !hasIdNumber) {
      missing.push('identity.curp / identity.idNumber');
    }

    return missing;
  }

  // -----------------------------------------------------------------------
  // Private: normalize alerts to Spanish
  // -----------------------------------------------------------------------

  private normalizeAlerts(alerts: ExtractionAlert[]): ExtractionAlert[] {
    return alerts.map((a) => {
      // Translate known English alert messages
      const englishToSpanish: Record<string, string> = {
        'Manual validation is required for INE documents.':
          'El INE requiere validación manual en Lista Nominal por la asesora.',
        'Manual validation required for INE.':
          'El INE requiere validación manual en Lista Nominal por la asesora.',
      };
      const translated = englishToSpanish[a.message];
      if (translated) {
        return { ...a, message: translated };
      }
      return a;
    });
  }
}

// ---------------------------------------------------------------------------
// Standalone: normalize CIC & citizenIdentifier to 9-digit strings
// ---------------------------------------------------------------------------

export interface IvrExtraction {
  cic: string | null;
  citizenIdentifier: string | null;
}

/**
 * Normalizes CIC and citizenIdentifier for INE validation.
 *
 * Priority:
 *  1. If OCR contains IDMEX...<<... pattern, extract with deterministic rules.
 *  2. If no IDMEX pattern, accept Gemini values only if exactly 9 digits.
 *  3. Otherwise null.
 *
 * IDMEX extraction rules:
 *   cic = first 9 digits from block after IDMEX (drop last digit of the block)
 *   citizenIdentifier = 9 digits starting at position 5 of block after << (drop first 4)
 */
export function normalizeIneValidationFields(input: {
  ocrText?: string;
  cic?: string | null;
  citizenIdentifier?: string | null;
}): IvrExtraction {
  // ── Try IDMEX pattern first ──────────────────────────────────────
  if (input.ocrText) {
    const collapsed = input.ocrText.replace(/[\s\r\n]+/g, ' ').trim();
    const regex = /IDMEX\s*(\d{9,12})\s*<{1,2}\s*(\d{9,16})/i;
    const match = regex.exec(collapsed);

    if (match) {
      const block1 = match[1]; // digits after IDMEX
      const block2 = match[2]; // digits after <<

      // cic = 9 digits: use first 9 of block1
      const cic = block1.length >= 9 ? block1.slice(0, 9) : null;

      // citizenIdentifier = 9 digits:
      //   If block2 >= 13 chars → slice(4, 13)
      //   If block2 == 9 chars → use as-is
      let citizenIdentifier: string | null = null;
      if (block2.length >= 13) {
        citizenIdentifier = block2.slice(4, 13);
      } else if (block2.length === 9) {
        citizenIdentifier = block2;
      }

      return { cic, citizenIdentifier };
    }
  }

  // ── Fallback: validate Gemini values ─────────────────────────────
  const geminiCic = input.cic ?? null;
  const geminiCid = input.citizenIdentifier ?? null;

  const cic =
    geminiCic && /^\d{9}$/.test(String(geminiCic).trim())
      ? String(geminiCic).trim()
      : null;

  const citizenIdentifier =
    geminiCid && /^\d{9}$/.test(String(geminiCid).trim())
      ? String(geminiCid).trim()
      : null;

  return { cic, citizenIdentifier };
}
