import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CaseAnalysisService } from './case-analysis.service';
import { IdentityMatchRule } from './rules/identity-match.rule';
import { BankarizationValidationRule } from './rules/bankarization-validation.rule';
import { BankViabilityRule } from './rules/bank-viability.rule';
import { PayrollBankMatchingService } from './services/payroll-bank-matching.service';
import { PagadoraDetectionService } from './services/pagadora-detection.service';

@Module({
  imports: [PrismaModule],
  providers: [
    CaseAnalysisService,
    IdentityMatchRule,
    BankarizationValidationRule,
    BankViabilityRule,
    PayrollBankMatchingService,
    PagadoraDetectionService,
  ],
  exports: [CaseAnalysisService],
})
export class CaseAnalysisModule {}