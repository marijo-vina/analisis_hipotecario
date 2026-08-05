import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CatalogsService {
  constructor(private readonly prisma: PrismaService) {}

  getCreditTypes() {
    return this.prisma.creditType.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
    });
  }

  getCaseStatuses() {
    return this.prisma.caseStatus.findMany({
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
    });
  }

  getDocumentTypes() {
    return this.prisma.documentType.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
    });
  }

  getDocumentStatuses() {
    return this.prisma.documentStatus.findMany({
      orderBy: [{ order: 'asc' }, { id: 'asc' }],
    });
  }

  getBanks() {
    return this.prisma.bank.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
    });
  }

  getBankProducts(destination?: string) {
    return this.prisma.bankPolicy.findMany({
      where: {
        isActive: true,
        ...(destination ? { destination: destination as any } : {}),
        bank: { isActive: true },
      },
      include: { bank: true },
      orderBy: { code: 'asc' },
    });
  }
}
