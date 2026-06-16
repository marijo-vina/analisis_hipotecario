import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateMortgageCaseDto } from './dto/create-mortgage-case.dto';
import { QueryMortgageCaseDto } from './dto/query-mortgage-case.dto';
import { UpdateMortgageCaseDto } from './dto/update-mortgage-case.dto';
import { UpdateMortgageCaseStatusDto } from './dto/update-mortgage-case-status.dto';
import { MortgageCasesService } from './mortgage-cases.service';

@UseGuards(JwtAuthGuard)
@Controller('mortgage-cases')
export class MortgageCasesController {
  constructor(private readonly mortgageCasesService: MortgageCasesService) {}

  @Post()
  create(
    @Body() createMortgageCaseDto: CreateMortgageCaseDto,
    @Req() req: { user: { id: string } },
  ) {
    return this.mortgageCasesService.create(createMortgageCaseDto, req.user.id);
  }

  @Get()
  findAll(@Query() query: QueryMortgageCaseDto) {
    return this.mortgageCasesService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.mortgageCasesService.findOne(id);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMortgageCaseDto,
  ) {
    return this.mortgageCasesService.update(id, dto);
  }

  @Patch(':id')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateMortgageCaseStatusDto,
  ) {
    return this.mortgageCasesService.updateStatus(id, dto.statusCode);
  }
}
