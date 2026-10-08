import { Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const COMPANY_RFC_PATTERN =
  /^[A-Z&Ñ]{3}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[A-Z0-9]{3}$/;

export abstract class MortgageCaseCorporateFieldsDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100)
  sharePercentage?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  incorporationDate?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  shareTenureMonths?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  legalName?: string;

  @IsOptional()
  @IsString()
  @Matches(COMPANY_RFC_PATTERN)
  companyRfc?: string;
}
