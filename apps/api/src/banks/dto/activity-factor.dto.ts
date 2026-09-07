import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateActivityFactorDto {
  @IsString()
  nativeLabel: string;

  @IsArray()
  @IsString({ each: true })
  satAliases: string[];

  @IsNumber()
  @Min(0)
  factor: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  factorTaxReturn?: number | null;
}

export class UpdateActivityFactorDto {
  @IsOptional()
  @IsString()
  nativeLabel?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  satAliases?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  factor?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  factorTaxReturn?: number | null;
}
