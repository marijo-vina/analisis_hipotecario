import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMortgageCaseDto } from './dto/create-mortgage-case.dto';
import { UpdateMortgageCaseDto } from './dto/update-mortgage-case.dto';
import { MortgageCasesService } from './mortgage-cases.service';

describe('MortgageCasesService', () => {
  let service: MortgageCasesService;

  const mockPrismaService = {
    mortgageCase: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
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
        status: { id: 1, code: 'PENDING_DOCUMENTS', name: 'Pendiente de documentos', order: 1 },
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
          documents: {
            select: {
              id: true,
              documentStatus: true,
              documentType: true,
              processingError: true,
            },
          },
        },
      });
      expect(result).toEqual(
        expect.objectContaining({
          advisorId,
          statusId: 1,
          personType: 'SALARIED',
        }),
      );
      expect(result.status).toBeDefined();
      expect(result.status.code).toBe('PENDING_DOCUMENTS');
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

    it('should persist PM personType and the five corporate fields', async () => {
      const incorporationDate = new Date('2020-01-15');
      const dto: CreateMortgageCaseDto = {
        clientId: '9f12fd26-c5f9-4eca-91b8-0235828f6ee4',
        creditTypeId: 2,
        personType: 'PM',
        sharePercentage: 51.5,
        incorporationDate,
        shareTenureMonths: 24,
        legalName: 'Acme SA de CV',
        companyRfc: 'ACM200115XX1',
      };
      const advisorId = 'advisor-pm';

      mockPrismaService.caseStatus.findUnique.mockResolvedValue({ id: 1, code: 'PENDING_DOCUMENTS' });
      mockPrismaService.client.findUnique.mockResolvedValue({ id: dto.clientId });
      mockPrismaService.creditType.findUnique.mockResolvedValue({ id: dto.creditTypeId });
      mockPrismaService.mortgageCase.create.mockResolvedValue({
        id: 'mc-pm-1',
        ...dto,
        advisorId,
        statusId: 1,
        personType: 'PM',
      });

      const result = await service.create(dto, advisorId);

      expect(mockPrismaService.mortgageCase.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            personType: 'PM',
            sharePercentage: 51.5,
            incorporationDate,
            shareTenureMonths: 24,
            legalName: 'Acme SA de CV',
            companyRfc: 'ACM200115XX1',
            advisorId,
            statusId: 1,
          }),
        }),
      );
      expect(result.personType).toBe('PM');
      expect(result.legalName).toBe('Acme SA de CV');
      expect(result.companyRfc).toBe('ACM200115XX1');
    });

    it('should persist PM without corporate fields and still default status PENDING_DOCUMENTS', async () => {
      const dto: CreateMortgageCaseDto = {
        clientId: '9f12fd26-c5f9-4eca-91b8-0235828f6ee4',
        creditTypeId: 2,
        personType: 'PM',
      };
      const advisorId = 'advisor-pm-empty';

      mockPrismaService.caseStatus.findUnique.mockResolvedValue({ id: 1, code: 'PENDING_DOCUMENTS' });
      mockPrismaService.client.findUnique.mockResolvedValue({ id: dto.clientId });
      mockPrismaService.creditType.findUnique.mockResolvedValue({ id: dto.creditTypeId });
      mockPrismaService.mortgageCase.create.mockResolvedValue({
        id: 'mc-pm-2',
        ...dto,
        advisorId,
        statusId: 1,
        personType: 'PM',
      });

      await service.create(dto, advisorId);

      expect(mockPrismaService.mortgageCase.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            personType: 'PM',
            statusId: 1,
          }),
        }),
      );
      const createData = mockPrismaService.mortgageCase.create.mock.calls[0][0].data;
      expect(createData).not.toHaveProperty('sharePercentage');
      expect(createData).not.toHaveProperty('legalName');
      expect(createData).not.toHaveProperty('companyRfc');
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
          documents: {
            select: {
              id: true,
              documentStatus: true,
              documentType: true,
              processingError: true,
            },
          },
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
          documents: {
            select: {
              id: true,
              documentStatus: true,
              documentType: true,
              processingError: true,
            },
          },
        },
      });
      expect(result).toEqual(row);
    });

    it('should throw NotFoundException when case does not exist', async () => {
      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(null);

      await expect(service.findOne('unknown')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update case fields and return with includes', async () => {
      const caseId = 'mc-1';
      const dto: UpdateMortgageCaseDto = {
        creditTypeId: 3,
        propertyLocation: 'Nueva CABA',
        requestedAmount: 2000000,
        propertyValue: 3000000,
        estimatedTermMonths: 180,
        notes: 'Reevaluado con nueva propiedad',
      };

      const existingCase = { id: caseId, statusId: 1 };
      const creditType = { id: 3, code: 'MEJORA_HIPOTECA', name: 'Mejora Hipoteca', isActive: true };
      const updatedCase = { ...existingCase, ...dto, status: { code: 'PENDING_DOCUMENTS' } };

      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(existingCase);
      mockPrismaService.creditType.findUnique.mockResolvedValue(creditType);
      mockPrismaService.mortgageCase.update.mockResolvedValue(updatedCase);

      const result = await service.update(caseId, dto);

      expect(mockPrismaService.mortgageCase.findUnique).toHaveBeenCalledWith({ where: { id: caseId } });
      expect(mockPrismaService.creditType.findUnique).toHaveBeenCalledWith({ where: { id: dto.creditTypeId } });
      expect(mockPrismaService.mortgageCase.update).toHaveBeenCalledWith({
        where: { id: caseId },
        data: { ...dto },
        include: {
          client: true,
          advisor: true,
          creditType: true,
          status: true,
          documents: {
            select: {
              id: true,
              documentStatus: true,
              documentType: true,
              processingError: true,
            },
          },
        },
      });
      expect(result).toEqual(updatedCase);
    });

    it('should throw NotFoundException when case does not exist', async () => {
      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', { creditTypeId: 2 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when creditType does not exist', async () => {
      mockPrismaService.mortgageCase.findUnique.mockResolvedValue({ id: 'mc-1', statusId: 1 });
      mockPrismaService.creditType.findUnique.mockResolvedValue(null);

      await expect(
        service.update('mc-1', { creditTypeId: 999 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should persist corporate field subset on update without changing personType', async () => {
      const caseId = 'mc-pm-1';
      const dto: UpdateMortgageCaseDto = {
        legalName: 'Nueva Razon Social SA de CV',
        companyRfc: 'NRS210315AA1',
        sharePercentage: 40,
      };
      const existingCase = {
        id: caseId,
        statusId: 1,
        personType: 'PM',
        legalName: null,
        companyRfc: null,
        sharePercentage: null,
      };
      const updatedCase = {
        ...existingCase,
        ...dto,
        personType: 'PM',
      };

      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(existingCase);
      mockPrismaService.mortgageCase.update.mockResolvedValue(updatedCase);

      const result = await service.update(caseId, dto);

      expect(mockPrismaService.mortgageCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: caseId },
          data: expect.objectContaining({
            legalName: 'Nueva Razon Social SA de CV',
            companyRfc: 'NRS210315AA1',
            sharePercentage: 40,
          }),
        }),
      );
      const updateData = mockPrismaService.mortgageCase.update.mock.calls[0][0].data;
      expect(updateData).not.toHaveProperty('personType');
      expect(result.personType).toBe('PM');
      expect(result.legalName).toBe('Nueva Razon Social SA de CV');
    });
  });
});
