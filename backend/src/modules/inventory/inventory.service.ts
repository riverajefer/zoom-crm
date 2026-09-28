import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, InventoryMovementType, NotificationType } from '../../generated/prisma';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { InventoryRepository } from './inventory.repository';
import {
  AdjustmentDirection,
  CreateInventoryMovementDto,
  FilterInventoryMovementsDto,
} from './dto';

// Tipos que siempre incrementan el stock.
const STOCK_INCREASE_TYPES: InventoryMovementType[] = [
  InventoryMovementType.ENTRY,
  InventoryMovementType.RETURN,
  InventoryMovementType.INITIAL,
];

/**
 * Insumo que quedó bajo el mínimo tras un movimiento. Se acumula para avisar
 * DESPUÉS del commit: notificar dentro de la transacción manda alertas de
 * consumos que pueden terminar revertidos.
 */
export interface LowStockAlert {
  supplyId: string;
  supplyName: string;
  currentStock: number;
  minimumStock: number;
}

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly repository: InventoryRepository,
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Crea un movimiento de inventario manual (no EXIT, que es automático).
   */
  async createManualMovement(dto: CreateInventoryMovementDto, performedById: string) {
    if (dto.type === InventoryMovementType.EXIT) {
      throw new BadRequestException(
        'El tipo EXIT es generado automáticamente por el sistema al completar una Orden de Trabajo.',
      );
    }
    return this.createMovement(dto, performedById);
  }

  /**
   * Crea movimientos de salida (EXIT) para todos los insumos de una OT al completarla.
   * Se ejecuta dentro de la transacción de updateStatus en WorkOrdersService.
   *
   * Devuelve los insumos que quedaron bajo el mínimo, para que el llamador avise
   * una vez confirmada la transacción.
   */
  async createExitFromWorkOrder(
    workOrderId: string,
    performedById: string,
    tx: Prisma.TransactionClient,
  ): Promise<LowStockAlert[]> {
    // Obtener todos los insumos de la OT con sus cantidades
    const { locationId: workOrderLocationId } = await tx.workOrder.findUniqueOrThrow({
      where: { id: workOrderId },
      select: { locationId: true },
    });

    const supplies = await tx.workOrderItemSupply.findMany({
      where: {
        workOrderItem: { workOrderId },
        quantity: { not: null, gt: 0 },
      },
      include: {
        supply: { select: { id: true, name: true, minimumStock: true } },
      },
    });

    if (supplies.length === 0) return [];

    const alerts: LowStockAlert[] = [];

    for (const ws of supplies) {
      if (!ws.quantity) continue;

      const qty = new Prisma.Decimal(ws.quantity);

      // El consumo se descuenta con `decrement`, no leyendo y volviendo a
      // escribir: dos OT que consumen el mismo insumo a la vez se pisaban.
      const { previousStock, newStock } = await this.applyStockDelta(
        tx,
        ws.supplyId,
        qty,
        false,
      );

      // A diferencia del movimiento manual, aquí NO se rechaza el consumo ni se
      // recorta el stock a cero. El trabajo ya se hizo: negarlo no devuelve el
      // material a la bodega, y recortar dejaba `previousStock - quantity`
      // distinto de `newStock`, es decir un kardex que no cuadra consigo mismo.
      // Un stock negativo es la señal honesta de que el registro venía atrasado
      // respecto a la bodega, y la alerta de mínimo lo hace visible.
      await tx.inventoryMovement.create({
        data: {
          // Qué sede consumió el insumo: la de la OT (docs/PLAN_SEDES.md §2).
          locationId: workOrderLocationId,
          supplyId: ws.supplyId,
          type: InventoryMovementType.EXIT,
          quantity: qty,
          previousStock,
          newStock,
          referenceType: 'WORK_ORDER',
          referenceId: workOrderId,
          performedById,
          notes: `Consumo automático al completar OT`,
        },
      });

      if (newStock.lessThan(ws.supply.minimumStock)) {
        alerts.push({
          supplyId: ws.supply.id,
          supplyName: ws.supply.name,
          currentStock: Number(newStock),
          minimumStock: Number(ws.supply.minimumStock),
        });
      }
    }

    return alerts;
  }

  /**
   * Crea un movimiento de inventario con toda la lógica de negocio.
   *
   * El movimiento y el cambio de stock van juntos en una transacción: antes eran
   * dos consultas sueltas bajo un `Promise.all` que el comentario llamaba
   * "atómico", así que un fallo al actualizar el stock dejaba en el kardex un
   * movimiento que declaraba un saldo que nunca se escribió.
   */
  async createMovement(dto: CreateInventoryMovementDto, performedById: string) {
    const { movement, alert } = await this.prisma.$transaction(async (tx) => {
      const supply = await tx.supply.findUnique({
        where: { id: dto.supplyId },
        select: { id: true, name: true, minimumStock: true, isActive: true },
      });

      if (!supply) throw new NotFoundException(`Insumo con id ${dto.supplyId} no encontrado`);
      if (!supply.isActive) throw new BadRequestException(`El insumo "${supply.name}" no está activo`);

      if (dto.type === InventoryMovementType.ADJUSTMENT) {
        if (!dto.reason) {
          throw new BadRequestException(
            'El campo "reason" es requerido para ajustes manuales (ADJUSTMENT)',
          );
        }
        if (!dto.direction) {
          throw new BadRequestException(
            'El campo "direction" es requerido para ajustes manuales (ADJUSTMENT): ' +
              'un conteo físico puede quedar por encima o por debajo del sistema.',
          );
        }
      }

      const qty = new Prisma.Decimal(dto.quantity);
      const increases = this.increasesStock(dto.type, dto.direction);

      const { previousStock, newStock } = await this.applyStockDelta(
        tx,
        dto.supplyId,
        qty,
        increases,
      );

      // El stock no puede quedar negativo por un movimiento manual. El throw
      // revierte el descuento junto con el resto de la transacción, así que la
      // comprobación es sobre el saldo real y no sobre una lectura previa que
      // otro movimiento simultáneo pudo dejar vieja.
      if (newStock.lessThan(0)) {
        throw new BadRequestException(
          `Stock insuficiente. Stock actual: ${previousStock}, cantidad solicitada: ${qty}`,
        );
      }

      const movementData: Prisma.InventoryMovementUncheckedCreateInput = {
        supplyId: dto.supplyId,
        type: dto.type,
        quantity: qty,
        unitCost: dto.unitCost !== undefined ? new Prisma.Decimal(dto.unitCost) : undefined,
        previousStock,
        newStock,
        referenceType: 'MANUAL',
        reason: dto.reason,
        notes: dto.notes,
        performedById,
      };

      const created = await this.repository.create(movementData, tx);

      return {
        movement: created,
        alert: newStock.lessThan(supply.minimumStock)
          ? {
              supplyId: supply.id,
              supplyName: supply.name,
              currentStock: Number(newStock),
              minimumStock: Number(supply.minimumStock),
            }
          : null,
      };
    });

    if (alert) {
      // Fuera de la transacción y sin bloquearla: el movimiento ya está firme.
      void this.notifyLowStockBatch([alert]);
    }

    return movement;
  }

  /**
   * Aplica el cambio de stock con la operación atómica del motor y devuelve el
   * saldo antes y después.
   *
   * Leer `currentStock`, calcular en memoria y escribir el valor absoluto
   * —que es lo que se hacía— pierde actualizaciones: dos movimientos
   * simultáneos sobre el mismo insumo leen el mismo saldo y el segundo pisa al
   * primero, dejando un movimiento registrado cuyo efecto desaparece.
   *
   * `previousStock` se deriva del saldo resultante, no de una lectura previa,
   * así que refleja el valor real en el instante del cambio.
   */
  private async applyStockDelta(
    tx: Prisma.TransactionClient,
    supplyId: string,
    qty: Prisma.Decimal,
    increases: boolean,
  ): Promise<{ previousStock: Prisma.Decimal; newStock: Prisma.Decimal }> {
    const updated = await tx.supply.update({
      where: { id: supplyId },
      data: {
        currentStock: increases ? { increment: qty } : { decrement: qty },
      },
      select: { currentStock: true },
    });

    const newStock = new Prisma.Decimal(updated.currentStock);
    const previousStock = increases ? newStock.sub(qty) : newStock.add(qty);

    return { previousStock, newStock };
  }

  /**
   * ¿El movimiento suma o resta?
   *
   * `ADJUSTMENT` es el único que va en los dos sentidos: un conteo físico puede
   * quedar por encima o por debajo del sistema, y antes solo podía restar, así
   * que una diferencia a favor no tenía cómo registrarse.
   */
  private increasesStock(
    type: InventoryMovementType,
    direction?: AdjustmentDirection,
  ): boolean {
    if (type === InventoryMovementType.ADJUSTMENT) {
      return direction === AdjustmentDirection.INCREASE;
    }
    return STOCK_INCREASE_TYPES.includes(type);
  }

  async findAll(filters: FilterInventoryMovementsDto) {
    return this.repository.findAll(filters);
  }

  async findById(id: string) {
    const movement = await this.repository.findById(id);
    if (!movement) throw new NotFoundException(`Movimiento con id ${id} no encontrado`);
    return movement;
  }

  async getLowStockSupplies() {
    return this.repository.getLowStockSuppliesRaw();
  }

  async getInventoryValuation() {
    return this.repository.getInventoryValuation();
  }

  /**
   * Verifica todos los insumos activos y notifica los que están bajo mínimo.
   * Llamado por el scheduler diario.
   */
  async checkAndNotifyAllLowStock() {
    const lowStock = await this.repository.getLowStockSuppliesRaw();
    if (lowStock.length === 0) return 0;

    return this.notifyLowStockBatch(
      lowStock.map((supply) => ({
        supplyId: supply.id,
        supplyName: supply.name,
        currentStock: supply.current_stock,
        minimumStock: supply.minimum_stock,
      })),
    );
  }

  /**
   * Notifica un lote de alertas de stock bajo. Un fallo de notificación nunca
   * debe tumbar el movimiento que la originó, así que cada una se aísla.
   *
   * Devuelve cuántas se enviaron.
   */
  async notifyLowStockBatch(alerts: LowStockAlert[]): Promise<number> {
    let notified = 0;
    for (const alert of alerts) {
      try {
        await this.notifyLowStock(
          alert.supplyId,
          alert.supplyName,
          alert.currentStock,
          alert.minimumStock,
        );
        notified++;
      } catch (err) {
        this.logger.error(`Error notificando stock bajo para ${alert.supplyName}`, err);
      }
    }
    return notified;
  }

  private async notifyLowStock(
    supplyId: string,
    supplyName: string,
    currentStock: number,
    minimumStock: number,
  ) {
    await this.notificationsService.notifyUsersWithPermission('manage_inventory', {
      type: NotificationType.LOW_STOCK_ALERT,
      title: `Stock bajo: ${supplyName}`,
      message: `El insumo "${supplyName}" tiene stock bajo (${currentStock} unidades). Mínimo requerido: ${minimumStock}.`,
      relatedId: supplyId,
      relatedType: 'SUPPLY',
    });
  }
}
