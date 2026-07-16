import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { IncomeCalculationService } from './income-calculation.service';
import { IncomeCalculationController } from './income-calculation.controller';

@Module({
  imports: [PrismaModule],
  controllers: [IncomeCalculationController],
  providers: [IncomeCalculationService],
  exports: [IncomeCalculationService],
})
export class IncomeCalculationModule {}
