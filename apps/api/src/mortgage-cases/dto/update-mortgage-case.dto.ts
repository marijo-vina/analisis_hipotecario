import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';

export class UpdateMortgageCaseDto {
  @Type(() => Number)
  @IsInt({ message: 'El tipo de crédito debe ser un número válido' })
  @IsPositive({ message: 'El tipo de crédito es obligatorio' })
  creditTypeId!: number;

  @IsString()
  @IsOptional()
  propertyLocation?: string;

  @IsNumber()
  @IsPositive({ message: 'El monto solicitado debe ser positivo' })
  @Type(() => Number)
  @IsOptional()
  requestedAmount?: number;

  @IsNumber()
  @IsPositive({ message: 'El valor de la propiedad debe ser positivo' })
  @Type(() => Number)
  @IsOptional()
  propertyValue?: number;

  @IsNumber()
  @Min(1, { message: 'El plazo estimado debe ser mayor a 0' })
  @Type(() => Number)
  @IsOptional()
  estimatedTermMonths?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}
