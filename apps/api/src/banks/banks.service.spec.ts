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
      upsert: jest.fn(),
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

      mockPrismaService.bank.findMany.mockResolvedValue(banks);

      const result = await service.findAll();

      expect(result).toEqual(banks);
      expect(mockPrismaService.bank.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.bank.findMany).toHaveBeenCalledWith({
        orderBy: { code: 'asc' },
        include: {
          _count: {
            select: { policies: true },
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
          name: expect.any(String),
          personType: expect.any(String),
          sourceVersion: expect.any(String),
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
  });
});
