import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DocumentAiService } from './document-ai.service';
import { GcsService } from './gcs.service';
import { StoragePathService } from './storage-path.service';

@Module({
  imports: [PrismaModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentAiService, StoragePathService, GcsService],
  exports: [DocumentsService, StoragePathService],
})
export class DocumentsModule {}
