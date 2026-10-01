import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { BanksController } from './banks.controller';
import { BanksService } from './banks.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IncomeCriterion, ProductDestination } from '../generated/prisma/client';

describe('BanksController', () => {
  let controller: BanksController;
  let service: BanksService;

  const mockBanksService = {
    findAll: jest.fn(),
    findByCode: jest.fn(),
    update: jest.fn(),
    upsertPolicy: jest.fn(),
    createActivityFactor: jest.fn(),
    updateActivityFactor: jest.fn(),
    deleteActivityFactor: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BanksController],
      providers: [
        {
          provide: BanksService,
          useValue: mockBanksService,
        },
      ],
    }).compile();

    controller = module.get<BanksController>(BanksController);
    service = module.get<BanksService>(BanksService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should protect all endpoints with JwtAuthGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, BanksController);
    expect(guards).toEqual([JwtAuthGuard]);
  });

  describe('findBanks', () => {
    it('should return all banks wrapped in data key', async () => {
      const banks = [
        {
          id: '1',
          code: 'BANORTE',
          name: 'Banorte',
          incomeCriterion: IncomeCriterion.NET,
          debtCommitmentFactor: 0.6,
          minimumBureauScore: 650,
          isActive: true,
          _count: { policies: 6 },
        },
      ];

      mockBanksService.findAll.mockResolvedValue(banks);

      const result = await controller.findBanks();

      expect(result).toEqual({ data: banks });
      expect(mockBanksService.findAll).toHaveBeenCalledTimes(1);
    });

    it('should return empty array wrapped in data key', async () => {
      mockBanksService.findAll.mockResolvedValue([]);

      const result = await controller.findBanks();

      expect(result).toEqual({ data: [] });
    });
  });

  describe('findBank', () => {
    it('should return bank detail with policies wrapped in data key', async () => {
      const bank = {
        id: '1',
        code: 'BANORTE',
        name: 'Banorte',
        incomeCriterion: IncomeCriterion.NET,
        debtCommitmentFactor: 0.6,
        minimumBureauScore: 650,
        isActive: true,
        policies: [
          {
            id: 'p1',
            destination: ProductDestination.ACQUISITION,
            minimumIncome: 15000,
            isActive: true,
          },
        ],
      };

      mockBanksService.findByCode.mockResolvedValue(bank);

      const result = await controller.findBank('BANORTE');

      expect(result).toEqual({ data: bank });
      expect(mockBanksService.findByCode).toHaveBeenCalledWith('BANORTE');
    });
  });

  describe('updateBank', () => {
    it('should update bank and return wrapped in data key', async () => {
      const updateData = {
        name: 'Banorte Updated',
        debtCommitmentFactor: 0.55,
      };

      const updatedBank = {
        id: '1',
        code: 'BANORTE',
        name: 'Banorte Updated',
        debtCommitmentFactor: 0.55,
      };

      mockBanksService.update.mockResolvedValue(updatedBank);

      const result = await controller.updateBank('BANORTE', updateData);

      expect(result).toEqual({ data: updatedBank });
      expect(mockBanksService.update).toHaveBeenCalledWith(
        'BANORTE',
        updateData,
      );
    });

    it('should PATCH Banorte factor card FLAT 0.6', async () => {
      const updateData = {
        pfaeFactorMode: 'FLAT' as const,
        pfaeFlatFactor: 0.6,
      };
      const updatedBank = {
        id: '1',
        code: 'BANORTE',
        pfaeFactorMode: 'FLAT',
        pfaeFlatFactor: 0.6,
      };
      mockBanksService.update.mockResolvedValue(updatedBank);

      const result = await controller.updateBank('BANORTE', updateData);

      expect(result.data.pfaeFactorMode).toBe('FLAT');
      expect(result.data.pfaeFlatFactor).toBe(0.6);
      expect(mockBanksService.update).toHaveBeenCalledWith(
        'BANORTE',
        updateData,
      );
    });
  });

  describe('updatePolicy', () => {
    it('should upsert policy and return wrapped in data key', async () => {
      const updateData = {
        minimumIncome: 20000,
        isActive: true,
      };

      const policy = {
        id: 'p1',
        bankId: '1',
        destination: ProductDestination.ACQUISITION,
        minimumIncome: 20000,
        isActive: true,
      };

      mockBanksService.upsertPolicy.mockResolvedValue(policy);

      const result = await controller.updatePolicy(
        'BANORTE',
        'ACQUISITION',
        updateData,
      );

      expect(result).toEqual({ data: policy });
      expect(mockBanksService.upsertPolicy).toHaveBeenCalledWith(
        'BANORTE',
        'ACQUISITION',
        updateData,
      );
    });

    it('should pass PFAE tenure and income cells to upsertPolicy', async () => {
      const updateData = {
        minimumActivityTenureMonths: 24,
        minimumIncomePfae: 15000,
      };
      const policy = {
        id: 'p1',
        destination: ProductDestination.ACQUISITION,
        ...updateData,
      };
      mockBanksService.upsertPolicy.mockResolvedValue(policy);

      const result = await controller.updatePolicy(
        'SANTANDER',
        'ACQUISITION',
        updateData,
      );

      expect(result.data.minimumIncomePfae).toBe(15000);
      expect(mockBanksService.upsertPolicy).toHaveBeenCalledWith(
        'SANTANDER',
        'ACQUISITION',
        updateData,
      );
    });
  });

  describe('PFAE activity factors CRUD', () => {
    it('should create an activity factor for a bank', async () => {
      const dto = {
        nativeLabel: 'Establecimientos y PI de salud',
        satAliases: ['medicos'],
        factor: 1.5,
      };
      const created = { id: 'f1', bankId: '1', ...dto };
      mockBanksService.createActivityFactor.mockResolvedValue(created);

      const result = await controller.createActivityFactor('MIFEL', dto);

      expect(result).toEqual({ data: created });
      expect(mockBanksService.createActivityFactor).toHaveBeenCalledWith(
        'MIFEL',
        dto,
      );
    });

    it('should update an activity factor', async () => {
      const dto = { factor: 1.5 };
      const updated = { id: 'f1', factor: 1.5 };
      mockBanksService.updateActivityFactor.mockResolvedValue(updated);

      const result = await controller.updateActivityFactor('MIFEL', 'f1', dto);

      expect(result).toEqual({ data: updated });
      expect(mockBanksService.updateActivityFactor).toHaveBeenCalledWith(
        'MIFEL',
        'f1',
        dto,
      );
    });

    it('should delete an activity factor', async () => {
      mockBanksService.deleteActivityFactor.mockResolvedValue({ id: 'f1' });

      const result = await controller.deleteActivityFactor('MIFEL', 'f1');

      expect(result).toEqual({ data: { id: 'f1' } });
      expect(mockBanksService.deleteActivityFactor).toHaveBeenCalledWith(
        'MIFEL',
        'f1',
      );
    });
  });
});
