import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
  forwardRef,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CaseAnalysisService } from '../case-analysis/case-analysis.service';
import { IncomeCalculationService } from './income-calculation.service';
import { SaveConciliationDto } from './dto/save-conciliation.dto';
import { SwitchIncomeSourceDto } from './dto/switch-income-source.dto';

/**
 * Optional body shape for `POST /cases/:caseId/income/calculate`.
 *
 * When omitted (or when `excludedDocumentIds` is undefined) every
 * payroll receipt is included by default. Passing a list of document
 * IDs excludes them from the initial computation — use this when the
 * advisor has deselected receipts in the UI before clicking
 * "Calcular".
 *
 * A plain interface (no class) keeps the call surface small. The
 * global `ValidationPipe` lets the body through untouched since
 * `forbidNonWhitelisted` only affects DTOs with class-validator
 * metadata.
 */
interface CalculateIncomeBody {
  excludedDocumentIds?: string[];
}

/**
 * Body shape for `PATCH /cases/:caseId/income/receipts/:receiptIndex`.
 *
 * `included` mirrors the new checkbox state for the targeted receipt:
 * `true` to include it in averages, `false` to exclude it.
 */
interface ToggleReceiptBody {
  included: boolean;
}

/**
 * REST controller for the admissible-monthly-income calculation
 * (HU-12). Mirrors HU-11's liability-controller pattern. All
 * endpoints require a valid JWT (JwtAuthGuard) and operate on a
 * nested route: `/cases/:caseId/income`.
 *
 * Endpoints:
 *   POST   /calculate                          → 201 (new snapshot)
 *   GET    /company-statements                  → 200 (PM company month rollup)
 *   GET    /latest                              → 200 (most recent snapshot)
 *   PATCH  /receipts/:receiptIndex              → 200 (toggle + new snapshot)
 *   PATCH  /source                              → 200 (PFAE source switch + Phase C)
 *   POST   /confirm                             → 200 (CONFIRMED snapshot)
 */
@UseGuards(JwtAuthGuard)
@Controller('cases/:caseId/income')
export class IncomeCalculationController {
  constructor(
    private readonly incomeService: IncomeCalculationService,
    @Inject(forwardRef(() => CaseAnalysisService))
    private readonly caseAnalysisService: CaseAnalysisService,
  ) {}

  /**
   * POST /cases/:caseId/income/calculate
   *
   * Reads PAYROLL_RECEIPT documents (via the service), computes
   * gross/net averages, and persists an immutable snapshot with
   * `status = CALCULATED`.
   */
  @Post('calculate')
  @HttpCode(201)
  async calculate(
    @Param('caseId') caseId: string,
    @Body() body?: CalculateIncomeBody,
  ) {
    return this.incomeService.calculate(
      caseId,
      body?.excludedDocumentIds ?? [],
    );
  }

  /**
   * GET /cases/:caseId/income/latest
   *
   * Returns the most recent snapshot for the case, or 404 when none
   * has been created yet.
   */
  /**
   * GET /cases/:caseId/income/company-statements
   *
   * Groups cleaned company bank statements and reports whether each
   * month in the window has at least 5 valid deposits. Does not
   * persist a snapshot and does not compute capacity.
   */
  @Get('company-statements')
  async companyStatements(@Param('caseId') caseId: string) {
    return this.incomeService.evaluateCompanyStatements(caseId);
  }

  @Get('latest')
  async getLatest(@Param('caseId') caseId: string) {
    return this.incomeService.getLatest(caseId);
  }

  /**
   * PATCH /cases/:caseId/income/receipts/:receiptIndex
   *
   * Toggles the `included` flag on a single receipt in the latest
   * snapshot, recalculates averages from the remaining included
   * receipts, and persists a NEW immutable snapshot.
   */
  @Patch('receipts/:receiptIndex')
  @HttpCode(200)
  async toggleReceipt(
    @Param('caseId') caseId: string,
    @Param('receiptIndex', ParseIntPipe) receiptIndex: number,
    @Body() body: ToggleReceiptBody,
  ) {
    return this.incomeService.toggleReceipt(
      caseId,
      receiptIndex,
      body.included,
    );
  }

  /**
   * PATCH /cases/:caseId/income/source
   *
   * Clones the latest PFAE bases into a new snapshot with the chosen
   * source, then re-runs Phase C only (copies prior Phase A).
   */
  @Patch('source')
  @HttpCode(200)
  async switchSource(
    @Param('caseId') caseId: string,
    @Body() dto: SwitchIncomeSourceDto,
    @Req() req: { user: { id: string } },
  ) {
    const snapshot = await this.incomeService.switchSource(caseId, dto.source);
    await this.caseAnalysisService.runPhaseC(caseId, req.user.id);
    return snapshot;
  }

  /**
   * POST /cases/:caseId/income/conciliation
   *
   * Persists conciliation results (status, method, reviewStatus) into
   * each document's `processingResults` JSON field. Called after the
   * front-end reconciliation preview runs.
   */
  @Post('conciliation')
  @HttpCode(200)
  async saveConciliation(
    @Param('caseId') caseId: string,
    @Body() dto: SaveConciliationDto,
  ) {
    return this.incomeService.saveConciliation(caseId, dto);
  }
}
