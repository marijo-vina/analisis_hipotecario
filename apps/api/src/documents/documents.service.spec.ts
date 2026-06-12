import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { DocumentsService } from './documents.service';

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

  const mockPrismaService = {
    document: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
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

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
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
});
