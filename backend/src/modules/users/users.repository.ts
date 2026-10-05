import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Encuentra todos los usuarios con su rol y cargo
   */
  async findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        phone: true,
        isActive: true,
        mustChangePassword: true,
        roleId: true,
        cargoId: true,
        createdAt: true,
        updatedAt: true,
        firstName: true,
        lastName: true,
        profilePhoto: true,
        defaultLocationId: true,
        locations: {
          select: {
            location: {
              select: { id: true, code: true, name: true, type: true, color: true },
            },
          },
          orderBy: { location: { sortOrder: 'asc' } },
        },
        role: {
          select: {
            id: true,
            name: true,
          },
        },
        cargo: {
          select: {
            id: true,
            name: true,
            productionArea: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Encuentra un usuario por ID con su rol, permisos y cargo
   */
  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        email: true,
        phone: true,
        isActive: true,
        mustChangePassword: true,
        roleId: true,
        cargoId: true,
        createdAt: true,
        updatedAt: true,
        firstName: true,
        lastName: true,
        defaultLocationId: true,
        locations: {
          select: {
            location: {
              select: { id: true, code: true, name: true, type: true, color: true },
            },
          },
          orderBy: { location: { sortOrder: 'asc' } },
        },
        role: {
          select: {
            id: true,
            name: true,
            permissions: {
              select: {
                permission: {
                  select: {
                    id: true,
                    name: true,
                    description: true,
                  },
                },
              },
            },
          },
        },
        cargo: {
          select: {
            id: true,
            name: true,
            description: true,
            productionArea: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        // Datos de nómina (ficha del empleado) si el usuario es empleado
        payrollEmployee: {
          select: {
            id: true,
            employeeType: true,
            monthlySalary: true,
            dailyRate: true,
            startDate: true,
            contractEndDate: true,
            contractType: true,
            status: true,
            notes: true,
            identificationType: true,
            identificationNumber: true,
            documentIssueDate: true,
            firstName: true,
            middleName: true,
            firstLastName: true,
            secondLastName: true,
            sex: true,
            birthDate: true,
            address: true,
            neighborhood: true,
            phone: true,
            email: true,
            eps: true,
            pensionFund: true,
            emergencyContactName: true,
            emergencyContactRelationship: true,
            emergencyContactPhone: true,
            cargo: { select: { id: true, name: true } },
          },
        },
      },
    });
  }

  /**
   * Encuentra un usuario por email
   */
  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        username: true,
        email: true,
        isActive: true,
        password: true,
        roleId: true,
        refreshToken: true,
        firstName: true,
        lastName: true,
      },
    });
  }

  /**
   * Encuentra un usuario por email excluyendo un ID específico
   */
  async findByEmailExcludingId(email: string, excludeId: string) {
    return this.prisma.user.findFirst({
      where: {
        email,
        NOT: { id: excludeId },
      },
    });
  }

  /**
   * Encuentra un usuario por username
   */
  async findByUsername(username: string) {
    return this.prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        email: true,
        isActive: true,
        password: true,
        roleId: true,
        refreshToken: true,
        firstName: true,
        lastName: true,
      },
    });
  }

  /**
   * Encuentra un usuario por username excluyendo un ID específico
   */
  async findByUsernameExcludingId(username: string, excludeId: string) {
    return this.prisma.user.findFirst({
      where: {
        username,
        NOT: { id: excludeId },
      },
    });
  }

  /**
   * Crea un nuevo usuario
   */
  async create(data: Prisma.UserCreateInput) {
    return this.prisma.user.create({
      data,
      select: {
        id: true,
        username: true,
        email: true,
        phone: true,
        isActive: true,
        mustChangePassword: true,
        roleId: true,
        cargoId: true,
        createdAt: true,
        firstName: true,
        lastName: true,
        role: {
          select: {
            id: true,
            name: true,
          },
        },
        cargo: {
          select: {
            id: true,
            name: true,
            productionArea: {
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
   * Actualiza un usuario
   */
  async roleHasPermission(roleId: string, permissionName: string): Promise<boolean> {
    const count = await this.prisma.rolePermission.count({
      where: { roleId, permission: { name: permissionName } },
    });
    return count > 0;
  }

  async countActiveLocations(ids: string[]): Promise<number> {
    return this.prisma.location.count({ where: { id: { in: ids }, isActive: true } });
  }

  /**
   * Reemplaza las sedes permitidas y la predeterminada, en una transacción.
   */
  async setLocations(id: string, locationIds: string[], defaultLocationId: string | null) {
    await this.prisma.$transaction([
      this.prisma.userLocation.deleteMany({ where: { userId: id } }),
      this.prisma.userLocation.createMany({
        data: locationIds.map((locationId) => ({ userId: id, locationId })),
      }),
      this.prisma.user.update({ where: { id }, data: { defaultLocationId } }),
    ]);
    return this.findById(id);
  }

  async update(id: string, data: Prisma.UserUpdateInput) {
    return this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        username: true,
        email: true,
        phone: true,
        isActive: true,
        mustChangePassword: true,
        roleId: true,
        cargoId: true,
        createdAt: true,
        updatedAt: true,
        firstName: true,
        lastName: true,
        role: {
          select: {
            id: true,
            name: true,
          },
        },
        cargo: {
          select: {
            id: true,
            name: true,
            productionArea: {
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
   * Actualiza el refresh token de un usuario
   */
  async updateRefreshToken(id: string, refreshToken: string | null) {
    return this.prisma.user.update({
      where: { id },
      data: { refreshToken },
    });
  }

  /**
   * Desactiva un usuario (soft delete)
   */
  async deactivate(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { isActive: false, refreshToken: null },
      select: {
        id: true,
        username: true,
        email: true,
        phone: true,
        isActive: true,
        mustChangePassword: true,
        roleId: true,
        cargoId: true,
        createdAt: true,
        updatedAt: true,
        firstName: true,
        lastName: true,
        role: {
          select: {
            id: true,
            name: true,
          },
        },
        cargo: {
          select: {
            id: true,
            name: true,
            productionArea: {
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
   * Elimina un usuario
   */
  async delete(id: string) {
    return this.prisma.user.delete({
      where: { id },
    });
  }
}
