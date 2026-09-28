import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma';
import { LOCATION_SUMMARY_SELECT } from '../../common/constants/location-select';
import { getRequestLocation, withoutLocationScope } from '../../common/utils/location-context';

@Injectable()
export class ClientsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find all clients with department and city info
   */
  async findAll(
    filters: {
      includeInactive?: boolean;
      createdAtFrom?: Date;
      createdAtTo?: Date;
    } = {},
  ) {
    const { includeInactive = false, createdAtFrom, createdAtTo } = filters;
    const clients = await this.prisma.client.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        ...((createdAtFrom || createdAtTo) && {
          createdAt: {
            ...(createdAtFrom && { gte: createdAtFrom }),
            ...(createdAtTo && { lte: createdAtTo }),
          },
        }),
      },
      select: {
        id: true,
        name: true,
        manager: true,
        phone: true,
        address: true,
        email: true,
        departmentId: true,
        cityId: true,
        personType: true,
        nit: true,
        cedula: true,
        encargado: true,
        landlinePhone: true,
        specialCondition: true,
        // Habilita el método de pago "Descuento por nómina" en la OP. Sin
        // listarlo acá el campo se guarda pero nunca llega al frontend, y la
        // opción no aparecería nunca.
        employeeId: true,
        employee: {
          select: {
            id: true,
            status: true,
            firstName: true,
            firstLastName: true,
          },
        },
        isActive: true,
        advisors: {
          select: {
            advisor: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        createdAt: true,
        updatedAt: true,
        department: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        city: {
          select: {
            id: true,
            name: true,
          },
        },
        orders: {
          where: { balance: { lt: 0 } },
          select: { balance: true }
        }
      },
      orderBy: { name: 'asc' },
    });

    return clients.map(client => {
      const saldoAFavor = client.orders?.reduce((sum, order) => sum + Math.abs(Number(order.balance)), 0) || 0;
      const { orders, ...rest } = client;
      return {
        ...rest,
        saldoAFavor
      };
    });
  }

  /**
   * Find client by ID
   */
  async findById(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        manager: true,
        phone: true,
        address: true,
        email: true,
        departmentId: true,
        cityId: true,
        personType: true,
        nit: true,
        cedula: true,
        encargado: true,
        landlinePhone: true,
        specialCondition: true,
        // Habilita el método de pago "Descuento por nómina" en la OP. Sin
        // listarlo acá el campo se guarda pero nunca llega al frontend, y la
        // opción no aparecería nunca.
        employeeId: true,
        employee: {
          select: {
            id: true,
            status: true,
            firstName: true,
            firstLastName: true,
          },
        },
        isActive: true,
        advisors: {
          select: {
            advisor: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        createdAt: true,
        updatedAt: true,
        department: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        city: {
          select: {
            id: true,
            name: true,
          },
        },
        orders: {
          where: { balance: { lt: 0 } },
          select: { balance: true }
        }
      },
    });

    if (!client) return null;

    const saldoAFavor = client.orders?.reduce((sum, order) => sum + Math.abs(Number(order.balance)), 0) || 0;
    const { orders, ...rest } = client;

    return {
      ...rest,
      saldoAFavor
    };
  }

  /**
   * Find client by email (for uniqueness validation)
   */
  async findByEmail(email: string) {
    return this.prisma.client.findUnique({
      where: { email },
    });
  }

  /**
   * Find client by email excluding a specific ID (for update validation)
   */
  async findByEmailExcludingId(email: string, excludeId: string) {
    return this.prisma.client.findFirst({
      where: {
        email,
        NOT: { id: excludeId },
      },
    });
  }

  /**
   * Proyección mínima de los clientes activos para la detección de duplicados.
   *
   * Se filtra en memoria y no en SQL a propósito: el criterio (tildes, sufijos
   * societarios, dígito de verificación del NIT, placeholders) vive en
   * `normalize.util.ts` y lo comparte el script que genera el reporte de
   * saneamiento. Reimplementarlo en SQL haría que el formulario y el reporte
   * discrepen con el tiempo. Sobre ~1.000 filas de tres columnas el barrido es
   * de milisegundos.
   */
  async findAllForDuplicateCheck(excludeId?: string) {
    return this.prisma.client.findMany({
      where: {
        isActive: true,
        ...(excludeId && { NOT: { id: excludeId } }),
      },
      select: {
        id: true,
        name: true,
        nit: true,
        cedula: true,
        advisors: {
          select: {
            advisor: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
                // Solo Zoom: la alerta dice de qué sede es el asesor (docs/PLAN_SEDES.md §5).
                defaultLocation: { select: { code: true, name: true, color: true } },
              },
            },
          },
        },
      },
    });
  }

  /**
   * Create a new client
   */
  async create(data: Prisma.ClientCreateInput) {
    return this.prisma.client.create({
      data,
      select: {
        id: true,
        name: true,
        manager: true,
        phone: true,
        address: true,
        email: true,
        departmentId: true,
        cityId: true,
        personType: true,
        nit: true,
        cedula: true,
        encargado: true,
        landlinePhone: true,
        specialCondition: true,
        // Habilita el método de pago "Descuento por nómina" en la OP. Sin
        // listarlo acá el campo se guarda pero nunca llega al frontend, y la
        // opción no aparecería nunca.
        employeeId: true,
        employee: {
          select: {
            id: true,
            status: true,
            firstName: true,
            firstLastName: true,
          },
        },
        isActive: true,
        advisors: {
          select: {
            advisor: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        createdAt: true,
        updatedAt: true,
        department: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        city: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  /**
   * Update a client
   */
  async update(id: string, data: Prisma.ClientUpdateInput) {
    return this.prisma.client.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        manager: true,
        phone: true,
        address: true,
        email: true,
        departmentId: true,
        cityId: true,
        personType: true,
        nit: true,
        cedula: true,
        encargado: true,
        landlinePhone: true,
        specialCondition: true,
        // Habilita el método de pago "Descuento por nómina" en la OP. Sin
        // listarlo acá el campo se guarda pero nunca llega al frontend, y la
        // opción no aparecería nunca.
        employeeId: true,
        employee: {
          select: {
            id: true,
            status: true,
            firstName: true,
            firstLastName: true,
          },
        },
        isActive: true,
        advisors: {
          select: {
            advisor: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        createdAt: true,
        updatedAt: true,
        department: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        city: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  /**
   * Update only the special condition field
   */
  /**
   * Ficha de empleado con el cliente que ya la esté usando, si lo hay.
   * `clientProfile` es la relación inversa del `employeeId @unique` de Client.
   */
  async findEmployeeWithClient(employeeId: string) {
    return this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        status: true,
        clientProfile: { select: { id: true, name: true } },
      },
    });
  }

  async updateSpecialCondition(id: string, specialCondition: string | null) {
    return this.prisma.client.update({
      where: { id },
      data: { specialCondition },
      select: {
        id: true,
        name: true,
        specialCondition: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Hard delete a client (use soft delete in service instead)
   */
  async delete(id: string) {
    return this.prisma.client.delete({
      where: { id },
    });
  }

  /**
   * Fetch all client emails (for bulk uniqueness check)
   */
  async findAllEmails(): Promise<string[]> {
    const clients = await this.prisma.client.findMany({
      select: { email: true },
      where: { email: { not: null } },
    });
    return clients.map((c) => c.email as string);
  }

  /**
   * Find user by ID including their role permissions (for advisor assignment check).
   */
  async findUserWithPermissions(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: {
          include: {
            permissions: { include: { permission: true } },
          },
        },
      },
    });
  }

  /**
   * Get consolidated financial stats + order history for a client
   */
  /**
   * Los clientes son comunes a las sedes: quien puede ver las otras sedes
   * (`read_other_locations`, o el admin con `view_all_locations`) recibe las
   * OP y COT de todas, cada una con su sede, y la ficha las agrupa. El resto
   * solo las de su sede activa (docs/PLAN_SEDES.md §8).
   */
  async findClientStats(id: string) {
    const location = getRequestLocation();
    const acrossLocations = !!(location?.readOther || location?.viewAll);
    return acrossLocations
      ? withoutLocationScope(() => this.queryClientStats(id))
      : this.queryClientStats(id);
  }

  private async queryClientStats(id: string) {
    const quotes = await this.prisma.quote.findMany({
      where: { clientId: id },
      select: {
        id: true,
        quoteNumber: true,
        quoteDate: true,
        total: true,
        status: true,
        location: { select: LOCATION_SUMMARY_SELECT },
      },
      orderBy: { quoteDate: 'desc' },
    });

    const orders = await this.prisma.order.findMany({
      where: { clientId: id },
      select: {
        location: { select: LOCATION_SUMMARY_SELECT },
        id: true,
        orderNumber: true,
        orderDate: true,
        total: true,
        paidAmount: true,
        balance: true,
        status: true,
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { orderDate: 'desc' },
    });

    let totalPurchased = 0;
    let pendingBalance = 0;
    let pendingOrdersCount = 0;
    let saldoAFavor = 0;
    let lastOrderDate: Date | null = null;

    for (const order of orders) {
      const total = Number(order.total);
      const balance = Number(order.balance);

      totalPurchased += total;

      if (balance > 0) {
        pendingBalance += balance;
        pendingOrdersCount++;
      } else if (balance < 0) {
        saldoAFavor += Math.abs(balance);
      }

      const orderDate = new Date(order.orderDate);
      if (!lastOrderDate || orderDate > lastOrderDate) {
        lastOrderDate = orderDate;
      }
    }

    return {
      totalPurchased,
      pendingBalance,
      pendingOrdersCount,
      saldoAFavor,
      lastOrderDate,
      orders: orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        orderDate: o.orderDate,
        total: Number(o.total),
        paidAmount: Number(o.paidAmount),
        balance: Number(o.balance),
        status: o.status,
        advisor: o.createdBy,
        location: o.location,
      })),
      quotes: quotes.map((q) => ({
        id: q.id,
        quoteNumber: q.quoteNumber,
        quoteDate: q.quoteDate,
        total: Number(q.total),
        status: q.status,
        location: q.location,
      })),
    };
  }

  /**
   * Create multiple clients inside a transaction.
   * Uses individual create() calls to preserve audit log extensions.
   */
  async createMany(clients: Array<{
    name: string;
    email?: string | null;
    phone: string;
    personType: import('../../generated/prisma').PersonType;
    departmentId: string;
    cityId: string;
    nit: string | null;
    cedula: string | null;
    manager: string | null;
    encargado: string | null;
    landlinePhone: string | null;
    address: string | null;
  }>) {
    return this.prisma.$transaction(async (tx) => {
      for (const client of clients) {
        await tx.client.create({ data: client });
      }
    });
  }
}
