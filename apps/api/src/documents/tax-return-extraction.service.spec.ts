import { Test, TestingModule } from '@nestjs/testing';
import { TaxReturnExtractionService } from './tax-return-extraction.service';
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

describe('TaxReturnExtractionService', () => {
  let service: TaxReturnExtractionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaxReturnExtractionService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: GeminiService, useValue: mockGeminiService },
      ],
    }).compile();

    service = module.get<TaxReturnExtractionService>(TaxReturnExtractionService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isTaxReturnDocument', () => {
    it('should return true for TAX_RETURN code', () => {
      expect(TaxReturnExtractionService.isTaxReturnDocument('TAX_RETURN')).toBe(true);
      expect(TaxReturnExtractionService.isTaxReturnDocument('tax_return')).toBe(true);
    });

    it('should return false for non-TAX_RETURN codes', () => {
      expect(TaxReturnExtractionService.isTaxReturnDocument('CSF')).toBe(false);
      expect(TaxReturnExtractionService.isTaxReturnDocument('PAYROLL_RECEIPT')).toBe(false);
      expect(TaxReturnExtractionService.isTaxReturnDocument(null)).toBe(false);
    });
  });

  describe('postProcessTaxReturn', () => {
    it('should correctly process RESICO declaration sample', () => {
      const rawData = {
        satReceipt: {
          rfc: 'DICA690402RZ4',
          taxpayerName: 'ALEJANDRO DE LA CRUZ DIAZ',
          declarationType: 'Normal',
          periodDescription: 'Del Ejercicio',
          taxYear: 2025,
          presentationDate: '2026-04-15 19:45',
          operationNumber: '230010729212',
          presentationMedium: 'Internet',
        },
        taxPayment: {
          paymentConcept: 'ISR PERSONAS FÍSICAS RÉGIMEN SIMPLIFICADO DE CONFIANZA',
          amountInFavor: 1826,
          amountDue: 0,
          amountToPay: 0,
        },
        declaredRegimes: ['RÉGIMEN SIMPLIFICADO DE CONFIANZA'],
        resicoIncome: {
          totalEffectiveIncome: 184726,
          totalInvoicedIncome: 184726,
          totalActivityIncome: 184726,
          taxWithheld: 0,
        },
        fiscalResult: {
          accumulableIncomeTotal: 184726,
          fiscalProfit: 184726,
          fiscalLoss: 0,
          taxResult: 184726,
        },
      };

      const result = service.postProcessTaxReturn(rawData);

      expect(result.documentType).toBe('TAX_RETURN');
      expect(result.satReceipt.rfc).toBe('DICA690402RZ4');
      expect(result.satReceipt.taxYear).toBe(2025);
      expect(result.satReceipt.operationNumber).toBe('230010729212');
      expect(result.isValidTaxYear).toBe(true);
      expect(result.hasTaxLoss).toBe(false);
      expect(result.hasOfficialReceipt).toBe(true);
      expect(result.fiscalResult.accumulableIncomeTotal).toBe(184726);
      expect(result.alerts).toHaveLength(0);
    });

    it('should correctly process Salarios + Profesionista sample and detect mixed declaration', () => {
      const rawData = {
        satReceipt: {
          rfc: 'TEST800101ABC',
          taxpayerName: 'CARLOS GOMEZ',
          declarationType: 'Normal',
          taxYear: 2025,
          presentationDate: '2026-04-20 10:15',
          operationNumber: '230010729221',
        },
        declaredRegimes: [
          'Sueldos, salarios y asimilados',
          'Actividad Empresarial y Servicios profesionales (Honorarios)',
        ],
        salariedIncome: {
          annualGrossIncome: 77079,
          exemptIncome: 16138,
          employmentSubsidy: 3517,
          taxWithheld: 236,
          retainers: [
            {
              rfc: 'GDF9712054NA',
              legalName: 'GOBIERNO DE LA CIUDAD DE MEXICO',
              annualIncome: 77079,
              exemptIncome: 16138,
              taxWithheld: 236,
            },
          ],
        },
        businessOrProfessionalIncome: {
          totalIncome: 16323,
          detailedIncome: [
            { concept: 'SERVICIOS PROFESIONALES (HONORARIOS)', amount: 16323 },
          ],
          taxWithheld: 1632,
        },
        fiscalResult: {
          accumulableIncomeTotal: 93402,
          fiscalProfit: 16323,
          fiscalLoss: 0,
        },
      };

      const result = service.postProcessTaxReturn(rawData);

      expect(result.isMixedDeclaration).toBe(true);
      expect(result.salariedIncome?.annualGrossIncome).toBe(77079);
      expect(result.businessOrProfessionalIncome?.totalIncome).toBe(16323);
      expect(result.salariedIncome?.retainers).toHaveLength(1);

      const mixedAlert = result.alerts.find((a) => a.code === 'DECLARACION_INGRESOS_MIXTOS');
      expect(mixedAlert).toBeDefined();
      expect(mixedAlert?.severity).toBe('INFO');
    });

    it('should trigger PERDIDA_FISCAL_KNOCKOUT_DECLARACION alert when fiscalLoss > 0', () => {
      const rawData = {
        satReceipt: {
          rfc: 'TEST900101XYZ',
          taxYear: 2025,
          operationNumber: '230010729999',
        },
        declaredRegimes: ['Actividad Empresarial'],
        fiscalResult: {
          accumulableIncomeTotal: 500000,
          fiscalProfit: 0,
          fiscalLoss: 45000,
          taxResult: -45000,
        },
      };

      const result = service.postProcessTaxReturn(rawData);

      expect(result.hasTaxLoss).toBe(true);
      const lossAlert = result.alerts.find((a) => a.code === 'PERDIDA_FISCAL_KNOCKOUT_DECLARACION');
      expect(lossAlert).toBeDefined();
      expect(lossAlert?.severity).toBe('ERROR');
    });

    it('should trigger EJERCICIO_FISCAL_OBSOLETO for taxYear older than previous year', () => {
      const rawData = {
        satReceipt: {
          rfc: 'TEST900101XYZ',
          taxYear: 2022,
          operationNumber: '230010729999',
        },
        fiscalResult: {
          accumulableIncomeTotal: 100000,
          fiscalProfit: 50000,
          fiscalLoss: 0,
        },
      };

      const result = service.postProcessTaxReturn(rawData);

      expect(result.isValidTaxYear).toBe(false);
      const obsoleteAlert = result.alerts.find((a) => a.code === 'EJERCICIO_FISCAL_OBSOLETO');
      expect(obsoleteAlert).toBeDefined();
      expect(obsoleteAlert?.severity).toBe('WARNING');
    });
  });

  describe('extract', () => {
    it('should fetch document, invoke Gemini, post-process and update document in DB', async () => {
      const caseId = 'case-123';
      const documentId = 'doc-456';

      mockPrismaService.document.findUnique.mockResolvedValue({
        id: documentId,
        mortgageCaseId: caseId,
        ocrText: 'ACUSE DE RECIBO DECLARACION ANUAL 2025 RFC DICA690402RZ4',
        documentType: { code: 'TAX_RETURN' },
        documentStatusId: 1,
      });

      mockGeminiService.extractStructuredData.mockResolvedValue({
        success: true,
        extractedData: {
          satReceipt: { rfc: 'DICA690402RZ4', taxYear: 2025, operationNumber: '230010729212' },
          declaredRegimes: ['Régimen Simplificado de Confianza'],
          fiscalResult: { accumulableIncomeTotal: 184726, fiscalProfit: 184726, fiscalLoss: 0 },
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
      expect(result.documentType).toBe('TAX_RETURN');
    });
  });
});
