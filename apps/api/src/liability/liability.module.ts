import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LiabilityCalculationService } from './liability.service';

@Module({
  imports: [PrismaModule],
  providers: [LiabilityCalculationService],
  exports: [LiabilityCalculationService],
})
export class LiabilityModule {}