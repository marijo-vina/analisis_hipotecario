import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CaseAnalysisService } from '../case-analysis/case-analysis.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateMortgageCaseDto } from './dto/create-mortgage-case.dto';
import { QueryMortgageCaseDto } from './dto/query-mortgage-case.dto';
import { UpdateMortgageCaseDto } from './dto/update-mortgage-case.dto';
import { MortgageCasesService } from './mortgage-cases.service';

@UseGuards(JwtAuthGuard)
@Controller('mortgage-cases')
export class MortgageCasesController {
  constructor(
    private readonly mortgageCasesService: MortgageCasesService,
    private readonly caseAnalysisService: CaseAnalysisService,
  ) {}

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
  updateViaPatch(
    @Param('id') id: string,
    @Body() dto: UpdateMortgageCaseDto,
  ) {
    return this.mortgageCasesService.update(id, dto);
  }

  /** Triggers a synchronous AnalysisRun for the case. */
  @HttpCode(200)
  @Post(':caseId/analyze')
  analyze(
    @Param('caseId') caseId: string,
    @Req() req: { user: { id: string } },
  ) {
    return this.caseAnalysisService.run(caseId, req.user.id);
  }

  /** Returns the most recent AnalysisRun for the case (or 404 when none exist). */
  @Get(':caseId/analysis/latest')
  async getLatestAnalysis(@Param('caseId') caseId: string) {
    const run = await this.caseAnalysisService.getLatest(caseId);
    if (!run) {
      throw new NotFoundException('No analysis runs found');
    }
    return run;
  }
}
