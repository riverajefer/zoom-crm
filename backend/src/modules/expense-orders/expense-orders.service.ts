import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { ExpenseOrderStatus, NotificationType, PaymentMethod, Prisma } from '../../generated/prisma';
import { PrismaService } from '../../database/prisma.service';
import { ConsecutivesService } from '../consecutives/consecutives.service';
import { ExpenseOrdersRepository } from './expense-orders.repository';
import {
  CajaRejectExpenseOrderDto,
  CreateExpenseItemDto,
  CreateExpenseOrderDto,
  ExpenseItemPaymentDto,
  FilterExpenseOrdersDto,
  ReturnExpenseOrderForCorrectionDto,
  UpdateExpenseOrderDto,
  UpdateExpenseOrderStatusDto,
} from './dto';
import { AuthenticatedUser } from '../../common/interfaces/auth.interface';
import { startOfDay, endOfDay } from '../../common/utils/date-range.util';
import { ExpenseOrderAuthRequestsService } from '../expense-order-auth-requests/expense-order-auth-requests.service';
import { AccountsPayableService } from '../accounts-payable/accounts-payable.service';
import { ExpenseOrderEditRequestsService } from '../expense-order-edit-requests/expense-order-edit-requests.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  allocateExpenseTotalToItems,
  computeExpenseTotals,
  ExpenseWithholdingRates,
  findItemPaymentMismatch,
} from '../../common/utils/expense-totals.util';
import { normalizeRate } from '../../common/utils/rounding.util';
import {
  assertCashSessionNotCounting,
  findActiveCashSessionForLocation,
} from '../cash-session/active-cash-session.util';
import { requireActiveLocationId } from '../../common/utils/location-context';
import { paymentMovesCash } from '../../common/utils/payment-method.util';

/** Una OG con muchos ítems genera un egreso y un consecutivo por cada uno. */
const CAJA_AUTHORIZE_TX_TIMEOUT_MS = 20_000;

/** Egreso que crea la autorización de Caja. `paymentId` = línea de un pago mixto. */
interface CashOut {
  amount: number | Prisma.Decimal;
  paymentMethod: PaymentMethod;
  paymentId: string | null;
}

