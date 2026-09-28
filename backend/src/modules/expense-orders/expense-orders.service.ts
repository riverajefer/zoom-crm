import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { ExpenseOrderStatus } from '../../generated/prisma';
import { PrismaService } from '../../database/prisma.service';
import { ConsecutivesService } from '../consecutives/consecutives.service';
import { ExpenseOrdersRepository } from './expense-orders.repository';
import {
  CajaRejectExpenseOrderDto,
  CreateExpenseItemDto,
  CreateExpenseOrderDto,
  FilterExpenseOrdersDto,
  UpdateExpenseOrderDto,
  UpdateExpenseOrderStatusDto,
} from './dto';
import { AuthenticatedUser } from '../../common/interfaces/auth.interface';
import { startOfDay, endOfDay } from '../../common/utils/date-range.util';
import { ExpenseOrderAuthRequestsService } from '../expense-order-auth-requests/expense-order-auth-requests.service';
import { AccountsPayableService } from '../accounts-payable/accounts-payable.service';
import { computeExpenseTotals } from '../../common/utils/expense-totals.util';
import { normalizeRate } from '../../common/utils/rounding.util';
import { findActiveCashSessionForLocation } from '../cash-session/active-cash-session.util';
import { requireActiveLocationId } from '../../common/utils/location-context';

const ALLOWED_TRANSITIONS: Record<ExpenseOrderStatus, ExpenseOrderStatus[]> = {
  [ExpenseOrderStatus.DRAFT]: [ExpenseOrderStatus.CREATED, ExpenseOrderStatus.ADMIN_AUTHORIZED],
  [ExpenseOrderStatus.CREATED]: [ExpenseOrderStatus.ADMIN_AUTHORIZED, ExpenseOrderStatus.DRAFT],
  [ExpenseOrderStatus.ADMIN_AUTHORIZED]: [], // La segunda firma usa el endpoint dedicado /caja-authorize
  [ExpenseOrderStatus.AUTHORIZED]: [],
  [ExpenseOrderStatus.PAID]: [],
};

const EDITABLE_STATUSES: ExpenseOrderStatus[] = [
  ExpenseOrderStatus.DRAFT,
  ExpenseOrderStatus.CREATED,
];

// Mismos estados que los editables: mientras nadie haya firmado la OG, borrarla
// no destruye ningún hecho contable. Antes solo se permitía en DRAFT, lo que
// obligaba a devolver la orden a borrador para poder eliminarla.
const DELETABLE_STATUSES: ExpenseOrderStatus[] = [
  ExpenseOrderStatus.DRAFT,
  ExpenseOrderStatus.CREATED,
];

