import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CatalogsService } from './catalogs.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class CatalogsController {
  constructor(private readonly catalogsService: CatalogsService) {}

  @Get('credit-types')
  async findCreditTypes() {
    const data = await this.catalogsService.getCreditTypes();

    return { data };
  }

  @Get('case-statuses')
  async findCaseStatuses() {
    const data = await this.catalogsService.getCaseStatuses();

    return { data };
  }

  @Get('document-types')
  async findDocumentTypes() {
    const data = await this.catalogsService.getDocumentTypes();

    return { data };
  }

  @Get('document-statuses')
  async findDocumentStatuses() {
    const data = await this.catalogsService.getDocumentStatuses();

    return { data };
  }
}
