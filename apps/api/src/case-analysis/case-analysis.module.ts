import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CaseStatusCalculatorModule } from '../case-status-calculator/case-status-calculator.module';
import { CaseAnalysisService } from './case-analysis.service';
import { IdentityMatchRule } from './rules/identity-match.rule';
import { BankarizationValidationRule } from './rules/bankarization-validation.rule';
import { PfaeValidationRule } from './rules/pfae-validation.rule';
import { PmCsfTaxRule } from './rules/pm-csf-tax.rule';
import { PmGatesRule } from './rules/pm-gates.rule';
import { BankViabilityRule } from './rules/bank-viability.rule';
import { PayrollBankMatchingService } from './services/payroll-bank-matching.service';
import { PagadoraDetectionService } from './services/pagadora-detection.service';
import { IncomeCalculationModule } from '../income-calculation/income-calculation.module';
import { LiabilityModule } from '../liability/liability.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => IncomeCalculationModule),
    LiabilityModule,
    CaseStatusCalculatorModule,
  ],
  providers: [
    CaseAnalysisService,
    IdentityMatchRule,
    BankarizationValidationRule,
    PfaeValidationRule,
    PmCsfTaxRule,
    PmGatesRule,
    BankViabilityRule,
    PayrollBankMatchingService,
    PagadoraDetectionService,
  ],
  exports: [CaseAnalysisService],
})
export class CaseAnalysisModule {}