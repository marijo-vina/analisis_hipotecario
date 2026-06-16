import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateDocumentDto } from './dto/create-document.dto';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

describe('DocumentsController', () => {
  let controller: DocumentsController;

  const mockDocumentsService = {
    create: jest.fn(),
    findAllByCase: jest.fn(),
    findOneByCase: jest.fn(),
    uploadAndCreate: jest.fn(),
    getSignedUrl: jest.fn(),
    delete: jest.fn(),
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

      const result = await controller.findAllByCase('case-uuid-1');

      expect(result).toEqual({ data: documents });
      expect(mockDocumentsService.findAllByCase).toHaveBeenCalledWith('case-uuid-1');
    });

    it('should return empty array wrapped in data when no documents', async () => {
      mockDocumentsService.findAllByCase.mockResolvedValue([]);

      const result = await controller.findAllByCase('case-uuid-1');

      expect(result).toEqual({ data: [] });
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
});
