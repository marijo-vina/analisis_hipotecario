import { Injectable } from '@nestjs/common';

@Injectable()
export class StoragePathService {
  buildPath(caseId: string, documentTypeCode: string, filename: string): string {
    return `${caseId}/${documentTypeCode}/${filename}`;
  }
}
