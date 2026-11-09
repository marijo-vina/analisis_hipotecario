import { Injectable } from '@nestjs/common';
import { DocumentOwner } from '../generated/prisma/client';

@Injectable()
export class StoragePathService {
  buildPath(
    caseId: string,
    documentTypeCode: string,
    filename: string,
    owner: DocumentOwner = 'SHAREHOLDER',
  ): string {
    if (owner === 'COMPANY') {
      return `${caseId}/COMPANY/${documentTypeCode}/${filename}`;
    }
    return `${caseId}/${documentTypeCode}/${filename}`;
  }
}
