import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { Prisma } from '../generated/prisma/client';

@Injectable()
export class ClientsService {
  constructor(private prisma: PrismaService) {}

  private generateFullName(
    firstName: string,
    paternalLastName: string,
    maternalLastName?: string,
  ): string {
    return `${firstName} ${paternalLastName}${maternalLastName ? ` ${maternalLastName}` : ''}`.trim();
  }

  async create(createClientDto: CreateClientDto) {
    const fullName = this.generateFullName(
      createClientDto.firstName,
      createClientDto.paternalLastName,
      createClientDto.maternalLastName,
    );

    try {
      return await this.prisma.client.create({
        data: {
          ...createClientDto,
          fullName,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException('Client with this RFC or Email already exists');
        }
      }
      throw error;
    }
  }

  async findAll(query: { page?: number; limit?: number } = {}) {
    const { page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.client.findMany({
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.client.count(),
    ]);

    return {
      data,
      meta: {
        total,
        page: Number(page),
        limit: Number(limit),
      },
    };
  }

  async findOne(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
    });

    if (!client) {
      throw new NotFoundException(`Client with ID ${id} not found`);
    }

    return client;
  }

  async update(id: string, updateClientDto: UpdateClientDto) {
    let fullName: string | undefined;

    const current = await this.findOne(id);

    if (updateClientDto.firstName || updateClientDto.paternalLastName) {
      fullName = this.generateFullName(
        updateClientDto.firstName ?? current.firstName,
        updateClientDto.paternalLastName ?? current.paternalLastName,
        updateClientDto.maternalLastName ?? current.maternalLastName,
      );
    } else if (updateClientDto.maternalLastName !== undefined) {
      fullName = this.generateFullName(
        current.firstName,
        current.paternalLastName,
        updateClientDto.maternalLastName,
      );
    }

    try {
      return await this.prisma.client.update({
        where: { id },
        data: {
          ...updateClientDto,
          ...(fullName ? { fullName } : {}),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException('Client with this RFC or Email already exists');
        }
      }
      throw error;
    }
  }
}