/** Egreso de caja de un ítem pagado cuyo método hay que corregir. */
interface PaymentCorrection {
  movementId: string;
  paymentMethod: PaymentMethod;
}

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
/** Formato de pesos para los mensajes de error que ve el usuario. */
const formatMoney = (value: unknown) =>
  Number(String(value)).toLocaleString('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  });

const DELETABLE_STATUSES: ExpenseOrderStatus[] = [
  ExpenseOrderStatus.DRAFT,
  ExpenseOrderStatus.CREATED,
];

/**
 * Ítems de la OT que hay que validar: los de la OG más los de sus líneas, sin
 * repetidos (la validación cuenta filas).
 */
function withLineWorkOrderItems(
  workOrderItemIds: string[] | undefined,
  lines: Array<{ workOrderItemId?: string | null }> | undefined,
): string[] | undefined {
  const ids = new Set(workOrderItemIds ?? []);
  for (const line of lines ?? []) {
    if (line.workOrderItemId) ids.add(line.workOrderItemId);
  }
  return ids.size ? [...ids] : workOrderItemIds;
}

/**
 * Método de pago de un ítem tal como se guarda. Un pago mixto son dos líneas de
 * métodos distintos; el ítem lleva el método de la primera para que lo que lee
 * un solo método siga funcionando. El crédito no entra: no es dinero que salga.
 */
function itemPaymentFields(
  item: {
    paymentMethod?: PaymentMethod;
    bankEntity?: string;
    payments?: ExpenseItemPaymentDto[];
  },
  index: number,
) {
  const lines = item.payments ?? [];
  if (lines.length === 0) {
    return {
      paymentMethod: item.paymentMethod ?? PaymentMethod.CASH,
      bankEntity: item.bankEntity,
    };
  }

  if (lines.length !== 2 || lines[0].paymentMethod === lines[1].paymentMethod) {
    throw new BadRequestException(
      `El pago mixto del ítem ${index + 1} debe tener dos métodos de pago distintos.`,
    );
  }
  if (lines.some((line) => !paymentMovesCash(line.paymentMethod))) {
    throw new BadRequestException(
      `El pago mixto del ítem ${index + 1} no admite crédito: cada parte debe salir como dinero.`,
    );
  }

  const payments = lines.map((line) => ({
    paymentMethod: line.paymentMethod,
    amount: line.amount,
    bankEntity: line.paymentMethod === PaymentMethod.TRANSFER ? line.bankEntity ?? null : null,
  }));
  return {
    paymentMethod: payments[0].paymentMethod,
    bankEntity: payments[0].bankEntity ?? undefined,
    payments,
  };
}

@Injectable()
export class ExpenseOrdersService {
  constructor(
    private readonly repository: ExpenseOrdersRepository,
    private readonly consecutivesService: ConsecutivesService,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ExpenseOrderAuthRequestsService))
    private readonly authRequestsService: ExpenseOrderAuthRequestsService,
    private readonly accountsPayableService: AccountsPayableService,
    private readonly editRequestsService: ExpenseOrderEditRequestsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Los ítems a los que aplica la OG tienen que ser de su OT. Sin ítems no hay
   * nada que validar: la OG es gasto de toda la OT.
   */
  private async assertWorkOrderItemsBelongTo(
    workOrderId: string | null | undefined,
    workOrderItemIds: string[] | undefined,
  ) {
    if (!workOrderItemIds?.length) return;
    if (!workOrderId) {
      throw new BadRequestException(
        'Para asociar ítems de OT, la OG debe tener una OT asociada',
      );
    }
    const found = await this.prisma.workOrderItem.count({
      where: { id: { in: workOrderItemIds }, workOrderId },
    });
    if (found !== workOrderItemIds.length) {
      throw new BadRequestException('Alguno de los ítems no pertenece a la OT asociada');
    }
  }

  /**
   * La máquina es opcional, pero si hay área encargada no puede ser de otra
   * área. Las máquinas sin área asignada valen para cualquiera: en PRD casi
   * ninguna la tiene (2026-10). El área se guarda por nombre (`areaOrMachine`),
   * así que se compara contra el nombre del área de la máquina.
   */
  private async assertMachineBelongsToArea(
    machineId: string | null | undefined,
    areaName: string | null | undefined,
  ) {
    if (!machineId) return;
    const machine = await this.prisma.machine.findUnique({
      where: { id: machineId },
      select: { productionArea: { select: { name: true } } },
    });
    if (!machine) {
      throw new NotFoundException(`Máquina con id ${machineId} no encontrada`);
    }
    if (areaName && machine.productionArea && machine.productionArea.name !== areaName) {
      throw new BadRequestException('La máquina no pertenece al área encargada');
    }
  }

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

  /** Cada pago mixto tiene que sumar lo que su ítem paga del total de la OG. */
  private assertItemPaymentsCoverShares(
    items: Parameters<typeof findItemPaymentMismatch>[0],
    rates: ExpenseWithholdingRates,
  ) {
    const mismatch = findItemPaymentMismatch(items, rates);
    if (mismatch) {
      throw new BadRequestException(
        `El pago mixto del ítem ${mismatch.index + 1} suma ${formatMoney(mismatch.paid)} y a ese ítem le corresponden ${formatMoney(mismatch.expected)}. Ajusta la división del pago.`,
      );
    }
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
    await this.assertWorkOrderItemsBelongTo(
      dto.workOrderId,
      withLineWorkOrderItems(dto.workOrderItemIds, dto.items),
    );
    await this.assertMachineBelongsToArea(dto.machineId, dto.areaOrMachine);

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
      ...itemPaymentFields(item, index),
      receiptFileId: item.receiptFileId,
      referenceFileId: item.referenceFileId,
      productionAreaIds: item.productionAreaIds,
      workOrderItemId: item.workOrderItemId ?? null,
      sortOrder: index,
    }));
    this.assertItemPaymentsCoverShares(itemsData, {
      applyIva: dto.applyIva ?? false,
      ivaRate: dto.ivaRate ?? 0.19,
      retefuenteRate: normalizeRate(dto.retefuenteRate).toNumber(),
      reteICARate: normalizeRate(dto.reteICARate).toNumber(),
      reteIVARate: dto.reteIVARate ?? 0,
    });

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
          workOrderItemIds: dto.workOrderItemIds,
          authorizedToId: dto.authorizedToId,
          responsibleId: dto.responsibleId,
          observations: dto.observations,
          comments: dto.comments,
          areaOrMachine: dto.areaOrMachine,
          machineId: dto.machineId,
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
          await this.consecutivesService.syncCounter('EXPENSE');
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

    // El formulario solo habilita el método de pago de los ítems pagados que
    // el backend dejaría corregir (ver `assertPaidItemsKeepPayment`).
    let paymentCorrectableItems = 0;
    if (expenseOrder.status === ExpenseOrderStatus.PAID) {
      const movements = await this.paidItemMovements(id);
      paymentCorrectableItems = this.paymentCorrectableCount(expenseOrder.items, movements);
    }
    return { ...expenseOrder, paymentCorrectableItems };
  }

  async update(id: string, dto: UpdateExpenseOrderDto, currentUser?: AuthenticatedUser) {
    const expenseOrder = await this.repository.findById(id);
    if (!expenseOrder) {
      throw new NotFoundException(`OG con id ${id} no encontrada`);
    }

    const isPaidEdit = expenseOrder.status === ExpenseOrderStatus.PAID;

    // Lo más común es tener el formulario abierto mientras el admin firma
    // (OG-2026-0888): el mensaje tiene que decir cómo seguir, no el estado.
    if (expenseOrder.status === ExpenseOrderStatus.ADMIN_AUTHORIZED) {
      throw new BadRequestException(
        `El admin ya firmó la ${expenseOrder.ogNumber} y no se puede editar así. Si tiene un error, usa «Devolver a corrección» en el detalle de la OG antes de que Caja la pague.`,
      );
    }

    if (!isPaidEdit && !EDITABLE_STATUSES.includes(expenseOrder.status as ExpenseOrderStatus)) {
      throw new BadRequestException(
        `No se puede modificar una OG en estado ${expenseOrder.status}. Solo se permite editar en estados DRAFT o CREATED, o una OG pagada con autorización del admin.`,
      );
    }

    // Una OG pagada se edita sin reabrirse: los egresos de caja que ya salieron
    // se quedan como están y, si el total sube, la diferencia queda como saldo
    // de su CP para que Caja la pague por ahí.
    let editApprovalId: string | null = null;
    let paymentCorrections: PaymentCorrection[] = [];
    if (isPaidEdit) {
      editApprovalId = await this.assertCanEditPaid(id, currentUser);
      paymentCorrections = await this.assertPaidItemsKeepPayment(id, expenseOrder.items, dto.items);
      await this.assertTotalCoversPaid(expenseOrder, dto);

      // Se consume antes de escribir: dos guardados simultáneos con la misma
      // aprobación no salen los dos. Si la escritura falla, se devuelve.
      if (editApprovalId) {
        const consumed = await this.editRequestsService.consumeApproval(editApprovalId);
        if (!consumed) {
          throw new ConflictException(
            'La autorización de edición ya se usó. Solicita una nueva si necesitas corregir otra cosa.',
          );
        }
      }
    }

    try {
      return await this.applyUpdate(id, expenseOrder, dto, isPaidEdit, currentUser?.id, paymentCorrections);
    } catch (error) {
      if (editApprovalId) {
        await this.prisma.expenseOrderEditRequest.update({
          where: { id: editApprovalId },
          data: { consumedAt: null },
        });
      }
      throw error;
    }
  }

  /**
   * ¿Quién puede editar una OG pagada? El admin, directamente. Cualquier otro,
   * solo con una solicitud de edición aprobada, vigente y sin usar. Devuelve el
   * id de esa solicitud (o null para el admin).
   */
  private async assertCanEditPaid(id: string, currentUser?: AuthenticatedUser): Promise<string | null> {
    if (!currentUser) {
      throw new ForbiddenException('Editar una OG pagada requiere autorización del administrador.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: currentUser.id },
      include: { role: true },
    });
    if (user?.role?.name === 'admin') return null;

    const approval = await this.editRequestsService.findActiveApproval(id, currentUser.id);
    if (!approval) {
      throw new ForbiddenException(
        'Esta OG ya está pagada. Para editarla, solicita autorización al administrador.',
      );
    }
    return approval.id;
  }

  /**
   * Los ítems de una OG pagada ya tienen su egreso de caja: no se pueden quitar
   * ni cambiar su comprobante. Sí se pueden corregir cantidad, precio y
   * descripción, agregar ítems nuevos y subir un comprobante que faltaba. Los
   * ítems llegan en el mismo orden en que se guardaron.
   *
   * El método de pago y el banco se pueden corregir solo mientras la sesión de
   * caja del egreso siga abierta: nadie ha contado el cajón todavía, así que
   * cambiar el método del egreso deja el arqueo correcto en vez de
   * descuadrarlo. Con la caja cerrada se bloquea, porque el arqueo ya se firmó.
   * Devuelve los egresos que hay que corregir.
   */
  private async assertPaidItemsKeepPayment(
    expenseOrderId: string,
    existing: Array<{
      paymentMethod: string;
      bankEntity: string | null;
      receiptFileId: string | null;
      payments?: Array<{ paymentMethod: string; amount: unknown }>;
    }>,
    incoming: UpdateExpenseOrderDto['items'],
  ): Promise<PaymentCorrection[]> {
    if (!incoming || incoming.length === 0) return [];

    if (incoming.length < existing.length) {
      throw new BadRequestException(
        'En una OG pagada no se pueden quitar ítems: cada uno ya salió de caja.',
      );
    }

    // La diferencia de una OG pagada se paga desde su CP, no con un pago mixto.
    if (incoming.slice(existing.length).some((item) => item.payments?.length)) {
      throw new BadRequestException(
        'Un ítem agregado a una OG pagada no lleva pago mixto: la diferencia se paga desde su CP.',
      );
    }

    const hasMixedPayment = existing.some((item) => item.payments?.length);
    const movements = await this.paidItemMovements(expenseOrderId);
    const correctable = this.paymentCorrectableCount(existing, movements);
    const corrections: PaymentCorrection[] = [];

    existing.forEach((item, index) => {
      const next = incoming[index];
      const nextMethod = next.paymentMethod ?? 'CASH';
      const methodChanged = nextMethod !== item.paymentMethod;
      const bankChanged = (next.bankEntity ?? null) !== (item.bankEntity ?? null);
      const receiptKept =
        !item.receiptFileId || (next.receiptFileId ?? null) === item.receiptFileId;

      if (!receiptKept) {
        throw new BadRequestException(
          `El ítem ${index + 1} ya se pagó: no se puede cambiar su comprobante.`,
        );
      }

      const paidLines = item.payments ?? [];
      const nextLines = next.payments ?? [];
      const linesChanged =
        nextLines.length > 0 &&
        (nextLines.length !== paidLines.length ||
          nextLines.some(
            (line, lineIndex) =>
              line.paymentMethod !== paidLines[lineIndex].paymentMethod ||
              line.amount !== Number(paidLines[lineIndex].amount),
          ));

      if (linesChanged) {
        throw new BadRequestException(
          `El ítem ${index + 1} ya se pagó: no se puede cambiar la división de su pago.`,
        );
      }

      // Las líneas ya pagadas se conservan tal cual: lo que diga el ítem no las toca.
      if (paidLines.length > 0) return;

      if (!methodChanged && !bankChanged) return;

      if (hasMixedPayment) {
        throw new BadRequestException(
          `El ítem ${index + 1} es de una OG con pago mixto ya pagada: no se puede cambiar su método de pago ni banco.`,
        );
      }

      if (index >= correctable) {
        throw new BadRequestException(
          `El ítem ${index + 1} ya se pagó y la caja de donde salió ya se cerró: ` +
            'no se puede cambiar su método de pago ni banco.',
        );
      }

      // Pasar a crédito diría que no salió dinero, y el egreso sí salió: eso
      // no es corregir el método, es anular el pago.
      if (methodChanged && !paymentMovesCash(nextMethod)) {
        throw new BadRequestException(
          `El ítem ${index + 1} ya se pagó: su método de pago no puede pasar a ${nextMethod}.`,
        );
      }

      if (methodChanged) {
        corrections.push({ movementId: movements[index].id, paymentMethod: nextMethod });
      }
    });

    return corrections;
  }

  /**
   * Egresos de caja que generó la autorización de Caja de la OG, en el orden de
   * los ítems: `cajaAuthorize` los crea en ese orden y es el único camino que
   * escribe egresos con referencia a la OG. Son uno por ítem, salvo con pago
   * mixto, y por eso ahí no se empareja por posición.
   */
  private paidItemMovements(expenseOrderId: string) {
    return this.prisma.cashMovement.findMany({
      where: {
        referenceType: 'EXPENSE_ORDER',
        referenceId: expenseOrderId,
        movementType: 'EXPENSE',
        isVoided: false,
      },
      select: {
        id: true,
        paymentMethod: true,
        cashSession: { select: { status: true } },
      },
      orderBy: [{ createdAt: 'asc' }, { receiptNumber: 'asc' }],
    });
  }

  /**
   * Cuántos de los primeros ítems pagados admiten corregir su método de pago.
   * Los ítems agregados al editar la OG ya pagada van al final y no tienen
   * egreso, así que hay a lo sumo un egreso por ítem. Si hay más egresos que
   * ítems (OG viejas, movimientos manuales), no se sabe cuál es de cuál y no se
   * corrige nada. Tampoco con pago mixto: un ítem tiene dos egresos y agregar
   * otro ítem haría que la posición apuntara al egreso equivocado. Todos
   * salieron en la misma autorización, así que la caja está abierta para todos
   * o para ninguno.
   */
  private paymentCorrectableCount(
    items: Array<{ paymentMethod: string; payments?: unknown[] }>,
    movements: Array<{ paymentMethod: string; cashSession: { status: string } | null }>,
  ): number {
    if (movements.length === 0 || movements.length > items.length) return 0;
    if (items.some((item) => item.payments?.length)) return 0;

    const consistent = movements.every(
      (movement, index) =>
        movement.cashSession?.status === 'OPEN' &&
        movement.paymentMethod === items[index].paymentMethod &&
        paymentMovesCash(items[index].paymentMethod as PaymentMethod),
    );
    return consistent ? movements.length : 0;
  }

  /**
   * Corrige el método del egreso y del abono de la CP que lo refleja. Exige
   * otra vez la sesión abierta: si Caja cerró entre la validación y este punto,
   * la edición no sale.
   */
  private async applyPaymentCorrections(
    tx: Prisma.TransactionClient,
    corrections: PaymentCorrection[],
  ) {
    for (const { movementId, paymentMethod } of corrections) {
      const { count } = await tx.cashMovement.updateMany({
        where: { id: movementId, isVoided: false, cashSession: { is: { status: 'OPEN' } } },
        data: { paymentMethod },
      });
      if (count === 0) {
        throw new ConflictException(
          'La caja de donde salió el pago se acaba de cerrar: ya no se puede cambiar el método de pago.',
        );
      }
      await tx.accountPayablePayment.updateMany({
        where: { cashMovementId: movementId },
        data: { paymentMethod },
      });
    }
  }

  /**
   * El nuevo total no puede quedar por debajo de lo que ya se le pagó al
   * proveedor: eso sería un cobro de más que hay que recuperar por fuera, no
   * una corrección de la OG.
   */
  private async assertTotalCoversPaid(
    expenseOrder: NonNullable<Awaited<ReturnType<ExpenseOrdersRepository['findById']>>>,
    dto: UpdateExpenseOrderDto,
  ) {
    const subtotal =
      dto.items && dto.items.length > 0
        ? dto.items.reduce((sum, item) => sum + (item.quantity ?? 1) * (item.unitPrice ?? 0), 0)
        : expenseOrder.items.reduce((sum: number, item: { total: unknown }) => sum + Number(item.total), 0);

    const newTotal = this.totalToPay(subtotal, {
      applyIva: dto.applyIva ?? expenseOrder.applyIva,
      ivaRate: dto.ivaRate ?? expenseOrder.ivaRate,
      retefuenteRate: dto.retefuenteRate ?? expenseOrder.retefuenteRate,
      reteICARate: dto.reteICARate ?? expenseOrder.reteICARate,
      reteIVARate: dto.reteIVARate ?? expenseOrder.reteIVARate,
    });

    const paid = await this.amountPaid(expenseOrder.id);

    // Un peso de tolerancia: los totales con retenciones traen centavos y los
    // egresos se repartieron por ítem desde ese mismo total.
    if (new Prisma.Decimal(newTotal).add(1).lessThan(paid)) {
      throw new BadRequestException(
        `El nuevo total (${formatMoney(newTotal)}) queda por debajo de lo que ya se pagó (${formatMoney(paid)}). ` +
          'Una OG pagada solo se puede corregir hacia arriba o al mismo valor.',
      );
    }
  }

  /**
   * Lo que ya salió por esta OG: los abonos vivos de su CP más los egresos de
   * la OG que la CP todavía no refleja. Sin CP, solo los egresos de la OG.
   */
  private async amountPaid(expenseOrderId: string): Promise<Prisma.Decimal> {
    const ap = await this.accountsPayableService.findByExpenseOrderId(expenseOrderId);
    if (ap) {
      const notReflected = await this.accountsPayableService.paidThroughExpenseOrder(ap.id);
      return new Prisma.Decimal(ap.paidAmount).add(notReflected);
    }

    const { _sum } = await this.prisma.cashMovement.aggregate({
      where: {
        referenceType: 'EXPENSE_ORDER',
        referenceId: expenseOrderId,
        movementType: 'EXPENSE',
        isVoided: false,
      },
      _sum: { amount: true },
    });
    return new Prisma.Decimal(_sum.amount ?? 0);
  }

  private async applyUpdate(
    id: string,
    expenseOrder: NonNullable<Awaited<ReturnType<ExpenseOrdersRepository['findById']>>>,
    dto: UpdateExpenseOrderDto,
    isPaidEdit: boolean,
    // Siempre presente cuando `isPaidEdit`: `assertCanEditPaid` exige usuario.
    editedById?: string,
    paymentCorrections: PaymentCorrection[] = [],
  ) {

    // Validate new workOrderId if changed
    if (dto.workOrderId) {
      const workOrder = await this.prisma.workOrder.findUnique({
        where: { id: dto.workOrderId },
      });
      if (!workOrder) {
        throw new NotFoundException(`OT con id ${dto.workOrderId} no encontrada`);
      }
    }

    // `workOrderId` undefined = no cambia; null = se quita la OT.
    const currentWorkOrderId = expenseOrder.workOrder?.id ?? null;
    const nextWorkOrderId =
      dto.workOrderId === undefined ? currentWorkOrderId : dto.workOrderId;
    await this.assertWorkOrderItemsBelongTo(
      nextWorkOrderId,
      withLineWorkOrderItems(dto.workOrderItemIds, dto.items),
    );
    await this.assertMachineBelongsToArea(
      dto.machineId === undefined ? expenseOrder.machine?.id : dto.machineId,
      dto.areaOrMachine === undefined ? expenseOrder.areaOrMachine : dto.areaOrMachine,
    );
    // Los ítems son de la OT: si la OT cambia y no llegan ítems nuevos, los
    // viejos quedarían apuntando a otra OT.
    const nextWorkOrderItemIds =
      dto.workOrderItemIds ?? (nextWorkOrderId !== currentWorkOrderId ? [] : undefined);

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

    const { items, workOrderItemIds: _, ...scalarData } = dto;

    // Se arma antes de escribir: un pago mixto inválido no deja la OG a medias.
    const itemsData = items?.map((item, index) => {
      // Lo pagado por líneas se conserva con su egreso (ver `assertPaidItemsKeepPayment`).
      const paid = isPaidEdit ? expenseOrder.items[index] : undefined;
      const payment = paid?.payments?.length
        ? {
            paymentMethod: paid.paymentMethod,
            bankEntity: paid.bankEntity ?? undefined,
            payments: paid.payments,
          }
        : itemPaymentFields(item, index);

      return {
        quantity: item.quantity ?? 1,
        name: item.name ?? '',
        description: item.description,
        supplierId: item.supplierId,
        unitPrice: item.unitPrice ?? 0,
        total: (item.quantity ?? 1) * (item.unitPrice ?? 0),
        ...payment,
        receiptFileId: item.receiptFileId,
        referenceFileId: item.referenceFileId,
        productionAreaIds: item.productionAreaIds,
        workOrderItemId: item.workOrderItemId ?? null,
        sortOrder: index,
      };
    });

    // En una OG pagada las líneas ya salieron de caja: si el total sube, la
    // diferencia queda en la CP y esas líneas no tienen por qué sumarlo.
    if (!isPaidEdit) {
      this.assertItemPaymentsCoverShares(itemsData?.length ? itemsData : expenseOrder.items, {
        applyIva: dto.applyIva ?? expenseOrder.applyIva,
        ivaRate: dto.ivaRate ?? expenseOrder.ivaRate,
        retefuenteRate: dto.retefuenteRate ?? expenseOrder.retefuenteRate,
        reteICARate: dto.reteICARate ?? expenseOrder.reteICARate,
        reteIVARate: dto.reteIVARate ?? expenseOrder.reteIVARate,
      });
    }

    // Update scalar fields
    if (Object.keys(scalarData).length > 0) {
      await this.repository.update(id, scalarData);
    }

    if (nextWorkOrderItemIds !== undefined) {
      await this.repository.replaceWorkOrderItems(id, nextWorkOrderItemIds);
    }
    // Si llegan líneas nuevas, traen su propio ítem; si no, las viejas
    // quedarían apuntando a ítems de otra OT.
    if (nextWorkOrderId !== currentWorkOrderId && !items?.length) {
      await this.repository.clearItemWorkOrderLinks(id);
    }

    // Replace items if provided
    if (itemsData && itemsData.length > 0) {
      if (paymentCorrections.length > 0) {
        // El ítem y su egreso cambian de método juntos o ninguno.
        await this.prisma.$transaction(async (tx) => {
          await this.applyPaymentCorrections(tx, paymentCorrections);
          await this.repository.replaceItems(id, itemsData, tx);
        });
      } else {
        await this.repository.replaceItems(id, itemsData);
      }
    }

    const updated = await this.repository.findById(id);

    const ap = await this.accountsPayableService.findByExpenseOrderId(id);

    // OG pagada sin CP espejo (las más viejas): se crea ahora con el nuevo total
    // y se salda contra los egresos de la OG, así la diferencia queda pagable.
    if (!ap && isPaidEdit) {
      const subtotal = (updated!.items as Array<{ total: unknown }>).reduce(
        (sum, item) => sum + Number(item.total),
        0,
      );
      const created = await this.accountsPayableService.createFromExpenseOrder(
        id,
        `Orden de Gasto ${updated!.ogNumber}`,
        this.totalToPay(subtotal, updated as Parameters<typeof this.totalToPay>[1]),
        editedById!,
        subtotal,
      );
      await this.accountsPayableService.settleFromExpenseOrderMovements(id, editedById!);
      await this.accountsPayableService.refreshFromLivePayments(created.id);
      return this.repository.findById(id);
    }

    // Una CP saldada no se toca en la edición normal; en la de una OG pagada sí,
    // porque es justo donde tiene que quedar la diferencia.
    if (ap && ap.status !== 'CANCELLED' && (isPaidEdit || ap.status !== 'PAID')) {
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

      if (isPaidEdit) {
        // Refleja en la CP los egresos de la OG que todavía no estuvieran (CP
        // históricas sin conciliar) y recalcula estado y saldo: si el total
        // subió, la CP pasa de PAID a deber la diferencia.
        await this.accountsPayableService.settleFromExpenseOrderMovements(id, editedById!);
        await this.accountsPayableService.refreshFromLivePayments(ap.id);
      }
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

    await this.assertWorkOrderItemsBelongTo(
      expenseOrder.workOrder?.id,
      dto.workOrderItemId ? [dto.workOrderItemId] : undefined,
    );

    if (dto.payments?.length) {
      throw new BadRequestException('El pago mixto se define al editar la OG, no al agregar un ítem.');
    }
    // El reparto es proporcional, pero el redondeo a peso entero puede mover un
    // peso entre ítems y dejar sin cuadrar un pago mixto que ya existía.
    this.assertItemPaymentsCoverShares(
      [...expenseOrder.items, { total: dto.quantity * dto.unitPrice }],
      expenseOrder,
    );

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
      workOrderItemId: dto.workOrderItemId ?? null,
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
      await this.assertNotPaidThroughAccountPayable(id, expenseOrder.ogNumber);

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

      // Sin este aviso Caja no se enteraba de que la OG la esperaba, y pagaba la
      // CP espejo por su lado (OG-2026-0832). Los admins quedan por fuera: son
      // quienes acaban de firmar. En Zoom solo le llega a la caja de la sede de
      // la OG, que es la que paga (`findActiveCashSessionForLocation`).
      await this.notificationsService.notifyUsersWithPermission(
        'caja_authorize_expense_orders',
        {
          type: NotificationType.EXPENSE_ORDER_PENDING_CAJA,
          title: 'OG pendiente de Caja',
          message: `La ${expenseOrder.ogNumber} ya tiene la firma del admin y espera la autorización de Caja para el pago.`,
          relatedId: id,
          relatedType: 'ExpenseOrder',
        },
        { locationId: expenseOrder.locationId },
        [],
        { excludeAdmins: true },
      );

      return this.repository.findById(id);
    }

    return this.repository.updateStatus(id, dto.status);
  }

  /**
   * Una OG cuya CP espejo ya se pagó desde Cuentas por Pagar no puede seguir al
   * pago por Caja: sus egresos sacarían el mismo gasto otra vez. Se revisa al
   * firmar el admin y otra vez al firmar Caja, que es donde sale el dinero.
   */
  private async assertNotPaidThroughAccountPayable(expenseOrderId: string, ogNumber: string) {
    const pagado = await this.accountsPayableService.paidOutsideExpenseOrder(expenseOrderId);
    if (!pagado) return;

    const monto = Number(pagado.amount).toLocaleString('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    });
    throw new ConflictException(
      `La ${ogNumber} ya se pagó desde Cuentas por Pagar (${pagado.apNumber}, ${monto}). ` +
        `Autorizarla registraría el gasto dos veces en caja. Si ese pago fue un error, revírtelo desde la CP antes de autorizar.`,
    );
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

    // Las dos firmas son para que una persona apruebe el gasto y otra entregue
    // el dinero. El rol admin tiene también el permiso de Caja, y firmar los dos
    // pasos anulaba el control (OG-2026-0832: 4 OG en 60 días, todas de admins).
    // Un admin sí puede autorizar en Caja una OG que firmó otro admin.
    if (expenseOrder.authorizedById === currentUser.id) {
      throw new ForbiddenException(
        `Firmaste la ${expenseOrder.ogNumber} como admin, así que la autorización de Caja la debe hacer otra persona.`,
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

    // Cada egreso lleva su parte del total a pagar (con IVA y menos
    // retenciones), no solo la base del ítem: es lo que Caja entrega al ver la
    // OG. Con la base, el cajón quedaba corto por el IVA en cada OG con IVA.
    const subtotal = expenseOrder.items.reduce(
      (sum: number, item: { total: unknown }) => sum + Number(item.total),
      0,
    );
    const itemAmounts = allocateExpenseTotalToItems(
      expenseOrder.items.map((item: { total: unknown }) => Number(item.total)),
      expenseOrder,
    );

    // Un pago mixto genera un egreso por línea: el arqueo cuenta solo el
    // efectivo, así que la transferencia no puede salir en el mismo egreso.
    this.assertItemPaymentsCoverShares(expenseOrder.items, expenseOrder);
    const cashOuts = expenseOrder.items.flatMap<CashOut>((item, index) =>
      item.payments?.length
        ? item.payments.map((payment) => ({
            amount: payment.amount,
            paymentMethod: payment.paymentMethod,
            paymentId: payment.id,
          }))
        : [
            {
              amount: itemAmounts[index],
              paymentMethod: item.paymentMethod || PaymentMethod.CASH,
              paymentId: null,
            },
          ],
    );

    for (const cashOut of cashOuts) {
      assertCashSessionNotCounting(activeSession, cashOut.paymentMethod);
    }

    await this.assertNotPaidThroughAccountPayable(expenseOrder.id, expenseOrder.ogNumber);

    // Autorización, egresos y paso a PAID van juntos o no va ninguno: si fallaba
    // a mitad, la OG quedaba con parte del dinero fuera y ya sin poder reintentar.
    const paid = await this.prisma.$transaction(
      async (tx) => {
        // La transición es condicionada: si otra autorización simultánea ya la
        // tomó, esta sale sin crear los egresos otra vez.
        const claimed = await this.repository.claimCajaAuthorization(id, currentUser.id, tx);
        if (!claimed) {
          throw new ConflictException(
            `La OG ${expenseOrder.ogNumber} ya fue autorizada por Caja. Refresca la página para ver el estado actual.`,
          );
        }

        for (const cashOut of cashOuts) {
          const receiptNumber = await this.consecutivesService.generateNumber(
            'CASH_RECEIPT',
            expenseOrder.locationId,
          );
          const movement = await tx.cashMovement.create({
            data: {
              amount: cashOut.amount,
              movementType: 'EXPENSE',
              paymentMethod: cashOut.paymentMethod,
              description: cashOut.paymentId
                ? `Pago mixto de ítem de Orden de Gasto ${expenseOrder.ogNumber}`
                : `Pago de ítem de Orden de Gasto ${expenseOrder.ogNumber}`,
              receiptNumber,
              cashSessionId: activeSession.id,
              performedById: currentUser.id,
              referenceType: 'EXPENSE_ORDER',
              referenceId: expenseOrder.id,
            },
          });

          if (cashOut.paymentId) {
            await tx.expenseOrderItemPayment.update({
              where: { id: cashOut.paymentId },
              data: { cashMovementId: movement.id },
            });
          }
        }

        return this.repository.updateStatus(id, ExpenseOrderStatus.PAID, undefined, tx);
      },
      { timeout: CAJA_AUTHORIZE_TX_TIMEOUT_MS },
    );

    // Crear Cuenta por Pagar automáticamente si no existe una asociada. Con el
    // mismo total que los egresos de arriba; con la base, la CP nacía por debajo
    // de lo girado.
    await this.accountsPayableService.createFromExpenseOrder(
      id,
      `Orden de Gasto ${expenseOrder.ogNumber}`,
      this.totalToPay(subtotal, expenseOrder),
      currentUser.id,
      subtotal,
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

  // ─── Devolver a corrección (endpoint dedicado /return-for-correction) ────────
  // Una OG con la firma del admin no se edita: se firmó sobre esos valores. Si
  // tiene un error, quien la creó o Caja la devuelven a CREATED con un motivo,
  // se corrige y el admin vuelve a firmar. Solo antes de que Caja la pague.
  async returnForCorrection(
    id: string,
    dto: ReturnExpenseOrderForCorrectionDto,
    currentUser: AuthenticatedUser,
  ) {
    const expenseOrder = await this.repository.findById(id);
    if (!expenseOrder) {
      throw new NotFoundException(`OG con id ${id} no encontrada`);
    }

    if (expenseOrder.status !== ExpenseOrderStatus.ADMIN_AUTHORIZED) {
      throw new BadRequestException(
        expenseOrder.status === ExpenseOrderStatus.PAID ||
          expenseOrder.status === ExpenseOrderStatus.AUTHORIZED
          ? `La ${expenseOrder.ogNumber} ya la pagó Caja. Para corregirla, solicita la edición al administrador.`
          : `Solo se devuelve a corrección una OG con la firma del admin. La ${expenseOrder.ogNumber} se puede editar directamente.`,
      );
    }

    await this.assertCanReturnForCorrection(expenseOrder.createdBy.id, currentUser.id);

    const claimed = await this.repository.claimReturnForCorrection(
      id,
      currentUser.id,
      dto.reason.trim(),
    );
    if (!claimed) {
      throw new ConflictException(
        `La ${expenseOrder.ogNumber} cambió de estado mientras tanto (posiblemente Caja ya la pagó). Refresca la página.`,
      );
    }

    // Avisa al admin que firmó (tendrá que volver a hacerlo) y a quien la creó
    // (es quien la corrige). Quien la devolvió no se avisa a sí mismo.
    const recipients = new Set(
      [expenseOrder.authorizedById, expenseOrder.createdBy.id].filter(
        (userId): userId is string => !!userId && userId !== currentUser.id,
      ),
    );
    for (const userId of recipients) {
      await this.notificationsService.create({
        userId,
        type: NotificationType.EXPENSE_ORDER_RETURNED_FOR_CORRECTION,
        title: 'OG devuelta a corrección',
        message: `La ${expenseOrder.ogNumber} se devolvió a corrección: «${dto.reason.trim()}». Necesita otra firma del admin.`,
        relatedId: id,
        relatedType: 'ExpenseOrder',
      });
    }

    return this.repository.findById(id);
  }

  /** Quien creó la OG, Caja (la última en revisarla) o un admin. */
  private async assertCanReturnForCorrection(createdById: string, userId: string) {
    if (createdById === userId) return;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: {
          select: {
            name: true,
            permissions: { select: { permission: { select: { name: true } } } },
          },
        },
      },
    });
    const isAdmin = user?.role?.name === 'admin';
    const isCaja = user?.role?.permissions.some(
      (rp) => rp.permission.name === 'caja_authorize_expense_orders',
    );
    if (!isAdmin && !isCaja) {
      throw new ForbiddenException(
        'Solo quien creó la OG o Caja pueden devolverla a corrección.',
      );
    }
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

  // ─── Comprobante de pago de un ítem ───────────────────────────────────────────
  // Muchas OG se crean y se autorizan antes de tener el soporte del pago; este
  // camino deja subirlo después, en cualquier estado, sin la autorización de
  // edición que exige una OG pagada. También reemplaza uno ya adjunto (una foto
  // borrosa, el soporte equivocado), pero nunca lo quita: el ítem siempre queda
  // con un comprobante. El archivo anterior se conserva en el storage.
  async attachItemReceipt(id: string, itemId: string, receiptFileId: string) {
    const expenseOrder = await this.repository.findById(id);
    if (!expenseOrder) {
      throw new NotFoundException(`OG con id ${id} no encontrada`);
    }

    const item = expenseOrder.items.find((i) => i.id === itemId);
    if (!item) {
      throw new NotFoundException(`El ítem ${itemId} no pertenece a la OG ${expenseOrder.ogNumber}`);
    }

    if (item.receiptFileId === receiptFileId) {
      throw new BadRequestException('Ese archivo ya es el comprobante de este ítem.');
    }

    const file = await this.prisma.uploadedFile.findFirst({
      where: { id: receiptFileId, isDeleted: false },
      select: { id: true },
    });
    if (!file) {
      throw new BadRequestException('El archivo del comprobante no existe.');
    }

    const updated = await this.repository.attachItemReceipt(
      id,
      itemId,
      receiptFileId,
      item.receiptFileId ?? null,
    );
    if (updated === 0) {
      throw new ConflictException(
        'Otra persona acaba de cambiar el comprobante de este ítem. Recarga la página.',
      );
    }

    return this.repository.findById(id);
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

    // Tampoco una que el admin ya firmó y volvió a CREATED (devuelta a
    // corrección o rechazada por Caja): la firma es un hecho y la OG tiene que
    // terminar corregida o pagada, no desaparecer. `authorizedAt` sobrevive al
    // regreso a CREATED, incluso si después pasa a DRAFT.
    if (expenseOrder.authorizedAt) {
      throw new BadRequestException(
        `La ${expenseOrder.ogNumber} ya tuvo la firma del admin y no se puede eliminar. Corrígela y solicita de nuevo la autorización.`,
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
