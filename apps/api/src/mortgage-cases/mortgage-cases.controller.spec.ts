import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateMortgageCaseDto } from './dto/create-mortgage-case.dto';
import { MortgageCasesController } from './mortgage-cases.controller';
import { MortgageCasesService } from './mortgage-cases.service';

describe('MortgageCasesController', () => {
  let controller: MortgageCasesController;

  const mockMortgageCasesService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MortgageCasesController],
      providers: [
        {
          provide: MortgageCasesService,
          useValue: mockMortgageCasesService,
        },
      ],
    }).compile();

    controller = module.get<MortgageCasesController>(MortgageCasesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should protect all endpoints with JwtAuthGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, MortgageCasesController);

    expect(guards).toEqual([JwtAuthGuard]);
  });

  describe('create', () => {
    it('should send dto and req.user.id to service', async () => {
      const dto: CreateMortgageCaseDto = {
        clientId: '9f12fd26-c5f9-4eca-91b8-0235828f6ee4',
        creditTypeId: 2,
      };
      const req = { user: { id: 'advisor-1' } };
      const created = { id: 'mc-1' };
      mockMortgageCasesService.create.mockResolvedValue(created);

      const result = await controller.create(dto, req);

      expect(result).toEqual(created);
      expect(mockMortgageCasesService.create).toHaveBeenCalledWith(dto, 'advisor-1');
    });
  });

  describe('findAll', () => {
    it('should return paginated list from service', async () => {
      const query = { page: 1, limit: 10 };
      const response = {
        data: [{ id: 'mc-1' }],
        meta: { total: 1, page: 1, limit: 10 },
      };
      mockMortgageCasesService.findAll.mockResolvedValue(response);

      const result = await controller.findAll(query);

      expect(result).toEqual(response);
      expect(mockMortgageCasesService.findAll).toHaveBeenCalledWith(query);
    });
  });

  describe('findOne', () => {
    it('should return case detail from service', async () => {
      const response = { id: 'mc-1' };
      mockMortgageCasesService.findOne.mockResolvedValue(response);

      const result = await controller.findOne('mc-1');

      expect(result).toEqual(response);
      expect(mockMortgageCasesService.findOne).toHaveBeenCalledWith('mc-1');
    });
  });
});
