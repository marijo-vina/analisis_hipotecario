import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CaseAnalysisService } from './case-analysis.service';
import { IdentityMatchRule } from './rules/identity-match.rule';

@Module({
  imports: [PrismaModule],
  providers: [CaseAnalysisService, IdentityMatchRule],
  exports: [CaseAnalysisService],
})
export class CaseAnalysisModule {}