import {
  IsString,
  IsNumber,
  IsOptional,
  IsIn,
} from 'class-validator';

/**
 * DTO for `PATCH /cases/:caseId/liability/credits/:creditIndex`.
 *
 * All financial fields are optional — the analyst overrides only what
 * needs correction. `reason` is mandatory (min 10 chars) and is stored
 * as `classificationReason` on the resulting snapshot, providing an
 * audit trail for the manual intervention.
 */
export class OverrideCreditDto {
  @IsOptional()
  @IsIn(['REVOLVING', 'FIXED'])
  creditNature?: string;

  @IsOptional()
  @IsNumber()
  currentBalance?: number;

  @IsOptional()
  @IsNumber()
  paymentDueAmountEffective?: number;

  @IsOptional()
  @IsString()
  reason?: string;
}