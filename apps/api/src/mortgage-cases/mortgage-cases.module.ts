import { Module } from '@nestjs/common';
import { CaseAnalysisModule } from '../case-analysis/case-analysis.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MortgageCasesController } from './mortgage-cases.controller';
import { MortgageCasesService } from './mortgage-cases.service';

@Module({
  imports: [PrismaModule, CaseAnalysisModule],
  controllers: [MortgageCasesController],
  providers: [MortgageCasesService],
})
export class MortgageCasesModule {}
