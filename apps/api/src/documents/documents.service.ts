import { BadGatewayException, BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { QueryDocumentDto } from './dto/query-document.dto';
import { DocumentAiService } from './document-ai.service';
import { OcrLayout } from './document-ai.types';
import { GcsService } from './gcs.service';
import { StoragePathService } from './storage-path.service';
import { CaseStatusCalculatorService } from '../case-status-calculator/case-status-calculator.service';

const DOCUMENT_INCLUDE = {
  documentType: true,
  documentStatus: true,
  uploadedBy: true,
};

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storagePathService: StoragePathService,
    private readonly gcsService: GcsService,
    private readonly documentAiService: DocumentAiService,
    private readonly caseStatusCalculator: CaseStatusCalculatorService,
  ) {}

  async create(caseId: string, advisorId: string, dto: CreateDocumentDto) {
    const mortgageCase = await this.prisma.mortgageCase.findUnique({
      where: { id: caseId },
    });

    if (!mortgageCase) {
      throw new NotFoundException('Mortgage case not found');
    }

    const documentType = await this.prisma.documentType.findUnique({
      where: { id: dto.documentTypeId },
    });

    if (!documentType) {
      throw new BadRequestException('Document type not found');
    }

    if (!documentType.isActive) {
      throw new BadRequestException('Document type is not active');
    }

    const uploadedStatus = await this.prisma.documentStatus.findUnique({
      where: { code: 'UPLOADED' },
    });

    if (!uploadedStatus) {
      throw new NotFoundException('Document status UPLOADED not found');
    }

    return this.prisma.document.create({
      data: {
        mortgageCaseId: caseId,
        documentTypeId: dto.documentTypeId,
        documentStatusId: uploadedStatus.id,
        originalName: dto.originalName,
        uploadedById: advisorId,
      },
      include: DOCUMENT_INCLUDE,
    });
  }

  async uploadAndCreate(
    caseId: string,
    advisorId: string,
    file: Express.Multer.File,
    documentTypeId: number,
  ) {
    // 1. Validate case exists
    const mortgageCase = await this.prisma.mortgageCase.findUnique({
      where: { id: caseId },
    });
    if (!mortgageCase) {
      throw new NotFoundException('Mortgage case not found');
    }

    // 2. Validate documentTypeId exists and isActive
    const documentType = await this.prisma.documentType.findUnique({
      where: { id: documentTypeId },
    });
    if (!documentType) {
      throw new BadRequestException('Document type not found');
    }
    if (!documentType.isActive) {
      throw new BadRequestException('Document type is not active');
    }

    // 3. Validate file.size > 0 — MUST check BEFORE GCS upload
    if (!file.size || file.size === 0) {
      throw new BadRequestException('File is empty');
    }

    // 4. Generate storagePath
    const storagePath = this.storagePathService.buildPath(
      caseId,
      documentType.code,
      file.originalname,
    );

    // 5. Upload to GCS — if throws, NO Document created
    const fileUrl = await this.gcsService.uploadFile(
      storagePath,
      file.buffer,
      file.mimetype,
    );

    // 6. Resolve UPLOADED status
    const uploadedStatus = await this.prisma.documentStatus.findUnique({
      where: { code: 'UPLOADED' },
    });
    if (!uploadedStatus) {
      throw new NotFoundException('Document status UPLOADED not found');
    }

    // 7. Create Document ONLY after GCS succeeds
    const document = await this.prisma.document.create({
      data: {
        mortgageCaseId: caseId,
        documentTypeId: documentType.id,
        documentStatusId: uploadedStatus.id,
        uploadedById: advisorId,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storagePath,
        fileUrl,
      },
      include: DOCUMENT_INCLUDE,
    });

    // 8. Recalculate case status after document upload
    await this.caseStatusCalculator.recalculate(caseId);

    return document;
  }

  async findAllByCase(caseId: string, dto?: QueryDocumentDto) {
    const where: { mortgageCaseId: string; documentStatusId?: number } = {
      mortgageCaseId: caseId,
    };

    if (dto?.documentStatusId) {
      where.documentStatusId = dto.documentStatusId;
    }

    return this.prisma.document.findMany({
      where,
      include: DOCUMENT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneByCase(caseId: string, documentId: string) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: DOCUMENT_INCLUDE,
    });

    if (!document || document.mortgageCaseId !== caseId) {
      throw new NotFoundException('Document not found');
    }

    return document;
  }

  async getSignedUrl(caseId: string, documentId: string): Promise<string> {
    const document = await this.findOneByCase(caseId, documentId);

    if (!document.storagePath) {
      throw new BadRequestException('El documento no tiene un archivo asociado');
    }

    return this.gcsService.generateSignedUrl(document.storagePath);
  }

  async delete(caseId: string, documentId: string): Promise<void> {
    // 1. Find document — 404 if not found or wrong case
    const document = await this.findOneByCase(caseId, documentId);

    // 2. Status gate: only UPLOADED documents are deletable
    if (document.documentStatus.code !== 'UPLOADED') {
      throw new BadRequestException(
        'Solo se pueden eliminar documentos no procesados',
      );
    }

    // 3. Storage path guard
    if (!document.storagePath) {
      throw new BadRequestException(
        'El documento no tiene un archivo asociado',
      );
    }

    // 4. Delete GCS file FIRST — if throws, abort (DB record stays)
    await this.gcsService.deleteFile(document.storagePath);

    // 5. Delete DB record only after GCS succeeds
    await this.prisma.document.delete({ where: { id: documentId } });

    // 6. Recalculate case status after document deletion
    await this.caseStatusCalculator.recalculate(caseId);
  }

  async processDocument(caseId: string, documentId: string, force?: boolean) {
    // 1. Fetch document with status include — 404 if not found or wrong case
    const document = await this.findOneByCase(caseId, documentId);

    // 2. Status gate: reject PROCESSING and PROCESSED
    if (document.documentStatus.code === 'PROCESSING') {
      throw new BadRequestException('Document is already being processed');
    }
    if (!force && document.documentStatus.code === 'PROCESSED') {
      throw new BadRequestException('Document has already been processed');
    }

    // 3. Metadata guard: reject null fileUrl or mimeType
    if (!document.fileUrl) {
      throw new BadRequestException('Document has no file to process');
    }
    if (!document.mimeType) {
      throw new BadRequestException('Document has no MIME type');
    }

    // 4. Resolve status IDs
    const processingStatusId = await this.resolveStatusId('PROCESSING');
    const processedStatusId = await this.resolveStatusId('PROCESSED');
    const ocrErrorStatusId = await this.resolveStatusId('OCR_ERROR');
    const errorStatusId = await this.resolveStatusId('ERROR');

    // 5. Update status to PROCESSING
    await this.prisma.document.update({
      where: { id: documentId },
      data: { documentStatusId: processingStatusId },
    });

    // 6. Call Document AI — extract text + compact layout together
    // (Phase 5 of layout-aware-buro-extraction). extractTextWithLayout
    // returns { ocrText, ocrLayout } from the same Document AI processor;
    // ocrLayout powers the LayoutFinancialExtractor when the feature flag
    // is enabled, and is stored additively alongside ocrText.
    let ocrText: string;
    let ocrLayout: OcrLayout;
    try {
      ({ ocrText, ocrLayout } = await this.documentAiService.extractTextWithLayout(
        document.fileUrl,
        document.mimeType,
      ));
    } catch (aiError) {
      this.logger.error(
        `Document AI processing failed for document ${documentId}: ${(aiError as Error).message}`,
      );
      // Persist OCR_ERROR on document (Document AI / OCR failure)
      try {
        await this.prisma.document.update({
          where: { id: documentId },
          data: {
            processingError: (aiError as Error).message,
            documentStatusId: ocrErrorStatusId,
          },
        });
      } catch (dbError) {
        this.logger.error(
          `Failed to set ERROR status for document ${documentId}: ${(dbError as Error).message}`,
        );
      }
      throw new BadGatewayException('Document processing service unavailable');
    }

    // 7. AI call succeeded — save ocrText, processedAt, status=PROCESSED
    try {
      const result = await this.prisma.document.update({
        where: { id: documentId },
        data: {
          ocrText,
          // Prisma Json fields require an index signature (InputJsonValue);
          // `OcrLayout` is structurally valid JSON but lacks that signature.
          // `as any` matches the established codebase convention for Json
          // field writes (see credit-bureau-extraction.service.ts:457).
          ocrLayout: ocrLayout as any,
          processedAt: new Date(),
          documentStatusId: processedStatusId,
        },
        include: DOCUMENT_INCLUDE,
      });

      // 8. Recalculate case status after successful document processing
      await this.caseStatusCalculator.recalculate(caseId);

      return result;
    } catch (dbError) {
      // 9. CRITICAL: if DB write fails, still attempt to set ERROR status
      this.logger.error(
        `Failed to save PROCESSED state for document ${documentId}: ${(dbError as Error).message}`,
      );
      try {
        await this.prisma.document.update({
          where: { id: documentId },
          data: {
            processingError: (dbError as Error).message,
            documentStatusId: errorStatusId,
          },
        });
      } catch (fallbackError) {
        this.logger.error(
          `CRITICAL: Failed to set ERROR status for document ${documentId}: ${(fallbackError as Error).message}`,
        );
      }
      throw new BadGatewayException('Document processing service unavailable');
    }
  }

  /**
   * Merge coordinate extraction results into Document.extractedData.
   * Uses deep merge: existing keys are preserved, coordinateExtraction is added.
   */
  async patchExtractedData(
    documentId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.document.update({
      where: { id: documentId },
      data: {
        extractedData: data as any,
      },
    });
  }

  private async resolveStatusId(code: string): Promise<number> {
    const status = await this.prisma.documentStatus.findUnique({
      where: { code },
    });

    if (!status) {
      throw new NotFoundException(`Document status ${code} not found`);
    }

    return status.id;
  }
}
