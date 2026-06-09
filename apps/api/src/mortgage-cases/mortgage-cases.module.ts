import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MortgageCasesController } from './mortgage-cases.controller';
import { MortgageCasesService } from './mortgage-cases.service';

@Module({
  imports: [PrismaModule],
  controllers: [MortgageCasesController],
  providers: [MortgageCasesService],
})
export class MortgageCasesModule {}
