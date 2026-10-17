import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma';

@Injectable()
export class MachinesRepository {
  constructor(private readonly prisma: PrismaService) {}

  private readonly selectFields = {
    id: true,
    name: true,
    description: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
    productionArea: {
      select: {
        id: true,
        name: true,
      },
    },
  } satisfies Prisma.MachineSelect;

  async findAll(includeInactive = false) {
    return this.prisma.machine.findMany({
      where: includeInactive ? {} : { isActive: true },
      select: this.selectFields,
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string) {
    return this.prisma.machine.findUnique({
      where: { id },
      select: this.selectFields,
    });
  }

  /**
   * Busca por nombre sin distinguir mayúsculas: en áreas de producción se
   * colaron duplicados como «DTF UV» y «dtf uv» por comparar exacto.
   */
  async findByName(name: string, excludeId?: string) {
    return this.prisma.machine.findFirst({
      where: {
        name: { equals: name.trim(), mode: 'insensitive' },
        ...(excludeId && { NOT: { id: excludeId } }),
      },
      select: { id: true, name: true },
    });
  }

  async create(data: Prisma.MachineUncheckedCreateInput) {
    return this.prisma.machine.create({
      data,
      select: this.selectFields,
    });
  }

  async update(id: string, data: Prisma.MachineUncheckedUpdateInput) {
    return this.prisma.machine.update({
      where: { id },
      data,
      select: this.selectFields,
    });
  }
}
