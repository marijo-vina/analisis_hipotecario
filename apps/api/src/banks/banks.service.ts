import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProductDestination } from '../generated/prisma/client';

const ALL_DESTINATIONS: ProductDestination[] = [
  ProductDestination.ACQUISITION,
  ProductDestination.LIQUIDITY,
  ProductDestination.MORTGAGE_REPLACEMENT,
  ProductDestination.TERRENO,
  ProductDestination.CONSTRUCCION,
  ProductDestination.REMODELACION,
];

@Injectable()
export class BanksService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const banks = await this.prisma.bank.findMany({
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

    return banks.map((bank: any) => {
      const { policies = [], _count, ...rest } = bank;
      return {
        ...rest,
        _count: {
          policies: policies.length,
        },
      };
    });
  }

  async findByCode(code: string) {
    const bank = await this.prisma.bank.findUnique({
      where: { code },
      include: {
        policies: true,
      },
    });

    if (!bank) {
      throw new NotFoundException(`Bank with code ${code} not found`);
    }

    // Ensure all 6 standard credit destinations exist in BankPolicy for this bank
    const existingDestinations = new Set((bank.policies || []).map((p) => p.destination));
    const missingDestinations = ALL_DESTINATIONS.filter(
      (dest) => !existingDestinations.has(dest),
    );

    if (missingDestinations.length > 0 && this.prisma.bankPolicy?.create) {
      for (const dest of missingDestinations) {
        await this.prisma.bankPolicy.create({
          data: {
            bankId: bank.id,
            code: `${bank.code}_${dest}`,
            destination: dest,
            isActive: false,
          },
        });
      }
    }

    return this.prisma.bank.findUnique({
      where: { code },
      include: {
        policies: {
          orderBy: { destination: 'asc' },
        },
      },
    });
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
