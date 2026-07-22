import { Controller, Get, Query, UseGuards } from '@nestjs/common';
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

  @Get('banks')
  async findBanks() {
    const data = await this.catalogsService.getBanks();

    return { data };
  }

  @Get('bank-products')
  async findBankProducts(@Query('destination') destination?: string) {
    const data = await this.catalogsService.getBankProducts(destination);

    return { data };
  }
}
