import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BanksService } from './banks.service';
import { UpdateBankDto } from './dto/update-bank.dto';
import { UpdatePolicyDto } from './dto/update-policy.dto';
import {
  CreateActivityFactorDto,
  UpdateActivityFactorDto,
} from './dto/activity-factor.dto';
import { ProductDestination } from '../generated/prisma/client';

@UseGuards(JwtAuthGuard)
@Controller('banks')
export class BanksController {
  constructor(private readonly banksService: BanksService) {}

  @Get()
  async findBanks() {
    const data = await this.banksService.findAll();
    return { data };
  }

  @Get(':code')
  async findBank(@Param('code') code: string) {
    const data = await this.banksService.findByCode(code);
    return { data };
  }

  @Patch(':code')
  async updateBank(
    @Param('code') code: string,
    @Body() dto: UpdateBankDto,
  ) {
    const data = await this.banksService.update(code, dto);
    return { data };
  }

  @Patch(':code/policies/:destination')
  async updatePolicy(
    @Param('code') code: string,
    @Param('destination') destination: string,
    @Body() dto: UpdatePolicyDto,
  ) {
    const data = await this.banksService.upsertPolicy(
      code,
      destination as ProductDestination,
      dto,
    );
    return { data };
  }

  @Post(':code/activity-factors')
  async createActivityFactor(
    @Param('code') code: string,
    @Body() dto: CreateActivityFactorDto,
  ) {
    const data = await this.banksService.createActivityFactor(code, dto);
    return { data };
  }

  @Patch(':code/activity-factors/:factorId')
  async updateActivityFactor(
    @Param('code') code: string,
    @Param('factorId') factorId: string,
    @Body() dto: UpdateActivityFactorDto,
  ) {
    const data = await this.banksService.updateActivityFactor(
      code,
      factorId,
      dto,
    );
    return { data };
  }

  @Delete(':code/activity-factors/:factorId')
  async deleteActivityFactor(
    @Param('code') code: string,
    @Param('factorId') factorId: string,
  ) {
    const data = await this.banksService.deleteActivityFactor(code, factorId);
    return { data };
  }
}
