import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMortgageCaseDto } from './dto/create-mortgage-case.dto';
import { MortgageCasesService } from './mortgage-cases.service';

describe('MortgageCasesService', () => {
  let service: MortgageCasesService;

  const mockPrismaService = {
    mortgageCase: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    caseStatus: {
      findUnique: jest.fn(),
    },
    client: {
      findUnique: jest.fn(),
    },
    creditType: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MortgageCasesService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<MortgageCasesService>(MortgageCasesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a mortgage case using advisorId from auth and default SALARIED', async () => {
      const dto: CreateMortgageCaseDto = {
        clientId: '9f12fd26-c5f9-4eca-91b8-0235828f6ee4',
        creditTypeId: 2,
        requestedAmount: 1000000,
      };
      const advisorId = 'advisor-1';

      mockPrismaService.caseStatus.findUnique.mockResolvedValue({ id: 1, code: 'PENDING_DOCUMENTS' });
      mockPrismaService.client.findUnique.mockResolvedValue({ id: dto.clientId });
      mockPrismaService.creditType.findUnique.mockResolvedValue({ id: dto.creditTypeId });
      mockPrismaService.mortgageCase.create.mockResolvedValue({
        id: 'mc-1',
        ...dto,
        advisorId,
        statusId: 1,
        personType: 'SALARIED',
      });

      const result = await service.create(dto, advisorId);

      expect(mockPrismaService.caseStatus.findUnique).toHaveBeenCalledWith({
        where: { code: 'PENDING_DOCUMENTS' },
      });
      expect(mockPrismaService.mortgageCase.create).toHaveBeenCalledWith({
        data: {
          ...dto,
          advisorId,
          statusId: 1,
          personType: 'SALARIED',
        },
        include: {
          client: true,
          advisor: true,
          creditType: true,
          status: true,
        },
      });
      expect(result).toEqual(
        expect.objectContaining({
          advisorId,
          statusId: 1,
          personType: 'SALARIED',
        }),
      );
    });

    it('should preserve SALARIED when personType is explicitly provided', async () => {
      const dto: CreateMortgageCaseDto = {
        clientId: '9f12fd26-c5f9-4eca-91b8-0235828f6ee4',
        creditTypeId: 2,
        personType: 'SALARIED',
      };
      const advisorId = 'advisor-2';

      mockPrismaService.caseStatus.findUnique.mockResolvedValue({ id: 1, code: 'PENDING_DOCUMENTS' });
      mockPrismaService.client.findUnique.mockResolvedValue({ id: dto.clientId });
      mockPrismaService.creditType.findUnique.mockResolvedValue({ id: dto.creditTypeId });
      mockPrismaService.mortgageCase.create.mockResolvedValue({ id: 'mc-2', ...dto, advisorId, statusId: 1 });

      await service.create(dto, advisorId);

      expect(mockPrismaService.mortgageCase.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ personType: 'SALARIED' }),
        }),
      );
    });

    it('should throw NotFoundException when client does not exist', async () => {
      const dto: CreateMortgageCaseDto = {
        clientId: 'missing-client',
        creditTypeId: 2,
      };

      mockPrismaService.caseStatus.findUnique.mockResolvedValue({ id: 1, code: 'PENDING_DOCUMENTS' });
      mockPrismaService.client.findUnique.mockResolvedValue(null);

      await expect(service.create(dto, 'advisor-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when pending status is missing', async () => {
      const dto: CreateMortgageCaseDto = {
        clientId: 'client-1',
        creditTypeId: 2,
      };

      mockPrismaService.caseStatus.findUnique.mockResolvedValue(null);

      await expect(service.create(dto, 'advisor-1')).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.mortgageCase.create).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when credit type does not exist', async () => {
      const dto: CreateMortgageCaseDto = {
        clientId: 'client-1',
        creditTypeId: 999,
      };

      mockPrismaService.caseStatus.findUnique.mockResolvedValue({ id: 1, code: 'PENDING_DOCUMENTS' });
      mockPrismaService.client.findUnique.mockResolvedValue({ id: dto.clientId });
      mockPrismaService.creditType.findUnique.mockResolvedValue(null);

      await expect(service.create(dto, 'advisor-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return paginated cases with meta and includes', async () => {
      const rows = [{ id: 'mc-1' }, { id: 'mc-2' }];
      mockPrismaService.mortgageCase.findMany.mockResolvedValue(rows);
      mockPrismaService.mortgageCase.count.mockResolvedValue(2);

      const result = await service.findAll({ page: 2, limit: 1 });

      expect(mockPrismaService.mortgageCase.findMany).toHaveBeenCalledWith({
        skip: 1,
        take: 1,
        orderBy: { createdAt: 'desc' },
        include: {
          client: true,
          advisor: true,
          creditType: true,
          status: true,
        },
      });
      expect(result).toEqual({
        data: rows,
        meta: {
          total: 2,
          page: 2,
          limit: 1,
        },
      });
    });
  });

  describe('findOne', () => {
    it('should return case detail with includes', async () => {
      const row = { id: 'mc-1' };
      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(row);

      const result = await service.findOne('mc-1');

      expect(mockPrismaService.mortgageCase.findUnique).toHaveBeenCalledWith({
        where: { id: 'mc-1' },
        include: {
          client: true,
          advisor: true,
          creditType: true,
          status: true,
        },
      });
      expect(result).toEqual(row);
    });

    it('should throw NotFoundException when case does not exist', async () => {
      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(null);

      await expect(service.findOne('unknown')).rejects.toThrow(NotFoundException);
    });
  });
});
