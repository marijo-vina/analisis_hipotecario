import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMortgageCaseDto } from './dto/create-mortgage-case.dto';
import { QueryMortgageCaseDto } from './dto/query-mortgage-case.dto';
import { UpdateMortgageCaseDto } from './dto/update-mortgage-case.dto';

const MORTGAGE_CASE_INCLUDE = {
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
};

@Injectable()
export class MortgageCasesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateMortgageCaseDto, advisorId: string) {
    const pendingStatus = await this.prisma.caseStatus.findUnique({
      where: { code: 'PENDING_DOCUMENTS' },
    });

    if (!pendingStatus) {
      throw new NotFoundException('Case status PENDING_DOCUMENTS not found');
    }

    const client = await this.prisma.client.findUnique({ where: { id: dto.clientId } });
    if (!client) {
      throw new NotFoundException(`Client with ID ${dto.clientId} not found`);
    }

    const creditType = await this.prisma.creditType.findUnique({ where: { id: dto.creditTypeId } });
    if (!creditType) {
      throw new NotFoundException(`CreditType with ID ${dto.creditTypeId} not found`);
    }

    return this.prisma.mortgageCase.create({
      data: {
        ...dto,
        advisorId,
        statusId: pendingStatus.id,
        personType: dto.personType ?? 'SALARIED',
      },
      include: MORTGAGE_CASE_INCLUDE,
    });
  }

  async findAll(query: QueryMortgageCaseDto = {}) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 10);
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.mortgageCase.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: MORTGAGE_CASE_INCLUDE,
      }),
      this.prisma.mortgageCase.count(),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
      },
    };
  }

  async findOne(id: string) {
    const mortgageCase = await this.prisma.mortgageCase.findUnique({
      where: { id },
      include: MORTGAGE_CASE_INCLUDE,
    });

    if (!mortgageCase) {
      throw new NotFoundException(`Mortgage case with ID ${id} not found`);
    }

    return mortgageCase;
  }

  async update(id: string, dto: UpdateMortgageCaseDto) {
    const mortgageCase = await this.prisma.mortgageCase.findUnique({ where: { id } });
    if (!mortgageCase) {
      throw new NotFoundException(`Mortgage case with ID ${id} not found`);
    }

    if (dto.creditTypeId != null) {
      const creditType = await this.prisma.creditType.findUnique({ where: { id: dto.creditTypeId } });
      if (!creditType) {
        throw new NotFoundException(`CreditType with ID ${dto.creditTypeId} not found`);
      }
    }

    return this.prisma.mortgageCase.update({
      where: { id },
      data: { ...dto },
      include: MORTGAGE_CASE_INCLUDE,
    });
  }
}
