import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateDocumentDto } from './dto/create-document.dto';
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

  @Get()
  async findAllByCase(@Param('caseId') caseId: string) {
    const data = await this.documentsService.findAllByCase(caseId);

    return { data };
  }

  @Get(':documentId')
  async findOneByCase(
    @Param('caseId') caseId: string,
    @Param('documentId') documentId: string,
  ) {
    const data = await this.documentsService.findOneByCase(caseId, documentId);

    return { data };
  }
}
