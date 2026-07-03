import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DocumentAiService } from './document-ai.service';
import { GcsService } from './gcs.service';
import { StoragePathService } from './storage-path.service';
import { GeminiService } from './gemini.service';
import { OfficialIdExtractionService } from './official-id-extraction.service';
import { PayrollExtractionService } from './payroll-extraction.service';
import { BankStatementExtractionService } from './bank-statement-extraction.service';
import { CreditBureauExtractionService } from './credit-bureau-extraction.service';
import { CreditScoreExtractionService } from './credit-score-extraction.service';

@Module({
  imports: [PrismaModule],
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
    CreditBureauExtractionService,
    CreditScoreExtractionService,
  ],
  exports: [DocumentsService, StoragePathService],
})
export class DocumentsModule {}
