import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

@UseGuards(JwtAuthGuard)
@Controller('banks')
export class BanksController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async findBanks() {
    const data = await this.prisma.bank.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
    });

    return { data };
  }
}
