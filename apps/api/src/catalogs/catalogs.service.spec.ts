import { Test, TestingModule } from '@nestjs/testing';
import { CatalogsService } from './catalogs.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CatalogsService', () => {
  let service: CatalogsService;

  const mockPrismaService = {
    creditType: {
      findMany: jest.fn(),
    },
    caseStatus: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<CatalogsService>(CatalogsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCreditTypes', () => {
    it('should return active credit types ordered by id asc', async () => {
      const creditTypes = [
        { id: 1, code: 'COMPRA', name: 'Compra', isActive: true },
        { id: 2, code: 'LIQUIDEZ', name: 'Liquidez', isActive: true },
      ];

      mockPrismaService.creditType.findMany.mockResolvedValue(creditTypes);

      const result = await service.getCreditTypes();

      expect(result).toEqual(creditTypes);
      expect(mockPrismaService.creditType.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { id: 'asc' },
      });
    });
  });

  describe('getCaseStatuses', () => {
    it('should return case statuses ordered by order asc and id asc', async () => {
      const statuses = [
        { id: 1, code: 'PENDING_DOCUMENTS', name: 'Pendiente Documentos', order: 1 },
        { id: 2, code: 'ANALYSIS', name: 'Análisis', order: 2 },
      ];

      mockPrismaService.caseStatus.findMany.mockResolvedValue(statuses);

      const result = await service.getCaseStatuses();

      expect(result).toEqual(statuses);
      expect(mockPrismaService.caseStatus.findMany).toHaveBeenCalledWith({
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
      });
    });
  });
});
