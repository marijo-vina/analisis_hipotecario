import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateMortgageCaseDto } from './dto/create-mortgage-case.dto';
import { QueryMortgageCaseDto } from './dto/query-mortgage-case.dto';
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
}
