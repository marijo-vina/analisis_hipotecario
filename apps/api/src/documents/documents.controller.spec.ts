import { BadGatewayException, BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateDocumentDto } from './dto/create-document.dto';
import { QueryDocumentDto } from './dto/query-document.dto';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { OfficialIdExtractionService } from './official-id-extraction.service';
import { PayrollExtractionService } from './payroll-extraction.service';
import { BankStatementExtractionService } from './bank-statement-extraction.service';
import { CreditBureauExtractionService } from './credit-bureau-extraction.service';
import { CreditScoreExtractionService } from './credit-score-extraction.service';
import { CoordinateExtractionService } from './coordinate-extraction.service';
import { CsfExtractionService } from './csf-extraction.service';
import { TaxReturnExtractionService } from './tax-return-extraction.service';
import { GcsService } from './gcs.service';

describe('DocumentsController', () => {
  let controller: DocumentsController;

  const mockDocumentsService = {
    create: jest.fn(),
    findAllByCase: jest.fn(),
    findOneByCase: jest.fn(),
    uploadAndCreate: jest.fn(),
    getSignedUrl: jest.fn(),
    delete: jest.fn(),
    processDocument: jest.fn(),
  };

  const mockOfficialIdExtractionService = {
    extract: jest.fn(),
  };

  const mockPayrollExtractionService = {
    extract: jest.fn(),
  };

  const mockBankStatementExtractionService = {
    extract: jest.fn(),
  };

  const mockCreditBureauExtractionService = {
    extract: jest.fn(),
  };

  const mockCreditScoreExtractionService = {
    extract: jest.fn(),
  };

  const mockCsfExtractionService = {
    extract: jest.fn(),
  };

  const mockTaxReturnExtractionService = {
    extract: jest.fn(),
  };

  const mockCoordinateExtractionService = {
    extract: jest.fn(),
  };

  const mockGcsService = {
    downloadFile: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DocumentsController],
      providers: [
        {
          provide: DocumentsService,
          useValue: mockDocumentsService,
        },
        {
          provide: OfficialIdExtractionService,
          useValue: mockOfficialIdExtractionService,
        },
        {
          provide: PayrollExtractionService,
          useValue: mockPayrollExtractionService,
        },
        {
          provide: BankStatementExtractionService,
          useValue: mockBankStatementExtractionService,
        },
        {
          provide: CreditBureauExtractionService,
          useValue: mockCreditBureauExtractionService,
        },
        {
          provide: CreditScoreExtractionService,
          useValue: mockCreditScoreExtractionService,
        },
        {
          provide: CsfExtractionService,
          useValue: mockCsfExtractionService,
        },
        {
          provide: TaxReturnExtractionService,
          useValue: mockTaxReturnExtractionService,
        },
        {
          provide: CoordinateExtractionService,
          useValue: mockCoordinateExtractionService,
        },
        {
          provide: GcsService,
          useValue: mockGcsService,
        },
      ],
    }).compile();

    controller = module.get<DocumentsController>(DocumentsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should protect all endpoints with JwtAuthGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, DocumentsController);

    expect(guards).toEqual([JwtAuthGuard]);
  });

  describe('create', () => {
    it('should send dto and req.user.id to service and wrap in data envelope', async () => {
      const dto: CreateDocumentDto = {
        documentTypeId: 1,
        originalName: 'nomina_ene.pdf',
      };
      const req = { user: { id: 'advisor-1' } };
      const created = {
        id: 'doc-1',
        documentType: { code: 'PAYROLL_RECEIPT' },
        documentStatus: { code: 'UPLOADED' },
        fileUrl: null,
      };
      mockDocumentsService.create.mockResolvedValue(created);

      const result = await controller.create('case-uuid-1', dto, req);

      expect(result).toEqual({ data: created });
      expect(mockDocumentsService.create).toHaveBeenCalledWith(
        'case-uuid-1',
        'advisor-1',
        dto,
      );
    });
  });

  describe('findAllByCase', () => {
    it('should return documents list wrapped in data envelope', async () => {
      const documents = [
        { id: 'doc-1', documentType: { code: 'PAYROLL_RECEIPT' } },
        { id: 'doc-2', documentType: { code: 'BANK_STATEMENT' } },
      ];
      mockDocumentsService.findAllByCase.mockResolvedValue(documents);

      const query: QueryDocumentDto = {};
      const result = await controller.findAllByCase('case-uuid-1', query);

      expect(result).toEqual({ data: documents });
      expect(mockDocumentsService.findAllByCase).toHaveBeenCalledWith('case-uuid-1', query);
    });

    it('should return empty array wrapped in data when no documents', async () => {
      mockDocumentsService.findAllByCase.mockResolvedValue([]);

      const query: QueryDocumentDto = {};
      const result = await controller.findAllByCase('case-uuid-1', query);

      expect(result).toEqual({ data: [] });
      expect(mockDocumentsService.findAllByCase).toHaveBeenCalledWith('case-uuid-1', query);
    });

    it('should pass documentStatusId filter to service', async () => {
      const documents = [
        { id: 'doc-1', documentType: { code: 'PAYROLL_RECEIPT' }, documentStatus: { code: 'PROCESSED' } },
      ];
      mockDocumentsService.findAllByCase.mockResolvedValue(documents);

      const query: QueryDocumentDto = { documentStatusId: 4 };
      const result = await controller.findAllByCase('case-uuid-1', query);

      expect(result).toEqual({ data: documents });
      expect(mockDocumentsService.findAllByCase).toHaveBeenCalledWith('case-uuid-1', query);
    });
  });

  describe('findOneByCase', () => {
    it('should return single document wrapped in data envelope', async () => {
      const document = {
        id: 'doc-1',
        documentType: { code: 'PAYROLL_RECEIPT' },
        documentStatus: { code: 'UPLOADED' },
      };
      mockDocumentsService.findOneByCase.mockResolvedValue(document);

      const result = await controller.findOneByCase('case-uuid-1', 'doc-1');

      expect(result).toEqual({ data: document });
      expect(mockDocumentsService.findOneByCase).toHaveBeenCalledWith('case-uuid-1', 'doc-1');
    });
  });

  describe('viewDocument', () => {
    it('should return signed URL wrapped in data envelope', async () => {
      const signedUrl = 'https://storage.googleapis.com/signed-url';
      mockDocumentsService.getSignedUrl.mockResolvedValue(signedUrl);

      const result = await controller.viewDocument('case-uuid-1', 'doc-1');

      expect(mockDocumentsService.getSignedUrl).toHaveBeenCalledWith(
        'case-uuid-1',
        'doc-1',
      );
      expect(result).toEqual({ data: { signedUrl } });
    });

    it('should propagate NotFoundException from service', async () => {
      mockDocumentsService.getSignedUrl.mockRejectedValue(
        new NotFoundException('Document not found'),
      );

      await expect(
        controller.viewDocument('case-uuid-1', 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should propagate BadRequestException from service', async () => {
      mockDocumentsService.getSignedUrl.mockRejectedValue(
        new BadRequestException('El documento no tiene un archivo asociado'),
      );

      await expect(
        controller.viewDocument('case-uuid-1', 'doc-no-file'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('upload', () => {
    const caseId = 'case-uuid-1';
    const documentTypeId = 1;
    const req = { user: { id: 'advisor-1' } };

    const mockFile: Express.Multer.File = {
      fieldname: 'file',
      originalname: 'nomina_ene.pdf',
      encoding: '7bit',
      mimetype: 'application/pdf',
      buffer: Buffer.from('test'),
      size: 12345,
      stream: null as any,
      destination: '',
      filename: '',
      path: '',
    };

    const createdDocument = {
      id: 'doc-1',
      mortgageCaseId: caseId,
      documentType: { id: 1, code: 'PAYROLL_RECEIPT', name: 'Recibo de nómina' },
      documentStatus: { id: 1, code: 'UPLOADED', name: 'Cargado' },
      originalName: 'nomina_ene.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 12345,
      storagePath: 'case-uuid-1/PAYROLL_RECEIPT/nomina_ene.pdf',
      fileUrl: 'gs://bucket/case-uuid-1/PAYROLL_RECEIPT/nomina_ene.pdf',
    };

    it('should delegate to service and return 201 { data }', async () => {
      mockDocumentsService.uploadAndCreate.mockResolvedValue(createdDocument);

      const result = await controller.upload(
        caseId,
        mockFile,
        documentTypeId,
        req,
      );

      expect(mockDocumentsService.uploadAndCreate).toHaveBeenCalledWith(
        caseId,
        'advisor-1',
        mockFile,
        documentTypeId,
      );
      expect(result).toEqual({ data: createdDocument });
    });

    it('should throw BadRequestException when file is missing (null)', async () => {
      await expect(
        controller.upload(caseId, null as any, documentTypeId, req),
      ).rejects.toThrow(BadRequestException);

      expect(mockDocumentsService.uploadAndCreate).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when file is missing (undefined)', async () => {
      await expect(
        controller.upload(caseId, undefined as any, documentTypeId, req),
      ).rejects.toThrow('File is required');

      expect(mockDocumentsService.uploadAndCreate).not.toHaveBeenCalled();
    });

    it('should propagate NotFounException from service', async () => {
      mockDocumentsService.uploadAndCreate.mockRejectedValue(
        new NotFoundException('Mortgage case not found'),
      );

      await expect(
        controller.upload(caseId, mockFile, documentTypeId, req),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteDocument', () => {
    it('should delegate to service and return void (204 via @HttpCode)', async () => {
      mockDocumentsService.delete.mockResolvedValue(undefined);

      const result = await controller.deleteDocument('case-uuid-1', 'doc-1');

      expect(mockDocumentsService.delete).toHaveBeenCalledWith(
        'case-uuid-1',
        'doc-1',
      );
      expect(result).toBeUndefined();
    });

    it('should propagate NotFoundException from service', async () => {
      mockDocumentsService.delete.mockRejectedValue(
        new NotFoundException('Document not found'),
      );

      await expect(
        controller.deleteDocument('case-uuid-1', 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should propagate BadRequestException from service', async () => {
      mockDocumentsService.delete.mockRejectedValue(
        new BadRequestException('Solo se pueden eliminar documentos no procesados'),
      );

      await expect(
        controller.deleteDocument('case-uuid-1', 'doc-validated'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('processDocument', () => {
    const caseId = 'case-uuid-1';
    const documentId = 'doc-uuid-1';

    const processedDocument = {
      id: documentId,
      mortgageCaseId: caseId,
      documentType: { id: 1, code: 'PAYROLL_RECEIPT', name: 'Recibo de nómina' },
      documentStatus: { id: 4, code: 'PROCESSED', name: 'Procesado' },
      ocrText: 'Contenido extraído del documento',
      processedAt: new Date('2026-06-18T12:00:00Z'),
      originalName: 'doc.pdf',
      mimeType: 'application/pdf',
      fileUrl: 'gs://bucket/doc.pdf',
    };

    it('should return 200 with document in data envelope on success', async () => {
      mockDocumentsService.processDocument.mockResolvedValue(processedDocument);

      const result = await controller.processDocument(caseId, documentId);

      expect(mockDocumentsService.processDocument).toHaveBeenCalledWith(caseId, documentId, false);
      expect(result).toEqual({ data: processedDocument });
    });

    it('should propagate BadRequestException for status validation error', async () => {
      mockDocumentsService.processDocument.mockRejectedValue(
        new BadRequestException('Document is already being processed'),
      );

      await expect(controller.processDocument(caseId, documentId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should propagate BadRequestException for metadata validation error', async () => {
      mockDocumentsService.processDocument.mockRejectedValue(
        new BadRequestException('Document has no file to process'),
      );

      await expect(controller.processDocument(caseId, documentId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should propagate NotFoundException from service', async () => {
      mockDocumentsService.processDocument.mockRejectedValue(
        new NotFoundException('Document not found'),
      );

      await expect(controller.processDocument(caseId, documentId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should propagate BadGatewayException from service', async () => {
      mockDocumentsService.processDocument.mockRejectedValue(
        new BadGatewayException('Document processing service unavailable'),
      );

      await expect(controller.processDocument(caseId, documentId)).rejects.toThrow(
        BadGatewayException,
      );
    });

    it('should pass force=true to service when ?force=true query param is present (Task 4.1)', async () => {
      mockDocumentsService.processDocument.mockResolvedValue(processedDocument);

      const result = await controller.processDocument(caseId, documentId, 'true');

      expect(mockDocumentsService.processDocument).toHaveBeenCalledWith(caseId, documentId, true);
      expect(result).toEqual({ data: processedDocument });
    });

    it('should pass force=false to service when force query param is absent (Task 4.2)', async () => {
      mockDocumentsService.processDocument.mockResolvedValue(processedDocument);

      const result = await controller.processDocument(caseId, documentId);

      expect(mockDocumentsService.processDocument).toHaveBeenCalledWith(caseId, documentId, false);
      expect(result).toEqual({ data: processedDocument });
    });
  });

  describe('extractOfficialId', () => {
    const caseId = 'case-uuid-1';
    const documentId = 'doc-uuid-1';

    const successfulExtraction = {
      success: true,
      documentId,
      extractedData: {
        identity: {
          idType: 'INE',
          fullName: 'JUAN PÉREZ',
          birthDate: '1990-03-15',
          curp: 'PEJ900315HYNRLN08',
        },
      },
      alerts: [],
      missingFields: [],
    };

    it('should return 200 with extraction result in data envelope', async () => {
      mockOfficialIdExtractionService.extract.mockResolvedValue(
        successfulExtraction,
      );

      const result = await controller.extractOfficialId(caseId, documentId);

      expect(
        mockOfficialIdExtractionService.extract,
      ).toHaveBeenCalledWith(caseId, documentId);
      expect(result).toEqual({ data: successfulExtraction });
    });

    it('should return error result without throwing when extraction fails gracefully', async () => {
      const failureResult = {
        success: false,
        documentId,
        extractedData: null,
        alerts: [],
        missingFields: [],
        error: { code: 'DOCUMENT_NOT_PROCESSED', message: 'El documento debe estar procesado' },
      };
      mockOfficialIdExtractionService.extract.mockResolvedValue(failureResult);

      const result = await controller.extractOfficialId(caseId, documentId);

      expect(result).toEqual({ data: failureResult });
    });
  });

  describe('extractPayrollReceipt', () => {
    const caseId = 'case-uuid-1';
    const documentId = 'doc-payroll-uuid-1';

    const successfulExtraction = {
      success: true,
      documentId,
      extractedData: {
        employee: {
          fullName: 'JUAN PÉREZ LÓPEZ',
          rfc: 'PELJ900101ABC',
        },
        income: {
          netIncome: 14800.0,
          grossIncome: 18000.0,
        },
      },
      alerts: [],
      missingFields: [],
    };

    it('should return 200 with extraction result in data envelope', async () => {
      mockPayrollExtractionService.extract.mockResolvedValue(
        successfulExtraction,
      );

      const result = await controller.extractPayrollReceipt(caseId, documentId);

      expect(
        mockPayrollExtractionService.extract,
      ).toHaveBeenCalledWith(caseId, documentId);
      expect(result).toEqual({ data: successfulExtraction });
    });

    it('should return error result without throwing when extraction fails gracefully', async () => {
      const failureResult = {
        success: false,
        documentId,
        extractedData: null,
        alerts: [],
        missingFields: [],
        error: { code: 'DOCUMENT_NOT_PROCESSED', message: 'El documento debe estar procesado' },
      };
      mockPayrollExtractionService.extract.mockResolvedValue(failureResult);

      const result = await controller.extractPayrollReceipt(caseId, documentId);

      expect(result).toEqual({ data: failureResult });
    });
  });

  describe('extractBankStatement', () => {
    const caseId = 'case-uuid-1';
    const documentId = 'doc-bank-uuid-1';

    const successfulExtraction = {
      success: true,
      documentId,
      extractedData: {
        accountHolder: {
          fullName: 'JUAN PÉREZ LÓPEZ',
          isJointAccount: false,
        },
        bank: {
          institutionName: 'BBVA',
          accountNumber: '0123456789',
          clabe: '012345678901234567',
        },
        statementPeriod: {
          periodStartDate: '2026-03-01',
          periodEndDate: '2026-05-31',
          averageBalance: 25000.0,
          endingBalance: 28000.0,
        },
        payrollDeposits: [
          {
            date: '2026-03-15',
            amount: 15000.0,
            currency: 'MXN',
            originalConcept: 'NOMINA',
            detectedPayerRfc: 'PELJ900101ABC',
            isPayrollConcept: true,
            containsPayrollKeyword: true,
            possiblePayrollProvider: false,
            matchCandidateForPayrollReceipt: {
              expectedPayrollReceiptId: null,
              amountMatchesPayrollNetIncome: null,
              dateMatchesPayrollPaymentDate: null,
              conceptMatchesEmployer: null,
              matchConfidence: null,
            },
          },
        ],
      },
      alerts: ['BANK_NO_RFC_DETECTED'],
      missingFields: [],
    };

    it('should return 200 with extraction result in data envelope', async () => {
      mockBankStatementExtractionService.extract.mockResolvedValue(
        successfulExtraction,
      );

      const result = await controller.extractBankStatement(caseId, documentId);

      expect(
        mockBankStatementExtractionService.extract,
      ).toHaveBeenCalledWith(caseId, documentId);
      expect(result).toEqual({ data: successfulExtraction });
    });

    it('should return error result without throwing when extraction fails gracefully', async () => {
      const failureResult = {
        success: false,
        documentId,
        extractedData: null,
        alerts: [],
        missingFields: [],
        error: { code: 'DOCUMENT_NOT_PROCESSED', message: 'El documento debe estar procesado' },
      };
      mockBankStatementExtractionService.extract.mockResolvedValue(failureResult);

      const result = await controller.extractBankStatement(caseId, documentId);

      expect(result).toEqual({ data: failureResult });
    });

    it('should propagate Document not found error when service rejects', async () => {
      mockBankStatementExtractionService.extract.mockRejectedValue(
        new NotFoundException('Document not found'),
      );

      await expect(
        controller.extractBankStatement(caseId, 'nonexistent'),
      ).rejects.toThrow(NotFoundException);

      expect(
        mockBankStatementExtractionService.extract,
      ).toHaveBeenCalledWith(caseId, 'nonexistent');
    });
  });

  describe('extractCsf', () => {
    const caseId = 'case-uuid-1';
    const documentId = 'doc-csf-uuid-1';

    const successfulExtraction = {
      documentType: 'CSF',
      taxpayer: { rfc: 'DICA690402RZ4', fullName: 'ALEJANDRO DE LA CRUZ' },
      activityStartDate: '2003-10-01',
      hasSalariedRegime: true,
      hasIndependentRegime: true,
      alerts: [],
    };

    it('should return 200 with CSF extraction result in data envelope', async () => {
      mockCsfExtractionService.extract.mockResolvedValue(successfulExtraction);

      const result = await controller.extractCsf(caseId, documentId);

      expect(mockCsfExtractionService.extract).toHaveBeenCalledWith(caseId, documentId);
      expect(result).toEqual({ data: successfulExtraction });
    });
  });

  describe('extractTaxReturn', () => {
    const caseId = 'case-uuid-1';
    const documentId = 'doc-tax-uuid-1';

    const successfulExtraction = {
      documentType: 'TAX_RETURN',
      satReceipt: { rfc: 'DICA690402RZ4', taxYear: 2025 },
      fiscalResult: { accumulableIncomeTotal: 184726, fiscalProfit: 184726 },
      alerts: [],
    };

    it('should return 200 with Tax Return extraction result in data envelope', async () => {
      mockTaxReturnExtractionService.extract.mockResolvedValue(successfulExtraction);

      const result = await controller.extractTaxReturn(caseId, documentId);

      expect(mockTaxReturnExtractionService.extract).toHaveBeenCalledWith(caseId, documentId);
      expect(result).toEqual({ data: successfulExtraction });
    });
  });
});
