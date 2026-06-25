import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiService } from './gemini.service';
import {
  OfficialIdExtractionService,
  OfficialIdExtractionResult,
  normalizeIneValidationFields,
} from './official-id-extraction.service';

// ---------------------------------------------------------------------------
// Helpers — mock document builder
// ---------------------------------------------------------------------------

interface MockDocument {
  id: string;
  mortgageCaseId: string;
  documentType: { id: number; code: string; name: string; isActive: boolean };
  documentStatus: { id: number; code: string; name: string; order: number };
  ocrText: string | null;
  extractedData: unknown | null;
}

const makeDocument = (
  overrides: Partial<MockDocument> = {},
): MockDocument => ({
  id: 'doc-1',
  mortgageCaseId: 'case-1',
  documentType: {
    id: 1,
    code: 'INE',
    name: 'INE',
    isActive: true,
  },
  documentStatus: {
    id: 4,
    code: 'PROCESSED',
    name: 'Procesado',
    order: 4,
  },
  ocrText: 'NOMBRE: JUAN PÉREZ\nFECHA NACIMIENTO: 15/03/1990\nCURP: PEJ900315HYNRLN08\nVIGENCIA: 31/12/2032',
  extractedData: null,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Gemini response builders
// ---------------------------------------------------------------------------

const validIneResponse = {
  schemaVersion: '1.0',
  documentType: 'OFFICIAL_ID',
  extractionMetadata: {
    sourceDocumentId: 'doc-1',
    mortgageCaseId: 'case-1',
    ocrProcessedAt: '2026-06-24T12:00:00Z',
    extractedAt: '2026-06-24T12:01:00Z',
    model: 'gemini-2.5-flash',
    confidence: 0.92,
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
    idType: 'INE',
    fullName: 'JUAN PÉREZ LÓPEZ',
    birthDate: '1990-03-15',
    curp: 'PEJ900315HYNRLN08',
    voterKey: 'PRLPJN90031531H100',
    idNumber: null,
    visibleExpirationDate: '2032-12-31',
    isExpiredByVisibleDate: false,
    hasSignature: true,
    hasPhoto: true,
  },
  ineValidation: {
    cic: '123456789',
    citizenIdentifier: '116375842',
    requiresManualValidation: true,
  },
  externalValidation: {
    required: true,
    status: 'NOT_VALIDATED',
    method: 'MANUAL_INE_PAGE',
    validatedAt: null,
    validatedBy: null,
    notes: 'La asesora debe validar manualmente la vigencia en Lista Nominal.',
  },
  missingFields: [],
  alerts: [
    {
      code: 'INE_MANUAL_VALIDATION_REQUIRED',
      severity: 'WARNING',
      category: 'MANUAL_VALIDATION',
      message: 'El INE requiere validación manual en Lista Nominal.',
      field: 'externalValidation.status',
      requiresManualReview: true,
    },
  ],
};

const expiredIneResponse = {
  ...validIneResponse,
  identity: {
    ...validIneResponse.identity,
    visibleExpirationDate: '2021-12-31',
    isExpiredByVisibleDate: true,
  },
  alerts: [],
};

const passportResponse = {
  ...validIneResponse,
  identity: {
    idType: 'PASSPORT',
    fullName: 'MARIA GARCIA HERNANDEZ',
    birthDate: '1985-07-22',
    curp: 'GAHM850722MYNRRS09',
    voterKey: null,
    idNumber: 'G12345678',
    visibleExpirationDate: '2028-06-15',
    isExpiredByVisibleDate: false,
    hasSignature: true,
    hasPhoto: true,
  },
  ineValidation: null,
  externalValidation: {
    required: false,
    status: 'NOT_VALIDATED',
    method: 'NOT_APPLICABLE',
    validatedAt: null,
    validatedBy: null,
    notes: null,
  },
  alerts: [],
};

const missingNameResponse = {
  ...validIneResponse,
  identity: {
    ...validIneResponse.identity,
    fullName: null,
  },
  alerts: [],
};

const missingBirthDateResponse = {
  ...validIneResponse,
  identity: {
    ...validIneResponse.identity,
    birthDate: null,
  },
  alerts: [],
};

const missingIdNumberResponse = {
  ...validIneResponse,
  identity: {
    ...validIneResponse.identity,
    curp: null,
    idNumber: null,
  },
  alerts: [],
};

const unknownTypeResponse = {
  ...validIneResponse,
  identity: {
    idType: 'UNKNOWN',
    fullName: null,
    birthDate: null,
    curp: null,
    voterKey: null,
    idNumber: null,
    visibleExpirationDate: null,
    isExpiredByVisibleDate: null,
    hasSignature: null,
    hasPhoto: null,
  },
  ineValidation: null,
  alerts: [],
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('OfficialIdExtractionService', () => {
  let service: OfficialIdExtractionService;
  let mockPrisma: { document: { findUnique: jest.Mock; update: jest.Mock } };
  let mockGemini: { extractStructuredData: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      document: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    mockGemini = {
      extractStructuredData: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OfficialIdExtractionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GeminiService, useValue: mockGemini },
      ],
    }).compile();

    service = module.get<OfficialIdExtractionService>(
      OfficialIdExtractionService,
    );

    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Static guard
  // -----------------------------------------------------------------------

  describe('isOfficialIdDocument', () => {
    it('returns true for INE', () => {
      expect(OfficialIdExtractionService.isOfficialIdDocument('INE')).toBe(true);
    });

    it('returns true for PASSPORT', () => {
      expect(OfficialIdExtractionService.isOfficialIdDocument('PASSPORT')).toBe(true);
    });

    it('returns false for PAYROLL_RECEIPT', () => {
      expect(OfficialIdExtractionService.isOfficialIdDocument('PAYROLL_RECEIPT')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // extract
  // -----------------------------------------------------------------------

  describe('extract', () => {
    const caseId = 'case-1';
    const documentId = 'doc-1';

    const assertSuccess = (
      result: OfficialIdExtractionResult,
      expectedIdType?: string,
    ) => {
      expect(result.success).toBe(true);
      expect(result.documentId).toBe(documentId);
      expect(result.extractedData).not.toBeNull();
      if (expectedIdType) {
        const identity = (result.extractedData as any).identity;
        expect(identity.idType).toBe(expectedIdType);
      }
      expect(mockPrisma.document.update).toHaveBeenCalledWith({
        where: { id: documentId },
        data: expect.objectContaining({
          extractedData: expect.any(Object),
        }),
      });
    };

    // ---------------------------------------------------------------
    // 1. INE vigente con datos completos + ineValidation
    // ---------------------------------------------------------------
    it('extrae datos completos de INE vigente con CIC e Identificador del ciudadano', async () => {
      const doc = makeDocument();
      mockPrisma.document.findUnique.mockResolvedValue(doc);
      mockGemini.extractStructuredData.mockResolvedValue({
        success: true,
        documentType: 'INE',
        extractedData: validIneResponse,
      });

      const result = await service.extract(caseId, documentId);

      assertSuccess(result, 'INE');

      // Debe tener el bloque ineValidation
      const iv = (result.extractedData as any).ineValidation;
      expect(iv).toBeDefined();
      expect(iv.cic).toBe('123456789');
      expect(iv.citizenIdentifier).toBe('116375842');
      expect(iv.requiresManualValidation).toBe(true);

      // Debe tener alerta de validación manual
      expect(result.alerts).toContainEqual(
        expect.objectContaining({ code: 'INE_MANUAL_VALIDATION_REQUIRED' }),
      );
    });

    // ---------------------------------------------------------------
    // 2. INE vencida
    // ---------------------------------------------------------------
    it('detecta INE vencida y genera alerta WARNING de expiración', async () => {
      const doc = makeDocument({
        ocrText: 'NOMBRE: ANA LÓPEZ\nVIGENCIA: 31/12/2021\nFECHA NACIMIENTO: 01/01/1980\nCURP: LOXA800101MYNRLN00',
      });
      mockPrisma.document.findUnique.mockResolvedValue(doc);
      mockGemini.extractStructuredData.mockResolvedValue({
        success: true,
        documentType: 'INE',
        extractedData: expiredIneResponse,
      });

      const result = await service.extract(caseId, documentId);

      assertSuccess(result, 'INE');

      expect(result.alerts).toContainEqual(
        expect.objectContaining({
          code: 'OFFICIAL_ID_EXPIRED',
          severity: 'WARNING',
          category: 'IDENTITY',
        }),
      );
    });

    // ---------------------------------------------------------------
    // 3. Pasaporte con datos básicos
    // ---------------------------------------------------------------
    it('extrae datos de pasaporte vigente sin ineValidation y sin alerta de validación manual', async () => {
      const doc = makeDocument({
        documentType: { id: 2, code: 'INE', name: 'INE', isActive: true },
        ocrText: 'PASSPORT NUMBER: G12345678\nSURNAMES: GARCIA HERNANDEZ\nGIVEN NAMES: MARIA',
      });
      mockPrisma.document.findUnique.mockResolvedValue(doc);
      mockGemini.extractStructuredData.mockResolvedValue({
        success: true,
        documentType: 'INE',
        extractedData: passportResponse,
      });

      const result = await service.extract(caseId, documentId);

      assertSuccess(result, 'PASSPORT');

      expect(
        result.alerts.find((a) => a.code === 'INE_MANUAL_VALIDATION_REQUIRED'),
      ).toBeUndefined();
    });

    // ---------------------------------------------------------------
    // 4. Missing fields
    // ---------------------------------------------------------------
    it('genera alerta CRITICAL cuando falta el nombre', async () => {
      const doc = makeDocument();
      mockPrisma.document.findUnique.mockResolvedValue(doc);
      mockGemini.extractStructuredData.mockResolvedValue({
        success: true,
        documentType: 'INE',
        extractedData: missingNameResponse,
      });

      const result = await service.extract(caseId, documentId);

      expect(result.success).toBe(true);
      expect(result.alerts).toContainEqual(
        expect.objectContaining({ code: 'OFFICIAL_ID_MISSING_NAME', severity: 'CRITICAL' }),
      );
    });

    it('genera alerta CRITICAL cuando falta fecha de nacimiento', async () => {
      const doc = makeDocument();
      mockPrisma.document.findUnique.mockResolvedValue(doc);
      mockGemini.extractStructuredData.mockResolvedValue({
        success: true,
        documentType: 'INE',
        extractedData: missingBirthDateResponse,
      });

      const result = await service.extract(caseId, documentId);

      expect(result.alerts).toContainEqual(
        expect.objectContaining({ code: 'OFFICIAL_ID_MISSING_BIRTH_DATE', severity: 'CRITICAL' }),
      );
    });

    it('genera alerta CRITICAL cuando falta CURP y número de identificación', async () => {
      const doc = makeDocument();
      mockPrisma.document.findUnique.mockResolvedValue(doc);
      mockGemini.extractStructuredData.mockResolvedValue({
        success: true,
        documentType: 'INE',
        extractedData: missingIdNumberResponse,
      });

      const result = await service.extract(caseId, documentId);

      expect(result.alerts).toContainEqual(
        expect.objectContaining({ code: 'OFFICIAL_ID_MISSING_ID_NUMBER', severity: 'CRITICAL' }),
      );
    });

    // ---------------------------------------------------------------
    // 5. Gemini errors
    // ---------------------------------------------------------------
    it('maneja respuesta inválida de Gemini sin bloquear el expediente', async () => {
      const doc = makeDocument();
      mockPrisma.document.findUnique.mockResolvedValue(doc);
      mockGemini.extractStructuredData.mockResolvedValue({
        success: false,
        documentType: 'INE',
        extractedData: null,
        error: { code: 'GEMINI_INVALID_JSON', message: 'Not valid JSON' },
      });

      const result = await service.extract(caseId, documentId);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('GEMINI_INVALID_JSON');
    });

    it('maneja documento UNKNOWN y genera alertas de campos faltantes', async () => {
      const doc = makeDocument({ ocrText: 'IMAGEN BORROSA' });
      mockPrisma.document.findUnique.mockResolvedValue(doc);
      mockGemini.extractStructuredData.mockResolvedValue({
        success: true,
        documentType: 'INE',
        extractedData: unknownTypeResponse,
      });

      const result = await service.extract(caseId, documentId);

      expect(result.success).toBe(true);
      expect(result.alerts).toContainEqual(
        expect.objectContaining({ code: 'OFFICIAL_ID_MISSING_NAME' }),
      );
      expect(result.alerts).toContainEqual(
        expect.objectContaining({ code: 'OFFICIAL_ID_MISSING_BIRTH_DATE' }),
      );
      expect(result.alerts).toContainEqual(
        expect.objectContaining({ code: 'OFFICIAL_ID_MISSING_ID_NUMBER' }),
      );
    });

    // ---------------------------------------------------------------
    // Error: not found, not processed, no OCR
    // ---------------------------------------------------------------
    it('lanza error cuando el documento no existe', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(null);
      await expect(service.extract(caseId, documentId)).rejects.toThrow('Document not found');
    });

    it('lanza error cuando el documento pertenece a otro expediente', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(
        makeDocument({ mortgageCaseId: 'other-case' }),
      );
      await expect(service.extract(caseId, documentId)).rejects.toThrow('Document not found');
    });

    it('retorna DOCUMENT_NOT_PROCESSED cuando no ha pasado OCR', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(
        makeDocument({
          documentStatus: { id: 1, code: 'UPLOADED', name: 'Cargado', order: 1 },
        }),
      );

      const result = await service.extract(caseId, documentId);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('DOCUMENT_NOT_PROCESSED');
      expect(mockGemini.extractStructuredData).not.toHaveBeenCalled();
    });

    it('retorna OCR_TEXT_EMPTY cuando el documento no tiene texto OCR', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(
        makeDocument({ ocrText: null }),
      );

      const result = await service.extract(caseId, documentId);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('OCR_TEXT_EMPTY');
      expect(mockGemini.extractStructuredData).not.toHaveBeenCalled();
    });

    // ---------------------------------------------------------------
    // Persistence
    // ---------------------------------------------------------------
    it('persiste el JSON extraído en base de datos', async () => {
      const doc = makeDocument();
      mockPrisma.document.findUnique.mockResolvedValue(doc);
      mockGemini.extractStructuredData.mockResolvedValue({
        success: true,
        documentType: 'INE',
        extractedData: validIneResponse,
      });
      mockPrisma.document.update.mockResolvedValue({
        ...doc,
        extractedData: validIneResponse,
      });

      await service.extract(caseId, documentId);

      expect(mockPrisma.document.update).toHaveBeenCalledWith({
        where: { id: documentId },
        data: {
          extractedData: expect.objectContaining({
            documentType: 'OFFICIAL_ID',
            identity: expect.objectContaining({ idType: 'INE' }),
            ineValidation: expect.objectContaining({ cic: '123456789' }),
          }),
        },
      });
    });

    it('no bloquea si falla la persistencia', async () => {
      const doc = makeDocument();
      mockPrisma.document.findUnique.mockResolvedValue(doc);
      mockGemini.extractStructuredData.mockResolvedValue({
        success: true,
        documentType: 'INE',
        extractedData: validIneResponse,
      });
      mockPrisma.document.update.mockRejectedValue(new Error('DB error'));

      const result = await service.extract(caseId, documentId);

      expect(result.success).toBe(true);
    });

    it('maneja timeout de Gemini sin lanzar excepción', async () => {
      const doc = makeDocument();
      mockPrisma.document.findUnique.mockResolvedValue(doc);
      mockGemini.extractStructuredData.mockResolvedValue({
        success: false,
        documentType: 'INE',
        extractedData: null,
        error: { code: 'GEMINI_TIMEOUT', message: 'Timeout' },
      });

      const result = await service.extract(caseId, documentId);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('GEMINI_TIMEOUT');
      expect(mockPrisma.document.update).not.toHaveBeenCalled();
    });

    // ---------------------------------------------------------------
    // Ajuste 2: INE validation scenarios
    // ---------------------------------------------------------------

    it('extrae ineValidation con CIC e Identificador del ciudadano para INE post-2014', async () => {
      const doc = makeDocument({
        ocrText:
          'NOMBRE: JUAN PÉREZ\nEMISIÓN: 2020\nCURP: PEJ900315HYNRLN08\nIDMEX123456789<<0<<1234<<5678<<9',
      });
      mockPrisma.document.findUnique.mockResolvedValue(doc);
      mockGemini.extractStructuredData.mockResolvedValue({
        success: true,
        documentType: 'INE',
        extractedData: validIneResponse,
      });

      const result = await service.extract(caseId, documentId);

      assertSuccess(result, 'INE');

      const iv = (result.extractedData as any).ineValidation;
      expect(iv.cic).toBe('123456789');
      expect(iv.citizenIdentifier).toBe('116375842');
      expect(iv.requiresManualValidation).toBe(true);
    });

    it('no genera alerta INE_MISSING_CIC cuando el CIC está presente', async () => {
      const doc = makeDocument();
      mockPrisma.document.findUnique.mockResolvedValue(doc);
      mockGemini.extractStructuredData.mockResolvedValue({
        success: true,
        documentType: 'INE',
        extractedData: validIneResponse,
      });

      const result = await service.extract(caseId, documentId);

      expect(
        result.alerts.find((a) => a.code === 'INE_MISSING_CIC'),
      ).toBeUndefined();
    });

    it('genera alerta INE_MISSING_CIC cuando el CIC es null', async () => {
      const noCicResponse = {
        ...validIneResponse,
        ineValidation: {
          ...validIneResponse.ineValidation,
          cic: null,
        },
      };

      const doc = makeDocument();
      mockPrisma.document.findUnique.mockResolvedValue(doc);
      mockGemini.extractStructuredData.mockResolvedValue({
        success: true,
        documentType: 'INE',
        extractedData: noCicResponse,
      });

      const result = await service.extract(caseId, documentId);

      expect(result.alerts).toContainEqual(
        expect.objectContaining({ code: 'INE_MISSING_CIC', severity: 'WARNING' }),
      );
    });

    it('genera alerta INE_MISSING_CITIZEN_ID cuando el citizenIdentifier es null', async () => {
      const noCidResponse = {
        ...validIneResponse,
        ineValidation: {
          ...validIneResponse.ineValidation,
          citizenIdentifier: null,
        },
      };

      const doc = makeDocument();
      mockPrisma.document.findUnique.mockResolvedValue(doc);
      mockGemini.extractStructuredData.mockResolvedValue({
        success: true,
        documentType: 'INE',
        extractedData: noCidResponse,
      });

      const result = await service.extract(caseId, documentId);

      expect(result.alerts).toContainEqual(
        expect.objectContaining({ code: 'INE_MISSING_CITIZEN_ID', severity: 'WARNING' }),
      );
    });

    it('genera ambas alertas cuando faltan CIC y citizenIdentifier', async () => {
      const missingBothResponse = {
        ...validIneResponse,
        ineValidation: {
          ...validIneResponse.ineValidation,
          cic: null,
          citizenIdentifier: null,
        },
      };

      const doc = makeDocument();
      mockPrisma.document.findUnique.mockResolvedValue(doc);
      mockGemini.extractStructuredData.mockResolvedValue({
        success: true,
        documentType: 'INE',
        extractedData: missingBothResponse,
      });

      const result = await service.extract(caseId, documentId);

      expect(result.alerts).toContainEqual(
        expect.objectContaining({ code: 'INE_MISSING_CIC' }),
      );
      expect(result.alerts).toContainEqual(
        expect.objectContaining({ code: 'INE_MISSING_CITIZEN_ID' }),
      );
    });

    it('conserva CIC como string con ceros iniciales', async () => {
      const leadingZerosResponse = {
        ...validIneResponse,
        ineValidation: {
          ...validIneResponse.ineValidation,
          cic: '001234567',
        },
      };

      const doc = makeDocument();
      mockPrisma.document.findUnique.mockResolvedValue(doc);
      mockGemini.extractStructuredData.mockResolvedValue({
        success: true,
        documentType: 'INE',
        extractedData: leadingZerosResponse,
      });

      const result = await service.extract(caseId, documentId);

      const iv = (result.extractedData as any).ineValidation;
      expect(iv.cic).toBe('001234567');
      expect(typeof iv.cic).toBe('string');
    });

    it('no genera alertas de CIC ni citizenIdentifier para pasaporte', async () => {
      const doc = makeDocument({
        documentType: { id: 2, code: 'INE', name: 'INE', isActive: true },
      });
      mockPrisma.document.findUnique.mockResolvedValue(doc);
      mockGemini.extractStructuredData.mockResolvedValue({
        success: true,
        documentType: 'INE',
        extractedData: passportResponse,
      });

      const result = await service.extract(caseId, documentId);

      expect(
        result.alerts.find((a) => a.code === 'INE_MISSING_CIC'),
      ).toBeUndefined();
      expect(
        result.alerts.find((a) => a.code === 'INE_MISSING_CITIZEN_ID'),
      ).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // normalizeIneValidationFields — standalone function tests
  // -----------------------------------------------------------------------

  describe('normalizeIneValidationFields', () => {
    it('extrae CIC=9 dígitos y citizenIdentifier=9 dígitos desde IDMEX estándar', () => {
      const result = normalizeIneValidationFields({
        ocrText: 'IDMEX1805517218<<0639013916431',
      });
      expect(result.cic).toBe('180551721');
      expect(result.citizenIdentifier).toBe('013916431');
    });

    it('extrae con el ejemplo documentado: IDMEX1836577170<<0747116375842', () => {
      const result = normalizeIneValidationFields({
        ocrText: 'IDMEX1836577170<<0747116375842',
      });
      expect(result.cic).toBe('183657717');
      expect(result.citizenIdentifier).toBe('116375842');
    });

    it('maneja espacios entre IDMEX y dígitos', () => {
      const result = normalizeIneValidationFields({
        ocrText: 'IDMEX 1805517218 << 0639013916431',
      });
      expect(result.cic).toBe('180551721');
      expect(result.citizenIdentifier).toBe('013916431');
    });

    it('maneja saltos de línea en OCR', () => {
      const result = normalizeIneValidationFields({
        ocrText: 'IDMEX\n1805517218\n<<\n0639013916431',
      });
      expect(result.cic).toBe('180551721');
      expect(result.citizenIdentifier).toBe('013916431');
    });

    it('retorna cic y citizenIdentifier como null si no hay IDMEX ni valores Gemini válidos', () => {
      const result = normalizeIneValidationFields({
        ocrText: 'NOMBRE: JUAN PÉREZ\nCURP: PEJ900315HYNRLN08',
      });
      expect(result.cic).toBeNull();
      expect(result.citizenIdentifier).toBeNull();
    });

    it('acepta Gemini cic si tiene exactamente 9 dígitos cuando no hay IDMEX', () => {
      const result = normalizeIneValidationFields({
        ocrText: 'NOMBRE: JUAN',
        cic: '123456789',
        citizenIdentifier: '987654321',
      });
      expect(result.cic).toBe('123456789');
      expect(result.citizenIdentifier).toBe('987654321');
    });

    it('rechaza Gemini cic de 10 dígitos cuando no hay IDMEX (debe ser exactamente 9)', () => {
      const result = normalizeIneValidationFields({
        ocrText: 'NOMBRE: JUAN',
        cic: '1234567890',
        citizenIdentifier: '987654321',
      });
      expect(result.cic).toBeNull(); // 10 dígitos → inválido sin IDMEX
      expect(result.citizenIdentifier).toBe('987654321');
    });

    it('rechaza Gemini citizenIdentifier de más de 9 dígitos cuando no hay IDMEX', () => {
      const result = normalizeIneValidationFields({
        ocrText: 'NOMBRE: JUAN',
        cic: '123456789',
        citizenIdentifier: '9876543210',
      });
      expect(result.cic).toBe('123456789');
      expect(result.citizenIdentifier).toBeNull(); // 10 dígitos → inválido
    });

    it('conserva ceros iniciales en ambos campos', () => {
      const result = normalizeIneValidationFields({
        ocrText: 'IDMEX0001234567<<0000123456789',
      });
      // cic = primeros 9 de '0001234567' = '000123456'
      expect(result.cic).toBe('000123456');
      // citizenIdentifier = slice(4, 13) de '0000123456789' = '123456789'
      expect(result.citizenIdentifier).toBe('123456789');
    });

    it('IDMEX tiene prioridad sobre valores Gemini', () => {
      const result = normalizeIneValidationFields({
        ocrText: 'IDMEX1805517218<<0639013916431',
        cic: '999999999',
        citizenIdentifier: '888888888',
      });
      // IDMEX gana
      expect(result.cic).toBe('180551721');
      expect(result.citizenIdentifier).toBe('013916431');
    });
  });

  // -----------------------------------------------------------------------
  // Integration: IDMEX normalization (post-Gemini, pre-alerts)
  // -----------------------------------------------------------------------

  describe('extract — IDMEX normalization', () => {
    const caseId = 'case-1';
    const documentId = 'doc-1';

    it('normaliza CIC a 9 dígitos y citizenIdentifier a 9 dígitos desde OCR IDMEX', async () => {
      const mockPrisma = {
        document: {
          findUnique: jest.fn(),
          update: jest.fn(),
        },
      };
      const mockGemini = {
        extractStructuredData: jest.fn(),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          OfficialIdExtractionService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: GeminiService, useValue: mockGemini },
        ],
      }).compile();

      const svc = module.get<OfficialIdExtractionService>(
        OfficialIdExtractionService,
      );

      const ineWithoutValidation = {
        ...validIneResponse,
        ineValidation: {
          cic: null,
          citizenIdentifier: null,
          requiresManualValidation: true,
        },
      };

      const doc = makeDocument({
        ocrText:
          'NOMBRE: JUAN PÉREZ\nCURP: PEJ900315HYNRLN08\nIDMEX1805517218<<0639013916431',
      });
      mockPrisma.document.findUnique.mockResolvedValue(doc);
      mockGemini.extractStructuredData.mockResolvedValue({
        success: true,
        documentType: 'INE',
        extractedData: ineWithoutValidation,
      });
      mockPrisma.document.update.mockResolvedValue({
        ...doc,
        extractedData: ineWithoutValidation,
      });

      const result = await svc.extract(caseId, documentId);

      expect(result.success).toBe(true);
      const iv = (result.extractedData as any).ineValidation;
      expect(iv.cic).toBe('180551721');
      expect(iv.citizenIdentifier).toBe('013916431');
    });

    it('no genera alerta de CIC faltante cuando IDMEX lo completa', async () => {
      const mockPrisma = {
        document: {
          findUnique: jest.fn(),
          update: jest.fn(),
        },
      };
      const mockGemini = {
        extractStructuredData: jest.fn(),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          OfficialIdExtractionService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: GeminiService, useValue: mockGemini },
        ],
      }).compile();

      const svc = module.get<OfficialIdExtractionService>(
        OfficialIdExtractionService,
      );

      const ineWithoutValidation = {
        ...validIneResponse,
        ineValidation: {
          cic: null,
          citizenIdentifier: null,
          requiresManualValidation: true,
        },
      };

      const doc = makeDocument({
        ocrText:
          'NOMBRE: JUAN\nIDMEX1805517218<<0639013916431',
      });
      mockPrisma.document.findUnique.mockResolvedValue(doc);
      mockGemini.extractStructuredData.mockResolvedValue({
        success: true,
        documentType: 'INE',
        extractedData: ineWithoutValidation,
      });
      mockPrisma.document.update.mockResolvedValue({
        ...doc,
        extractedData: ineWithoutValidation,
      });

      const result = await svc.extract(caseId, documentId);

      // No debe haber alerta de CIC ni citizenIdentifier faltantes
      expect(
        result.alerts.find((a) => a.code === 'INE_MISSING_CIC'),
      ).toBeUndefined();
      expect(
        result.alerts.find((a) => a.code === 'INE_MISSING_CITIZEN_ID'),
      ).toBeUndefined();
    });

    it('corrige CIC de 10 dígitos de Gemini a 9 usando IDMEX', async () => {
      const mockPrisma = {
        document: {
          findUnique: jest.fn(),
          update: jest.fn(),
        },
      };
      const mockGemini = {
        extractStructuredData: jest.fn(),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          OfficialIdExtractionService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: GeminiService, useValue: mockGemini },
        ],
      }).compile();

      const svc = module.get<OfficialIdExtractionService>(
        OfficialIdExtractionService,
      );

      // Gemini returned 10-digit CIC
      const ineWith10DigitCic = {
        ...validIneResponse,
        ineValidation: {
          cic: '1805517218', // 10 dígitos!
          citizenIdentifier: '0639013916431', // 13 dígitos!
          requiresManualValidation: true,
        },
      };

      const doc = makeDocument({
        ocrText:
          'IDMEX1805517218<<0639013916431',
      });
      mockPrisma.document.findUnique.mockResolvedValue(doc);
      mockGemini.extractStructuredData.mockResolvedValue({
        success: true,
        documentType: 'INE',
        extractedData: ineWith10DigitCic,
      });
      mockPrisma.document.update.mockResolvedValue({
        ...doc,
        extractedData: ineWith10DigitCic,
      });

      const result = await svc.extract(caseId, documentId);

      const iv = (result.extractedData as any).ineValidation;
      // IDMEX tiene prioridad — normaliza a 9 dígitos
      expect(iv.cic).toBe('180551721');
      expect(iv.citizenIdentifier).toBe('013916431');
    });
  });

  // -----------------------------------------------------------------------
  // Alert normalization (Spanish)
  // -----------------------------------------------------------------------

  describe('extract — alert normalization', () => {
    const caseId = 'case-1';
    const documentId = 'doc-1';

    it('traduce alerta en inglés de validación manual a español', async () => {
      const mockPrisma = {
        document: {
          findUnique: jest.fn(),
          update: jest.fn(),
        },
      };
      const mockGemini = {
        extractStructuredData: jest.fn(),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          OfficialIdExtractionService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: GeminiService, useValue: mockGemini },
        ],
      }).compile();

      const svc = module.get<OfficialIdExtractionService>(
        OfficialIdExtractionService,
      );

      const ineWithEnglishAlert = {
        ...validIneResponse,
        alerts: [
          {
            code: 'MANUAL_VALIDATION',
            severity: 'WARNING',
            category: 'MANUAL_VALIDATION',
            message: 'Manual validation is required for INE documents.',
            field: null,
            requiresManualReview: true,
          },
        ],
      };

      const doc = makeDocument();
      mockPrisma.document.findUnique.mockResolvedValue(doc);
      mockGemini.extractStructuredData.mockResolvedValue({
        success: true,
        documentType: 'INE',
        extractedData: ineWithEnglishAlert,
      });
      mockPrisma.document.update.mockResolvedValue({
        ...doc,
        extractedData: ineWithEnglishAlert,
      });

      const result = await svc.extract(caseId, documentId);

      // Should not contain English alert
      const englishAlerts = result.alerts.filter((a) =>
        a.message.includes('Manual validation is required'),
      );
      expect(englishAlerts).toHaveLength(0);

      // Should contain Spanish alert
      const spanishAlerts = result.alerts.filter((a) =>
        a.message.includes('validación manual en Lista Nominal'),
      );
      expect(spanishAlerts.length).toBeGreaterThan(0);
    });
  });
});
