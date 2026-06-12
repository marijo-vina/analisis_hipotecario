import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { StoragePathService } from './storage-path.service';

@Module({
  imports: [PrismaModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, StoragePathService],
  exports: [DocumentsService, StoragePathService],
})
export class DocumentsModule {}
