import { Test, TestingModule } from '@nestjs/testing';
import { ClientsService } from './clients.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';

describe('ClientsService', () => {
  let service: ClientsService;
  let prisma: PrismaService;

  const mockPrismaService = {
    client: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ClientsService>(ClientsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('creation and fullName', () => {
    it('should generate fullName and succeed without optional fields (RFC/CURP)', async () => {
      const dto: CreateClientDto = {
        firstName: 'Juan',
        paternalLastName: 'Perez',
        email: 'juan_no_opts@example.com',
        phone: '1234567890',
      };

      mockPrismaService.client.create.mockResolvedValue({
        id: '1',
        ...dto,
        fullName: 'Juan Perez',
        rfc: null,
        curp: null,
      });

      const result = await service.create(dto);

      expect(result.fullName).toBe('Juan Perez');
      expect(mockPrismaService.client.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          fullName: 'Juan Perez',
        }),
      });
    });

    it('should generate fullName with 3 components (national)', async () => {
      const dto: CreateClientDto = {
        firstName: 'Juan',
        paternalLastName: 'Perez',
        maternalLastName: 'Garcia',
        email: 'juan@example.com',
        phone: '1234567890',
        rfc: 'PEGP800101XYZ',
      };

      mockPrismaService.client.create.mockResolvedValue({
        id: '1',
        ...dto,
        fullName: 'Juan Perez Garcia',
      });

      await service.create(dto);

      expect(mockPrismaService.client.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          fullName: 'Juan Perez Garcia',
        }),
      });
    });

    it('should generate fullName with 2 components (foreign/missing maternal)', async () => {
      const dto: CreateClientDto = {
        firstName: 'John',
        paternalLastName: 'Doe',
        maternalLastName: undefined,
        email: 'john@example.com',
        phone: '1234567890',
      };

      mockPrismaService.client.create.mockResolvedValue({
        id: '2',
        ...dto,
        fullName: 'John Doe',
      });

      await service.create(dto);

      expect(mockPrismaService.client.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          fullName: 'John Doe',
        }),
      });
    });
  });

  describe('update fullName generation', () => {
    it('should update fullName when names change', async () => {
      const id = '1';
      const dto: UpdateClientDto = {
        firstName: 'Juan',
        paternalLastName: 'Perez',
        maternalLastName: 'Lopez',
      };

      mockPrismaService.client.findUnique.mockResolvedValue({
        id,
        firstName: 'Juan',
        paternalLastName: 'Perez',
        maternalLastName: 'Old',
      });

      mockPrismaService.client.update.mockResolvedValue({
        id,
        ...dto,
        fullName: 'Juan Perez Lopez',
      });

      await service.update(id, dto);

      expect(mockPrismaService.client.update).toHaveBeenCalledWith({
        where: { id },
        data: expect.objectContaining({
          fullName: 'Juan Perez Lopez',
        }),
      });
    });
  });

  describe('findAll paginated', () => {
    it('should return paginated data and meta', async () => {
      const clients = [{ id: '1', fullName: 'Juan Perez' }];
      mockPrismaService.client.findMany.mockResolvedValue(clients);
      mockPrismaService.client.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result).toEqual({
        data: clients,
        meta: {
          total: 1,
          page: 1,
          limit: 10,
        },
      });

      expect(mockPrismaService.client.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('error handling', () => {
    it('should throw ConflictException on duplicate email/rfc (create)', async () => {
      const dto: CreateClientDto = {
        firstName: 'Juan',
        paternalLastName: 'Perez',
        email: 'duplicate@example.com',
        phone: '1234567890',
        rfc: 'PEGP800101XYZ',
      };

      const prismaError = new Prisma.PrismaClientKnownRequestError('Message', {
        code: 'P2002',
        clientVersion: '1.0',
        meta: { target: ['email'] },
      });

      mockPrismaService.client.create.mockRejectedValue(prismaError);

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException on duplicate CURP (create)', async () => {
      const dto: CreateClientDto = {
        firstName: 'Juan',
        paternalLastName: 'Perez',
        email: 'juan.curp@example.com',
        phone: '1234567890',
        curp: 'PEGP800101HDFRRN01',
      };

      const prismaError = new Prisma.PrismaClientKnownRequestError('Message', {
        code: 'P2002',
        clientVersion: '1.0',
        meta: { target: ['curp'] },
      });

      mockPrismaService.client.create.mockRejectedValue(prismaError);

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException if client does not exist (update)', async () => {
      const id = 'non-existent';
      const dto: UpdateClientDto = { firstName: 'New' };

      mockPrismaService.client.findUnique.mockResolvedValue(null);

      await expect(service.update(id, dto)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if client does not exist (findOne)', async () => {
      const id = 'non-existent';
      mockPrismaService.client.findUnique.mockResolvedValue(null);

      await expect(service.findOne(id)).rejects.toThrow(NotFoundException);
    });
  });
});
