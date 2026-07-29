import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CaseStatusCalculatorService } from './case-status-calculator.service';

@Module({
  imports: [PrismaModule],
  providers: [CaseStatusCalculatorService],
  exports: [CaseStatusCalculatorService],
})
export class CaseStatusCalculatorModule {}
