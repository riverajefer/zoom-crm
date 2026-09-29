import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma, OrderStatus, EditRequestStatus } from '../../generated/prisma';
import { clampPageSize, MAX_REPORT_PAGE_SIZE } from '../../common/dto/pagination.dto';
import { LOCATION_SUMMARY_SELECT } from '../../common/constants/location-select';

/**
 * Resuelve el filtro de estado. Las pantallas de ventas piden `excludeAnulado`
 * porque una orden anulada no es una venta; un `status` explícito manda sobre
 * la exclusión, de modo que seleccionar "Anulada" en el filtro sigue
 * mostrándolas. Fuente única para que el listado, el resumen y la exportación
 * cuenten siempre el mismo conjunto.
 */
export function buildOrderStatusFilter(
  status?: OrderStatus,
  excludeAnulado?: boolean,
  statuses?: OrderStatus[],
): Prisma.OrderWhereInput['status'] | undefined {
  // Un `status` explícito manda sobre la lista, igual que sobre `excludeAnulado`.
  if (status) return status;
  if (statuses?.length) return { in: statuses };
  if (excludeAnulado) return { not: OrderStatus.ANULADO };
  return undefined;
}

/**
 * Estados en los que la entrega ya ocurrió. `WARRANTY` entra porque una garantía
 * solo existe sobre algo que se entregó, y `DELIVERED_ON_CREDIT` porque se
 * entregó aunque quedara saldo.
 */
export const DELIVERED_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.DELIVERED,
  OrderStatus.DELIVERED_ON_CREDIT,
  OrderStatus.WARRANTY,
];

/**
 * Campos que cubre el buscador de órdenes. Fuente única para que el listado, la
 * exportación a Excel y las tarjetas de totales cuenten siempre el mismo
 * conjunto de órdenes ante el mismo texto de búsqueda.
 */
export function buildOrderSearchFilter(
  search: string,
): Prisma.OrderWhereInput[] {
  return [
    { orderNumber: { contains: search, mode: 'insensitive' } },
    { client: { name: { contains: search, mode: 'insensitive' } } },
    { client: { email: { contains: search, mode: 'insensitive' } } },
    { client: { phone: { contains: search, mode: 'insensitive' } } },
    { notes: { contains: search, mode: 'insensitive' } },
    { electronicInvoiceNumber: { contains: search, mode: 'insensitive' } },
  ];
}

