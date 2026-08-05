import {
  IsOptional,
  IsString,
  IsEnum,
  IsNumber,
  IsInt,
  IsBoolean,
  Min,
  Max,
} from 'class-validator';
import { IncomeCriterion } from '../../generated/prisma/client';

export class UpdateBankDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(IncomeCriterion)
  incomeCriterion?: IncomeCriterion;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  debtCommitmentFactor?: number;

  @IsOptional()
  @IsInt()
  @Min(300)
  minimumBureauScore?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
