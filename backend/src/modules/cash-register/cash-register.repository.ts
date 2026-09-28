import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateCashRegisterDto, UpdateCashRegisterDto } from './dto';

@Injectable()
export class CashRegisterRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.cashRegister.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        _count: {
          select: {
            sessions: {
              where: { status: 'OPEN' },
            },
          },
        },
      },
    });
  }

  async findById(id: string) {
    return this.prisma.cashRegister.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            sessions: {
              where: { status: 'OPEN' },
            },
          },
        },
      },
    });
  }

  async findByName(name: string) {
    return this.prisma.cashRegister.findUnique({ where: { name } });
  }

  async create(dto: CreateCashRegisterDto, locationId: string) {
    return this.prisma.cashRegister.create({
      data: {
        locationId,
        name: dto.name,
        description: dto.description,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateCashRegisterDto) {
    return this.prisma.cashRegister.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async delete(id: string) {
    return this.prisma.cashRegister.delete({ where: { id } });
  }

  async hasOpenSessions(id: string): Promise<boolean> {
    const count = await this.prisma.cashSession.count({
      where: { cashRegisterId: id, status: 'OPEN' },
    });
    return count > 0;
  }
}
