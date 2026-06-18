import { BadGatewayException, BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { DocumentAiService } from './document-ai.service';
import { DocumentsService } from './documents.service';
import { GcsService } from './gcs.service';
import { StoragePathService } from './storage-path.service';

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
  };

  const mockGcsService = {
    uploadFile: jest.fn(),
    generateSignedUrl: jest.fn(),
    deleteFile: jest.fn(),
  };

  const mockStoragePathService = {
    buildPath: jest.fn(),
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

    it('should throw BadRequestException when document status is not UPLOADED', async () => {
      mockPrismaService.document.findUnique.mockResolvedValue({
        ...mockDocument,
        documentStatus: { id: 2, code: 'VALIDATED', name: 'Validado', order: 3 },
      });

      await expect(service.delete(caseId, documentId)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.delete(caseId, documentId)).rejects.toThrow(
        'Solo se pueden eliminar documentos no procesados',
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
          processedAt: now,
        });
      mockDocumentAiService.extractText.mockResolvedValue(extractedText);

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

      // Step 3: Call Document AI
      expect(mockDocumentAiService.extractText).toHaveBeenCalledWith(gcsUri, mimeType);

      // Step 4: Set PROCESSED with ocrText
      expect(mockPrismaService.document.update).toHaveBeenNthCalledWith(2, {
        where: { id: documentId },
        data: {
          ocrText: extractedText,
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
          processedAt: now,
          processingError: null,
        });
      mockDocumentAiService.extractText.mockResolvedValue(extractedText);

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
      expect(mockDocumentAiService.extractText).not.toHaveBeenCalled();
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
      expect(mockDocumentAiService.extractText).not.toHaveBeenCalled();
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

    it('should persist processingError and set ERROR status on Document AI failure', async () => {
      mockPrismaService.document.findUnique.mockResolvedValue(mockDocument);
      mockPrismaService.documentStatus.findUnique.mockImplementation((args: { where: { code: string } }) => {
        const statusMap: Record<string, typeof mockProcessingStatus> = {
          PROCESSING: mockProcessingStatus,
          PROCESSED: mockProcessedStatus,
          ERROR: mockErrorStatus,
        };
        return Promise.resolve(statusMap[args.where.code] || null);
      });
      mockPrismaService.document.update
        .mockResolvedValueOnce({ ...mockDocument, documentStatusId: mockProcessingStatus.id, documentStatus: mockProcessingStatus })
        .mockResolvedValueOnce({
          ...mockDocument,
          documentStatusId: mockErrorStatus.id,
          documentStatus: mockErrorStatus,
          processingError: 'gRPC timeout',
        });
      mockDocumentAiService.extractText.mockRejectedValue(new Error('gRPC timeout'));

      await expect(service.processDocument(caseId, documentId)).rejects.toThrow(
        BadGatewayException,
      );

      // Verify ERROR status was persisted
      expect(mockPrismaService.document.update).toHaveBeenLastCalledWith({
        where: { id: documentId },
        data: expect.objectContaining({
          processingError: 'gRPC timeout',
          documentStatusId: mockErrorStatus.id,
        }),
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
        };
        return Promise.resolve(statusMap[args.where.code] || null);
      });

      // First update (PROCESSING) succeeds
      mockPrismaService.document.update
        .mockResolvedValueOnce({ ...mockDocument, documentStatusId: mockProcessingStatus.id, documentStatus: mockProcessingStatus });

      mockDocumentAiService.extractText.mockResolvedValue(extractedText);

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
});
