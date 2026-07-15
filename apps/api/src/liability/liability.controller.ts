import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { LiabilityCalculationService } from './liability.service';
// Local DTO interface (service-level) — distinct from the HTTP DTO
import type { OverrideCreditDto as ServiceOverrideDto } from './liability.service';
import { OverrideCreditDto } from './dto/override-credit.dto';
import type { LiabilityCreditInput } from './liability.types';

/**
 * Maps a raw bureau-extracted credit record to the LiabilityCreditInput
 * shape expected by the calculation service.
 *
 * Bureau `extractedData.credits[].` fields → LiabilityCreditInput:
 *   accountNumber       → creditReference
 *   institution         → institution
 *   creditType          → creditType
 *   classification      → classification (Gemini's call)
 *   status              → status
 *   currentBalance      → currentBalance (nullable)
 *   paymentDueAmount    → paymentDueAmountEffective (nullable)
 *   isClosed            → isClosed
 */
function mapBureauCreditToInput(
  raw: Record<string, unknown>,
): LiabilityCreditInput {
  return {
    creditReference: String(raw.accountNumber ?? raw.creditReference ?? ''),
    institution: String(raw.institution ?? ''),
    creditType: String(raw.creditType ?? ''),
    productName: raw.productName ? String(raw.productName) : undefined,
    classification: String(raw.classification ?? 'UNKNOWN'),
    status: String(raw.status ?? ''),
    currentBalance:
      raw.currentBalance !== null && raw.currentBalance !== undefined
        ? Number(raw.currentBalance)
        : null,
    paymentDueAmountEffective:
      raw.paymentDueAmount !== null && raw.paymentDueAmount !== undefined
        ? Number(raw.paymentDueAmount)
        : null,
    isClosed: Boolean(raw.isClosed ?? false),
  };
}

@UseGuards(JwtAuthGuard)
@Controller('cases/:caseId/liability')
export class LiabilityController {
  constructor(
    private readonly liabilityService: LiabilityCalculationService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * POST /cases/:caseId/liability/calculate
   *
   * Fetches the most recent CREDIT_BUREAU_REPORT document for the case,
   * extracts the `credits` array from its `extractedData`, maps each
   * credit to LiabilityCreditInput, and delegates to the calculation
   * service. Returns the newly created snapshot.
   */
  @Post('calculate')
  @HttpCode(201)
  async calculate(@Param('caseId') caseId: string) {
    const credits = await this.extractCreditsFromCase(caseId);

    if (credits.length === 0) {
      throw new NotFoundException(
        'No se encontraron créditos extraídos del reporte de buró para este caso',
      );
    }

    return this.liabilityService.calculate(caseId, credits);
  }

  /**
   * GET /cases/:caseId/liability/latest
   *
   * Returns the most recent LiabilitySnapshot for the case, or 404
   * when no snapshot exists yet.
   */
  @Get('latest')
  async getLatest(@Param('caseId') caseId: string) {
    const result = await this.liabilityService.getLatest(caseId);
    if (!result) {
      throw new NotFoundException(
        'No se ha calculado el pasivo para este caso aún',
      );
    }
    return result;
  }

  /**
   * PATCH /cases/:caseId/liability/credits/:creditIndex
   *
   * Applies a manual override to a single credit within the latest
   * snapshot, recalculates aggregates, and returns the new snapshot.
   */
  @Patch('credits/:creditIndex')
  @HttpCode(200)
  async overrideCredit(
    @Param('caseId') caseId: string,
    @Param('creditIndex', ParseIntPipe) creditIndex: number,
    @Body() dto: OverrideCreditDto,
  ) {
    const serviceDto: ServiceOverrideDto = {
      reason: dto.reason,
      ...(dto.creditNature !== undefined && {
        creditNature: dto.creditNature as ServiceOverrideDto['creditNature'],
      }),
      ...(dto.currentBalance !== undefined && {
        currentBalance: dto.currentBalance,
      }),
      ...(dto.paymentDueAmountEffective !== undefined && {
        paymentDueAmountEffective: dto.paymentDueAmountEffective,
      }),
    };

    return this.liabilityService.overrideCredit(
      caseId,
      creditIndex,
      serviceDto,
    );
  }

  // ── Private helpers ─────────────────────────────────────────────────

  /**
   * Fetch the case's CREDIT_BUREAU_REPORT documents and extract the
   * `credits` array from the most recent one's `extractedData`.
   */
  private async extractCreditsFromCase(
    caseId: string,
  ): Promise<LiabilityCreditInput[]> {
    const mortgageCase = await this.prisma.mortgageCase.findUnique({
      where: { id: caseId },
      include: {
        documents: {
          where: {
            documentType: { code: 'CREDIT_BUREAU_REPORT' },
          },
          orderBy: { createdAt: 'desc' },
          include: {
            documentType: true,
          },
        },
      },
    });

    if (!mortgageCase) {
      throw new NotFoundException(`Caso hipotecario ${caseId} no encontrado`);
    }

    if (mortgageCase.documents.length === 0) {
      return [];
    }

    const latestBureauDoc = mortgageCase.documents[0];
    const extractedData = latestBureauDoc.extractedData as Record<
      string,
      unknown
    > | null;

    if (!extractedData) {
      return [];
    }

    const rawCredits = (extractedData.credits ??
      []) as unknown as Record<string, unknown>[];

    if (!Array.isArray(rawCredits)) {
      return [];
    }

    return rawCredits.map(mapBureauCreditToInput);
  }
}