import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProductDestination } from '../generated/prisma/client';

@Injectable()
export class BanksService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.bank.findMany({
      orderBy: { code: 'asc' },
      include: {
        _count: {
          select: { policies: { where: { isActive: true } } },
        },
      },
    });
  }

  async findByCode(code: string) {
    const bank = await this.prisma.bank.findUnique({
      where: { code },
      include: {
        policies: {
          orderBy: { destination: 'asc' },
        },
      },
    });

    if (!bank) {
      throw new NotFoundException(`Bank with code ${code} not found`);
    }

    return bank;
  }

  async update(code: string, data: any) {
    try {
      return await this.prisma.bank.update({
        where: { code },
        data,
      });
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`Bank with code ${code} not found`);
      }
      throw error;
    }
  }

  async upsertPolicy(
    bankCode: string,
    destination: ProductDestination,
    data: any,
  ) {
    const bank = await this.prisma.bank.findUnique({
      where: { code: bankCode },
    });

    if (!bank) {
      throw new NotFoundException(`Bank with code ${bankCode} not found`);
    }

    if (!Object.values(ProductDestination).includes(destination)) {
      throw new BadRequestException(
        `Invalid destination: ${destination}. Must be one of: ${Object.values(ProductDestination).join(', ')}`,
      );
    }

    const policyCode = `${bankCode}_${destination}`;

    return this.prisma.bankPolicy.upsert({
      where: {
        bankId_destination: {
          bankId: bank.id,
          destination,
        },
      },
      create: {
        bankId: bank.id,
        destination,
        code: policyCode,
        ...data,
      },
      update: data,
    });
  }
}
