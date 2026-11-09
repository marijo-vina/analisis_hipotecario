import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CaseStatusCalculatorModule } from '../case-status-calculator/case-status-calculator.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DocumentAiService } from './document-ai.service';
import { GcsService } from './gcs.service';
import { StoragePathService } from './storage-path.service';
import { GeminiService } from './gemini.service';
import { OfficialIdExtractionService } from './official-id-extraction.service';
import { PayrollExtractionService } from './payroll-extraction.service';
import { BankStatementExtractionService } from './bank-statement-extraction.service';
import { BureauGridClient } from './bureau-grid.client';
import { CreditBureauExtractionService } from './credit-bureau-extraction.service';
import { CreditScoreExtractionService } from './credit-score-extraction.service';
import { LayoutFinancialExtractorService } from './layout-financial-extractor.service';
import { CoordinateExtractionService } from './coordinate-extraction.service';
import { CsfExtractionService } from './csf-extraction.service';
import { TaxReturnExtractionService } from './tax-return-extraction.service';
import { ArticlesExtractionService } from './articles-extraction.service';
import { BankStatementCleanerService } from './bank-statement-cleaner.service';

@Module({
  imports: [PrismaModule, CaseStatusCalculatorModule],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    DocumentAiService,
    StoragePathService,
    GcsService,
    GeminiService,
    OfficialIdExtractionService,
    PayrollExtractionService,
    BankStatementExtractionService,
    BankStatementCleanerService,
    BureauGridClient,
    CreditBureauExtractionService,
    CreditScoreExtractionService,
    LayoutFinancialExtractorService,
    CoordinateExtractionService,
    CsfExtractionService,
    TaxReturnExtractionService,
    ArticlesExtractionService,
  ],
  exports: [
    DocumentsService,
    StoragePathService,
    CsfExtractionService,
    TaxReturnExtractionService,
    ArticlesExtractionService,
    BankStatementCleanerService,
  ],
})
export class DocumentsModule {}
