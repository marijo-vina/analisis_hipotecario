import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateMortgageCaseDto {
  @IsUUID()
  clientId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  creditTypeId!: number;

  @IsOptional()
  @IsIn(['SALARIED'])
  personType?: 'SALARIED';

  @IsOptional()
  @IsString()
  propertyLocation?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  requestedAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  propertyValue?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  estimatedTermMonths?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
