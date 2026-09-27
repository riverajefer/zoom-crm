import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma';

@Injectable()
export class SedesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(includeInactive: boolean) {
    return this.prisma.location.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
  }

  async findById(id: string) {
    return this.prisma.location.findUnique({ where: { id } });
  }

  async findByCode(code: string) {
    return this.prisma.location.findUnique({ where: { code } });
  }

  async create(data: Prisma.LocationCreateInput) {
    return this.prisma.location.create({ data });
  }

  async update(id: string, data: Prisma.LocationUpdateInput) {
    return this.prisma.location.update({ where: { id }, data });
  }
}