@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  private readonly selectFields = {
    id: true,
    orderNumber: true,
    locationId: true,
    location: { select: LOCATION_SUMMARY_SELECT },
    clientId: true,
    orderDate: true,
    deliveryDate: true,

    // Auditoría de cambios de fecha de entrega
    previousDeliveryDate: true,
    deliveryDateReason: true,
    deliveryDateChangedAt: true,
    deliveryDateChangedBy: true,

    subtotal: true,
    taxRate: true,
    tax: true,
    retefuenteRate: true,
    reteICARate: true,
    reteIVARate: true,
    discountAmount: true,
    total: true,
    paidAmount: true,
    appliedCreditAmount: true,
    refundedAmount: true,
    reversedAmount: true,
    reversedNetAmount: true,
    balance: true,
    advancePaymentStatus: true,
    advancePaymentRejectedReason: true,
    discountApprovalStatus: true,
    advancePaymentApprovals: {
      include: {
        requestedBy: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        reviewedBy: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      }
    },
    refundRequests: {
      // Los dos estados que el detalle de la OP necesita anunciar: la que espera
      // autorización y la que ya se autorizó pero Caja todavía no ha pagado.
      // Filtrar solo por PENDING dejaba la segunda invisible, que es justo la
      // que le dice al usuario que hay plata comprometida sin salir.
      where: {
        OR: [
          { status: 'PENDING' as const },
          { status: 'APPROVED' as const, executedAt: null },
        ],
      },
      select: {
        id: true,
        refundAmount: true,
        reversedAmount: true,
        refundReason: true,
        paymentMethod: true,
        bankEntity: true,
        receiptFileId: true,
        executionReceiptFileId: true,
        observation: true,
        status: true,
        executedAt: true,
        requestedAt: true,
        requestedBy: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: 'desc' as const },
    },
    clientOwnershipAuthStatus: true,
    requiresColorProof: true,
    colorProofPrice: true,
    status: true,
    notes: true,
    notesImageId: true,
    electronicInvoiceNumber: true,
    createdAt: true,
    updatedAt: true,
    commercialChannelId: true,
    commercialChannel: {
      select: {
        id: true,
        name: true,
      },
    },
    client: {
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        personType: true,
        nit: true,
        cedula: true,
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
        orders: {
          where: { balance: { lt: 0 } },
          select: { balance: true }
        }
      },
    },
    createdBy: {
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    },
    items: {
      select: {
        id: true,
        description: true,
        quantity: true,
        unitPrice: true,
        total: true,
        specifications: true,
        sampleImageId: true,
        sortOrder: true,
        productId: true,
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
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
      },
      orderBy: { sortOrder: 'asc' as const },
    },
    payments: {
      select: {
        id: true,
        amount: true,
        paymentMethod: true,
        paymentDate: true,
        reference: true,
        notes: true,
        bankEntity: true,
        receiptFileId: true,
        createdAt: true,
        // Un pago anulado sobrevive en la lista: el Historial de Pagos lo
        // muestra marcado con su motivo en vez de dejar un hueco sin explicar.
        isVoided: true,
        voidedAt: true,
        voidReason: true,
        receivedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        voidedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        // Un pago solo genera movimiento de caja si había una sesión ABIERTA al
        // registrarlo; si no, `cashMovementId` queda null para siempre y el abono
        // nunca aparece en el historial de caja. Exponerlo permite que la
        // exportación marque esos pagos huérfanos para la conciliación bancaria.
        cashMovement: {
          select: {
            receiptNumber: true,
            isVoided: true,
          },
        },
      },
      orderBy: { paymentDate: 'desc' as const },
    },
    discounts: {
      select: {
        id: true,
        amount: true,
        reason: true,
        appliedAt: true,
        appliedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { appliedAt: 'desc' as const },
    },
    workOrders: {
      where: {
        status: { not: 'CANCELLED' as const },
      },
      select: {
        id: true,
        workOrderNumber: true,
        status: true,
      },
      take: 1,
    },
  };

  async findAll(status?: OrderStatus) {
    const where: Prisma.OrderWhereInput = status ? { status } : {};

    const orders = await this.prisma.order.findMany({
      where,
      select: this.selectFields,
      orderBy: { orderDate: 'desc' },
    });

    return orders.map(order => {
      let processedClient: any = order.client;
      if (order.client) {
        const { orders, ...clientRest } = order.client as any;
        const saldoAFavor = orders?.reduce((sum: number, o: any) => sum + Math.abs(Number(o.balance)), 0) || 0;
        processedClient = { ...clientRest, saldoAFavor };
      }
      return { ...order, client: processedClient };
    });
  }

  async findAllWithFilters(filters: {
    status?: OrderStatus;
    statuses?: OrderStatus[];
    search?: string;
    clientId?: string;
    orderDateFrom?: Date;
    orderDateTo?: Date;
    paymentDateFrom?: Date;
    paymentDateTo?: Date;
    page?: number;
    limit?: number;
    excludeWithWorkOrder?: boolean;
    productionAreaId?: string;
    createdById?: string;
    hasBalance?: boolean;
    paymentStatus?: 'PAID' | 'PENDING';
    deliveryStatus?: 'PENDING' | 'DELIVERED';
    advancePaymentStatus?: EditRequestStatus;
    excludeAnulado?: boolean;
  }) {
    const { status, statuses, search, clientId, orderDateFrom, orderDateTo, paymentDateFrom, paymentDateTo, page = 1, limit = 20, excludeWithWorkOrder, productionAreaId, createdById, hasBalance, paymentStatus, deliveryStatus, advancePaymentStatus, excludeAnulado } = filters;

    const where: Prisma.OrderWhereInput = {};

    const statusFilter = buildOrderStatusFilter(status, excludeAnulado, statuses);
    if (statusFilter !== undefined) {
      where.status = statusFilter;
    }

    if (createdById) {
      where.createdById = createdById;
    }

    if (search) {
      where.OR = buildOrderSearchFilter(search);
    }

    if (clientId) {
      where.clientId = clientId;
    }

    if (productionAreaId) {
      where.items = {
        some: {
          productionAreas: {
            some: {
              productionAreaId,
            }
          }
        }
      };
    }

    if (orderDateFrom || orderDateTo) {
      where.orderDate = {};
      if (orderDateFrom) {
        where.orderDate.gte = orderDateFrom;
      }
      if (orderDateTo) {
        where.orderDate.lte = orderDateTo;
      }
    }

    // Filtro por fecha de abono (conciliación bancaria): trae las órdenes con al
    // menos un pago en el rango, sin importar cuándo se creó la orden. Ojo: cada
    // orden sigue devolviendo TODOS sus pagos, así que quien necesite solo los
    // del rango debe filtrarlos también al consumir la respuesta.
    if (paymentDateFrom || paymentDateTo) {
      const paymentDate: Prisma.DateTimeFilter = {};
      if (paymentDateFrom) {
        paymentDate.gte = paymentDateFrom;
      }
      if (paymentDateTo) {
        paymentDate.lte = paymentDateTo;
      }
      where.payments = { some: { paymentDate } };
    }

    if (hasBalance) {
      where.balance = { gt: 0 };
    }

    // El Seguimiento de OP abre el listado desde una celda de «pagadas» o «con
    // saldo»; `hasBalance` solo sabe expresar la segunda.
    if (paymentStatus) {
      where.balance = paymentStatus === 'PENDING' ? { gt: 0 } : { lte: 0 };
    }

    // La columna «Brecha» del Seguimiento de OP necesita expresar «todavía sin
    // entregar», que no es un estado sino la ausencia de varios. Un `status`
    // explícito manda sobre este filtro, igual que con `excludeAnulado`.
    if (deliveryStatus && !status) {
      where.status =
        deliveryStatus === 'DELIVERED'
          ? { in: DELIVERED_ORDER_STATUSES }
          : { notIn: [...DELIVERED_ORDER_STATUSES, OrderStatus.ANULADO] };
    }

    if (advancePaymentStatus) {
      where.advancePaymentStatus = advancePaymentStatus;
    }

    if (excludeWithWorkOrder) {
      where.workOrders = {
        none: {
          status: { not: 'CANCELLED' },
        },
      };
    }

    const take = clampPageSize(limit, 20, MAX_REPORT_PAGE_SIZE);
    const skip = (page - 1) * take;

    const [orders, total, sum] = await Promise.all([
      this.prisma.order.findMany({
        where,
        select: this.selectFields,
        orderBy: { orderDate: 'desc' },
        skip,
        take,
      }),
      this.prisma.order.count({ where }),
      // Subtotal de los filtros: el encabezado de cada sede en la vista
      // "Todas" (docs/PLAN_SEDES.md §6.2).
      this.prisma.order.aggregate({ where, _sum: { total: true } }),
    ]);

    return {
      data: orders.map(order => {
        let processedClient: any = order.client;
        if (order.client) {
          const { orders, advisors, ...clientRest } = order.client as any;
          const saldoAFavor = orders?.reduce((sum: number, o: any) => sum + Math.abs(Number(o.balance)), 0) || 0;
          processedClient = {
            ...clientRest,
            advisors,
            advisorId: advisors?.[0]?.advisor?.id ?? null,
            advisor: advisors?.[0]?.advisor ?? null,
            saldoAFavor,
          };
        }
        return { ...order, client: processedClient };
      }),
      meta: {
        total,
        page,
        limit: take,
        totalPages: Math.ceil(total / take),
        sumTotal: (sum._sum.total ?? 0).toString(),
      },
    };
  }

  async findById(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: this.selectFields,
    });

    if (!order) return null;

    // Qué ítems ya están en una OT. Va en consulta aparte y no dentro de
    // `selectFields` porque ese select lo comparten los listados paginados, que no
    // necesitan el dato y pagarían un join por ítem en cada página. Aquí es una
    // sola consulta sobre el índice `work_order_items.order_item_id`.
    const workOrderLinks = await this.prisma.workOrderItem.findMany({
      where: { orderItem: { orderId: id } },
      select: {
        orderItemId: true,
        workOrder: {
          select: { id: true, workOrderNumber: true, status: true },
        },
      },
    });

    const workOrdersByItem = new Map<string, typeof workOrderLinks[number]['workOrder'][]>();
    for (const link of workOrderLinks) {
      const current = workOrdersByItem.get(link.orderItemId) ?? [];
      current.push(link.workOrder);
      workOrdersByItem.set(link.orderItemId, current);
    }

    const itemsWithWorkOrders = order.items.map((item) => ({
      ...item,
      workOrders: workOrdersByItem.get(item.id) ?? [],
    }));

    order.items = itemsWithWorkOrders as typeof order.items;

    let processedClient: any = order.client;
    if (order.client) {
      const { orders, advisors, ...clientRest } = order.client as any;
      const saldoAFavor = orders?.reduce((sum: number, o: any) => sum + Math.abs(Number(o.balance)), 0) || 0;
      processedClient = {
        ...clientRest,
        advisors,
        advisorId: advisors?.[0]?.advisor?.id ?? null,
        advisor: advisors?.[0]?.advisor ?? null,
        saldoAFavor,
      };
    }

    // Si hay información de cambio de fecha, buscar el usuario que lo hizo
    if (order.deliveryDateChangedBy) {
      const changedByUser = await this.prisma.user.findUnique({
        where: { id: order.deliveryDateChangedBy },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      });

      return {
        ...order,
        client: processedClient,
        deliveryDateChangedByUser: changedByUser,
      };
    }

    return { ...order, client: processedClient };
  }

  async findByOrderNumber(orderNumber: string) {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      select: this.selectFields,
    });

    if (!order) return null;

    let processedClient: any = order.client;
    if (order.client) {
      const { orders, advisors, ...clientRest } = order.client as any;
      const saldoAFavor = orders?.reduce((sum: number, o: any) => sum + Math.abs(Number(o.balance)), 0) || 0;
      processedClient = {
        ...clientRest,
        advisors,
        advisorId: advisors?.[0]?.advisor?.id ?? null,
        advisor: advisors?.[0]?.advisor ?? null,
        saldoAFavor,
      };
    }

    return { ...order, client: processedClient };
  }

  /**
   * Busca la orden creada con una llave de idempotencia dada. Devuelve la orden
   * completa, igual que `create`, para que la petición gemela de un doble clic
   * reciba exactamente lo mismo que recibió la ganadora.
   */
  async findByIdempotencyKey(idempotencyKey: string) {
    const order = await this.prisma.order.findUnique({
      where: { idempotencyKey },
      select: { id: true },
    });
    return order ? this.findById(order.id) : null;
  }

  async create(data: Prisma.OrderCreateInput) {
    // Crear la orden primero sin los includes complejos para mejor performance
    const order = await this.prisma.order.create({
      data,
      select: {
        id: true,
        orderNumber: true,
        status: true,
      },
    });

    // Luego obtener la orden completa con todos los datos
    return this.findById(order.id);
  }

  async update(id: string, data: Prisma.OrderUpdateInput) {
    return this.prisma.order.update({
      where: { id },
      data,
      select: this.selectFields,
    });
  }

  async delete(id: string) {
    return this.prisma.order.delete({
      where: { id },
    });
  }

  async updateStatus(id: string, status: OrderStatus) {
    return this.prisma.order.update({
      where: { id },
      data: { status },
      select: this.selectFields,
    });
  }

  async registerElectronicInvoice(id: string, electronicInvoiceNumber: string) {
    return this.prisma.order.update({
      where: { id },
      data: { electronicInvoiceNumber },
      select: this.selectFields,
    });
  }

  // Para cálculos de totales por cliente
  async getTotalsByClient(clientId: string) {
    return this.prisma.order.aggregate({
      where: { clientId },
      _sum: {
        total: true,
        paidAmount: true,
        balance: true,
      },
      _count: true,
    });
  }

  // ========== ITEM MANAGEMENT ==========

  async findItemById(itemId: string) {
    return this.prisma.orderItem.findUnique({
      where: { id: itemId },
      include: {
        order: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });
  }

  async createItem(data: Prisma.OrderItemCreateInput) {
    return this.prisma.orderItem.create({
      data,
    });
  }

  async updateItem(itemId: string, data: Prisma.OrderItemUpdateInput) {
    return this.prisma.orderItem.update({
      where: { id: itemId },
      data,
    });
  }

  async deleteItem(itemId: string) {
    return this.prisma.orderItem.delete({
      where: { id: itemId },
    });
  }

  // ========== PAYMENT MANAGEMENT ==========

  async createPayment(data: Prisma.PaymentCreateInput) {
    return this.prisma.payment.create({
      data,
      select: {
        id: true,
        amount: true,
        paymentMethod: true,
        paymentDate: true,
        reference: true,
        notes: true,
        bankEntity: true,
        createdAt: true,
        receivedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  async findPaymentsByOrderId(orderId: string) {
    return this.prisma.payment.findMany({
      where: { orderId },
      select: {
        id: true,
        amount: true,
        paymentMethod: true,
        paymentDate: true,
        reference: true,
        notes: true,
        bankEntity: true,
        receiptFileId: true,
        createdAt: true,
        // Un pago anulado sobrevive en la lista: el Historial de Pagos lo
        // muestra marcado con su motivo en vez de dejar un hueco sin explicar.
        isVoided: true,
        voidedAt: true,
        voidReason: true,
        receivedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        voidedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        // Mismo shape que `ORDER_INCLUDE.payments` para que el tipo `Payment`
        // del frontend valga igual en el listado y en el detalle.
        cashMovement: {
          select: {
            receiptNumber: true,
            isVoided: true,
          },
        },
      },
      orderBy: { paymentDate: 'desc' },
    });
  }

  // ========== ORDER FINANCIALS UPDATE ==========

  async updateOrderFinancials(
    orderId: string,
    financials: {
      subtotal: Prisma.Decimal;
      tax: Prisma.Decimal;
      discountAmount: Prisma.Decimal;
      total: Prisma.Decimal;
      paidAmount: Prisma.Decimal;
      balance: Prisma.Decimal;
    },
  ) {
    return this.prisma.order.update({
      where: { id: orderId },
      data: financials,
      select: this.selectFields,
    });
  }

  // ========== DISCOUNT MANAGEMENT ==========

  async findDiscountsByOrderId(orderId: string) {
    return this.prisma.orderDiscount.findMany({
      where: { orderId },
      select: {
        id: true,
        amount: true,
        reason: true,
        appliedAt: true,
        appliedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { appliedAt: 'desc' },
    });
  }

  // ========== PROFITABILITY ==========

  async getOrderProfitabilityData(orderId: string) {
    return this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        total: true,
        workOrders: {
          select: {
            workOrderNumber: true,
            expenseOrders: {
              select: {
                id: true,
                ogNumber: true,
                status: true,
                items: {
                  select: { total: true },
                },
              },
            },
          },
        },
      },
    });
  }

  async getProfitabilityList(filters: {
    search?: string;
    status?: string;
    orderDateFrom?: Date;
    orderDateTo?: Date;
    page: number;
    limit: number;
  }) {
    const { search, status, orderDateFrom, orderDateTo, page, limit } = filters;

    const where: Prisma.OrderWhereInput = {};

    if (status) {
      where.status = status as OrderStatus;
    } else {
      // Por defecto excluir órdenes ANULADAS del análisis de rentabilidad
      where.status = { not: OrderStatus.ANULADO };
    }

    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { client: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    if (orderDateFrom || orderDateTo) {
      where.orderDate = {};
      if (orderDateFrom) (where.orderDate as Prisma.DateTimeFilter).gte = orderDateFrom;
      if (orderDateTo) (where.orderDate as Prisma.DateTimeFilter).lte = orderDateTo;
    }

    const take = clampPageSize(limit, 20, MAX_REPORT_PAGE_SIZE);
    const skip = (page - 1) * take;

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        select: {
          id: true,
          orderNumber: true,
          total: true,
          status: true,
          orderDate: true,
          client: { select: { name: true } },
          workOrders: {
            select: {
              expenseOrders: {
                select: {
                  items: { select: { total: true } },
                },
              },
            },
          },
        },
        orderBy: { orderDate: 'desc' },
        skip,
        take,
      }),
      this.prisma.order.count({ where }),
    ]);

    return { orders, total };
  }

  /**
   * Estados en los que una orden con saldo es cartera por cobrar: la venta ya
   * está en firme. Quedan fuera `DRAFT` —todavía no es una venta; en producción
   * hay 239 borradores con saldo que no le debe nadie—, `ANULADO` y `RETURNED`.
   *
   * Vive aquí, en el backend, porque tenerlo en la pantalla fue justo lo que
   * permitió que se desactualizara: la lista del frontend no incluía
   * `DELIVERED_ON_CREDIT`, que por definición es una entrega con saldo.
   */
  static readonly RECEIVABLE_STATUSES: OrderStatus[] = [
    OrderStatus.CONFIRMED,
    OrderStatus.IN_PRODUCTION,
    OrderStatus.READY,
    OrderStatus.DELIVERED,
    OrderStatus.DELIVERED_ON_CREDIT,
    OrderStatus.WARRANTY,
  ];

  /**
   * Totales de la cartera pendiente para el encabezado de la pantalla.
   *
   * Va aparte del listado porque el listado se pagina: sumar los saldos de la
   * página visible daría una cifra que cambia al pasar de página. La suma la
   * hace el motor sobre el conjunto completo.
   */
  async getPendingPaymentSummary(filters: { clientId?: string }) {
    const where: Prisma.OrderWhereInput = {
      status: { in: OrdersRepository.RECEIVABLE_STATUSES },
      balance: { gt: 0 },
      ...(filters.clientId ? { clientId: filters.clientId } : {}),
    };

    const [aggregate, count] = await Promise.all([
      this.prisma.order.aggregate({ where, _sum: { balance: true } }),
      this.prisma.order.count({ where }),
    ]);

    return {
      count,
      totalBalance: aggregate._sum.balance?.toString() ?? '0',
    };
  }

  /**
   * Los asesores que han creado al menos una orden.
   *
   * La pantalla de ventas por asesor se traía 1.000 órdenes completas solo para
   * deducir esta lista, así que con 3.209 órdenes en producción se le quedaban
   * asesores por fuera del filtro. Esto es la consulta que de verdad hacía
   * falta.
   */
  async findAdvisorsWithOrders() {
    const grouped = await this.prisma.order.groupBy({ by: ['createdById'] });

    const ids = grouped
      .map((row) => row.createdById)
      .filter((id): id is string => Boolean(id));

    if (ids.length === 0) return [];

    return this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, firstName: true, lastName: true, username: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }
}
