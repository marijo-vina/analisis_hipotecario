import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * DTO for `POST /cases/:caseId/income/confirm`.
 *
 * The advisor captures manually confirmed gross/net income values and
 * optional observations. Confirmation does NOT overwrite the calculated
 * averages — both are stored side by side in the immutable snapshot.
 */
export class ConfirmIncomeDto {
  @IsNumber()
  confirmedGrossIncome: number;

  @IsNumber()
  confirmedNetIncome: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observations?: string;
}
