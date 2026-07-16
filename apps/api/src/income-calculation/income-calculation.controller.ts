import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IncomeCalculationService } from './income-calculation.service';
import { ConfirmIncomeDto } from './dto/confirm-income.dto';

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
 *   GET    /latest                              → 200 (most recent snapshot)
 *   PATCH  /receipts/:receiptIndex              → 200 (toggle + new snapshot)
 *   POST   /confirm                             → 200 (CONFIRMED snapshot)
 */
@UseGuards(JwtAuthGuard)
@Controller('cases/:caseId/income')
export class IncomeCalculationController {
  constructor(private readonly incomeService: IncomeCalculationService) {}

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
   * POST /cases/:caseId/income/confirm
   *
   * Capture manually-confirmed gross/net income and optional
   * observations on the latest snapshot. Persists a NEW snapshot
   * with `status = CONFIRMED` that preserves the calculated
   * averages (confirmed values are stored side-by-side).
   */
  @Post('confirm')
  @HttpCode(200)
  async confirm(
    @Param('caseId') caseId: string,
    @Body() dto: ConfirmIncomeDto,
    @Req() req: { user: { id: string } },
  ) {
    return this.incomeService.confirm(caseId, dto, req.user.id);
  }
}
