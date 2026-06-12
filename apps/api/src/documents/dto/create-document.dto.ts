import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateDocumentDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  documentTypeId: number;

  @IsString()
  @IsNotEmpty()
  originalName: string;
}
