import { Test, TestingModule } from '@nestjs/testing';
import { CsfExtractionService } from './csf-extraction.service';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiService } from './gemini.service';

const mockPrismaService = {
  document: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  documentStatus: {
    findUnique: jest.fn(),
  },
};

const mockGeminiService = {
  extractStructuredData: jest.fn(),
};

describe('CsfExtractionService', () => {
  let service: CsfExtractionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CsfExtractionService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: GeminiService, useValue: mockGeminiService },
      ],
    }).compile();

    service = module.get<CsfExtractionService>(CsfExtractionService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isCsfDocument', () => {
    it('should return true for CSF code', () => {
      expect(CsfExtractionService.isCsfDocument('CSF')).toBe(true);
      expect(CsfExtractionService.isCsfDocument('csf')).toBe(true);
    });

    it('should return false for non-CSF codes', () => {
      expect(CsfExtractionService.isCsfDocument('PAYROLL_RECEIPT')).toBe(false);
      expect(CsfExtractionService.isCsfDocument('INE')).toBe(false);
      expect(CsfExtractionService.isCsfDocument(null)).toBe(false);
    });
  });

  describe('postProcessCsf', () => {
    it('should correctly process real sample CSF and detect mixed regime + tenure', () => {
      const rawData = {
        issuance: {
          issuanceDateRaw: 'CIUDAD DE MEXICO A 15 DE ENERO DE 2024',
          issuanceDate: '2025-08-05',
          issuanceLocation: 'CIUDAD DE MEXICO',
          idCIF: '12345678901',
        },
        taxpayer: {
          rfc: 'PEGJ800101AB1',
          curp: 'PEGJ800101HDFRRN09',
          firstName: 'JUAN PEREZ',
          firstLastName: 'PEREZ',
          secondLastName: 'GARCIA',
          fullName: 'JUAN PEREZ GARCIA',
          operationsStartDate: '2010-01-15',
          statusInPadron: 'REACTIVADO',
          lastStatusChangeDate: '2001-10-01',
        },
        fiscalAddress: {
          postalCode: '01000',
          streetType: 'CALLE',
          streetName: 'REFORMA',
          exteriorNumber: '100',
          interiorNumber: 'INT 1',
          neighborhood: 'COLONIA JUAREZ',
          municipality: 'CUAUHTEMOC',
          state: 'CIUDAD DE MEXICO',
          betweenStreets: 'CALLE A Y CALLE B',
        },
        activities: [
          {
            order: 1,
            description: 'Consultorios de medicina especializada pertenecientes al sector privado',
            percentage: 70,
            startDate: '2011-03-01',
            endDate: null,
          },
          {
            order: 2,
            description: 'Asalariado',
            percentage: 30,
            startDate: '2019-01-01',
            endDate: null,
          },
        ],
        regimes: [
          {
            description: 'Régimen de las Personas Físicas con Actividades Empresariales y Profesionales',
            startDate: '2003-10-01',
            endDate: null,
          },
          {
            description: 'Régimen de Sueldos y Salarios e Ingresos Asimilados a Salarios',
            startDate: '2011-03-01',
            endDate: null,
          },
        ],
        digitalStamp: {
          originalChain: '||2025/08/05|PEGJ800101AB1|CONSTANCIA DE SITUACIÓN FISCAL||',
          digitalStamp: 'SYNTHETICSTAMPEXAMPLE...',
        },
      };

      const result = service.postProcessCsf(rawData);

      expect(result.documentType).toBe('CSF');
      expect(result.taxpayer.rfc).toBe('PEGJ800101AB1');
      expect(result.taxpayer.curp).toBe('PEGJ800101HDFRRN09');
      expect(result.taxpayer.fullName).toBe('JUAN PEREZ GARCIA');
      expect(result.activityStartDate).toBe('2011-03-01');
      expect(result.hasSalariedRegime).toBe(true);
      expect(result.hasIndependentRegime).toBe(true);
      expect(result.isSolelySalaried).toBe(false);
      expect(result.tenureMonths).toBeGreaterThan(120);

      // Check mixed income alert
      const mixedAlert = result.alerts.find((a) => a.code === 'REGIMEN_SUELDOS_Y_SALARIOS_AVISO_MIXTO');
      expect(mixedAlert).toBeDefined();
      expect(mixedAlert?.severity).toBe('INFO');
    });

    it('does not use the independent tax-regime start date for arraigo', () => {
      const rawData = {
        taxpayer: { rfc: 'TEST900101XYZ', fullName: 'JUAN PEREZ' },
        activities: [
          {
            description: 'Servicios profesionales',
            percentage: 100,
            startDate: '2018-05-01',
            endDate: null,
          },
        ],
        regimes: [
          {
            description:
              'Régimen de las Personas Físicas con Actividades Empresariales y Profesionales',
            startDate: '2003-10-01',
            endDate: null,
          },
        ],
      };

      const result = service.postProcessCsf(rawData);
      expect(result.activityStartDate).toBe('2018-05-01');
    });

    it('should generate VIGENCIA_MAYOR_3_MESES alert for old CSF', () => {
      const rawData = {
        issuance: {
          issuanceDate: '2024-01-01',
        },
        taxpayer: {
          rfc: 'TEST900101XYZ',
          fullName: 'JUAN PEREZ',
        },
        regimes: [
          {
            description: 'Régimen Simplificado de Confianza',
            startDate: '2022-01-01',
          },
        ],
        activities: [],
      };

      const result = service.postProcessCsf(rawData);
      expect(result.issuance.isOlderThan3Months).toBe(true);
      const vigenciaAlert = result.alerts.find((a) => a.code === 'VIGENCIA_MAYOR_3_MESES');
      expect(vigenciaAlert).toBeDefined();
      expect(vigenciaAlert?.severity).toBe('WARNING');
    });

    it('should flag REGIMEN_EXCLUSIVAMENTE_ASALARIADO if only salaried regime is present', () => {
      const rawData = {
        taxpayer: {
          rfc: 'TEST900101XYZ',
          fullName: 'MARIA LOPEZ',
        },
        regimes: [
          {
            description: 'Régimen de Sueldos y Salarios e Ingresos Asimilados a Salarios',
            startDate: '2020-01-01',
          },
        ],
        activities: [
          {
            description: 'Asalariado',
            percentage: 100,
            startDate: '2020-01-01',
          },
        ],
      };

      const result = service.postProcessCsf(rawData);
      expect(result.isSolelySalaried).toBe(true);
      const salariedAlert = result.alerts.find((a) => a.code === 'REGIMEN_EXCLUSIVAMENTE_ASALARIADO');
      expect(salariedAlert).toBeDefined();
      expect(salariedAlert?.severity).toBe('ERROR');
    });
  });

  describe('extract', () => {
    it('should fetch document, invoke Gemini, post-process and update document in DB', async () => {
      const caseId = 'case-123';
      const documentId = 'doc-456';

      mockPrismaService.document.findUnique.mockResolvedValue({
        id: documentId,
        mortgageCaseId: caseId,
        ocrText: 'CONSTANCIA DE SITUACION FISCAL RFC PEGJ800101AB1 JUAN PEREZ',
        documentType: { code: 'CSF' },
        documentStatusId: 1,
      });

      mockGeminiService.extractStructuredData.mockResolvedValue({
        success: true,
        extractedData: {
          taxpayer: { rfc: 'PEGJ800101AB1', fullName: 'JUAN PEREZ' },
          regimes: [{ description: 'Régimen Simplificado de Confianza', startDate: '2023-01-01' }],
          activities: [{ description: 'Servicios Profesionales', percentage: 100, startDate: '2023-01-01' }],
        },
      });

      mockPrismaService.documentStatus.findUnique.mockResolvedValue({
        id: 3,
        code: 'PROCESSED',
      });

      mockPrismaService.document.update.mockResolvedValue({});

      const result = await service.extract(caseId, documentId);

      expect(mockGeminiService.extractStructuredData).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.document.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: documentId },
          data: expect.objectContaining({
            documentStatusId: 3,
          }),
        }),
      );
      expect(result.documentType).toBe('CSF');
    });

    it('should throw error when document is not found', async () => {
      mockPrismaService.document.findUnique.mockResolvedValue(null);
      await expect(service.extract('case-123', 'doc-999')).rejects.toThrow('Document doc-999 not found');
    });

    it('should throw error when document has no OCR text', async () => {
      mockPrismaService.document.findUnique.mockResolvedValue({
        id: 'doc-456',
        mortgageCaseId: 'case-123',
        ocrText: null,
        documentType: { code: 'CSF' },
      });

      await expect(service.extract('case-123', 'doc-456')).rejects.toThrow('has no OCR text');
    });
  });
});
