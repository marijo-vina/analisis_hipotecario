import { IsIn } from 'class-validator';
import type { IncomeSource } from '../income-calculation.types';

export class SwitchIncomeSourceDto {
  @IsIn(['BANK_STATEMENTS', 'TAX_RETURN'])
  source!: Exclude<IncomeSource, 'PAYROLL'>;
}
