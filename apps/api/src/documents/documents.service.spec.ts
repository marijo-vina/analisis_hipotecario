import { BadGatewayException, BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { QueryDocumentDto } from './dto/query-document.dto';
import { DocumentAiService } from './document-ai.service';
import { DocumentsService } from './documents.service';
import { GcsService } from './gcs.service';
import { StoragePathService } from './storage-path.service';
import { CaseStatusCalculatorService } from '../case-status-calculator/case-status-calculator.service';

describe('DocumentsService', () => {
  let service: DocumentsService;

  const mockDocumentType = {
    id: 1,
    code: 'PAYROLL_RECEIPT',
    name: 'Recibo de nómina',
    isActive: true,
  };

  const mockDocumentStatus = {
    id: 1,
    code: 'UPLOADED',
    name: 'Cargado',
    order: 1,
  };

  const mockProcessingStatus = {
    id: 3,
    code: 'PROCESSING',
    name: 'Procesando',
    order: 3,
  };

  const mockProcessedStatus = {
    id: 4,
    code: 'PROCESSED',
    name: 'Procesado',
    order: 4,
  };

  const mockErrorStatus = {
    id: 5,
    code: 'ERROR',
    name: 'Error',
    order: 5,
  };

  const mockOcrErrorStatus = {
    id: 8,
    code: 'OCR_ERROR',
    name: 'Error de OCR',
    order: 8,
  };

  const mockPrismaService = {
    document: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    documentType: {
      findUnique: jest.fn(),
    },
    documentStatus: {
      findUnique: jest.fn(),
    },
    mortgageCase: {
      findUnique: jest.fn(),
    },
  };

  const mockDocumentAiService = {
    extractText: jest.fn(),
    extractTextWithLayout: jest.fn(),
  };

  const mockGcsService = {
    uploadFile: jest.fn(),
    generateSignedUrl: jest.fn(),
    deleteFile: jest.fn(),
  };

  const mockStoragePathService = {
    buildPath: jest.fn(),
  };

  const mockCaseStatusCalculatorService = {
    recalculate: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: DocumentAiService,
          useValue: mockDocumentAiService,
        },
        {
          provide: GcsService,
          useValue: mockGcsService,
        },
        {
          provide: StoragePathService,
          useValue: mockStoragePathService,
        },
        {
          provide: CaseStatusCalculatorService,
          useValue: mockCaseStatusCalculatorService,
        },
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const caseId = 'case-uuid-1';
    const advisorId = 'advisor-uuid-1';
    const dto: CreateDocumentDto = {
      documentTypeId: 1,
      originalName: 'nomina_ene.pdf',
    };

    it('should create document metadata with UPLOADED status', async () => {
      mockPrismaService.mortgageCase.findUnique.mockResolvedValue({ id: caseId });
      mockPrismaService.documentType.findUnique.mockResolvedValue(mockDocumentType);
      mockPrismaService.documentStatus.findUnique.mockResolvedValue(mockDocumentStatus);
      mockPrismaService.document.create.mockResolvedValue({
        id: 'doc-uuid-1',
        mortgageCaseId: caseId,
        documentTypeId: 1,
        documentStatusId: 1,
        fileUrl: null,
        storagePath: null,
        originalName: 'nomina_ene.pdf',
        uploadedById: advisorId,
        documentType: mockDocumentType,
        documentStatus: mockDocumentStatus,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.create(caseId, advisorId, dto);

      expect(mockPrismaService.mortgageCase.findUnique).toHaveBeenCalledWith({
        where: { id: caseId },
      });
      expect(mockPrismaService.documentType.findUnique).toHaveBeenCalledWith({
        where: { id: dto.documentTypeId },
      });
      expect(mockPrismaService.documentStatus.findUnique).toHaveBeenCalledWith({
        where: { code: 'UPLOADED' },
      });
      expect(mockPrismaService.document.create).toHaveBeenCalledWith({
        data: {
          mortgageCaseId: caseId,
          documentTypeId: dto.documentTypeId,
          documentStatusId: mockDocumentStatus.id,
          originalName: dto.originalName,
          uploadedById: advisorId,
        },
        include: {
          documentType: true,
          documentStatus: true,
          uploadedBy: true,
        },
      });
      expect(result).toEqual(
        expect.objectContaining({
          documentStatus: expect.objectContaining({ code: 'UPLOADED' }),
          fileUrl: null,
          storagePath: null,
        }),
      );
    });

    it('should throw NotFoundException when mortgage case does not exist', async () => {
      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(null);

      await expect(service.create(caseId, advisorId, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when documentTypeId is not found', async () => {
      mockPrismaService.mortgageCase.findUnique.mockResolvedValue({ id: caseId });
      mockPrismaService.documentType.findUnique.mockResolvedValue(null);

      await expect(service.create(caseId, advisorId, dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrismaService.document.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when document type is inactive', async () => {
      mockPrismaService.mortgageCase.findUnique.mockResolvedValue({ id: caseId });
      mockPrismaService.documentType.findUnique.mockResolvedValue({
        ...mockDocumentType,
        isActive: false,
      });

      await expect(service.create(caseId, advisorId, dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrismaService.document.create).not.toHaveBeenCalled();
    });
  });

  describe('findAllByCase', () => {
    const caseId = 'case-uuid-1';

    it('should return all documents for a case with relations', async () => {
      const documents = [
        {
          id: 'doc-1',
          mortgageCaseId: caseId,
          documentType: mockDocumentType,
          documentStatus: mockDocumentStatus,
          originalName: 'doc1.pdf',
          fileUrl: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'doc-2',
          mortgageCaseId: caseId,
          documentType: { id: 2, code: 'BANK_STATEMENT', name: 'Estado de cuenta', isActive: true },
          documentStatus: { id: 2, code: 'PENDING_REVIEW', name: 'Pendiente de revisión', order: 2 },
          originalName: 'doc2.pdf',
          fileUrl: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrismaService.document.findMany.mockResolvedValue(documents);

      const result = await service.findAllByCase(caseId);

      expect(mockPrismaService.document.findMany).toHaveBeenCalledWith({
        where: { mortgageCaseId: caseId },
        include: {
          documentType: true,
          documentStatus: true,
          uploadedBy: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(documents);
    });

    it('should return empty array when case has no documents', async () => {
      mockPrismaService.document.findMany.mockResolvedValue([]);

      const result = await service.findAllByCase(caseId);

      expect(result).toEqual([]);
    });

    it('should filter by documentStatusId when provided in DTO', async () => {
      const dto: QueryDocumentDto = { documentStatusId: 4 };
      const documents = [
        {
          id: 'doc-1',
          mortgageCaseId: caseId,
          documentType: mockDocumentType,
          documentStatus: { id: 4, code: 'PROCESSED', name: 'Procesado', order: 4 },
          originalName: 'doc1.pdf',
          fileUrl: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrismaService.document.findMany.mockResolvedValue(documents);

      const result = await service.findAllByCase(caseId, dto);

      expect(mockPrismaService.document.findMany).toHaveBeenCalledWith({
        where: { mortgageCaseId: caseId, documentStatusId: 4 },
        include: {
          documentType: true,
          documentStatus: true,
          uploadedBy: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(documents);
    });

    it('should not filter by status when DTO has no documentStatusId', async () => {
      const dto: QueryDocumentDto = {};
      const documents = [
        {
          id: 'doc-1',
          mortgageCaseId: caseId,
          documentType: mockDocumentType,
          documentStatus: mockDocumentStatus,
          originalName: 'doc1.pdf',
          fileUrl: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrismaService.document.findMany.mockResolvedValue(documents);

      const result = await service.findAllByCase(caseId, dto);

      expect(mockPrismaService.document.findMany).toHaveBeenCalledWith({
        where: { mortgageCaseId: caseId },
        include: {
          documentType: true,
          documentStatus: true,
          uploadedBy: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(documents);
    });
  });

  describe('findOneByCase', () => {
    const caseId = 'case-uuid-1';
    const documentId = 'doc-uuid-1';

    it('should return a single document with relations', async () => {
      const document = {
        id: documentId,
        mortgageCaseId: caseId,
        documentType: mockDocumentType,
        documentStatus: mockDocumentStatus,
        originalName: 'doc.pdf',
        fileUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.document.findUnique.mockResolvedValue(document);

      const result = await service.findOneByCase(caseId, documentId);

      expect(mockPrismaService.document.findUnique).toHaveBeenCalledWith({
        where: { id: documentId },
        include: {
          documentType: true,
          documentStatus: true,
          uploadedBy: true,
        },
      });
      expect(result).toEqual(document);
    });

    it('should throw NotFoundException when document does not exist', async () => {
      mockPrismaService.document.findUnique.mockResolvedValue(null);

      await expect(service.findOneByCase(caseId, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when document belongs to a different case', async () => {
      mockPrismaService.document.findUnique.mockResolvedValue({
        id: documentId,
        mortgageCaseId: 'other-case-id',
      });

      await expect(service.findOneByCase(caseId, documentId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('uploadAndCreate', () => {
    const caseId = 'case-uuid-1';
    const advisorId = 'advisor-uuid-1';
    const documentTypeId = 1;
    const storagePath = 'case-uuid-1/PAYROLL_RECEIPT/nomina_ene.pdf';
    const fileUrl = 'gs://test-bucket/case-uuid-1/PAYROLL_RECEIPT/nomina_ene.pdf';

    const mockFile: Express.Multer.File = {
      fieldname: 'file',
      originalname: 'nomina_ene.pdf',
      encoding: '7bit',
      mimetype: 'application/pdf',
      buffer: Buffer.from('fake-pdf-content'),
      size: 12345,
      stream: null as any,
      destination: '',
      filename: '',
      path: '',
    };

    const createdDocument = {
      id: 'doc-uuid-1',
      mortgageCaseId: caseId,
      documentTypeId,
      documentStatusId: 1,
      fileUrl,
      storagePath,
      mimeType: 'application/pdf',
      sizeBytes: 12345,
      originalName: 'nomina_ene.pdf',
      uploadedById: advisorId,
      documentType: { id: 1, code: 'PAYROLL_RECEIPT', name: 'Recibo de nómina', isActive: true },
      documentStatus: { id: 1, code: 'UPLOADED', name: 'Cargado', order: 1 },
      uploadedBy: { id: advisorId, name: 'Test Advisor', email: 'advisor@test.com', role: 'ADVISOR' },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should upload file and create Document with metadata', async () => {
      mockPrismaService.mortgageCase.findUnique.mockResolvedValue({ id: caseId });
      mockPrismaService.documentType.findUnique.mockResolvedValue(mockDocumentType);
      mockStoragePathService.buildPath.mockReturnValue(storagePath);
      mockGcsService.uploadFile.mockResolvedValue(fileUrl);
      mockPrismaService.document.create.mockResolvedValue(createdDocument);

      const result = await service.uploadAndCreate(
        caseId,
        advisorId,
        mockFile,
        documentTypeId,
      );

      // Validation calls
      expect(mockPrismaService.mortgageCase.findUnique).toHaveBeenCalledWith({
        where: { id: caseId },
      });
      expect(mockPrismaService.documentType.findUnique).toHaveBeenCalledWith({
        where: { id: documentTypeId },
      });

      // Path building
      expect(mockStoragePathService.buildPath).toHaveBeenCalledWith(
        caseId,
        mockDocumentType.code,
        mockFile.originalname,
      );

      // GCS upload
      expect(mockGcsService.uploadFile).toHaveBeenCalledWith(
        storagePath,
        mockFile.buffer,
        mockFile.mimetype,
      );

      // Document creation with full metadata
      expect(mockPrismaService.document.create).toHaveBeenCalledWith({
        data: {
          mortgageCaseId: caseId,
          documentTypeId,
          documentStatusId: mockDocumentStatus.id,
          uploadedById: advisorId,
          originalName: mockFile.originalname,
          mimeType: mockFile.mimetype,
          sizeBytes: mockFile.size,
          storagePath,
          fileUrl,
        },
        include: {
          documentType: true,
          documentStatus: true,
          uploadedBy: true,
        },
      });

      expect(result).toEqual(createdDocument);
    });

    it('should return Document with JPEG mimeType for image upload', async () => {
      const jpegFile = { ...mockFile, mimetype: 'image/jpeg', originalname: 'foto.jpg' };
      const jpegPath = 'case-uuid-1/PAYROLL_RECEIPT/foto.jpg';

      mockPrismaService.mortgageCase.findUnique.mockResolvedValue({ id: caseId });
      mockPrismaService.documentType.findUnique.mockResolvedValue(mockDocumentType);
      mockStoragePathService.buildPath.mockReturnValue(jpegPath);
      mockGcsService.uploadFile.mockResolvedValue(`gs://test-bucket/${jpegPath}`);
      mockPrismaService.document.create.mockResolvedValue({
        ...createdDocument,
        mimeType: 'image/jpeg',
        originalName: 'foto.jpg',
      });

      await service.uploadAndCreate(caseId, advisorId, jpegFile, documentTypeId);

      expect(mockGcsService.uploadFile).toHaveBeenCalledWith(
        jpegPath,
        jpegFile.buffer,
        'image/jpeg',
      );
    });

    it('should throw NotFoundException when case does not exist', async () => {
      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(null);

      await expect(
        service.uploadAndCreate(caseId, advisorId, mockFile, documentTypeId),
      ).rejects.toThrow(NotFoundException);

      expect(mockGcsService.uploadFile).not.toHaveBeenCalled();
      expect(mockPrismaService.document.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when documentTypeId is not found', async () => {
      mockPrismaService.mortgageCase.findUnique.mockResolvedValue({ id: caseId });
      mockPrismaService.documentType.findUnique.mockResolvedValue(null);

      await expect(
        service.uploadAndCreate(caseId, advisorId, mockFile, documentTypeId),
      ).rejects.toThrow(BadRequestException);

      expect(mockGcsService.uploadFile).not.toHaveBeenCalled();
      expect(mockPrismaService.document.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when document type is inactive', async () => {
      mockPrismaService.mortgageCase.findUnique.mockResolvedValue({ id: caseId });
      mockPrismaService.documentType.findUnique.mockResolvedValue({
        ...mockDocumentType,
        isActive: false,
      });

      await expect(
        service.uploadAndCreate(caseId, advisorId, mockFile, documentTypeId),
      ).rejects.toThrow(BadRequestException);

      expect(mockGcsService.uploadFile).not.toHaveBeenCalled();
      expect(mockPrismaService.document.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when file is empty (size = 0)', async () => {
      mockPrismaService.mortgageCase.findUnique.mockResolvedValue({ id: caseId });
      mockPrismaService.documentType.findUnique.mockResolvedValue(mockDocumentType);
      mockStoragePathService.buildPath.mockReturnValue(storagePath);

      const emptyFile = { ...mockFile, size: 0 };

      await expect(
        service.uploadAndCreate(caseId, advisorId, emptyFile, documentTypeId),
      ).rejects.toThrow('File is empty');

      expect(mockGcsService.uploadFile).not.toHaveBeenCalled();
      expect(mockPrismaService.document.create).not.toHaveBeenCalled();
    });

    it('should throw BadGatewayException when GCS upload fails and NOT create Document', async () => {
      mockPrismaService.mortgageCase.findUnique.mockResolvedValue({ id: caseId });
      mockPrismaService.documentType.findUnique.mockResolvedValue(mockDocumentType);
      mockStoragePathService.buildPath.mockReturnValue(storagePath);
      mockGcsService.uploadFile.mockRejectedValue(new BadGatewayException('File storage service unavailable'));

      await expect(
        service.uploadAndCreate(caseId, advisorId, mockFile, documentTypeId),
      ).rejects.toThrow(BadGatewayException);

      // CRITICAL: Document must NOT be created if GCS upload fails
      expect(mockPrismaService.document.create).not.toHaveBeenCalled();
    });
  });

  describe('getSignedUrl', () => {
    const caseId = 'case-uuid-1';
    const documentId = 'doc-uuid-1';
    const storagePath = 'case-uuid-1/PAYROLL_RECEIPT/nomina_ene.pdf';

    const mockDocument = {
      id: documentId,
      mortgageCaseId: caseId,
      documentType: mockDocumentType,
      documentStatus: mockDocumentStatus,
      originalName: 'nomina_ene.pdf',
      storagePath,
      fileUrl: 'gs://bucket/case-uuid-1/PAYROLL_RECEIPT/nomina_ene.pdf',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should return signed URL for a valid document with storagePath', async () => {
      const signedUrl = 'https://storage.googleapis.com/signed-url';
      mockPrismaService.document.findUnique.mockResolvedValue(mockDocument);
      mockGcsService.generateSignedUrl.mockResolvedValue(signedUrl);

      const result = await service.getSignedUrl(caseId, documentId);

      expect(mockPrismaService.document.findUnique).toHaveBeenCalledWith({
        where: { id: documentId },
        include: {
          documentType: true,
          documentStatus: true,
          uploadedBy: true,
        },
      });
      expect(mockGcsService.generateSignedUrl).toHaveBeenCalledWith(storagePath);
      expect(result).toBe(signedUrl);
    });

    it('should throw NotFoundException when document does not exist', async () => {
      mockPrismaService.document.findUnique.mockResolvedValue(null);

      await expect(service.getSignedUrl(caseId, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockGcsService.generateSignedUrl).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when document belongs to different case', async () => {
      mockPrismaService.document.findUnique.mockResolvedValue({
        ...mockDocument,
        mortgageCaseId: 'other-case',
      });

      await expect(service.getSignedUrl(caseId, documentId)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockGcsService.generateSignedUrl).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when document has no storagePath', async () => {
      mockPrismaService.document.findUnique.mockResolvedValue({
        ...mockDocument,
        storagePath: null,
      });

      await expect(service.getSignedUrl(caseId, documentId)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.getSignedUrl(caseId, documentId)).rejects.toThrow(
        'El documento no tiene un archivo asociado',
      );
      expect(mockGcsService.generateSignedUrl).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    const caseId = 'case-uuid-1';
    const documentId = 'doc-uuid-1';
    const storagePath = 'case-uuid-1/PAYROLL_RECEIPT/nomina_ene.pdf';

    const mockDocument = {
      id: documentId,
      mortgageCaseId: caseId,
      documentType: mockDocumentType,
      documentStatus: mockDocumentStatus,
      originalName: 'nomina_ene.pdf',
      storagePath,
      fileUrl: 'gs://bucket/case-uuid-1/PAYROLL_RECEIPT/nomina_ene.pdf',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should delete GCS file and DB record for UPLOADED document', async () => {
      mockPrismaService.document.findUnique.mockResolvedValue(mockDocument);
      mockGcsService.deleteFile.mockResolvedValue(undefined);
      mockPrismaService.document.delete.mockResolvedValue(mockDocument);

      await service.delete(caseId, documentId);

      expect(mockGcsService.deleteFile).toHaveBeenCalledWith(storagePath);
      expect(mockPrismaService.document.delete).toHaveBeenCalledWith({
        where: { id: documentId },
      });
    });

    it('should abort if GCS delete fails — DB record must stay', async () => {
      mockPrismaService.document.findUnique.mockResolvedValue(mockDocument);
      mockGcsService.deleteFile.mockRejectedValue(
        new BadGatewayException('Error al eliminar el archivo del almacenamiento'),
      );

      await expect(service.delete(caseId, documentId)).rejects.toThrow(
        BadGatewayException,
      );
      expect(mockPrismaService.document.delete).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when document does not exist', async () => {
      mockPrismaService.document.findUnique.mockResolvedValue(null);

      await expect(service.delete(caseId, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockGcsService.deleteFile).not.toHaveBeenCalled();
      expect(mockPrismaService.document.delete).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when document belongs to different case', async () => {
      mockPrismaService.document.findUnique.mockResolvedValue({
        ...mockDocument,
        mortgageCaseId: 'other-case',
      });

      await expect(service.delete(caseId, documentId)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockGcsService.deleteFile).not.toHaveBeenCalled();
      expect(mockPrismaService.document.delete).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when document status is PROCESSING', async () => {
      mockGcsService.deleteFile.mockResolvedValue(undefined);
      mockPrismaService.document.findUnique.mockResolvedValue({
        ...mockDocument,
        documentStatus: { id: 3, code: 'PROCESSING', name: 'En procesamiento', order: 3 },
      });

      await expect(service.delete(caseId, documentId)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.delete(caseId, documentId)).rejects.toThrow(
        'No se puede eliminar un documento mientras está en procesamiento',
      );
      expect(mockGcsService.deleteFile).not.toHaveBeenCalled();
      expect(mockPrismaService.document.delete).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when document has no storagePath', async () => {
      mockPrismaService.document.findUnique.mockResolvedValue({
        ...mockDocument,
        storagePath: null,
      });

      await expect(service.delete(caseId, documentId)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.delete(caseId, documentId)).rejects.toThrow(
        'El documento no tiene un archivo asociado',
      );
      expect(mockGcsService.deleteFile).not.toHaveBeenCalled();
      expect(mockPrismaService.document.delete).not.toHaveBeenCalled();
    });
  });

  describe('processDocument', () => {
    const caseId = 'case-uuid-1';
    const documentId = 'doc-uuid-1';
    const gcsUri = 'gs://bucket/case-uuid-1/PAYROLL_RECEIPT/doc.pdf';
    const mimeType = 'application/pdf';
    const extractedText = 'Contenido extraído del documento';
    const now = new Date('2026-06-18T12:00:00Z');
    // Compact OcrLayout fixture (Phase 5.1): processDocument persists this
    // alongside ocrText when extractTextWithLayout() succeeds.
    const mockOcrLayout = {
      pages: [
        { pageNumber: 1, width: 612, height: 792, lines: [], tokens: [] },
      ],
    };

    const mockDocument = {
      id: documentId,
      mortgageCaseId: caseId,
      documentTypeId: 1,
      documentStatusId: 1,
      fileUrl: gcsUri,
      storagePath: 'case-uuid-1/PAYROLL_RECEIPT/doc.pdf',
      mimeType,
      sizeBytes: 12345,
      originalName: 'doc.pdf',
      uploadedById: 'advisor-1',
      ocrText: null,
      processedAt: null,
      processingError: null,
      documentType: mockDocumentType,
      documentStatus: mockDocumentStatus,
      uploadedBy: { id: 'advisor-1', name: 'Test', email: 'test@test.com', role: 'ADVISOR' },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(now);
      // Reset mock implementation chains to prevent stale mockResolvedValueOnce
      // values from leaking between tests (critical for TDD RED phase where
      // failing tests don't consume their mockResolvedValueOnce values).
      mockPrismaService.document.update.mockReset();
      mockPrismaService.document.findUnique.mockReset();
      mockDocumentAiService.extractText.mockReset();
      mockDocumentAiService.extractTextWithLayout.mockReset();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should transition UPLOADED → PROCESSING → PROCESSED and save ocrText', async () => {
      mockPrismaService.document.findUnique.mockResolvedValue(mockDocument);
      mockPrismaService.documentStatus.findUnique.mockImplementation((args: { where: { code: string } }) => {
        const statusMap: Record<string, typeof mockProcessingStatus> = {
          PROCESSING: mockProcessingStatus,
          PROCESSED: mockProcessedStatus,
          ERROR: mockErrorStatus,
          OCR_ERROR: mockOcrErrorStatus,
        };
        return Promise.resolve(statusMap[args.where.code] || null);
      });
      mockPrismaService.document.update
        .mockResolvedValueOnce({ ...mockDocument, documentStatusId: mockProcessingStatus.id, documentStatus: mockProcessingStatus })
        .mockResolvedValueOnce({
          ...mockDocument,
          documentStatusId: mockProcessedStatus.id,
          documentStatus: mockProcessedStatus,
          ocrText: extractedText,
          ocrLayout: mockOcrLayout,
          processedAt: now,
        });
      mockDocumentAiService.extractTextWithLayout.mockResolvedValue({
        ocrText: extractedText,
        ocrLayout: mockOcrLayout,
      });

      const result = await service.processDocument(caseId, documentId);

      // Step 1: Find document
      expect(mockPrismaService.document.findUnique).toHaveBeenCalledWith({
        where: { id: documentId },
        include: { documentType: true, documentStatus: true, uploadedBy: true },
      });

      // Step 2: Set PROCESSING
      expect(mockPrismaService.document.update).toHaveBeenNthCalledWith(1, {
        where: { id: documentId },
        data: { documentStatusId: mockProcessingStatus.id },
      });

      // Step 3: Call Document AI (layout-aware — Phase 5.1)
      expect(mockDocumentAiService.extractTextWithLayout).toHaveBeenCalledWith(gcsUri, mimeType);

      // Step 4: Set PROCESSED with ocrText + ocrLayout
      expect(mockPrismaService.document.update).toHaveBeenNthCalledWith(2, {
        where: { id: documentId },
        data: {
          ocrText: extractedText,
          ocrLayout: mockOcrLayout,
          processedAt: now,
          documentStatusId: mockProcessedStatus.id,
        },
        include: { documentType: true, documentStatus: true, uploadedBy: true },
      });

      expect(result.documentStatus.code).toBe('PROCESSED');
      expect(result.ocrText).toBe(extractedText);
      expect(result.processedAt).toEqual(now);
    });

    it('should allow reprocessing of ERROR document → PROCESSED', async () => {
      const errorDocument = {
        ...mockDocument,
        documentStatusId: mockErrorStatus.id,
        documentStatus: mockErrorStatus,
        processingError: 'Previous error',
      };

      mockPrismaService.document.findUnique.mockResolvedValue(errorDocument);
      mockPrismaService.documentStatus.findUnique.mockImplementation((args: { where: { code: string } }) => {
        const statusMap: Record<string, typeof mockProcessingStatus> = {
          PROCESSING: mockProcessingStatus,
          PROCESSED: mockProcessedStatus,
          ERROR: mockErrorStatus,
          OCR_ERROR: mockOcrErrorStatus,
        };
        return Promise.resolve(statusMap[args.where.code] || null);
      });
      mockPrismaService.document.update
        .mockResolvedValueOnce({ ...errorDocument, documentStatusId: mockProcessingStatus.id, documentStatus: mockProcessingStatus })
        .mockResolvedValueOnce({
          ...errorDocument,
          documentStatusId: mockProcessedStatus.id,
          documentStatus: mockProcessedStatus,
          ocrText: extractedText,
          ocrLayout: mockOcrLayout,
          processedAt: now,
          processingError: null,
        });
      mockDocumentAiService.extractTextWithLayout.mockResolvedValue({
        ocrText: extractedText,
        ocrLayout: mockOcrLayout,
      });

      const result = await service.processDocument(caseId, documentId);

      expect(result.documentStatus.code).toBe('PROCESSED');
      expect(result.ocrText).toBe(extractedText);
    });

    it('should reject PROCESSING status with 400', async () => {
      mockPrismaService.document.findUnique.mockResolvedValue({
        ...mockDocument,
        documentStatusId: mockProcessingStatus.id,
        documentStatus: mockProcessingStatus,
      });

      await expect(service.processDocument(caseId, documentId)).rejects.toThrow(
        'Document is already being processed',
      );
      expect(mockDocumentAiService.extractTextWithLayout).not.toHaveBeenCalled();
    });

    it('should reject PROCESSED status with 400', async () => {
      mockPrismaService.document.findUnique.mockResolvedValue({
        ...mockDocument,
        documentStatusId: mockProcessedStatus.id,
        documentStatus: mockProcessedStatus,
      });

      await expect(service.processDocument(caseId, documentId)).rejects.toThrow(
        'Document has already been processed',
      );
      expect(mockDocumentAiService.extractTextWithLayout).not.toHaveBeenCalled();
    });

    it('should skip Document AI for CREDIT_BUREAU_REPORT when OCR text already exists', async () => {
      const bureauDoc = {
        ...mockDocument,
        ocrText: 'BURÓ DE CRÉDITO\nScore: 685',
        documentType: {
          id: 3,
          code: 'CREDIT_BUREAU_REPORT',
          name: 'Buró de crédito',
          isActive: true,
        },
        documentStatusId: mockOcrErrorStatus.id,
        documentStatus: mockOcrErrorStatus,
        processingError: 'Document processing service unavailable',
      };

      mockPrismaService.document.findUnique.mockResolvedValue(bureauDoc);
      mockPrismaService.documentStatus.findUnique.mockImplementation(
        (args: { where: { code: string } }) => {
          const statusMap: Record<string, typeof mockProcessingStatus> = {
            PROCESSING: mockProcessingStatus,
            PROCESSED: mockProcessedStatus,
            ERROR: mockErrorStatus,
            OCR_ERROR: mockOcrErrorStatus,
          };
          return Promise.resolve(statusMap[args.where.code] || null);
        },
      );
      mockPrismaService.document.update.mockResolvedValue({
        ...bureauDoc,
        documentStatusId: mockProcessedStatus.id,
        documentStatus: mockProcessedStatus,
        processingError: null,
      });

      const result = await service.processDocument(caseId, documentId, true);

      expect(mockDocumentAiService.extractTextWithLayout).not.toHaveBeenCalled();
      expect(result.documentStatus.code).toBe('PROCESSED');
      expect(result.ocrText).toBe('BURÓ DE CRÉDITO\nScore: 685');
    });

    it('should bypass PROCESSED gate when force=true and proceed to processing (Task 3.1)', async () => {
      const processedDoc = {
        ...mockDocument,
        documentStatusId: mockProcessedStatus.id,
        documentStatus: mockProcessedStatus,
        ocrText: 'Old OCR text',
        processedAt: new Date('2026-01-01T00:00:00Z'),
      };

      mockPrismaService.document.findUnique.mockResolvedValue(processedDoc);
      mockPrismaService.documentStatus.findUnique.mockImplementation((args: { where: { code: string } }) => {
        const statusMap: Record<string, typeof mockProcessingStatus> = {
          PROCESSING: mockProcessingStatus,
          PROCESSED: mockProcessedStatus,
          ERROR: mockErrorStatus,
          OCR_ERROR: mockOcrErrorStatus,
        };
        return Promise.resolve(statusMap[args.where.code] || null);
      });
      mockPrismaService.document.update
        .mockResolvedValueOnce({ ...processedDoc, documentStatusId: mockProcessingStatus.id, documentStatus: mockProcessingStatus })
        .mockResolvedValueOnce({
          ...processedDoc,
          documentStatusId: mockProcessedStatus.id,
          documentStatus: mockProcessedStatus,
          ocrText: extractedText,
          ocrLayout: mockOcrLayout,
          processedAt: now,
        });
      mockDocumentAiService.extractTextWithLayout.mockResolvedValue({
        ocrText: extractedText,
        ocrLayout: mockOcrLayout,
      });

      const result = await service.processDocument(caseId, documentId, true);

      // Gate was bypassed — processing proceeded
      expect(mockPrismaService.document.update).toHaveBeenNthCalledWith(1, {
        where: { id: documentId },
        data: { documentStatusId: mockProcessingStatus.id },
      });
      expect(mockDocumentAiService.extractTextWithLayout).toHaveBeenCalledWith(gcsUri, mimeType);
      expect(result.documentStatus.code).toBe('PROCESSED');
      expect(result.ocrText).toBe(extractedText);
    });

    it('should still reject PROCESSING status with 400 when force=true (Task 3.2)', async () => {
      mockPrismaService.document.findUnique.mockResolvedValue({
        ...mockDocument,
        documentStatusId: mockProcessingStatus.id,
        documentStatus: mockProcessingStatus,
      });

      await expect(service.processDocument(caseId, documentId, true)).rejects.toThrow(
        'Document is already being processed',
      );
      expect(mockDocumentAiService.extractTextWithLayout).not.toHaveBeenCalled();
    });

    it('should reject PROCESSED status with 400 when force=false (Task 3.3)', async () => {
      mockPrismaService.document.findUnique.mockResolvedValue({
        ...mockDocument,
        documentStatusId: mockProcessedStatus.id,
        documentStatus: mockProcessedStatus,
      });

      await expect(service.processDocument(caseId, documentId, false)).rejects.toThrow(
        'Document has already been processed',
      );
      expect(mockDocumentAiService.extractTextWithLayout).not.toHaveBeenCalled();
    });

    it('should process UPLOADED normally with force=true (Task 3.4)', async () => {
      mockPrismaService.document.findUnique.mockResolvedValue(mockDocument);
      mockPrismaService.documentStatus.findUnique.mockImplementation((args: { where: { code: string } }) => {
        const statusMap: Record<string, typeof mockProcessingStatus> = {
          PROCESSING: mockProcessingStatus,
          PROCESSED: mockProcessedStatus,
          ERROR: mockErrorStatus,
          OCR_ERROR: mockOcrErrorStatus,
        };
        return Promise.resolve(statusMap[args.where.code] || null);
      });
      mockPrismaService.document.update
        .mockResolvedValueOnce({ ...mockDocument, documentStatusId: mockProcessingStatus.id, documentStatus: mockProcessingStatus })
        .mockResolvedValueOnce({
          ...mockDocument,
          documentStatusId: mockProcessedStatus.id,
          documentStatus: mockProcessedStatus,
          ocrText: extractedText,
          ocrLayout: mockOcrLayout,
          processedAt: now,
        });
      mockDocumentAiService.extractTextWithLayout.mockResolvedValue({
        ocrText: extractedText,
        ocrLayout: mockOcrLayout,
      });

      const result = await service.processDocument(caseId, documentId, true);

      // Processing proceeds normally — force is harmless on UPLOADED
      expect(mockPrismaService.document.update).toHaveBeenNthCalledWith(1, {
        where: { id: documentId },
        data: { documentStatusId: mockProcessingStatus.id },
      });
      expect(mockDocumentAiService.extractTextWithLayout).toHaveBeenCalledWith(gcsUri, mimeType);
      expect(result.documentStatus.code).toBe('PROCESSED');
      expect(result.ocrText).toBe(extractedText);
    });

    it('should reject null fileUrl with 400', async () => {
      mockPrismaService.document.findUnique.mockResolvedValue({
        ...mockDocument,
        fileUrl: null,
      });

      await expect(service.processDocument(caseId, documentId)).rejects.toThrow(
        'Document has no file to process',
      );
      expect(mockDocumentAiService.extractText).not.toHaveBeenCalled();
    });

    it('should reject null mimeType with 400', async () => {
      mockPrismaService.document.findUnique.mockResolvedValue({
        ...mockDocument,
        mimeType: null,
      });

      await expect(service.processDocument(caseId, documentId)).rejects.toThrow(
        'Document has no MIME type',
      );
      expect(mockDocumentAiService.extractText).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when document does not exist', async () => {
      mockPrismaService.document.findUnique.mockResolvedValue(null);

      await expect(service.processDocument(caseId, 'nonexistent')).rejects.toThrow(
        'Document not found',
      );
      expect(mockDocumentAiService.extractText).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when document belongs to different case', async () => {
      mockPrismaService.document.findUnique.mockResolvedValue({
        ...mockDocument,
        mortgageCaseId: 'other-case',
      });

      await expect(service.processDocument(caseId, documentId)).rejects.toThrow(
        'Document not found',
      );
      expect(mockDocumentAiService.extractText).not.toHaveBeenCalled();
    });

    it('should set OCR_ERROR status and processingError when extractTextWithLayout() throws', async () => {
      mockPrismaService.document.findUnique.mockResolvedValue(mockDocument);
      mockPrismaService.documentStatus.findUnique.mockImplementation((args: { where: { code: string } }) => {
        const statusMap: Record<string, typeof mockProcessingStatus> = {
          PROCESSING: mockProcessingStatus,
          PROCESSED: mockProcessedStatus,
          ERROR: mockErrorStatus,
          OCR_ERROR: mockOcrErrorStatus,
        };
        return Promise.resolve(statusMap[args.where.code] || null);
      });
      mockPrismaService.document.update
        .mockResolvedValueOnce({ ...mockDocument, documentStatusId: mockProcessingStatus.id, documentStatus: mockProcessingStatus })
        .mockResolvedValueOnce({
          ...mockDocument,
          documentStatusId: mockOcrErrorStatus.id,
          documentStatus: mockOcrErrorStatus,
          processingError: 'gRPC timeout',
          ocrText: null,
        });
      mockDocumentAiService.extractTextWithLayout.mockRejectedValue(new Error('gRPC timeout'));

      await expect(service.processDocument(caseId, documentId)).rejects.toThrow(
        BadGatewayException,
      );

      // Verify OCR_ERROR status was persisted with processingError
      expect(mockPrismaService.document.update).toHaveBeenLastCalledWith({
        where: { id: documentId },
        data: expect.objectContaining({
          processingError: 'gRPC timeout',
          documentStatusId: mockOcrErrorStatus.id,
        }),
      });
    });

    it('should allow re-processing from OCR_ERROR document', async () => {
      const ocrErrorDocument = {
        ...mockDocument,
        documentStatusId: mockOcrErrorStatus.id,
        documentStatus: mockOcrErrorStatus,
        processingError: 'Previous OCR failure',
      };

      mockPrismaService.document.findUnique.mockResolvedValue(ocrErrorDocument);
      mockPrismaService.documentStatus.findUnique.mockImplementation((args: { where: { code: string } }) => {
        const statusMap: Record<string, typeof mockProcessingStatus> = {
          PROCESSING: mockProcessingStatus,
          PROCESSED: mockProcessedStatus,
          ERROR: mockErrorStatus,
          OCR_ERROR: mockOcrErrorStatus,
        };
        return Promise.resolve(statusMap[args.where.code] || null);
      });
      mockPrismaService.document.update
        .mockResolvedValueOnce({ ...ocrErrorDocument, documentStatusId: mockProcessingStatus.id, documentStatus: mockProcessingStatus })
        .mockResolvedValueOnce({
          ...ocrErrorDocument,
          documentStatusId: mockProcessedStatus.id,
          documentStatus: mockProcessedStatus,
          ocrText: extractedText,
          ocrLayout: mockOcrLayout,
          processedAt: now,
          processingError: null,
        });
      mockDocumentAiService.extractTextWithLayout.mockResolvedValue({
        ocrText: extractedText,
        ocrLayout: mockOcrLayout,
      });

      const result = await service.processDocument(caseId, documentId);

      expect(result.documentStatus.code).toBe('PROCESSED');
      expect(result.ocrText).toBe(extractedText);
      // OCR_ERROR is not guarded — should pass through to PROCESSING
      expect(mockPrismaService.document.update).toHaveBeenNthCalledWith(1, {
        where: { id: documentId },
        data: { documentStatusId: mockProcessingStatus.id },
      });
    });

    it('should catch unexpected runtime error after PROCESSING and set ERROR', async () => {
      const runtimeError = new Error('Unexpected DB write failure');
      mockPrismaService.document.findUnique.mockResolvedValue(mockDocument);
      mockPrismaService.documentStatus.findUnique.mockImplementation((args: { where: { code: string } }) => {
        const statusMap: Record<string, typeof mockProcessingStatus> = {
          PROCESSING: mockProcessingStatus,
          PROCESSED: mockProcessedStatus,
          ERROR: mockErrorStatus,
          OCR_ERROR: mockOcrErrorStatus,
        };
        return Promise.resolve(statusMap[args.where.code] || null);
      });

      // First update (PROCESSING) succeeds
      mockPrismaService.document.update
        .mockResolvedValueOnce({ ...mockDocument, documentStatusId: mockProcessingStatus.id, documentStatus: mockProcessingStatus });

      mockDocumentAiService.extractTextWithLayout.mockResolvedValue({
        ocrText: extractedText,
        ocrLayout: mockOcrLayout,
      });

      // Second update (PROCESSED) fails with unexpected error
      mockPrismaService.document.update
        .mockRejectedValueOnce(runtimeError)
        // Fallback update (ERROR) succeeds
        .mockResolvedValueOnce({
          ...mockDocument,
          documentStatusId: mockErrorStatus.id,
          documentStatus: mockErrorStatus,
          processingError: 'Unexpected DB write failure',
        });

      await expect(service.processDocument(caseId, documentId)).rejects.toThrow(
        BadGatewayException,
      );

      // Verify fallback ERROR status was attempted (3 calls: PROCESSING, PROCESSED-fail, ERROR-fallback)
      expect(mockPrismaService.document.update).toHaveBeenCalledTimes(3);
    });
  });

  // =========================================================================
  // Phase 5.1 — layout-aware extraction wiring (Strict TDD)
  // processDocument() must call extractTextWithLayout() (not extractText())
  // and persist ocrLayout alongside ocrText on the PROCESSED update.
  // =========================================================================
  describe('processDocument — layout-aware wiring (Phase 5.1)', () => {
    const caseId = 'case-uuid-1';
    const documentId = 'doc-uuid-1';
    const gcsUri = 'gs://bucket/case-uuid-1/PAYROLL_RECEIPT/doc.pdf';
    const mimeType = 'application/pdf';
    const extractedText = 'Contenido extraído del documento';
    const now = new Date('2026-06-18T12:00:00Z');

    // Minimal valid OcrLayout (compact JSON shape from document-ai.types.ts).
    const mockOcrLayout = {
      pages: [
        {
          pageNumber: 1,
          width: 612,
          height: 792,
          lines: [],
          tokens: [],
        },
      ],
    };

    const mockDocument = {
      id: documentId,
      mortgageCaseId: caseId,
      documentTypeId: 1,
      documentStatusId: 1,
      fileUrl: gcsUri,
      storagePath: 'case-uuid-1/PAYROLL_RECEIPT/doc.pdf',
      mimeType,
      sizeBytes: 12345,
      originalName: 'doc.pdf',
      uploadedById: 'advisor-1',
      ocrText: null,
      ocrLayout: null,
      processedAt: null,
      processingError: null,
      documentType: mockDocumentType,
      documentStatus: mockDocumentStatus,
      uploadedBy: { id: 'advisor-1', name: 'Test', email: 'test@test.com', role: 'ADVISOR' },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    function setupStatusMap() {
      mockPrismaService.documentStatus.findUnique.mockImplementation(
        (args: { where: { code: string } }) => {
          const statusMap: Record<string, typeof mockProcessingStatus> = {
            PROCESSING: mockProcessingStatus,
            PROCESSED: mockProcessedStatus,
            ERROR: mockErrorStatus,
            OCR_ERROR: mockOcrErrorStatus,
          };
          return Promise.resolve(statusMap[args.where.code] || null);
        },
      );
    }

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(now);
      mockPrismaService.document.update.mockReset();
      mockPrismaService.document.findUnique.mockReset();
      mockDocumentAiService.extractText.mockReset();
      mockDocumentAiService.extractTextWithLayout.mockReset();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should call extractTextWithLayout (not extractText) with gcsUri + mimeType', async () => {
      mockPrismaService.document.findUnique.mockResolvedValue(mockDocument);
      setupStatusMap();
      mockPrismaService.document.update
        .mockResolvedValueOnce({ ...mockDocument, documentStatus: mockProcessingStatus })
        .mockResolvedValueOnce({ ...mockDocument, documentStatus: mockProcessedStatus });
      mockDocumentAiService.extractTextWithLayout.mockResolvedValue({
        ocrText: extractedText,
        ocrLayout: mockOcrLayout,
      });

      await service.processDocument(caseId, documentId);

      expect(mockDocumentAiService.extractTextWithLayout).toHaveBeenCalledWith(
        gcsUri,
        mimeType,
      );
      expect(mockDocumentAiService.extractText).not.toHaveBeenCalled();
    });

    it('should persist ocrLayout alongside ocrText when saving PROCESSED', async () => {
      mockPrismaService.document.findUnique.mockResolvedValue(mockDocument);
      setupStatusMap();
      const processedDoc = {
        ...mockDocument,
        documentStatusId: mockProcessedStatus.id,
        documentStatus: mockProcessedStatus,
        ocrText: extractedText,
        ocrLayout: mockOcrLayout,
        processedAt: now,
      };
      mockPrismaService.document.update
        .mockResolvedValueOnce({ ...mockDocument, documentStatus: mockProcessingStatus })
        .mockResolvedValueOnce(processedDoc);
      mockDocumentAiService.extractTextWithLayout.mockResolvedValue({
        ocrText: extractedText,
        ocrLayout: mockOcrLayout,
      });

      const result = await service.processDocument(caseId, documentId);

      // PROCESSED update must carry ocrLayout AND ocrText
      expect(mockPrismaService.document.update).toHaveBeenNthCalledWith(2, {
        where: { id: documentId },
        data: {
          ocrText: extractedText,
          ocrLayout: mockOcrLayout,
          processedAt: now,
          documentStatusId: mockProcessedStatus.id,
        },
        include: { documentType: true, documentStatus: true, uploadedBy: true },
      });
      expect(result.documentStatus.code).toBe('PROCESSED');
      expect(result.ocrText).toBe(extractedText);
      expect(result.ocrLayout).toEqual(mockOcrLayout);
    });

    it('should NOT persist ocrLayout on the OCR_ERROR path (only processingError)', async () => {
      mockPrismaService.document.findUnique.mockResolvedValue(mockDocument);
      setupStatusMap();
      mockPrismaService.document.update
        .mockResolvedValueOnce({ ...mockDocument, documentStatus: mockProcessingStatus })
        .mockResolvedValueOnce({
          ...mockDocument,
          documentStatusId: mockOcrErrorStatus.id,
          documentStatus: mockOcrErrorStatus,
          processingError: 'gRPC timeout',
        });
      mockDocumentAiService.extractTextWithLayout.mockRejectedValue(
        new Error('gRPC timeout'),
      );

      await expect(service.processDocument(caseId, documentId)).rejects.toThrow(
        BadGatewayException,
      );

      // The OCR_ERROR fallback update must NOT include ocrLayout/ocrText
      expect(mockPrismaService.document.update).toHaveBeenLastCalledWith({
        where: { id: documentId },
        data: expect.objectContaining({
          processingError: 'gRPC timeout',
          documentStatusId: mockOcrErrorStatus.id,
        }),
      });
      const updateCalls = (mockPrismaService.document.update as jest.Mock).mock
        .calls as Array<Array<{ data?: Record<string, unknown> }>>;
      const lastCallData = updateCalls[updateCalls.length - 1][0].data as Record<string, unknown>;
      expect(lastCallData).not.toHaveProperty('ocrLayout');
      expect(lastCallData).not.toHaveProperty('ocrText');
    });
  });
});
