import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateDocumentDto } from './dto/create-document.dto';
import { QueryDocumentDto } from './dto/query-document.dto';
import { DocumentsService } from './documents.service';
import { OfficialIdExtractionService } from './official-id-extraction.service';
import { PayrollExtractionService } from './payroll-extraction.service';
import { BankStatementExtractionService } from './bank-statement-extraction.service';
import { CreditBureauExtractionService } from './credit-bureau-extraction.service';
import { CreditScoreExtractionService } from './credit-score-extraction.service';
import { CoordinateExtractionService } from './coordinate-extraction.service';
import { GcsService } from './gcs.service';

@UseGuards(JwtAuthGuard)
@Controller('mortgage-cases/:caseId/documents')
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly officialIdExtractionService: OfficialIdExtractionService,
    private readonly payrollExtractionService: PayrollExtractionService,
    private readonly bankStatementExtractionService: BankStatementExtractionService,
    private readonly creditBureauExtractionService: CreditBureauExtractionService,
    private readonly creditScoreExtractionService: CreditScoreExtractionService,
    private readonly coordinateExtractionService: CoordinateExtractionService,
    private readonly gcsService: GcsService,
  ) {}

  @Post()
  async create(
    @Param('caseId') caseId: string,
    @Body() dto: CreateDocumentDto,
    @Req() req: { user: { id: string } },
  ) {
    const data = await this.documentsService.create(caseId, req.user.id, dto);

    return { data };
  }

  @Post('upload')
  @HttpCode(201)
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: {
      fileSize: (parseInt(process.env.MAX_UPLOAD_SIZE_MB || '10', 10)) * 1024 * 1024,
    },
    fileFilter: (_req, file, callback) => {
      const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
      if (!allowed.includes(file.mimetype)) {
        return callback(
          new BadRequestException(
            `File type not allowed. Allowed: ${allowed.join(', ')}`,
          ),
          false,
        );
      }
      callback(null, true);
    },
  }))
  async upload(
    @Param('caseId') caseId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('documentTypeId', ParseIntPipe) documentTypeId: number,
    @Req() req: { user: { id: string } },
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    const data = await this.documentsService.uploadAndCreate(
      caseId,
      req.user.id,
      file,
      documentTypeId,
    );
    return { data };
  }

  @Get()
  async findAllByCase(
    @Param('caseId') caseId: string,
    @Query() query: QueryDocumentDto,
  ) {
    const data = await this.documentsService.findAllByCase(caseId, query);

    return { data };
  }

  @Get(':documentId/view')
  async viewDocument(
    @Param('caseId') caseId: string,
    @Param('documentId') documentId: string,
  ) {
    const signedUrl = await this.documentsService.getSignedUrl(caseId, documentId);
    return { data: { signedUrl } };
  }

  @Get(':documentId')
  async findOneByCase(
    @Param('caseId') caseId: string,
    @Param('documentId') documentId: string,
  ) {
    const data = await this.documentsService.findOneByCase(caseId, documentId);

    return { data };
  }

  @Delete(':documentId')
  @HttpCode(204)
  async deleteDocument(
    @Param('caseId') caseId: string,
    @Param('documentId') documentId: string,
  ) {
    await this.documentsService.delete(caseId, documentId);
  }

  @Post(':documentId/process')
  @HttpCode(200)
  async processDocument(
    @Param('caseId') caseId: string,
    @Param('documentId') documentId: string,
    @Query('force') force?: string,
  ) {
    const data = await this.documentsService.processDocument(caseId, documentId, force === 'true');
    return { data };
  }

  @Post(':documentId/extract')
  @HttpCode(200)
  async extractOfficialId(
    @Param('caseId') caseId: string,
    @Param('documentId') documentId: string,
  ) {
    const data = await this.officialIdExtractionService.extract(
      caseId,
      documentId,
    );
    return { data };
  }

  @Post(':documentId/extract-payroll')
  @HttpCode(200)
  async extractPayrollReceipt(
    @Param('caseId') caseId: string,
    @Param('documentId') documentId: string,
  ) {
    const data = await this.payrollExtractionService.extract(
      caseId,
      documentId,
    );
    return { data };
  }

  @Post(':documentId/extract-bank-statement')
  @HttpCode(200)
  async extractBankStatement(
    @Param('caseId') caseId: string,
    @Param('documentId') documentId: string,
  ) {
    const data = await this.bankStatementExtractionService.extract(
      caseId,
      documentId,
    );
    return { data };
  }

  @Post(':documentId/extract-bureau')
  @HttpCode(200)
  async extractCreditBureau(
    @Param('caseId') caseId: string,
    @Param('documentId') documentId: string,
  ) {
    const data = await this.creditBureauExtractionService.extract(
      caseId,
      documentId,
    );
    return { data };
  }

  /**
   * PATCH /mortgage-cases/:caseId/documents/:documentId/credits/:creditIndex/payment-due
   *
   * Allows an analyst to confirm or manually override the `paymentDueAmount`
   * of a single credit within an extracted bureau report. The override
   * sets `paymentDueAmountSource = MANUAL` and recalculates
   * `monthlyDebtContribution` for that credit.
   */
  @Patch(':documentId/credits/:creditIndex/payment-due')
  @HttpCode(200)
  async updatePaymentDue(
    @Param('caseId') caseId: string,
    @Param('documentId') documentId: string,
    @Param('creditIndex', ParseIntPipe) creditIndex: number,
    @Body() body: { paymentDueAmountManualOverride?: number; paymentDueAmountConfirmed?: boolean },
  ) {
    const data = await this.creditBureauExtractionService.updatePaymentDue(
      documentId,
      creditIndex,
      body,
    );
    return { data };
  }

  /**
   * PATCH /mortgage-cases/:caseId/documents/:documentId/inquiries
   *
   * Allows an analyst to manually set or confirm the "Consultas 24 meses"
   * value extracted from the bureau report.
   */
  @Patch(':documentId/inquiries')
  @HttpCode(200)
  async updateInquiries(
    @Param('caseId') caseId: string,
    @Param('documentId') documentId: string,
    @Body() body: { inquiries24mManual?: number; inquiries24mConfirmed?: boolean },
  ) {
    const data = await this.creditBureauExtractionService.updateInquiries24m(
      documentId,
      body,
    );
    return { data };
  }

  @Post(':documentId/extract-score')
  @HttpCode(200)
  async extractCreditScore(
    @Param('caseId') caseId: string,
    @Param('documentId') documentId: string,
  ) {
    const data = await this.creditScoreExtractionService.extract(
      caseId,
      documentId,
    );
    return { data };
  }

  /**
   * PATCH /mortgage-cases/:caseId/documents/:documentId/extracted-data
   *
   * Persists a manual correction/edit for an extracted data field.
   */
  @Patch(':documentId/extracted-data')
  @HttpCode(200)
  async updateExtractedDataField(
    @Param('caseId') caseId: string,
    @Param('documentId') documentId: string,
    @Body() body: { label: string; value: string },
  ) {
    const data = await this.documentsService.updateExtractedDataField(
      caseId,
      documentId,
      body.label,
      body.value,
    );
    return { data };
  }

