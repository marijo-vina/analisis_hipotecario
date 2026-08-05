import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { BanksController } from './banks.controller';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

describe('BanksController', () => {
  let controller: BanksController;

  const mockPrismaService = {
    bank: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BanksController],
      providers: [
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    controller = module.get<BanksController>(BanksController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should protect all endpoints with JwtAuthGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, BanksController);

    expect(guards).toEqual([JwtAuthGuard]);
  });

  describe('findBanks', () => {
    it('should return active banks ordered by code asc', async () => {
      const banks = [
        { id: '1', code: 'BANORTE', name: 'Banorte', isActive: true },
        { id: '2', code: 'HSBC', name: 'HSBC', isActive: true },
      ];

      mockPrismaService.bank.findMany.mockResolvedValue(banks);

      const result = await controller.findBanks();

      expect(result).toEqual({ data: banks });
      expect(mockPrismaService.bank.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.bank.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { code: 'asc' },
      });
    });

    it('should return empty array wrapped in data key', async () => {
      mockPrismaService.bank.findMany.mockResolvedValue([]);

      const result = await controller.findBanks();

      expect(result).toEqual({ data: [] });
      expect(mockPrismaService.bank.findMany).toHaveBeenCalledTimes(1);
    });
  });
});
