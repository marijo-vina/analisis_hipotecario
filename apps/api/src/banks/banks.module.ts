import { Module } from '@nestjs/common';
import { BanksController } from './banks.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [BanksController],
})
export class BanksModule {}
