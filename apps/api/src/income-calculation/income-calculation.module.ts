import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CaseAnalysisModule } from '../case-analysis/case-analysis.module';
import { IncomeCalculationService } from './income-calculation.service';
import { IncomeCalculationController } from './income-calculation.controller';

@Module({
  imports: [PrismaModule, forwardRef(() => CaseAnalysisModule)],
  controllers: [IncomeCalculationController],
  providers: [IncomeCalculationService],
  exports: [IncomeCalculationService],
})
export class IncomeCalculationModule {}
