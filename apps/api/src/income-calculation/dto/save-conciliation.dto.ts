import { IsArray, IsString, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class ConciliationItemDto {
  @IsString() documentId: string;
  @IsString() status: string;
  @IsString() @IsOptional() method?: string;
  @IsString() @IsOptional() reviewStatus?: string;
}

export class SaveConciliationDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => ConciliationItemDto)
  items: ConciliationItemDto[];
}
