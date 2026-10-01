import {
  IsOptional,
  IsNumber,
  IsInt,
  IsBoolean,
  Min,
} from 'class-validator';

export class UpdatePolicyDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  minimumIncome?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minimumPropertyValue?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  minimumEmploymentTenureMonths?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  minimumApplicantAgeMonths?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  maximumApplicationAgeMonths?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  minimumActivityTenureMonths?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minimumIncomePfae?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  minimumApplicantAgeMonthsPfae?: number | null;
}
