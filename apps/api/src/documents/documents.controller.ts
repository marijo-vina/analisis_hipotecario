import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
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

@UseGuards(JwtAuthGuard)
@Controller('mortgage-cases/:caseId/documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

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
}