@Injectable()
export class ExpenseOrdersService {
  constructor(
    private readonly repository: ExpenseOrdersRepository,
    private readonly consecutivesService: ConsecutivesService,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ExpenseOrderAuthRequestsService))
    private readonly authRequestsService: ExpenseOrderAuthRequestsService,
    private readonly accountsPayableService: AccountsPayableService,
  ) {}

  /**
   * Total a pagar de la OG: subtotal + IVA - retenciones. Se delega en el util
   * compartido para que la Cuenta por Pagar que nace de esta orden llegue
   * exactamente al mismo número.
   */
  private totalToPay(
    subtotal: number,
    source: {
      applyIva?: boolean | null;
      ivaRate?: unknown;
      retefuenteRate?: unknown;
      reteICARate?: unknown;
      reteIVARate?: unknown;
    },
  ): number {
    return computeExpenseTotals(subtotal, {
      applyIva: source.applyIva,
      ivaRate: source.ivaRate as number,
      retefuenteRate: source.retefuenteRate as number,
      reteICARate: source.reteICARate as number,
      reteIVARate: source.reteIVARate as number,
    }).total;
  }

  async create(
    dto: CreateExpenseOrderDto,
    createdById: string,
    status: ExpenseOrderStatus = ExpenseOrderStatus.DRAFT,
  ) {
    // Doble clic en "Crear OG": el formulario manda la misma llave en las dos
    // peticiones. Si la primera ya insertó, devolvemos esa OG en lugar de gastar
    // otro consecutivo. El índice único de `idempotency_key` es la garantía real
    // (esta lectura es check-then-act); el P2002 se atrapa más abajo.
    if (dto.idempotencyKey) {
      const existing = await this.repository.findByIdempotencyKey(
        dto.idempotencyKey,
      );
      if (existing) return existing;
    }

    // Si el creador es admin, la OG no necesita aprobación administrativa:
    // pasa directamente a ADMIN_AUTHORIZED para que solo Caja deba firmarla.
    const creator = await this.prisma.user.findUnique({
      where: { id: createdById },
      include: { role: true },
    });
    const creatorIsAdmin = creator?.role?.name === 'admin';
    if (creatorIsAdmin) {
      status = ExpenseOrderStatus.ADMIN_AUTHORIZED;
    }
    // Validate WorkOrder exists if provided
    if (dto.workOrderId) {
      const workOrder = await this.prisma.workOrder.findUnique({
        where: { id: dto.workOrderId },
      });
      if (!workOrder) {
        throw new NotFoundException(`OT con id ${dto.workOrderId} no encontrada`);
      }
    }

    // Validate ExpenseType and Subcategory belong to each other
    const subcategory = await this.prisma.expenseSubcategory.findFirst({
      where: {
        id: dto.expenseSubcategoryId,
        expenseTypeId: dto.expenseTypeId,
      },
    });
    if (!subcategory) {
      throw new BadRequestException(
        'La subcategoría no pertenece al tipo de gasto indicado',
      );
    }

    // Build items with computed total
    const itemsData = dto.items.map((item, index) => ({
      quantity: item.quantity,
      name: item.name,
      description: item.description,
      supplierId: item.supplierId,
      unitPrice: item.unitPrice,
      total: item.quantity * item.unitPrice,
      paymentMethod: item.paymentMethod,
      bankEntity: item.bankEntity,
      receiptFileId: item.receiptFileId,
      referenceFileId: item.referenceFileId,
      productionAreaIds: item.productionAreaIds,
      sortOrder: index,
    }));

    // Reintento en caso de colisión de consecutivo
    const maxAttempts = 3;
    let attempts = 0;
    // La OG nace en la sede activa: un local o la Matriz (docs/PLAN_SEDES.md §14).
    const locationId = requireActiveLocationId();
    let currentOgNumber = await this.consecutivesService.generateNumber('EXPENSE', locationId);

    while (attempts < maxAttempts) {
      attempts++;
      try {
        const created = await this.repository.create({
          ogNumber: currentOgNumber,
          locationId,
          expenseTypeId: dto.expenseTypeId,
          expenseSubcategoryId: dto.expenseSubcategoryId,
          workOrderId: dto.workOrderId,
          authorizedToId: dto.authorizedToId,
          responsibleId: dto.responsibleId,
          observations: dto.observations,
          areaOrMachine: dto.areaOrMachine,
          applyIva: dto.applyIva ?? false,
          ivaRate: dto.ivaRate ?? 0.19,
          retefuenteRate: normalizeRate(dto.retefuenteRate).toNumber(),
          reteICARate: normalizeRate(dto.reteICARate).toNumber(),
          reteIVARate: dto.reteIVARate ?? 0,
          status,
          createdById,
          idempotencyKey: dto.idempotencyKey,
          ...(creatorIsAdmin && {
            authorizedById: createdById,
            authorizedAt: new Date(),
          }),
          items: itemsData,
        });

        const subtotal = (created.items as Array<{ total: unknown }>).reduce(
          (sum, item) => sum + Number(item.total),
          0,
        );
        const totalAmount = this.totalToPay(subtotal, dto);
        await this.accountsPayableService.createFromExpenseOrder(
          created.id,
          `Orden de Gasto ${created.ogNumber}`,
          totalAmount,
          createdById,
          subtotal,
        );

        return created;
      } catch (error: any) {
        const isUniqueConstraintError = error.code === 'P2002';
        // Con el adaptador de Postgres, `meta.target` viene vacío: el nombre de
        // la restricción violada llega dentro de `meta.driverAdapterError`. Por
        // eso se busca sobre el meta completo y no sobre `target`.
        const meta = JSON.stringify(error.meta ?? '');
        const target = JSON.stringify(error.meta?.target || '');
        const hitsIdempotencyKey =
          meta.includes('idempotency_key') || meta.includes('idempotencyKey');

        // La petición gemela de un doble clic ganó la carrera: la OG ya existe
        // con esta misma llave. Devolvemos esa, sin reintentar con otro
        // consecutivo — reintentar es justo lo que creaba el duplicado.
        if (isUniqueConstraintError && dto.idempotencyKey && hitsIdempotencyKey) {
          const twin = await this.repository.findByIdempotencyKey(
            dto.idempotencyKey,
          );
          if (twin) return twin;

          // La gemela existe (por eso chocamos) pero su transacción todavía no
          // es visible. Volver a intentar el insert crearía el duplicado que
          // esta llave existe para evitar.
          throw new ConflictException(
            'Ya se está creando una orden de gasto con esta misma solicitud. Espera un momento y revisa la lista.',
          );
        }

        const isNumberTarget =
          meta.includes('og_number') ||
          target.includes('expense_orders_og_number_key') ||
          (error.meta?.modelName === 'ExpenseOrder' && (error.meta?.target === undefined || target === '""'));

        if (isUniqueConstraintError && isNumberTarget && attempts < maxAttempts) {
          await this.consecutivesService.syncCounter('EXPENSE', locationId);
          currentOgNumber = await this.consecutivesService.generateNumber('EXPENSE', locationId);
          continue;
        }
        throw error;
      }
    }
  }

  async findAll(filters: FilterExpenseOrdersDto) {
    const { createdAtFrom, createdAtTo, ...rest } = filters;
    return this.repository.findAll({
      ...rest,
      createdAtFrom: startOfDay(createdAtFrom),
      createdAtTo: endOfDay(createdAtTo),
    });
  }

  async findOne(id: string) {
    const expenseOrder = await this.repository.findById(id);
    if (!expenseOrder) {
      throw new NotFoundException(`OG con id ${id} no encontrada`);
    }
    return expenseOrder;
  }

  async update(id: string, dto: UpdateExpenseOrderDto) {
    const expenseOrder = await this.repository.findById(id);
    if (!expenseOrder) {
      throw new NotFoundException(`OG con id ${id} no encontrada`);
    }

    if (!EDITABLE_STATUSES.includes(expenseOrder.status as ExpenseOrderStatus)) {
      throw new BadRequestException(
        `No se puede modificar una OG en estado ${expenseOrder.status}. Solo se permite editar en estados DRAFT o CREATED.`,
      );
    }

    // Validate new workOrderId if changed
    if (dto.workOrderId) {
      const workOrder = await this.prisma.workOrder.findUnique({
        where: { id: dto.workOrderId },
      });
      if (!workOrder) {
        throw new NotFoundException(`OT con id ${dto.workOrderId} no encontrada`);
      }
    }

    // Validate subcategory belongs to type
    if (dto.expenseTypeId || dto.expenseSubcategoryId) {
      const typeId = dto.expenseTypeId ?? expenseOrder.expenseType.id;
      const subcatId = dto.expenseSubcategoryId ?? expenseOrder.expenseSubcategory.id;
      const subcategory = await this.prisma.expenseSubcategory.findFirst({
        where: { id: subcatId, expenseTypeId: typeId },
      });
      if (!subcategory) {
        throw new BadRequestException('La subcategoría no pertenece al tipo de gasto indicado');
      }
    }

    const { items, ...scalarData } = dto;

    // Update scalar fields
    if (Object.keys(scalarData).length > 0) {
      await this.repository.update(id, scalarData);
    }

    // Replace items if provided
    if (items && items.length > 0) {
      const itemsData = items.map((item, index) => ({
        quantity: item.quantity ?? 1,
        name: item.name ?? '',
        description: item.description,
        supplierId: item.supplierId,
        unitPrice: item.unitPrice ?? 0,
        total: (item.quantity ?? 1) * (item.unitPrice ?? 0),
        paymentMethod: item.paymentMethod ?? 'CASH',
        bankEntity: item.bankEntity,
        receiptFileId: item.receiptFileId,
        referenceFileId: item.referenceFileId,
        productionAreaIds: item.productionAreaIds,
        sortOrder: index,
      }));
      await this.repository.replaceItems(id, itemsData);
    }

    const updated = await this.repository.findById(id);

    const ap = await this.accountsPayableService.findByExpenseOrderId(id);
    if (ap && !['PAID', 'CANCELLED'].includes(ap.status)) {
      const subtotal = (updated!.items as Array<{ total: unknown }>).reduce(
        (sum, item) => sum + Number(item.total),
        0,
      );
      const newTotal = this.totalToPay(subtotal, updated as Parameters<typeof this.totalToPay>[1]);
      const syncData: {
        totalAmount: number;
        subtotalAmount: number;
        expenseTypeId?: string;
        expenseSubcategoryId?: string;
        applyIva?: boolean;
        ivaRate?: number;
        retefuenteRate?: number;
        reteICARate?: number;
        reteIVARate?: number;
      } = {
        totalAmount: newTotal,
        subtotalAmount: subtotal,
        applyIva: (updated as { applyIva?: boolean }).applyIva,
        ivaRate: Number((updated as { ivaRate?: unknown }).ivaRate ?? 0.19),
        retefuenteRate: Number((updated as { retefuenteRate?: unknown }).retefuenteRate ?? 0),
        reteICARate: Number((updated as { reteICARate?: unknown }).reteICARate ?? 0),
        reteIVARate: Number((updated as { reteIVARate?: unknown }).reteIVARate ?? 0),
      };
      if (dto.expenseTypeId) syncData.expenseTypeId = dto.expenseTypeId;
      if (dto.expenseSubcategoryId) syncData.expenseSubcategoryId = dto.expenseSubcategoryId;
      await this.accountsPayableService.syncFromExpenseOrder(ap.id, syncData);
    }

    return updated;
  }

  async addItem(id: string, dto: CreateExpenseItemDto) {
    const expenseOrder = await this.repository.findById(id);
    if (!expenseOrder) {
      throw new NotFoundException(`OG con id ${id} no encontrada`);
    }

    if (!EDITABLE_STATUSES.includes(expenseOrder.status as ExpenseOrderStatus)) {
      throw new BadRequestException(
        `No se puede agregar ítems a una OG en estado ${expenseOrder.status}. Solo se permite en estados DRAFT o CREATED.`,
      );
    }

    // Compute sortOrder as next after existing items
    const sortOrder = expenseOrder.items.length;

    await this.repository.addItem(id, {
      quantity: dto.quantity,
      name: dto.name,
      description: dto.description,
      supplierId: dto.supplierId,
      unitPrice: dto.unitPrice,
      total: dto.quantity * dto.unitPrice,
      paymentMethod: dto.paymentMethod,
      bankEntity: dto.bankEntity,
      receiptFileId: dto.receiptFileId,
      referenceFileId: dto.referenceFileId,
      productionAreaIds: dto.productionAreaIds,
      sortOrder,
    });

    const updated = await this.repository.findById(id);

    const ap = await this.accountsPayableService.findByExpenseOrderId(id);
    if (ap && !['PAID', 'CANCELLED'].includes(ap.status)) {
      const subtotal = (updated!.items as Array<{ total: unknown }>).reduce(
        (sum, item) => sum + Number(item.total),
        0,
      );
      const newTotal = this.totalToPay(subtotal, updated as Parameters<typeof this.totalToPay>[1]);
      await this.accountsPayableService.syncFromExpenseOrder(ap.id, {
        totalAmount: newTotal,
        subtotalAmount: subtotal,
      });
    }

    return updated;
  }

  async updateStatus(id: string, dto: UpdateExpenseOrderStatusDto, currentUser: AuthenticatedUser) {
    const expenseOrder = await this.repository.findById(id);
    if (!expenseOrder) {
      throw new NotFoundException(`OG con id ${id} no encontrada`);
    }

    const currentStatus = expenseOrder.status as ExpenseOrderStatus;
    const allowedNext = ALLOWED_TRANSITIONS[currentStatus];

    if (!allowedNext.includes(dto.status)) {
      throw new BadRequestException(
        `No se puede cambiar el estado de ${currentStatus} a ${dto.status}. Transiciones permitidas: ${allowedNext.join(', ') || 'ninguna'}`,
      );
    }

    // ─── Rama A: primera autorización (Admin → ADMIN_AUTHORIZED) ────────────────
    // Solo Admin puede hacerlo directamente; no-admins necesitan solicitud aprobada.
    // No crea movimientos de caja.
    if (dto.status === ExpenseOrderStatus.ADMIN_AUTHORIZED) {
      const user = await this.prisma.user.findUnique({
        where: { id: currentUser.id },
        include: { role: true },
      });

      const isAdmin = user?.role?.name === 'admin';
      let authorizedById: string;

      if (!isAdmin) {
        const hasApproval = await this.authRequestsService.hasApprovedRequest(id, currentUser.id);
        if (!hasApproval) {
          throw new ForbiddenException(
            'Autorizar una OG requiere aprobación de un administrador. Por favor, cree una solicitud de autorización.',
          );
        }

        const approvedRequest = await this.authRequestsService.getApprovedRequest(id, currentUser.id);
        await this.authRequestsService.consumeApprovedRequest(id, currentUser.id);
        await this.repository.updateStatus(id, dto.status, {
          authorizedById: approvedRequest!.reviewedById!,
          authorizedAt: new Date(),
        });
        authorizedById = approvedRequest!.reviewedById!;
      } else {
        await this.repository.updateStatus(id, dto.status, {
          authorizedById: currentUser.id,
          authorizedAt: new Date(),
        });
        authorizedById = currentUser.id;
      }

      // La OG ya tiene la firma del admin, así que ninguna solicitud de
      // autorización sigue teniendo algo que pedir. Si no se cierran acá, quedan
      // PENDING para siempre en "Solicitudes" aunque la OG ya esté autorizada o
      // pagada: así se acumularon 84 en producción. Cubre también las solicitudes
      // de otros usuarios para la misma OG, que `consumeApprovedRequest` no toca.
      await this.authRequestsService.closePendingRequestsForAuthorizedOrder(
        id,
        authorizedById,
      );

      return this.repository.findById(id);
    }

    return this.repository.updateStatus(id, dto.status);
  }

  // ─── Segunda firma Caja (endpoint dedicado /caja-authorize) ───────────────────
  // Requiere permiso 'caja_authorize_expense_orders' (verificado en el Controller).
  // La OG debe estar en ADMIN_AUTHORIZED. Crea movimientos de caja y auto-paga.
  async cajaAuthorize(id: string, currentUser: AuthenticatedUser) {
    const expenseOrder = await this.repository.findById(id);
    if (!expenseOrder) {
      throw new NotFoundException(`OG con id ${id} no encontrada`);
    }

    if (expenseOrder.status !== ExpenseOrderStatus.ADMIN_AUTHORIZED) {
      throw new BadRequestException(
        `La OG debe estar en estado ADMIN_AUTHORIZED para ser autorizada por Caja. Estado actual: ${expenseOrder.status}`,
      );
    }

    // La caja abierta se verifica ANTES de tocar el estado. Al revés, una OG sin
    // caja quedaba en AUTHORIZED sin pago ni movimientos, y como ya no estaba en
    // ADMIN_AUTHORIZED, Caja no podía volver a intentarlo.
    // La caja de la sede de la OG: un local o la Matriz (docs/PLAN_SEDES.md §4)
    const activeSession = await findActiveCashSessionForLocation(this.prisma, expenseOrder.locationId);

    if (!activeSession) {
      throw new BadRequestException(
        'No hay una sesión de caja abierta. Abre la caja y vuelve a autorizar la OG.',
      );
    }

    // Registrar autorización de Caja. La transición es condicionada: si otra
    // autorización simultánea ya la tomó, esta sale sin crear los egresos otra vez.
    const claimed = await this.repository.claimCajaAuthorization(id, currentUser.id);
    if (!claimed) {
      throw new ConflictException(
        `La OG ${expenseOrder.ogNumber} ya fue autorizada por Caja. Refresca la página para ver el estado actual.`,
      );
    }

    // Crear movimientos de caja + auto-transición a PAID

    for (const item of expenseOrder.items) {
      const receiptNumber = await this.consecutivesService.generateNumber(
        'CASH_RECEIPT',
        expenseOrder.locationId,
      );
      await this.prisma.cashMovement.create({
        data: {
          amount: item.total,
          movementType: 'EXPENSE',
          paymentMethod: item.paymentMethod || 'CASH',
          description: `Pago de ítem de Orden de Gasto ${expenseOrder.ogNumber}`,
          receiptNumber,
          cashSessionId: activeSession.id,
          performedById: currentUser.id,
          referenceType: 'EXPENSE_ORDER',
          referenceId: expenseOrder.id,
        },
      });
    }

    const paid = await this.repository.updateStatus(id, ExpenseOrderStatus.PAID);

    // Crear Cuenta por Pagar automáticamente si no existe una asociada
    const totalAmount = expenseOrder.items.reduce(
      (sum: number, item: { total: unknown }) => sum + Number(item.total),
      0,
    );
    await this.accountsPayableService.createFromExpenseOrder(
      id,
      `Orden de Gasto ${expenseOrder.ogNumber}`,
      totalAmount,
      currentUser.id,
    );

    // La CP espejo se crea al nacer la OG y nadie la conciliaba después: el
    // dinero salía por los movimientos de arriba y la cuenta seguía mostrando su
    // saldo completo, lista para que alguien la volviera a pagar. Reflejar esos
    // movimientos como abonos de la CP la deja saldada sin mover un peso más.
    await this.accountsPayableService.settleFromExpenseOrderMovements(id, currentUser.id);

    return paid;
  }

  // ─── Rechazo Caja (endpoint dedicado /caja-reject) ───────────────────────────
  // Requiere permiso 'caja_authorize_expense_orders' (verificado en el Controller).
  // La OG debe estar en ADMIN_AUTHORIZED. Devuelve la OG a CREATED con motivo de rechazo.
  async cajaReject(id: string, dto: CajaRejectExpenseOrderDto, currentUser: AuthenticatedUser) {
    const expenseOrder = await this.repository.findById(id);
    if (!expenseOrder) {
      throw new NotFoundException(`OG con id ${id} no encontrada`);
    }

    if (expenseOrder.status !== ExpenseOrderStatus.ADMIN_AUTHORIZED) {
      throw new BadRequestException(
        `La OG debe estar en estado ADMIN_AUTHORIZED para ser rechazada por Caja. Estado actual: ${expenseOrder.status}`,
      );
    }

    return this.repository.updateStatus(id, ExpenseOrderStatus.CREATED, {
      cajaRejectedById: currentUser.id,
      cajaRejectedAt: new Date(),
      cajaRejectionReason: dto.reason,
    });
  }

  // ─── Factura electrónica ──────────────────────────────────────────────────────
  // Registra/actualiza el número de factura electrónica del proveedor asociado a la
  // compra. Disponible en cualquier OG ya creada (no en DRAFT).
  async registerElectronicInvoice(id: string, electronicInvoiceNumber: string) {
    const expenseOrder = await this.repository.findById(id);
    if (!expenseOrder) {
      throw new NotFoundException(`OG con id ${id} no encontrada`);
    }

    if (expenseOrder.status === ExpenseOrderStatus.DRAFT) {
      throw new BadRequestException(
        'No se puede registrar una factura electrónica en una OG en estado BORRADOR.',
      );
    }

    return this.repository.registerElectronicInvoice(id, electronicInvoiceNumber);
  }

  async remove(id: string) {
    const expenseOrder = await this.repository.findById(id);
    if (!expenseOrder) {
      throw new NotFoundException(`OG con id ${id} no encontrada`);
    }

    // Se puede eliminar mientras nadie haya firmado: DRAFT y CREATED. Desde
    // ADMIN_AUTHORIZED en adelante ya hay autorizaciones y (en AUTHORIZED/PAID)
    // movimiento de caja, así que la orden es un hecho contable y se queda.
    if (!DELETABLE_STATUSES.includes(expenseOrder.status as ExpenseOrderStatus)) {
      throw new BadRequestException(
        `Solo se pueden eliminar OGs en estado BORRADOR o CREADA. Estado actual: ${expenseOrder.status}`,
      );
    }

    // La OG nace con una Cuenta por Pagar pegada. Si se borrara solo la OG, la
    // relación es opcional y Prisma dejaría la CxP viva con `expenseOrderId` en
    // null: una cuenta fantasma que nadie puede rastrear hasta su origen.
    const accountPayable = await this.prisma.accountPayable.findUnique({
      where: { expenseOrderId: id },
      select: {
        id: true,
        apNumber: true,
        paidAmount: true,
        _count: { select: { payments: true } },
      },
    });

    if (
      accountPayable &&
      (accountPayable._count.payments > 0 || Number(accountPayable.paidAmount) > 0)
    ) {
      throw new BadRequestException(
        `No se puede eliminar la OG ${expenseOrder.ogNumber}: su cuenta por pagar ${accountPayable.apNumber} ya tiene pagos registrados`,
      );
    }

    // Una sola transacción: o se van las dos, o no se va ninguna. Los ítems, los
    // adjuntos y las solicitudes de autorización caen por cascada.
    return this.prisma.$transaction(async (tx) => {
      if (accountPayable) {
        await tx.accountPayable.delete({ where: { id: accountPayable.id } });
      }
      return tx.expenseOrder.delete({ where: { id } });
    });
  }
}
