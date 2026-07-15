import { IsNumber, IsOptional, IsString } from 'class-validator';

/**
 * DTO for `POST /cases/:caseId/liability/calculate`.
 *
 * The endpoint extracts credit data from the case's CREDIT_BUREAU_REPORT
 * document(s), so the body is optional. When provided, `factorUsed` lets
 * the caller override the default 0.06 (6%) factor used in the
 * `REVOLVING = MAX(balance × factor, payment)` rule.
 */
export class CalculateLiabilityDto {
  @IsOptional()
  @IsNumber()
  factorUsed?: number;
}