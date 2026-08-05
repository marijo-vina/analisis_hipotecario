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
    documentType: {
      findMany: jest.fn(),
    },
    documentStatus: {
      findMany: jest.fn(),
    },
    bank: {
      findMany: jest.fn(),
    },
    bankPolicy: {
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

  describe('getDocumentTypes', () => {
    it('should return active document types ordered by id asc', async () => {
      const types = [
        { id: 1, code: 'PAYROLL_RECEIPT', name: 'Recibo de nómina', isActive: true },
        { id: 2, code: 'BANK_STATEMENT', name: 'Estado de cuenta', isActive: true },
      ];

      mockPrismaService.documentType.findMany.mockResolvedValue(types);

      const result = await service.getDocumentTypes();

      expect(result).toEqual(types);
      expect(mockPrismaService.documentType.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { id: 'asc' },
      });
    });

    it('should return empty array when no active document types', async () => {
      mockPrismaService.documentType.findMany.mockResolvedValue([]);

      const result = await service.getDocumentTypes();

      expect(result).toEqual([]);
    });
  });

  describe('getDocumentStatuses', () => {
    it('should return document statuses ordered by order asc and id asc', async () => {
      const statuses = [
        { id: 1, code: 'UPLOADED', name: 'Cargado', order: 1 },
        { id: 2, code: 'PENDING_REVIEW', name: 'Pendiente de revisión', order: 2 },
        { id: 5, code: 'ERROR', name: 'Error', order: 5 },
      ];

      mockPrismaService.documentStatus.findMany.mockResolvedValue(statuses);

      const result = await service.getDocumentStatuses();

      expect(result).toEqual(statuses);
      expect(mockPrismaService.documentStatus.findMany).toHaveBeenCalledWith({
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
      });
    });

    it('should return empty array when no statuses exist', async () => {
      mockPrismaService.documentStatus.findMany.mockResolvedValue([]);

      const result = await service.getDocumentStatuses();

      expect(result).toEqual([]);
    });
  });

  describe('getBanks', () => {
    it('should return active banks ordered by code asc', async () => {
      const banks = [
        { id: '1', code: 'BANORTE', name: 'Banorte', isActive: true },
        { id: '2', code: 'HSBC', name: 'HSBC', isActive: true },
      ];

      mockPrismaService.bank.findMany.mockResolvedValue(banks);

      const result = await service.getBanks();

      expect(result).toEqual(banks);
      expect(mockPrismaService.bank.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { code: 'asc' },
      });
    });

    it('should return empty array when no active banks', async () => {
      mockPrismaService.bank.findMany.mockResolvedValue([]);

      const result = await service.getBanks();

      expect(result).toEqual([]);
    });
  });

  describe('getBankProducts', () => {
    it('should return active bank products with bank included', async () => {
      const products = [
        { id: '1', code: 'BANORTE_ADQ_HF', destination: 'ACQUISITION', bank: { code: 'BANORTE' } },
      ];

      mockPrismaService.bankPolicy.findMany.mockResolvedValue(products);

      const result = await service.getBankProducts();

      expect(result).toEqual(products);
      expect(mockPrismaService.bankPolicy.findMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
          bank: { isActive: true },
        },
        include: { bank: true },
        orderBy: { code: 'asc' },
      });
    });

    it('should filter by destination when provided', async () => {
      const products = [
        { id: '1', code: 'BANORTE_ADQ_HF', destination: 'ACQUISITION', bank: { code: 'BANORTE' } },
      ];

      mockPrismaService.bankPolicy.findMany.mockResolvedValue(products);

      const result = await service.getBankProducts('ACQUISITION');

      expect(result).toEqual(products);
      expect(mockPrismaService.bankPolicy.findMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
          destination: 'ACQUISITION',
          bank: { isActive: true },
        },
        include: { bank: true },
        orderBy: { code: 'asc' },
      });
    });

    it('should return empty array when no products match', async () => {
      mockPrismaService.bankPolicy.findMany.mockResolvedValue([]);

      const result = await service.getBankProducts('LIQUIDITY');

      expect(result).toEqual([]);
    });
  });
});
