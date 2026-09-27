import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma';

@Injectable()
export class PermissionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Nombre del rol, para decidir si ve los permisos reservados. */
  async findRoleName(roleId: string): Promise<string | null> {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      select: { name: true },
    });
    return role?.name ?? null;
  }

  /**
   * Encuentra todos los permisos
   */
  async findAll() {
    return this.prisma.permission.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { roles: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Encuentra un permiso por ID con sus roles
   */
  async findById(id: string) {
    return this.prisma.permission.findUnique({
      where: { id },
      include: {
        roles: {
          include: {
            role: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Encuentra un permiso por nombre
   */
  async findByName(name: string) {
    return this.prisma.permission.findUnique({
      where: { name },
    });
  }

  /**
   * Encuentra un permiso por nombre excluyendo un ID específico
   */
  async findByNameExcludingId(name: string, excludeId: string) {
    return this.prisma.permission.findFirst({
      where: {
        name,
        NOT: { id: excludeId },
      },
    });
  }

  /**
   * Encuentra múltiples permisos por IDs
   */
  async findByIds(ids: string[]) {
    return this.prisma.permission.findMany({
      where: { id: { in: ids } },
    });
  }

  /**
   * Crea un nuevo permiso
   */
  async create(data: Prisma.PermissionCreateInput) {
    return this.prisma.permission.create({
      data,
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
      },
    });
  }

  /**
   * Actualiza un permiso
   */
  async update(id: string, data: Prisma.PermissionUpdateInput) {
    return this.prisma.permission.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Elimina un permiso
   */
  async delete(id: string) {
    return this.prisma.permission.delete({
      where: { id },
    });
  }
}
