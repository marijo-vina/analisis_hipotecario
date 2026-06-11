import { IsString, IsIn } from 'class-validator';

export class UpdateMortgageCaseStatusDto {
  @IsString()
  @IsIn([
    'PENDING_DOCUMENTS',
    'DOCUMENTS_UPLOADED',
    'PROCESSING',
    'DATA_EXTRACTED',
    'IN_REVIEW',
    'REPORT_GENERATED',
    'OBSERVED',
    'CLOSED',
  ])
  statusCode!: string;
}
