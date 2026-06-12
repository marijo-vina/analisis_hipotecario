import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDocumentDto } from './dto/create-document.dto';

const DOCUMENT_INCLUDE = {
  documentType: true,
  documentStatus: true,
  uploadedBy: true,
};

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

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
