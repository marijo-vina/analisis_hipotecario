import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { BanksService } from './banks.service';
import { PrismaService } from '../prisma/prisma.service';
import { IncomeCriterion, ProductDestination } from '../generated/prisma/client';

describe('BanksService', () => {
  let service: BanksService;
  let prisma: PrismaService;

  const mockPrismaService = {
    bank: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    bankPolicy: {
      findMany: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
    },
    bankActivityFactor: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BanksService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<BanksService>(BanksService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all banks with policy count, ordered by code asc', async () => {
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
        {
          id: '2',
          code: 'HSBC',
          name: 'HSBC',
          incomeCriterion: IncomeCriterion.GROSS,
          debtCommitmentFactor: 0.5,
          minimumBureauScore: null,
          isActive: true,
          _count: { policies: 1 },
        },
      ];

      mockPrismaService.bank.findMany.mockResolvedValue([
        { ...banks[0], policies: [1, 2, 3, 4, 5, 6].map((i) => ({ id: `${i}` })) },
        { ...banks[1], policies: [{ id: '1' }] },
      ]);

      const result = await service.findAll();

      expect(result).toEqual(banks);
      expect(mockPrismaService.bank.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.bank.findMany).toHaveBeenCalledWith({
        orderBy: [
          { isActive: 'desc' },
          { name: 'asc' },
        ],
        include: {
          policies: {
            where: { isActive: true },
            select: { id: true },
          },
        },
      });
    });

    it('should return empty array when no banks exist', async () => {
      mockPrismaService.bank.findMany.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('findByCode', () => {
    it('should return bank with policies when found', async () => {
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
          {
            id: 'p2',
            destination: ProductDestination.LIQUIDITY,
            minimumIncome: 20000,
            isActive: true,
          },
        ],
      };

      mockPrismaService.bank.findUnique.mockResolvedValue(bank);

      const result = await service.findByCode('BANORTE');

      expect(result).toEqual(bank);
      expect(mockPrismaService.bank.findUnique).toHaveBeenCalledWith({
        where: { code: 'BANORTE' },
        include: {
          policies: {
            orderBy: { destination: 'asc' },
          },
          activityFactors: {
            orderBy: { nativeLabel: 'asc' },
          },
        },
      });
    });

    it('should throw NotFoundException when bank not found', async () => {
      mockPrismaService.bank.findUnique.mockResolvedValue(null);

      await expect(service.findByCode('INVALID')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findByCode('INVALID')).rejects.toThrow(
        'Bank with code INVALID not found',
      );
    });
  });

  describe('update', () => {
    it('should update bank and return updated bank', async () => {
      const updateData = {
        name: 'Banorte Updated',
        incomeCriterion: IncomeCriterion.GROSS,
        debtCommitmentFactor: 0.55,
        minimumBureauScore: 660,
        isActive: false,
      };

      const updatedBank = {
        id: '1',
        code: 'BANORTE',
        ...updateData,
      };

      mockPrismaService.bank.update.mockResolvedValue(updatedBank);

      const result = await service.update('BANORTE', updateData);

      expect(result).toEqual(updatedBank);
      expect(mockPrismaService.bank.update).toHaveBeenCalledWith({
        where: { code: 'BANORTE' },
        data: updateData,
      });
    });

    it('should throw NotFoundException when updating non-existent bank', async () => {
      const prismaError = {
        code: 'P2025',
        message: 'Record not found',
      };

      mockPrismaService.bank.update.mockRejectedValue(prismaError);

      await expect(
        service.update('INVALID', { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should handle partial updates', async () => {
      const updateData = {
        minimumBureauScore: 700,
      };

      const updatedBank = {
        id: '1',
        code: 'BANORTE',
        name: 'Banorte',
        minimumBureauScore: 700,
      };

      mockPrismaService.bank.update.mockResolvedValue(updatedBank);

      const result = await service.update('BANORTE', updateData);

      expect(result.minimumBureauScore).toBe(700);
      expect(mockPrismaService.bank.update).toHaveBeenCalledWith({
        where: { code: 'BANORTE' },
        data: updateData,
      });
    });

    it('should PATCH Banorte factor card as FLAT 0.6', async () => {
      const updateData = {
        pfaeFactorMode: 'FLAT',
        pfaeFlatFactor: 0.6,
        taxReturnPolicy: 'NOT_PREFERRED',
      };
      const updatedBank = {
        id: '1',
        code: 'BANORTE',
        ...updateData,
      };
      mockPrismaService.bank.update.mockResolvedValue(updatedBank);

      const result = await service.update('BANORTE', updateData);

      expect(result.pfaeFactorMode).toBe('FLAT');
      expect(result.pfaeFlatFactor).toBe(0.6);
      expect(result.taxReturnPolicy).toBe('NOT_PREFERRED');
      expect(mockPrismaService.bank.update).toHaveBeenCalledWith({
        where: { code: 'BANORTE' },
        data: updateData,
      });
    });
  });

  describe('upsertPolicy', () => {
    it('should create new policy when it does not exist', async () => {
      const bank = { id: '1', code: 'BANORTE' };
      const policyData = {
        minimumIncome: 15000,
        minimumPropertyValue: 350000,
        isActive: true,
      };

      const newPolicy = {
        id: 'new-policy-id',
        bankId: '1',
        destination: ProductDestination.ACQUISITION,
        ...policyData,
      };

      mockPrismaService.bank.findUnique.mockResolvedValue(bank);
      mockPrismaService.bankPolicy.upsert.mockResolvedValue(newPolicy);

      const result = await service.upsertPolicy(
        'BANORTE',
        ProductDestination.ACQUISITION,
        policyData,
      );

      expect(result).toEqual(newPolicy);
      expect(mockPrismaService.bankPolicy.upsert).toHaveBeenCalledWith({
        where: {
          bankId_destination: {
            bankId: '1',
            destination: ProductDestination.ACQUISITION,
          },
        },
        create: {
          bankId: '1',
          destination: ProductDestination.ACQUISITION,
          ...policyData,
          code: expect.any(String),
        },
        update: policyData,
      });
    });

    it('should update existing policy when it exists', async () => {
      const bank = { id: '1', code: 'BANORTE' };
      const policyData = {
        minimumIncome: 20000,
        isActive: false,
      };

      const updatedPolicy = {
        id: 'existing-policy-id',
        bankId: '1',
        destination: ProductDestination.LIQUIDITY,
        ...policyData,
      };

      mockPrismaService.bank.findUnique.mockResolvedValue(bank);
      mockPrismaService.bankPolicy.upsert.mockResolvedValue(updatedPolicy);

      const result = await service.upsertPolicy(
        'BANORTE',
        ProductDestination.LIQUIDITY,
        policyData,
      );

      expect(result).toEqual(updatedPolicy);
      expect(mockPrismaService.bankPolicy.upsert).toHaveBeenCalled();
    });

    it('should throw NotFoundException when bank not found', async () => {
      mockPrismaService.bank.findUnique.mockResolvedValue(null);

      await expect(
        service.upsertPolicy('INVALID', ProductDestination.ACQUISITION, {}),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.upsertPolicy('INVALID', ProductDestination.ACQUISITION, {}),
      ).rejects.toThrow('Bank with code INVALID not found');
    });

    it('should throw BadRequestException when destination is invalid', async () => {
      const bank = { id: '1', code: 'BANORTE' };
      mockPrismaService.bank.findUnique.mockResolvedValue(bank);

      await expect(
        service.upsertPolicy('BANORTE', 'INVALID_DESTINATION' as any, {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle null values in policy data', async () => {
      const bank = { id: '1', code: 'BANORTE' };
      const policyData = {
        minimumIncome: null,
        minimumPropertyValue: null,
        minimumEmploymentTenureMonths: null,
      };

      const newPolicy = {
        id: 'new-policy-id',
        bankId: '1',
        destination: ProductDestination.TERRENO,
        ...policyData,
      };

      mockPrismaService.bank.findUnique.mockResolvedValue(bank);
      mockPrismaService.bankPolicy.upsert.mockResolvedValue(newPolicy);

      const result = await service.upsertPolicy(
        'BANORTE',
        ProductDestination.TERRENO,
        policyData,
      );

      expect(result).toEqual(newPolicy);
    });

    it('should update PFAE tenure and income cells on the same policy row', async () => {
      const bank = { id: '1', code: 'SANTANDER' };
      const policyData = {
        minimumActivityTenureMonths: 24,
        minimumIncomePfae: 15000,
        minimumApplicantAgeMonthsPfae: null,
      };
      const updatedPolicy = {
        id: 'santander-adq',
        bankId: '1',
        destination: ProductDestination.ACQUISITION,
        ...policyData,
      };
      mockPrismaService.bank.findUnique.mockResolvedValue(bank);
      mockPrismaService.bankPolicy.upsert.mockResolvedValue(updatedPolicy);

      const result = await service.upsertPolicy(
        'SANTANDER',
        ProductDestination.ACQUISITION,
        policyData,
      );

      expect(result.minimumActivityTenureMonths).toBe(24);
      expect(result.minimumIncomePfae).toBe(15000);
      expect(mockPrismaService.bankPolicy.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: policyData,
          create: expect.objectContaining(policyData),
        }),
      );
    });
  });

  describe('activity factor CRUD', () => {
    const bank = { id: 'bank-1', code: 'MIFEL' };

    it('should create an activity factor with factor 1.5', async () => {
      const dto = {
        nativeLabel: 'Establecimientos y PI de salud',
        satAliases: ['medicos'],
        factor: 1.5,
      };
      const created = { id: 'f1', bankId: bank.id, ...dto };
      mockPrismaService.bank.findUnique.mockResolvedValue(bank);
      mockPrismaService.bankActivityFactor.create.mockResolvedValue(created);

      const result = await service.createActivityFactor('MIFEL', dto);

      expect(result.factor).toBe(1.5);
      expect(mockPrismaService.bankActivityFactor.create).toHaveBeenCalledWith({
        data: {
          bankId: bank.id,
          nativeLabel: dto.nativeLabel,
          satAliases: dto.satAliases,
          factor: dto.factor,
          factorTaxReturn: undefined,
        },
      });
    });

    it('should throw NotFoundException when creating a factor for a missing bank', async () => {
      mockPrismaService.bank.findUnique.mockResolvedValue(null);

      await expect(
        service.createActivityFactor('INVALID', {
          nativeLabel: 'x',
          satAliases: [],
          factor: 0.5,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update an activity factor that belongs to the bank', async () => {
      const existing = {
        id: 'f1',
        bankId: bank.id,
        nativeLabel: 'Comercio',
        factor: 0.35,
      };
      mockPrismaService.bank.findUnique.mockResolvedValue(bank);
      mockPrismaService.bankActivityFactor.findUnique.mockResolvedValue(existing);
      mockPrismaService.bankActivityFactor.update.mockResolvedValue({
        ...existing,
        factor: 0.4,
      });

      const result = await service.updateActivityFactor('MIFEL', 'f1', {
        factor: 0.4,
      });

      expect(result.factor).toBe(0.4);
      expect(mockPrismaService.bankActivityFactor.update).toHaveBeenCalledWith({
        where: { id: 'f1' },
        data: { factor: 0.4 },
      });
    });

    it('should throw NotFoundException when factor belongs to another bank', async () => {
      mockPrismaService.bank.findUnique.mockResolvedValue(bank);
      mockPrismaService.bankActivityFactor.findUnique.mockResolvedValue({
        id: 'f1',
        bankId: 'other-bank',
      });

      await expect(
        service.updateActivityFactor('MIFEL', 'f1', { factor: 1.5 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should delete an activity factor that belongs to the bank', async () => {
      mockPrismaService.bank.findUnique.mockResolvedValue(bank);
      mockPrismaService.bankActivityFactor.findUnique.mockResolvedValue({
        id: 'f1',
        bankId: bank.id,
      });
      mockPrismaService.bankActivityFactor.delete.mockResolvedValue({
        id: 'f1',
      });

      const result = await service.deleteActivityFactor('MIFEL', 'f1');

      expect(result).toEqual({ id: 'f1' });
      expect(mockPrismaService.bankActivityFactor.delete).toHaveBeenCalledWith({
        where: { id: 'f1' },
      });
    });
  });
});
