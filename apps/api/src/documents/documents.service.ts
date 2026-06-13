import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { GcsService } from './gcs.service';
import { StoragePathService } from './storage-path.service';

const DOCUMENT_INCLUDE = {
  documentType: true,
  documentStatus: true,
  uploadedBy: true,
};

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storagePathService: StoragePathService,
    private readonly gcsService: GcsService,
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
    return this.prisma.document.create({
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
  }

  async findAllByCase(caseId: string) {
    return this.prisma.document.findMany({
      where: { mortgageCaseId: caseId },
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
}
