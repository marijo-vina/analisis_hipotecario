import { Module } from '@nestjs/common';
import { BanksController } from './banks.controller';
import { BanksService } from './banks.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [BanksController],
  providers: [BanksService],
})
export class BanksModule {}
