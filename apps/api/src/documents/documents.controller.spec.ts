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
});
