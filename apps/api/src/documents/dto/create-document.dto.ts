import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { DocumentOwner } from '../../generated/prisma/client';

export class CreateDocumentDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  documentTypeId: number;

  @IsString()
  @IsNotEmpty()
  originalName: string;

  @IsOptional()
  @IsEnum(DocumentOwner)
  owner?: DocumentOwner;
}
