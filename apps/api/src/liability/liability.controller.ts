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
import { mapBureauCreditToInput, mapCompanyBureauCredit } from './credit-mapper';

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
    const mortgageCase = await this.loadBureauCase(caseId);

    if (mortgageCase.personType === 'PM') {
      const shareholder = this.creditsForOwner(mortgageCase.documents, 'SHAREHOLDER').map(
        mapBureauCreditToInput,
      );
      const company = this.creditsForOwner(mortgageCase.documents, 'COMPANY').map(
        mapCompanyBureauCredit,
      );
      if (shareholder.length === 0 && company.length === 0) {
        throw new NotFoundException(
          'No se encontraron créditos extraídos del reporte de buró para este caso',
        );
      }
      const share =
        mortgageCase.sharePercentage == null
          ? null
          : Number(mortgageCase.sharePercentage);
      return this.liabilityService.calculatePersonaMoral(
        caseId,
        shareholder,
        company,
        Number.isFinite(share) ? share : null,
      );
    }

    const credits = this.creditsFromLatest(mortgageCase.documents).map(mapBureauCreditToInput);

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
      ...(dto.reason !== undefined && { reason: dto.reason }),
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

  private async loadBureauCase(caseId: string) {
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

    return mortgageCase;
  }

  /** Latest bureau for one owner. A missing owner counts as SHAREHOLDER. */
  private creditsForOwner(
    documents: Array<{
      owner?: string | null;
      extractedData: unknown;
    }>,
    owner: 'SHAREHOLDER' | 'COMPANY',
  ): Record<string, unknown>[] {
    const match = documents.find((doc) => {
      const docOwner = doc.owner === 'COMPANY' ? 'COMPANY' : 'SHAREHOLDER';
      return docOwner === owner;
    });
    return this.readCredits(match?.extractedData);
  }

  /** Documents are ordered newest first. */
  private creditsFromLatest(
    documents: Array<{ extractedData: unknown }>,
  ): Record<string, unknown>[] {
    return this.readCredits(documents[0]?.extractedData);
  }

  private readCredits(extractedData: unknown): Record<string, unknown>[] {
    const data = extractedData as { credits?: unknown } | null | undefined;
    return Array.isArray(data?.credits)
      ? (data.credits as Record<string, unknown>[])
      : [];
  }
}