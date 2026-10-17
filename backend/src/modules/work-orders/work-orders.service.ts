import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WorkOrderStatus } from '../../generated/prisma';
import { PrismaService } from '../../database/prisma.service';
import {
  findForView,
  lookupInOtherLocations,
  LOOKUP_MIN_QUERY_LENGTH,
} from '../../common/utils/location-consulta';
import { LOCATION_SUMMARY_SELECT } from '../../common/constants/location-select';
import { ConsecutivesService } from '../consecutives/consecutives.service';
import { WorkOrdersRepository } from './work-orders.repository';
import { InventoryService } from '../inventory/inventory.service';
import { AuthenticatedUser } from '../../common/interfaces/auth.interface';
import { startOfDay, endOfDay } from '../../common/utils/date-range.util';
import {
  AddSupplyToItemDto,
  CreateWorkOrderDto,
  FilterWorkOrdersDto,
  UpdateWorkOrderDto,
  UpdateWorkOrderStatusDto,
} from './dto';

const ALLOWED_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  [WorkOrderStatus.DRAFT]: [WorkOrderStatus.CONFIRMED, WorkOrderStatus.CANCELLED],
  [WorkOrderStatus.CONFIRMED]: [WorkOrderStatus.IN_PRODUCTION, WorkOrderStatus.CANCELLED],
  // «Lista para entrega» es un paso opcional: una OT puede completarse directo
  // desde producción, como se hacía antes de que existiera el estado.
  [WorkOrderStatus.IN_PRODUCTION]: [
    WorkOrderStatus.READY,
    WorkOrderStatus.COMPLETED,
    WorkOrderStatus.CANCELLED,
  ],
  [WorkOrderStatus.READY]: [WorkOrderStatus.COMPLETED, WorkOrderStatus.CANCELLED],
  [WorkOrderStatus.COMPLETED]: [],
  [WorkOrderStatus.CANCELLED]: [],
};

const EDITABLE_STATUSES: WorkOrderStatus[] = [
  WorkOrderStatus.DRAFT,
  WorkOrderStatus.CONFIRMED,
  WorkOrderStatus.IN_PRODUCTION,
];

