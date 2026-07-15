import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LiabilityCalculationService } from './liability.service';
import { LiabilityController } from './liability.controller';

@Module({
  imports: [PrismaModule],
  controllers: [LiabilityController],
  providers: [LiabilityCalculationService],
  exports: [LiabilityCalculationService],
})
export class LiabilityModule {}