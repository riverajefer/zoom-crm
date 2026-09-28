import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ExpenseOrderStatus } from '../../generated/prisma';
import { FilterExpenseOrdersDto } from './dto';
import { clampPageSize, MAX_PAGE_SIZE } from '../../common/dto/pagination.dto';
import { LOCATION_SUMMARY_SELECT } from '../../common/constants/location-select';

@Injectable()
export class ExpenseOrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  private readonly selectFields = {
    id: true,
    ogNumber: true,
    locationId: true,
    location: { select: LOCATION_SUMMARY_SELECT },
    status: true,
    observations: true,
    areaOrMachine: true,
    applyIva: true,
    ivaRate: true,
    retefuenteRate: true,
    reteICARate: true,
    reteIVARate: true,
    electronicInvoiceNumber: true,
    createdAt: true,
    updatedAt: true,
    expenseType: {
      select: { id: true, name: true },
    },
    expenseSubcategory: {
      select: { id: true, name: true },
    },
    workOrder: {
      select: {
        id: true,
        workOrderNumber: true,
        status: true,
        fileName: true,
        observations: true,
        advisor: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        designer: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            deliveryDate: true,
            total: true,
            paidAmount: true,
            balance: true,
            client: { select: { id: true, name: true } },
          },
        },
      },
    },
    authorizedTo: {
      select: { id: true, firstName: true, lastName: true, email: true },
    },
    responsible: {
      select: { id: true, firstName: true, lastName: true, email: true },
    },
    createdBy: {
      select: { id: true, firstName: true, lastName: true, email: true },
    },
    authorizedById: true,
    authorizedAt: true,
    authorizedBy: {
      select: { id: true, firstName: true, lastName: true, email: true },
    },
    cajaAuthorizedById: true,
    cajaAuthorizedAt: true,
    cajaAuthorizedBy: {
      select: { id: true, firstName: true, lastName: true, email: true },
    },
    cajaRejectedById: true,
    cajaRejectedAt: true,
    cajaRejectionReason: true,
    cajaRejectedBy: {
      select: { id: true, firstName: true, lastName: true, email: true },
    },
    items: {
      select: {
        id: true,
        quantity: true,
        name: true,
        description: true,
        unitPrice: true,
        total: true,
        paymentMethod: true,
        bankEntity: true,
        receiptFileId: true,
        referenceFileId: true,
        sortOrder: true,
        supplier: {
          select: { id: true, name: true, email: true },
        },
        productionAreas: {
          select: {
            productionArea: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { sortOrder: 'asc' as const },
    },
  };

  async findAll(
    filters: Omit<FilterExpenseOrdersDto, 'createdAtFrom' | 'createdAtTo'> & {
      createdAtFrom?: Date;
      createdAtTo?: Date;
    },
  ) {
    const {
      status,
      workOrderId,
      expenseTypeId,
      search,
      createdAtFrom,
      createdAtTo,
      page = 1,
      limit = 20,
    } = filters;
    const take = clampPageSize(limit, 20, MAX_PAGE_SIZE);
    const skip = (page - 1) * take;

    const where: Record<string, unknown> = {};

    if (status) where.status = status;
    if (workOrderId) where.workOrderId = workOrderId;
    if (expenseTypeId) where.expenseTypeId = expenseTypeId;

    if (createdAtFrom || createdAtTo) {
      const createdAt: Record<string, Date> = {};
      if (createdAtFrom) createdAt.gte = createdAtFrom;
      if (createdAtTo) createdAt.lte = createdAtTo;
      where.createdAt = createdAt;
    }

    if (search) {
      where.OR = [
        { ogNumber: { contains: search, mode: 'insensitive' } },
        { electronicInvoiceNumber: { contains: search, mode: 'insensitive' } },
        { authorizedTo: { firstName: { contains: search, mode: 'insensitive' } } },
        { authorizedTo: { lastName: { contains: search, mode: 'insensitive' } } },
        { createdBy: { firstName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.expenseOrder.findMany({
        where,
        select: this.selectFields,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.expenseOrder.count({ where }),
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
    return this.prisma.expenseOrder.findUnique({
      where: { id },
      select: this.selectFields,
    });
  }

  /**
   * Busca la OG que ya nació de este formulario. Devuelve la misma forma que
   * `create`, para que la petición gemela de un doble clic reciba una respuesta
   * indistinguible de la original.
   */
  async findByIdempotencyKey(idempotencyKey: string) {
    return this.prisma.expenseOrder.findUnique({
      where: { idempotencyKey },
      select: this.selectFields,
    });
  }

  async create(data: {
    ogNumber: string;
    expenseTypeId: string;
    expenseSubcategoryId: string;
    workOrderId?: string;
    authorizedToId?: string;
    responsibleId?: string;
    observations?: string;
    areaOrMachine?: string;
    applyIva?: boolean;
    ivaRate?: number;
    retefuenteRate?: number;
    reteICARate?: number;
    reteIVARate?: number;
    status: ExpenseOrderStatus;
    createdById: string;
    /** Sede de la OG: una sede o la Matriz (docs/PLAN_SEDES.md §14). */
    locationId: string;
    idempotencyKey?: string;
    authorizedById?: string;
    authorizedAt?: Date;
    items: Array<{
      quantity: number;
      name: string;
      description?: string;
      supplierId?: string;
      unitPrice: number;
      total: number;
      paymentMethod: string;
      bankEntity?: string;
      receiptFileId?: string;
      referenceFileId?: string;
      productionAreaIds?: string[];
      sortOrder: number;
    }>;
  }) {
    const { items, ...orderData } = data;

    return this.prisma.expenseOrder.create({
      data: {
        ...orderData,
        items: {
          create: items.map((item) => ({
            quantity: item.quantity,
            name: item.name,
            description: item.description,
            supplierId: item.supplierId,
            unitPrice: item.unitPrice,
            total: item.total,
            paymentMethod: item.paymentMethod as any,
            bankEntity: item.bankEntity,
            receiptFileId: item.receiptFileId,
            referenceFileId: item.referenceFileId,
            sortOrder: item.sortOrder,
            productionAreas: item.productionAreaIds?.length
              ? {
                  create: item.productionAreaIds.map((productionAreaId) => ({
                    productionAreaId,
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
      expenseTypeId?: string;
      expenseSubcategoryId?: string;
      workOrderId?: string | null;
      authorizedToId?: string;
      responsibleId?: string | null;
      observations?: string;
      areaOrMachine?: string;
      applyIva?: boolean;
      ivaRate?: number;
      retefuenteRate?: number;
      reteICARate?: number;
      reteIVARate?: number;
    },
  ) {
    return this.prisma.expenseOrder.update({
      where: { id },
      data,
      select: this.selectFields,
    });
  }

  async replaceItems(
    expenseOrderId: string,
    items: Array<{
      quantity: number;
      name: string;
      description?: string;
      supplierId?: string;
      unitPrice: number;
      total: number;
      paymentMethod: string;
      bankEntity?: string;
      receiptFileId?: string;
      referenceFileId?: string;
      productionAreaIds?: string[];
      sortOrder: number;
    }>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Delete existing items (cascade will remove productionAreas)
      await tx.expenseOrderItem.deleteMany({ where: { expenseOrderId } });

      // Create new items
      await tx.expenseOrderItem.createMany({
        data: items.map((item) => ({
          expenseOrderId,
          quantity: item.quantity,
          name: item.name,
          description: item.description,
          supplierId: item.supplierId,
          unitPrice: item.unitPrice,
          total: item.total,
          paymentMethod: item.paymentMethod as any,
          bankEntity: item.bankEntity,
          receiptFileId: item.receiptFileId,
          referenceFileId: item.referenceFileId,
          sortOrder: item.sortOrder,
        })),
      });

      // Create production area relations
      const createdItems = await tx.expenseOrderItem.findMany({
        where: { expenseOrderId },
        orderBy: { sortOrder: 'asc' },
      });

      for (let i = 0; i < createdItems.length; i++) {
        const areaIds = items[i]?.productionAreaIds;
        if (areaIds?.length) {
          await tx.expenseOrderItemProductionArea.createMany({
            data: areaIds.map((productionAreaId) => ({
              expenseOrderItemId: createdItems[i].id,
              productionAreaId,
            })),
          });
        }
      }
    });
  }

  async addItem(
    expenseOrderId: string,
    item: {
      quantity: number;
      name: string;
      description?: string;
      supplierId?: string;
      unitPrice: number;
      total: number;
      paymentMethod: string;
      bankEntity?: string;
      receiptFileId?: string;
      referenceFileId?: string;
      productionAreaIds?: string[];
      sortOrder: number;
    },
  ) {
    const created = await this.prisma.expenseOrderItem.create({
      data: {
        expenseOrderId,
        quantity: item.quantity,
        name: item.name,
        description: item.description,
        supplierId: item.supplierId,
        unitPrice: item.unitPrice,
        total: item.total,
        paymentMethod: item.paymentMethod as any,
        bankEntity: item.bankEntity,
        receiptFileId: item.receiptFileId,
        referenceFileId: item.referenceFileId,
        sortOrder: item.sortOrder,
        productionAreas: item.productionAreaIds?.length
          ? {
              create: item.productionAreaIds.map((productionAreaId) => ({
                productionAreaId,
              })),
            }
          : undefined,
      },
    });

    return created;
  }

  async updateStatus(
    id: string,
    status: ExpenseOrderStatus,
    fields?: {
      authorizedById?: string;
      authorizedAt?: Date;
      cajaAuthorizedById?: string;
      cajaAuthorizedAt?: Date;
      cajaRejectedById?: string;
      cajaRejectedAt?: Date;
      cajaRejectionReason?: string;
    },
  ) {
    return this.prisma.expenseOrder.update({
      where: { id },
      data: {
        status,
        ...(fields?.authorizedById       !== undefined && { authorizedById:       fields.authorizedById }),
        ...(fields?.authorizedAt         !== undefined && { authorizedAt:         fields.authorizedAt }),
        ...(fields?.cajaAuthorizedById   !== undefined && { cajaAuthorizedById:   fields.cajaAuthorizedById }),
        ...(fields?.cajaAuthorizedAt     !== undefined && { cajaAuthorizedAt:     fields.cajaAuthorizedAt }),
        ...(fields?.cajaRejectedById     !== undefined && { cajaRejectedById:     fields.cajaRejectedById }),
        ...(fields?.cajaRejectedAt       !== undefined && { cajaRejectedAt:       fields.cajaRejectedAt }),
        ...(fields?.cajaRejectionReason  !== undefined && { cajaRejectionReason:  fields.cajaRejectionReason }),
      },
      select: this.selectFields,
    });
  }

  /**
   * Pasa la OG de ADMIN_AUTHORIZED a AUTHORIZED solo si sigue en ese estado, y
   * dice si lo logró.
   *
   * Es la guarda contra dos autorizaciones de Caja simultáneas: con un `update`
   * simple las dos leían ADMIN_AUTHORIZED y creaban los egresos de caja dos
   * veces. La segunda ahora encuentra la OG ya autorizada y no toca nada.
   */
  async claimCajaAuthorization(id: string, cajaAuthorizedById: string): Promise<boolean> {
    const { count } = await this.prisma.expenseOrder.updateMany({
      where: { id, status: ExpenseOrderStatus.ADMIN_AUTHORIZED },
      data: {
        status: ExpenseOrderStatus.AUTHORIZED,
        cajaAuthorizedById,
        cajaAuthorizedAt: new Date(),
      },
    });
    return count === 1;
  }

  async registerElectronicInvoice(id: string, electronicInvoiceNumber: string) {
    return this.prisma.expenseOrder.update({
      where: { id },
      data: { electronicInvoiceNumber },
      select: this.selectFields,
    });
  }

  async delete(id: string) {
    return this.prisma.expenseOrder.delete({ where: { id } });
  }
}
