import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma, WorkOrderStatus, WorkOrderTimeEntryType } from '../../generated/prisma';
import { FilterWorkOrdersDto } from './dto';
import { clampPageSize, MAX_PAGE_SIZE } from '../../common/dto/pagination.dto';
import { LOCATION_SUMMARY_SELECT } from '../../common/constants/location-select';

@Injectable()
export class WorkOrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  private readonly selectFields = {
    id: true,
    workOrderNumber: true,
    status: true,
    locationId: true,
    location: { select: LOCATION_SUMMARY_SELECT },
    fileName: true,
    attachment: {
      select: {
        id: true,
        fileName: true,
        originalName: true,
        mimeType: true,
        size: true,
      },
    },
    attachment2: {
      select: {
        id: true,
        fileName: true,
        originalName: true,
        mimeType: true,
        size: true,
      },
    },
    observations: true,
    createdAt: true,
    updatedAt: true,
    order: {
      select: {
        id: true,
        orderNumber: true,
        status: true,
        deliveryDate: true,
        total: true,
        client: {
          select: {
            id: true,
            name: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    },
    advisor: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    },
    designer: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    },
    expenseOrders: {
      select: {
        id: true,
        ogNumber: true,
        status: true,
        createdAt: true,
        expenseType: {
          select: {
            name: true,
          },
        },
        expenseSubcategory: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc' as const,
      },
    },
    timeEntries: {
      select: {
        id: true,
        entryType: true,
        workedDate: true,
        hoursWorked: true,
        startAt: true,
        endAt: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        workOrderItem: {
          select: {
            id: true,
            productDescription: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc' as const,
      },
    },
    items: {
      select: {
        id: true,
        productDescription: true,
        observations: true,
        orderItem: {
          select: {
            id: true,
            description: true,
            quantity: true,
            unitPrice: true,
            total: true,
          },
        },
        productionAreas: {
          select: {
            productionArea: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        supplies: {
          select: {
            id: true,
            quantity: true,
            notes: true,
            supply: {
              select: {
                id: true,
                name: true,
                sku: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'asc' as const,
      },
    },
  };

  async findAll(
    filters: Omit<FilterWorkOrdersDto, 'createdAtFrom' | 'createdAtTo'> & {
      createdAtFrom?: Date;
      createdAtTo?: Date;
    },
  ) {
    const {
      status,
      orderId,
      search,
      createdAtFrom,
      createdAtTo,
      page = 1,
      limit = 20,
    } = filters;
    const take = clampPageSize(limit, 20, MAX_PAGE_SIZE);
    const skip = (page - 1) * take;

    const where: Record<string, unknown> = {};

    if (status) {
      where.status = status;
    }

    if (orderId) {
      where.orderId = orderId;
    }

    if (createdAtFrom || createdAtTo) {
      const createdAt: Record<string, Date> = {};
      if (createdAtFrom) createdAt.gte = createdAtFrom;
      if (createdAtTo) createdAt.lte = createdAtTo;
      where.createdAt = createdAt;
    }

    if (search) {
      where.OR = [
        { workOrderNumber: { contains: search, mode: 'insensitive' } },
        {
          order: {
            client: { name: { contains: search, mode: 'insensitive' } },
          },
        },
        {
          order: {
            orderNumber: { contains: search, mode: 'insensitive' },
          },
        },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.workOrder.findMany({
        where,
        select: this.selectFields,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.workOrder.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit: take,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  async findById(id: string) {
    return this.prisma.workOrder.findUnique({
      where: { id },
      select: this.selectFields,
    });
  }

  async create(data: {
    workOrderNumber: string;
    orderId: string;
    advisorId: string;
    /** Sede de la OP de la que nace (docs/PLAN_SEDES.md §2). */
    locationId: string;
    designerId?: string;
    fileName?: string;
    attachmentId?: string;
    observations?: string;
    status: WorkOrderStatus;
    items: Array<{
      orderItemId: string;
      productDescription: string;
      observations?: string;
      productionAreaIds?: string[];
      supplies?: Array<{
        supplyId: string;
        quantity?: number;
        notes?: string;
      }>;
    }>;
  }) {
    const { items, ...workOrderData } = data;

    return this.prisma.workOrder.create({
      data: {
        ...workOrderData,
        items: {
          create: items.map((item) => ({
            orderItemId: item.orderItemId,
            productDescription: item.productDescription,
            observations: item.observations,
            productionAreas: item.productionAreaIds?.length
              ? {
                  create: item.productionAreaIds.map((productionAreaId) => ({
                    productionAreaId,
                  })),
                }
              : undefined,
            supplies: item.supplies?.length
              ? {
                  create: item.supplies.map((supply) => ({
                    supplyId: supply.supplyId,
                    quantity: supply.quantity,
                    notes: supply.notes,
                  })),
                }
              : undefined,
          })),
        },
      },
      select: this.selectFields,
    });
  }

  async update(
    id: string,
    data: {
      designerId?: string | null;
      fileName?: string | null;
      attachmentId?: string | null;
      observations?: string | null;
    },
  ) {
    return this.prisma.workOrder.update({
      where: { id },
      data,
      select: this.selectFields,
    });
  }

  async updateStatus(id: string, status: WorkOrderStatus) {
    return this.prisma.workOrder.update({
      where: { id },
      data: { status },
      select: this.selectFields,
    });
  }

  async delete(id: string) {
    return this.prisma.workOrder.delete({ where: { id } });
  }

  async findItemById(workOrderId: string, workOrderItemId: string) {
    return this.prisma.workOrderItem.findFirst({
      where: {
        id: workOrderItemId,
        workOrderId,
      },
    });
  }

  async updateItem(
    itemId: string,
    data: {
      productDescription?: string;
      observations?: string;
      productionAreaIds?: string[];
      supplies?: Array<{
        supplyId: string;
        quantity?: number;
        notes?: string;
      }>;
    },
  ) {
    const { productionAreaIds, supplies, ...itemData } = data;

    return this.prisma.$transaction(async (tx) => {
      if (productionAreaIds !== undefined) {
        await tx.workOrderItemProductionArea.deleteMany({
          where: { workOrderItemId: itemId },
        });
        if (productionAreaIds.length > 0) {
          await tx.workOrderItemProductionArea.createMany({
            data: productionAreaIds.map((productionAreaId) => ({
              workOrderItemId: itemId,
              productionAreaId,
            })),
          });
        }
      }

      if (supplies !== undefined) {
        await tx.workOrderItemSupply.deleteMany({
          where: { workOrderItemId: itemId },
        });
        if (supplies.length > 0) {
          await tx.workOrderItemSupply.createMany({
            data: supplies.map((supply) => ({
              workOrderItemId: itemId,
              supplyId: supply.supplyId,
              quantity: supply.quantity,
              notes: supply.notes,
            })),
          });
        }
      }

      return tx.workOrderItem.update({
        where: { id: itemId },
        data: itemData,
      });
    });
  }

  async addSupplyToItem(
    workOrderItemId: string,
    data: {
      supplyId: string;
      quantity?: number;
      notes?: string;
    },
  ) {
    return this.prisma.workOrderItemSupply.upsert({
      where: {
        workOrderItemId_supplyId: {
          workOrderItemId,
          supplyId: data.supplyId,
        },
      },
      create: {
        workOrderItemId,
        supplyId: data.supplyId,
        quantity: data.quantity,
        notes: data.notes,
      },
      update: {
        quantity: data.quantity,
        notes: data.notes,
      },
      include: {
        supply: {
          select: { id: true, name: true, sku: true },
        },
      },
    });
  }

  async removeSupplyFromItem(workOrderItemId: string, supplyId: string) {
    return this.prisma.workOrderItemSupply.delete({
      where: {
        workOrderItemId_supplyId: {
          workOrderItemId,
          supplyId,
        },
      },
    });
  }

  async createTimeEntry(data: {
    workOrderId: string;
    workOrderItemId?: string;
    userId: string;
    entryType: WorkOrderTimeEntryType;
    workedDate: Date;
    hoursWorked: Prisma.Decimal;
    startAt?: Date;
    endAt?: Date;
    notes?: string;
  }) {
    return this.prisma.workOrderTimeEntry.create({
      data: {
        workOrderId: data.workOrderId,
        workOrderItemId: data.workOrderItemId,
        userId: data.userId,
        entryType: data.entryType,
        workedDate: data.workedDate,
        hoursWorked: data.hoursWorked,
        startAt: data.startAt,
        endAt: data.endAt,
        notes: data.notes,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        workOrderItem: {
          select: {
            id: true,
            productDescription: true,
          },
        },
      },
    });
  }

  async findTimeEntryById(workOrderId: string, timeEntryId: string) {
    return this.prisma.workOrderTimeEntry.findFirst({
      where: {
        id: timeEntryId,
        workOrderId,
      },
    });
  }

  async updateTimeEntry(
    timeEntryId: string,
    data: {
      workOrderItemId?: string | null;
      entryType?: WorkOrderTimeEntryType;
      workedDate?: Date;
      hoursWorked?: Prisma.Decimal;
      startAt?: Date | null;
      endAt?: Date | null;
      notes?: string | null;
    },
  ) {
    return this.prisma.workOrderTimeEntry.update({
      where: { id: timeEntryId },
      data,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        workOrderItem: {
          select: {
            id: true,
            productDescription: true,
          },
        },
      },
    });
  }
}