@Injectable()
export class WorkOrdersService {
  constructor(
    private readonly workOrdersRepository: WorkOrdersRepository,
    private readonly consecutivesService: ConsecutivesService,
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  async create(dto: CreateWorkOrderDto, advisorId: string, status: WorkOrderStatus = WorkOrderStatus.DRAFT) {
    // 1. Verify the Order exists and is in an allowed status
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: {
        items: {
          select: {
            id: true,
            description: true,
            quantity: true,
            annulledQuantity: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Orden con id ${dto.orderId} no encontrada`);
    }

    // DELIVERED entra porque en la práctica la OP se marca entregada antes de
    // que alguien registre la OT: sin esto el trabajo queda sin su orden.
    const allowedOrderStatuses = ['CONFIRMED', 'IN_PRODUCTION', 'READY', 'DELIVERED'];
    if (!allowedOrderStatuses.includes(order.status)) {
      throw new BadRequestException(
        `Solo se pueden crear OTs para órdenes en estado CONFIRMED, IN_PRODUCTION, READY o DELIVERED. Estado actual: ${order.status}`,
      );
    }

    // 1b. Verify the Order does not already have an active (non-cancelled) work order
    const existingWorkOrder = await this.prisma.workOrder.findFirst({
      where: {
        orderId: dto.orderId,
        status: { not: WorkOrderStatus.CANCELLED },
      },
      select: { workOrderNumber: true },
    });

    if (existingWorkOrder) {
      throw new BadRequestException(
        `La orden ${order.orderNumber} ya tiene una OT activa (${existingWorkOrder.workOrderNumber}). Solo se permite una OT activa por orden de pedido.`,
      );
    }

    // 2. Validate all orderItemIds belong to this order
    const orderItemIds = new Set(order.items.map((item) => item.id));
    for (const item of dto.items) {
      if (!orderItemIds.has(item.orderItemId)) {
        throw new BadRequestException(
          `El item con orderItemId ${item.orderItemId} no pertenece a la orden ${dto.orderId}`,
        );
      }
    }

    // 3. Build items with productDescription from OrderItem if not provided
    const orderItemMap = new Map(order.items.map((item) => [item.id, item]));

    // Un ítem anulado por completo en la OP ya no se produce: mandarlo al
    // taller sería fabricar algo que nadie va a pagar.
    for (const item of dto.items) {
      const orderItem = orderItemMap.get(item.orderItemId)!;
      const annulled = new Prisma.Decimal(orderItem.annulledQuantity ?? 0);
      if (
        annulled.greaterThan(0) &&
        annulled.greaterThanOrEqualTo(orderItem.quantity)
      ) {
        throw new BadRequestException(
          `El ítem «${orderItem.description.trim()}» está anulado en la orden y no puede incluirse en la OT`,
        );
      }
    }
    const itemsData = dto.items.map((item) => ({
      orderItemId: item.orderItemId,
      productDescription: item.productDescription ?? orderItemMap.get(item.orderItemId)!.description,
      observations: item.observations,
      productionAreaIds: item.productionAreaIds,
      supplies: item.supplies?.map((s) => ({
        supplyId: s.supplyId,
        quantity: s.quantity,
        notes: s.notes,
      })),
    }));

    // 4. Generate work order number and create (with retry on unique constraint)
    const MAX_RETRIES = 3;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      // La OT hereda la sede de su OP (docs/PLAN_SEDES.md §2).
      const workOrderNumber = await this.consecutivesService.generateNumber('WORK_ORDER', order.locationId);

      try {
        return await this.workOrdersRepository.create({
          workOrderNumber,
          locationId: order.locationId,
          orderId: dto.orderId,
          advisorId,
          designerId: dto.designerId,
          fileName: dto.fileName,
          attachmentId: dto.attachmentId,
          observations: dto.observations,
          status,
          items: itemsData,
        });
      } catch (error: any) {
        const isUniqueViolation = error?.code === 'P2002';
        if (isUniqueViolation && attempt < MAX_RETRIES - 1) {
          // Sync the counter with actual DB values and retry
          await this.consecutivesService.syncWorkOrderCounter();
          continue;
        }
        throw error;
      }
    }
  }

  async findAll(filters: FilterWorkOrdersDto) {
    const { createdAtFrom, createdAtTo, ...rest } = filters;
    return this.workOrdersRepository.findAll({
      ...rest,
      createdAtFrom: startOfDay(createdAtFrom),
      createdAtTo: endOfDay(createdAtTo),
    });
  }

  async findOne(id: string) {
    const workOrder = await this.workOrdersRepository.findById(id);
    if (!workOrder) {
      throw new NotFoundException(`OT con id ${id} no encontrada`);
    }
    // Ítems que se sumaron a la OP después de crear la OT: el formulario de
    // edición los ofrece para agregarlos y el detalle avisa que faltan.
    const pendingOrderItems = await this.workOrdersRepository.findPendingOrderItems(
      id,
      workOrder.order.id,
    );
    return { ...workOrder, pendingOrderItems };
  }

  /** Detalle para la pantalla, con modo consulta para otra sede. Ver `OrdersService.findOneForView`. */
  async findOneForView(id: string) {
    const workOrder = await findForView(this.prisma, 'WorkOrder', () =>
      this.workOrdersRepository.findById(id),
    );
    if (!workOrder) {
      throw new NotFoundException(`OT con id ${id} no encontrada`);
    }
    return workOrder;
  }

  /** OT de las otras sedes que coinciden con la búsqueda. Ver `OrdersService.lookupInOtherLocations`. */
  async lookupInOtherLocations(q: string) {
    const search = q.trim();
    if (search.length < LOOKUP_MIN_QUERY_LENGTH) return [];
    const where: Prisma.WorkOrderWhereInput = {
      OR: [
        { workOrderNumber: { contains: search, mode: 'insensitive' } },
        { order: { orderNumber: { contains: search, mode: 'insensitive' } } },
        { order: { client: { name: { contains: search, mode: 'insensitive' } } } },
      ],
    };
    return lookupInOtherLocations(where, {
      count: (w) =>
        this.prisma.workOrder.groupBy({ by: ['locationId'], where: w, _count: { _all: true } }),
      find: (w, take) =>
        this.prisma.workOrder.findMany({
          where: w,
          select: {
            id: true,
            workOrderNumber: true,
            status: true,
            createdAt: true,
            order: {
              select: { id: true, orderNumber: true, client: { select: { id: true, name: true } } },
            },
            locationId: true,
            location: { select: LOCATION_SUMMARY_SELECT },
          },
          orderBy: { createdAt: 'desc' },
          take,
        }),
    });
  }

  async update(id: string, dto: UpdateWorkOrderDto) {
    const workOrder = await this.workOrdersRepository.findById(id);
    if (!workOrder) {
      throw new NotFoundException(`OT con id ${id} no encontrada`);
    }

    if (!EDITABLE_STATUSES.includes(workOrder.status as WorkOrderStatus)) {
      throw new BadRequestException(
        `No se puede modificar una OT en estado ${workOrder.status}. Solo se permite editar en estados DRAFT, CONFIRMED o IN_PRODUCTION.`,
      );
    }

    const { items, ...scalarData } = dto;

    // Update scalar fields
    if (Object.keys(scalarData).length > 0) {
      await this.workOrdersRepository.update(id, scalarData);
    }

    // Reconcile items if provided
    if (items && items.length > 0) {
      // Verify orderItemIds belong to the order
      const order = await this.prisma.order.findUnique({
        where: { id: workOrder.order.id },
        include: {
          items: {
            select: { id: true, description: true, quantity: true, annulledQuantity: true },
          },
        },
      });

      const orderItemMap = new Map(order!.items.map((i) => [i.id, i]));
      const addedOrderItemIds = new Set<string>();

      for (const item of items) {
        const orderItem = orderItemMap.get(item.orderItemId);
        if (!orderItem) {
          throw new BadRequestException(
            `El item con orderItemId ${item.orderItemId} no pertenece a la orden ${workOrder.order.orderNumber}`,
          );
        }

        // Find the corresponding workOrderItem by orderItemId
        const woItem = workOrder.items.find(
          (i: (typeof workOrder.items)[number]) => i.orderItem.id === item.orderItemId,
        );

        // Ítem de la OP que la OT no tenía (se agregó a la OP después de crear
        // la OT): se crea. Antes se descartaba en silencio y no había otra forma
        // de pasarlo a la OT, porque solo se permite una OT activa por OP.
        if (!woItem) {
          if (addedOrderItemIds.has(item.orderItemId)) continue;
          const annulled = new Prisma.Decimal(orderItem.annulledQuantity ?? 0);
          if (annulled.greaterThan(0) && annulled.greaterThanOrEqualTo(orderItem.quantity)) {
            throw new BadRequestException(
              `El ítem «${orderItem.description.trim()}» está anulado en la orden y no puede incluirse en la OT`,
            );
          }
          await this.workOrdersRepository.addItem(id, {
            orderItemId: item.orderItemId,
            productDescription: item.productDescription ?? orderItem.description,
            observations: item.observations,
            productionAreaIds: item.productionAreaIds,
            supplies: item.supplies?.map((s) => ({
              supplyId: s.supplyId,
              quantity: s.quantity,
              notes: s.notes,
            })),
          });
          addedOrderItemIds.add(item.orderItemId);
          continue;
        }

        await this.workOrdersRepository.updateItem(woItem.id, {
          productDescription: item.productDescription ?? orderItemMap.get(item.orderItemId)?.description,
          observations: item.observations,
          productionAreaIds: item.productionAreaIds,
          supplies: item.supplies?.map((s) => ({
            supplyId: s.supplyId,
            quantity: s.quantity,
            notes: s.notes,
          })),
        });
      }
    }

    return this.workOrdersRepository.findById(id);
  }

  async updateStatus(id: string, dto: UpdateWorkOrderStatusDto, currentUser?: AuthenticatedUser) {
    const workOrder = await this.workOrdersRepository.findById(id);
    if (!workOrder) {
      throw new NotFoundException(`OT con id ${id} no encontrada`);
    }

    const currentStatus = workOrder.status as WorkOrderStatus;
    const allowedNext = ALLOWED_TRANSITIONS[currentStatus];

    if (!allowedNext.includes(dto.status)) {
      throw new BadRequestException(
        `No se puede cambiar el estado de ${currentStatus} a ${dto.status}. Transiciones permitidas: ${allowedNext.join(', ') || 'ninguna'}`,
      );
    }

    // Al completar la OT, descontar insumos del inventario en una transaccion atomica
    if (dto.status === WorkOrderStatus.COMPLETED && currentUser) {
      const { workOrder: updated, lowStock } = await this.prisma.$transaction(
        async (tx) => {
          await tx.workOrder.update({
            where: { id },
            data: { status: dto.status },
          });
          const alerts = await this.inventoryService.createExitFromWorkOrder(
            id,
            currentUser.id,
            tx,
          );
          return {
            workOrder: await this.workOrdersRepository.findById(id),
            lowStock: alerts,
          };
        },
      );

      // Las alertas salen con la transacción ya confirmada: avisar desde dentro
      // mandaba correos de consumos que todavía podían revertirse.
      if (lowStock.length > 0) {
        void this.inventoryService.notifyLowStockBatch(lowStock);
      }

      return updated;
    }

    return this.workOrdersRepository.updateStatus(id, dto.status);
  }

  async addSupplyToItem(workOrderId: string, itemId: string, dto: AddSupplyToItemDto) {
    // Verify work order exists
    const workOrder = await this.workOrdersRepository.findById(workOrderId);
    if (!workOrder) {
      throw new NotFoundException(`OT con id ${workOrderId} no encontrada`);
    }

    // Verify item belongs to the work order
    const item = await this.workOrdersRepository.findItemById(workOrderId, itemId);
    if (!item) {
      throw new NotFoundException(`Item con id ${itemId} no encontrado en la OT ${workOrderId}`);
    }

    return this.workOrdersRepository.addSupplyToItem(itemId, {
      supplyId: dto.supplyId,
      quantity: dto.quantity,
      notes: dto.notes,
    });
  }

  async removeSupplyFromItem(workOrderId: string, itemId: string, supplyId: string) {
    const workOrder = await this.workOrdersRepository.findById(workOrderId);
    if (!workOrder) {
      throw new NotFoundException(`OT con id ${workOrderId} no encontrada`);
    }

    const item = await this.workOrdersRepository.findItemById(workOrderId, itemId);
    if (!item) {
      throw new NotFoundException(`Item con id ${itemId} no encontrado en la OT ${workOrderId}`);
    }

    return this.workOrdersRepository.removeSupplyFromItem(itemId, supplyId);
  }

  async remove(id: string) {
    const workOrder = await this.workOrdersRepository.findById(id);
    if (!workOrder) {
      throw new NotFoundException(`OT con id ${id} no encontrada`);
    }

    if (workOrder.status !== WorkOrderStatus.DRAFT) {
      throw new BadRequestException(
        `Solo se pueden eliminar OTs en estado DRAFT. Estado actual: ${workOrder.status}`,
      );
    }

    return this.workOrdersRepository.delete(id);
  }
}