/**
   * DEV-ONLY: Coordinate-based extraction (POC v3.1 integration).
   * Reads the document from GCS, extracts coordinate words via pdfjs-dist,
   * and returns structured credits with band-based payment amounts.
   */
  @Post(':documentId/coordinate-extract')
  @HttpCode(200)
  async coordinateExtract(
    @Param('caseId') caseId: string,
    @Param('documentId') documentId: string,
  ) {
    // Reuse existing extraction flow to get the PDF buffer from GCS
    const doc = await this.documentsService.findOneByCase(caseId, documentId);
    if (!doc || !doc.storagePath) {
      throw new BadRequestException('Document not found or missing storage path.');
    }

    // Read raw PDF bytes from GCS
    const pdfBuffer = await this.gcsService.downloadFile(doc.storagePath);
    const result = await this.coordinateExtractionService.extract(
      pdfBuffer,
      doc.originalName,
    );

    // Persist in extractedData for the UI to consume
    await this.documentsService.patchExtractedData(documentId, {
      coordinateExtraction: {
        extractedAt: new Date().toISOString(),
        sourceFile: result.sourceFile,
        totalPages: result.totalPages,
        columnsDetected: result.columnsDetected,
        credits: result.credits.map((c) => ({
          institution: c.institution,
          paymentDueAmount: c.paymentDueAmount,
          paymentSource: c.paymentSource,
          pastDueAmount: c.pastDueAmount,
          lastPaymentAmount: c.lastPaymentAmount,
          currentBalance: c.currentBalance,
          maxCredit: c.maxCredit,
          creditLimit: c.creditLimit,
        })),
        warnings: result.warnings,
      },
    });

    return { data: result };
  }
}
