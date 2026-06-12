import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { CatalogsController } from './catalogs.controller';
import { CatalogsService } from './catalogs.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

describe('CatalogsController', () => {
  let controller: CatalogsController;

  const mockCatalogsService = {
    getCreditTypes: jest.fn(),
    getCaseStatuses: jest.fn(),
    getDocumentTypes: jest.fn(),
    getDocumentStatuses: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CatalogsController],
      providers: [
        {
          provide: CatalogsService,
          useValue: mockCatalogsService,
        },
      ],
    }).compile();

    controller = module.get<CatalogsController>(CatalogsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should protect all endpoints with JwtAuthGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, CatalogsController);

    expect(guards).toEqual([JwtAuthGuard]);
  });

  describe('findCreditTypes', () => {
    it('should return credit types from service', async () => {
      const creditTypes = [
        { id: 1, code: 'COMPRA', name: 'Compra', isActive: true },
        { id: 2, code: 'LIQUIDEZ', name: 'Liquidez', isActive: true },
      ];

      mockCatalogsService.getCreditTypes.mockResolvedValue(creditTypes);

      const result = await controller.findCreditTypes();

      expect(result).toEqual({ data: creditTypes });
      expect(mockCatalogsService.getCreditTypes).toHaveBeenCalledTimes(1);
    });

    it('should return empty array wrapped in data key', async () => {
      mockCatalogsService.getCreditTypes.mockResolvedValue([]);

      const result = await controller.findCreditTypes();

      expect(result).toEqual({ data: [] });
      expect(mockCatalogsService.getCreditTypes).toHaveBeenCalledTimes(1);
    });
  });

  describe('findCaseStatuses', () => {
    it('should return case statuses from service', async () => {
      const statuses = [
        { id: 1, code: 'PENDING_DOCUMENTS', name: 'Pendiente Documentos', order: 1 },
        { id: 2, code: 'ANALYSIS', name: 'Análisis', order: 2 },
      ];

      mockCatalogsService.getCaseStatuses.mockResolvedValue(statuses);

      const result = await controller.findCaseStatuses();

      expect(result).toEqual({ data: statuses });
      expect(mockCatalogsService.getCaseStatuses).toHaveBeenCalledTimes(1);
    });

    it('should return empty statuses wrapped in data key', async () => {
      mockCatalogsService.getCaseStatuses.mockResolvedValue([]);

      const result = await controller.findCaseStatuses();

      expect(result).toEqual({ data: [] });
      expect(mockCatalogsService.getCaseStatuses).toHaveBeenCalledTimes(1);
    });
  });

  describe('findDocumentTypes', () => {
    it('should return active document types from service', async () => {
      const types = [
        { id: 1, code: 'PAYROLL_RECEIPT', name: 'Recibo de nómina', isActive: true },
        { id: 2, code: 'BANK_STATEMENT', name: 'Estado de cuenta', isActive: true },
      ];

      mockCatalogsService.getDocumentTypes.mockResolvedValue(types);

      const result = await controller.findDocumentTypes();

      expect(result).toEqual({ data: types });
      expect(mockCatalogsService.getDocumentTypes).toHaveBeenCalledTimes(1);
    });

    it('should return empty array wrapped in data key', async () => {
      mockCatalogsService.getDocumentTypes.mockResolvedValue([]);

      const result = await controller.findDocumentTypes();

      expect(result).toEqual({ data: [] });
      expect(mockCatalogsService.getDocumentTypes).toHaveBeenCalledTimes(1);
    });
  });

  describe('findDocumentStatuses', () => {
    it('should return document statuses from service', async () => {
      const statuses = [
        { id: 1, code: 'UPLOADED', name: 'Cargado', order: 1 },
        { id: 2, code: 'PENDING_REVIEW', name: 'Pendiente de revisión', order: 2 },
      ];

      mockCatalogsService.getDocumentStatuses.mockResolvedValue(statuses);

      const result = await controller.findDocumentStatuses();

      expect(result).toEqual({ data: statuses });
      expect(mockCatalogsService.getDocumentStatuses).toHaveBeenCalledTimes(1);
    });

    it('should return empty array wrapped in data key', async () => {
      mockCatalogsService.getDocumentStatuses.mockResolvedValue([]);

      const result = await controller.findDocumentStatuses();

      expect(result).toEqual({ data: [] });
      expect(mockCatalogsService.getDocumentStatuses).toHaveBeenCalledTimes(1);
    });
  });
});
