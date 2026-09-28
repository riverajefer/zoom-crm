import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AccountPayableStatus, Prisma } from '../../generated/prisma';
import { PrismaService } from '../../database/prisma.service';
import { ConsecutivesService } from '../consecutives/consecutives.service';
import { StorageService } from '../storage/storage.service';
import { AccountsPayableRepository } from './accounts-payable.repository';
import {
  CancelAccountPayableDto,
  CreateAccountPayableDto,
  CreateAttachmentDto,
  FilterAccountPayableDto,
  RegisterPaymentDto,
  SetInstallmentsDto,
  UpdateAccountPayableDto,
  UpdateInstallmentDto,
} from './dto';

const READONLY_STATUSES: AccountPayableStatus[] = [
  AccountPayableStatus.PAID,
  AccountPayableStatus.CANCELLED,
];

// Un gasto se considera "anticipo de nómina" cuando el tipo es "Personal" y la
// subcategoría "Anticipos". En ese caso se debe elegir un empleado beneficiario y
// el anticipo se vincula al periodo de nómina en curso para aplicar el descuento.
const ADVANCE_EXPENSE_TYPE = 'personal';
const ADVANCE_EXPENSE_SUBCATEGORY = 'anticipos';

/** Formato de pesos para los mensajes de error que ve el usuario. */
const money = (value: unknown) =>
  Number(String(value)).toLocaleString('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  });

import { computeExpenseTotals } from '../../common/utils/expense-totals.util';
import { normalizeRate } from '../../common/utils/rounding.util';
import { findActiveCashSession } from '../cash-session/active-cash-session.util';
import {
  BUSINESS_TIMEZONE,
  businessToday,
  startOfDay,
} from '../../common/utils/date-range.util';
import { requireActiveLocationId } from '../../common/utils/location-context';

@Injectable()
export class AccountsPayableService {
  private readonly logger = new Logger(AccountsPayableService.name);

  constructor(
    private readonly repository: AccountsPayableRepository,
    private readonly prisma: PrismaService,
    private readonly consecutivesService: ConsecutivesService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Resuelve base y total a pagar de una cuenta.
   *
   * El cliente envía la base (`subtotalAmount`) y el backend calcula el total
   * con IVA y retenciones: si cada lado hiciera su propia cuenta, la pantalla y
   * el saldo pendiente terminarían en números distintos. `totalAmount` sigue
   * aceptándose para los clientes que aún no mandan la base.
   */
  private resolveAmounts(dto: {
    totalAmount?: number;
    subtotalAmount?: number;
    applyIva?: boolean;
    ivaRate?: number;
    retefuenteRate?: number;
    reteICARate?: number;
    reteIVARate?: number;
  }): { subtotalAmount: number; totalAmount: number } {
    if (dto.subtotalAmount !== undefined) {
      const { total } = computeExpenseTotals(dto.subtotalAmount, dto);
      return { subtotalAmount: dto.subtotalAmount, totalAmount: total };
    }

    const totalAmount = dto.totalAmount ?? 0;
    const ivaRate = dto.applyIva ? (dto.ivaRate ?? 0.19) : 0;
    // Sin base explícita solo queda deshacer el IVA. La cuenta no admite
    // retenciones en esta rama, y por eso el DTO las trae junto con la base.
    const subtotalAmount = ivaRate > 0 ? totalAmount / (1 + ivaRate) : totalAmount;
    return { subtotalAmount, totalAmount };
  }

  async findAll(filters: FilterAccountPayableDto) {
    return this.repository.findAll(filters);
  }

  async findOne(id: string) {
    const ap = await this.repository.findById(id);
    if (!ap) {
      throw new NotFoundException(`Cuenta por pagar con id ${id} no encontrada`);
    }
    return ap;
  }

  /**
   * Empleados activos elegibles como beneficiarios de un anticipo de nómina.
   * Se expone aquí para no acoplar el formulario de Cuentas por Pagar al permiso
   * de nómina (read_payroll_employees).
   */
  async getBeneficiaries() {
    const employees = await this.prisma.employee.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        userId: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { user: { firstName: 'asc' } },
    });
    return employees;
  }

  async create(dto: CreateAccountPayableDto, createdById: string) {
    // La CP nace en la sede activa: un local o la Matriz (docs/PLAN_SEDES.md §14).
    const locationId = requireActiveLocationId();
    const apNumber = await this.consecutivesService.generateNumber('ACCOUNT_PAYABLE', locationId);

    if (dto.expenseOrderId) {
      const existing = await this.repository.findByExpenseOrderId(dto.expenseOrderId);
      if (existing) {
        throw new BadRequestException(
          `La Orden de Gasto ${dto.expenseOrderId} ya tiene una cuenta por pagar asociada`,
        );
      }
    }

    const advanceLink = await this.resolveAdvanceLink(
      dto.expenseTypeId,
      dto.expenseSubcategoryId,
      dto.beneficiaryUserId,
    );

    const { subtotalAmount, totalAmount } = this.resolveAmounts(dto);

    return this.repository.create({
      apNumber,
      location: { connect: { id: locationId } },
      expenseType: { connect: { id: dto.expenseTypeId } },
      expenseSubcategory: { connect: { id: dto.expenseSubcategoryId } },
      description: dto.description ?? '',
      observations: dto.observations,
      subtotalAmount,
      totalAmount,
      paidAmount: 0,
      balance: totalAmount,
      applyIva: dto.applyIva ?? false,
      ivaRate: dto.ivaRate ?? 0.19,
      retefuenteRate: normalizeRate(dto.retefuenteRate),
      reteICARate: normalizeRate(dto.reteICARate),
      reteIVARate: dto.reteIVARate ?? 0,
      dueDate: new Date(dto.dueDate),
      isRecurring: dto.isRecurring ?? false,
      recurringDay: dto.recurringDay,
      recurringFrequency: dto.recurringFrequency,
      status: AccountPayableStatus.PENDING,
      createdBy: { connect: { id: createdById } },
      ...(dto.supplierId && { supplier: { connect: { id: dto.supplierId } } }),
      ...(dto.expenseOrderId && { expenseOrder: { connect: { id: dto.expenseOrderId } } }),
      ...(advanceLink && {
        beneficiaryUser: { connect: { id: advanceLink.beneficiaryUserId } },
        payrollPeriod: { connect: { id: advanceLink.payrollPeriodId } },
      }),
    });
  }

  /**
   * Determina si una cuenta por pagar es un anticipo de nómina (tipo "Personal" +
   * subcategoría "Anticipos"). En ese caso valida el empleado beneficiario y lo
   * vincula al periodo de nómina en curso. Devuelve `null` cuando no es un anticipo.
   */
  private async resolveAdvanceLink(
    expenseTypeId: string,
    expenseSubcategoryId: string,
    beneficiaryUserId?: string,
  ): Promise<{ beneficiaryUserId: string; payrollPeriodId: string } | null> {
    const subcategory = await this.prisma.expenseSubcategory.findUnique({
      where: { id: expenseSubcategoryId },
      select: { name: true, expenseType: { select: { name: true } } },
    });

    const isAdvance =
      subcategory?.expenseType?.name?.trim().toLowerCase() === ADVANCE_EXPENSE_TYPE &&
      subcategory?.name?.trim().toLowerCase() === ADVANCE_EXPENSE_SUBCATEGORY;

    if (!isAdvance) return null;

    // El beneficiario es opcional: si no se selecciona, el anticipo se crea sin
    // vincularse a un empleado/periodo de nómina (no se aplicará descuento).
    if (!beneficiaryUserId) return null;

    const employee = await this.prisma.employee.findUnique({
      where: { userId: beneficiaryUserId },
      select: { id: true, status: true },
    });

    if (!employee) {
      throw new BadRequestException(
        'El usuario seleccionado no tiene ficha de empleado y no puede recibir anticipos de nómina',
      );
    }

    const currentPeriod = await this.prisma.payrollPeriod.findFirst({
      where: { status: 'IN_PROGRESS' },
      orderBy: { startDate: 'desc' },
      select: { id: true, name: true },
    });

    if (!currentPeriod) {
      throw new BadRequestException(
        'No hay un periodo de nómina en curso (En curso) al cual vincular el anticipo. Marca un periodo como "En curso" primero.',
      );
    }

    const payrollItem = await this.prisma.payrollItem.findUnique({
      where: { periodId_employeeId: { periodId: currentPeriod.id, employeeId: employee.id } },
      select: { id: true },
    });

    if (!payrollItem) {
      throw new BadRequestException(
        `El empleado seleccionado no está incluido en el periodo de nómina en curso (${currentPeriod.name}). Agrégalo al periodo antes de registrar el anticipo.`,
      );
    }

    return { beneficiaryUserId, payrollPeriodId: currentPeriod.id };
  }

  async adminAuthorize(id: string, adminId: string) {
    const ap = await this.findOne(id);
    if (ap.status !== AccountPayableStatus.PENDING) {
      throw new BadRequestException(
        `La CP debe estar en estado PENDING para ser autorizada. Estado actual: ${ap.status}`,
      );
    }
    return this.repository.update(id, {
      status: AccountPayableStatus.ADMIN_AUTHORIZED,
      authorizedBy: { connect: { id: adminId } },
      authorizedAt: new Date(),
    });
  }

  async update(id: string, dto: UpdateAccountPayableDto) {
    const ap = await this.findOne(id);

    if (READONLY_STATUSES.includes(ap.status as AccountPayableStatus)) {
      throw new BadRequestException(
        `No se puede editar una cuenta en estado ${ap.status}`,
      );
    }

    const hasPayments = Number(ap.paidAmount) > 0;
    // El IVA y las retenciones también mueven el total: si la cuenta ya tiene
    // abonos, cambiarlos correría el saldo por debajo de lo ya pagado.
    const changesAmount =
      dto.totalAmount !== undefined ||
      dto.subtotalAmount !== undefined ||
      dto.applyIva !== undefined ||
      dto.ivaRate !== undefined ||
      dto.retefuenteRate !== undefined ||
      dto.reteICARate !== undefined ||
      dto.reteIVARate !== undefined;
    if (hasPayments && changesAmount) {
      throw new BadRequestException(
        'No se puede cambiar el monto total de una cuenta que ya tiene pagos registrados',
      );
    }

    const updateData: Record<string, unknown> = {};
    if (dto.expenseTypeId !== undefined) updateData.expenseType = { connect: { id: dto.expenseTypeId } };
    if (dto.expenseSubcategoryId !== undefined) updateData.expenseSubcategory = { connect: { id: dto.expenseSubcategoryId } };
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.observations !== undefined) updateData.observations = dto.observations;
    if (dto.dueDate !== undefined) updateData.dueDate = new Date(dto.dueDate);
    if (dto.isRecurring !== undefined) updateData.isRecurring = dto.isRecurring;
    if (dto.recurringDay !== undefined) updateData.recurringDay = dto.recurringDay;
    if (dto.recurringFrequency !== undefined) updateData.recurringFrequency = dto.recurringFrequency;
    if (dto.applyIva !== undefined) updateData.applyIva = dto.applyIva;
    if (dto.ivaRate !== undefined) updateData.ivaRate = dto.ivaRate;
    if (dto.retefuenteRate !== undefined) updateData.retefuenteRate = normalizeRate(dto.retefuenteRate);
    if (dto.reteICARate !== undefined) updateData.reteICARate = normalizeRate(dto.reteICARate);
    if (dto.reteIVARate !== undefined) updateData.reteIVARate = dto.reteIVARate;
    if (dto.supplierId !== undefined) {
      updateData.supplier = dto.supplierId
        ? { connect: { id: dto.supplierId } }
        : { disconnect: true };
    }

    if (dto.totalAmount !== undefined || dto.subtotalAmount !== undefined) {
      const { subtotalAmount, totalAmount } = this.resolveAmounts({
        ...dto,
        applyIva: dto.applyIva ?? ap.applyIva,
        ivaRate: dto.ivaRate ?? Number(ap.ivaRate),
        retefuenteRate: dto.retefuenteRate ?? Number(ap.retefuenteRate ?? 0),
        reteICARate: dto.reteICARate ?? Number(ap.reteICARate ?? 0),
        reteIVARate: dto.reteIVARate ?? Number(ap.reteIVARate ?? 0),
      });
      updateData.subtotalAmount = subtotalAmount;
      updateData.totalAmount = totalAmount;
      updateData.balance = new Prisma.Decimal(totalAmount).sub(ap.paidAmount);
    }

    // Recalcular el vínculo de anticipo si cambian el tipo/subcategoría o el
    // beneficiario. Si deja de ser un anticipo, se desvincula.
    if (
      dto.expenseTypeId !== undefined ||
      dto.expenseSubcategoryId !== undefined ||
      dto.beneficiaryUserId !== undefined
    ) {
      const effectiveTypeId = dto.expenseTypeId ?? ap.expenseType?.id;
      const effectiveSubcategoryId = dto.expenseSubcategoryId ?? ap.expenseSubcategory?.id;
      const effectiveBeneficiaryId = dto.beneficiaryUserId ?? ap.beneficiaryUser?.id;

      const advanceLink =
        effectiveTypeId && effectiveSubcategoryId
          ? await this.resolveAdvanceLink(
              effectiveTypeId,
              effectiveSubcategoryId,
              effectiveBeneficiaryId,
            )
          : null;

      if (advanceLink) {
        updateData.beneficiaryUser = { connect: { id: advanceLink.beneficiaryUserId } };
        updateData.payrollPeriod = { connect: { id: advanceLink.payrollPeriodId } };
      } else {
        updateData.beneficiaryUser = { disconnect: true };
        updateData.payrollPeriod = { disconnect: true };
      }
    }

    return this.repository.update(id, updateData);
  }

  async cancel(id: string, dto: CancelAccountPayableDto, cancelledById: string) {
    const ap = await this.findOne(id);

    if (ap.status === AccountPayableStatus.PAID) {
      throw new BadRequestException('No se puede anular una cuenta que ya fue pagada');
    }
    if (ap.status === AccountPayableStatus.CANCELLED) {
      throw new BadRequestException('La cuenta ya está anulada');
    }

    return this.repository.update(id, {
      status: AccountPayableStatus.CANCELLED,
      cancelledAt: new Date(),
      cancelledBy: { connect: { id: cancelledById } },
      cancelReason: dto.cancelReason,
    });
  }

  /**
   * Dinero que salió de caja por la Orden de Gasto asociada y que la CP todavía
   * no refleja como pago.
   *
   * La autorización de Caja de una OG crea un `CashMovement` de egreso por cada
   * ítem: la plata sale sin pasar por `AccountPayablePayment`, así que la CP
   * espejo se queda con `paidAmount = 0` y su saldo completo. Quien mire solo la
   * CP ve una deuda viva que en realidad ya se pagó, y volver a pagarla saca el
   * dinero dos veces (pasó 6 veces entre mayo y junio de 2026, $3.317.400).
   *
   * Solo cuenta los movimientos SIN pago de CP asociado. Los que ya reflejó
   * `settleFromExpenseOrderMovements` están descontados de `balance`, y
   * restarlos otra vez dejaba el disponible en $0: el IVA de 83 CP en PRD
   * (32 PARTIAL y 51 OVERDUE, $1.945.120) quedó impagable hasta 2026-09-14.
   * Lo que queda por contar son las CP históricas nunca conciliadas y cualquier
   * otra ruta que pague por el lado de la OG sin tocar la CP.
   */
  async paidThroughExpenseOrder(accountPayableId: string): Promise<Prisma.Decimal> {
    // Se lee el vínculo con la OG desde la base y no del objeto que llega: el
    // `select` del repositorio no expone `expenseOrderId`, y confiar en él haría
    // que el tope se calcule como si la CP no tuviera OG.
    const ap = await this.prisma.accountPayable.findUnique({
      where: { id: accountPayableId },
      select: { expenseOrderId: true },
    });
    const expenseOrderId = ap?.expenseOrderId;
    if (!expenseOrderId) return new Prisma.Decimal(0);

    const movimientos = await this.prisma.cashMovement.findMany({
      where: {
        referenceType: 'EXPENSE_ORDER',
        referenceId: expenseOrderId,
        movementType: 'EXPENSE',
        isVoided: false,
        accountPayablePayment: { is: null },
      },
      select: { amount: true },
    });

    return movimientos.reduce((sum, m) => sum.add(m.amount), new Prisma.Decimal(0));
  }

  /**
   * Verifica que el monto quepa en lo que realmente falta por pagar.
   *
   * El tope no es `balance`: hay que descontar también lo que salió por la OG y
   * la CP todavía no refleja (ver `paidThroughExpenseOrder`). Cuando la OG cubre
   * todo, el disponible es cero y no se puede pagar nada; cuando la CP ya está
   * conciliada, el tope es su saldo, que es el IVA o las retenciones pendientes.
   */
  async assertPayableAmount(ap: { id: string; apNumber: string; balance: unknown }, amount: number) {
    const balance = new Prisma.Decimal(ap.balance as never);
    const porOG = await this.paidThroughExpenseOrder(ap.id);
    const disponible = Prisma.Decimal.max(balance.sub(porOG), new Prisma.Decimal(0));

    if (new Prisma.Decimal(amount).greaterThan(disponible)) {
      if (porOG.greaterThan(0)) {
        throw new BadRequestException(
          `La CP ${ap.apNumber} ya tiene ${money(porOG)} pagados a través de su Orden de Gasto ` +
            `(salieron de caja al autorizarla). Disponible para pagar: ${money(disponible)}. ` +
            `Si la cuenta no debe pagarse de nuevo, anúlala en vez de registrar otro pago.`,
        );
      }
      throw new BadRequestException(
        `El monto del pago (${amount}) supera el saldo pendiente (${balance})`,
      );
    }
  }

  /**
   * Salda la CP espejo contra los movimientos de caja que acaba de crear la
   * autorización de Caja de su OG.
   *
   * No mueve dinero: los `CashMovement` ya existen, esto solo los refleja como
   * `AccountPayablePayment` para que la CP deje de aparecer debiendo lo que ya
   * se pagó y su historial muestre por dónde salió. Idempotente — un movimiento
   * ya reflejado se salta, porque `cashMovementId` es único en el pago.
   *
   * El total de la CP puede no coincidir con la suma de los movimientos: los
   * movimientos son por ítem (la base) y el total incluye IVA y retenciones. Si
   * queda saldo, la CP sigue viva por la diferencia, que sí es pagable.
   */
  async settleFromExpenseOrderMovements(
    expenseOrderId: string,
    registeredById: string,
  ): Promise<void> {
    const ap = await this.repository.findByExpenseOrderId(expenseOrderId);
    if (!ap || ap.status === AccountPayableStatus.CANCELLED) return;

    const movimientos = await this.prisma.cashMovement.findMany({
      where: {
        referenceType: 'EXPENSE_ORDER',
        referenceId: expenseOrderId,
        movementType: 'EXPENSE',
        isVoided: false,
        accountPayablePayment: { is: null },
      },
      select: { id: true, amount: true, paymentMethod: true, createdAt: true, performedById: true },
      orderBy: { createdAt: 'asc' },
    });

    if (movimientos.length === 0) return;

    await this.prisma.$transaction(async (tx) => {
      for (const mov of movimientos) {
        await tx.accountPayablePayment.create({
          data: {
            accountPayableId: ap.id,
            amount: mov.amount,
            paymentMethod: mov.paymentMethod,
            paymentDate: mov.createdAt,
            notes: 'Pago registrado en la autorización de Caja de la Orden de Gasto',
            registeredById: mov.performedById || registeredById,
            cashMovementId: mov.id,
          },
        });
      }

      // Se recalcula desde los pagos vivos, igual que en `deletePayment`: una CP
      // que ya venía descuadrada se corrige sola en vez de arrastrar el error.
      const vivos = await tx.accountPayablePayment.findMany({
        where: { accountPayableId: ap.id, isReversed: false },
        select: { amount: true },
      });
      const paidAmount = vivos.reduce((sum, p) => sum.add(p.amount), new Prisma.Decimal(0));
      const balance = new Prisma.Decimal(ap.totalAmount).sub(paidAmount);

      await tx.accountPayable.update({
        where: { id: ap.id },
        data: {
          paidAmount,
          balance,
          status: balance.lessThanOrEqualTo(0)
            ? AccountPayableStatus.PAID
            : AccountPayableStatus.PARTIAL,
        },
      });
    });

    this.logger.log(
      `CP ${ap.apNumber} saldada con ${movimientos.length} movimiento(s) de caja de su OG`,
    );
  }

  async registerPayment(id: string, dto: RegisterPaymentDto, registeredById: string) {
    const ap = await this.findOne(id);

    if (ap.status === AccountPayableStatus.CANCELLED) {
      throw new BadRequestException('No se puede registrar un pago en una cuenta anulada');
    }
    if (ap.status === AccountPayableStatus.PAID) {
      throw new BadRequestException('La cuenta ya está completamente pagada');
    }

    await this.assertPayableAmount(ap, dto.amount);

    return this.executePayment(id, ap.apNumber, ap.locationId, ap.paidAmount, ap.totalAmount, dto, registeredById);
  }

  async registerPaymentFromAuthRequest(
    id: string,
    dto: Pick<RegisterPaymentDto, 'amount' | 'paymentMethod' | 'paymentDate' | 'reference' | 'notes' | 'bankEntity' | 'receiptFileId' | 'receiptFileId2'>,
    registeredById: string,
    paymentAuthRequestId: string,
  ) {
    const ap = await this.findOne(id);

    if (ap.status === AccountPayableStatus.CANCELLED) {
      throw new BadRequestException('No se puede registrar un pago en una cuenta anulada');
    }
    if (ap.status === AccountPayableStatus.PAID) {
      throw new BadRequestException('La cuenta ya está completamente pagada');
    }

    await this.assertPayableAmount(ap, dto.amount);

    // Caja: buscar sesión de caja activa automáticamente
    const activeSession = await findActiveCashSession(this.prisma);

    return this.executePayment(
      id,
      ap.apNumber,
      ap.locationId,
      ap.paidAmount,
      ap.totalAmount,
      dto,
      registeredById,
      activeSession?.id,
      paymentAuthRequestId,
    );
  }

  private async executePayment(
    id: string,
    apNumber: string,
    /** Sede de la CP: el recibo de caja se numera en ella. */
    locationId: string,
    paidAmount: unknown,
    totalAmount: unknown,
    dto: Pick<RegisterPaymentDto, 'amount' | 'paymentMethod' | 'paymentDate' | 'reference' | 'notes' | 'bankEntity' | 'receiptFileId' | 'receiptFileId2'> & { cashSessionId?: string },
    registeredById: string,
    cashSessionId?: string,
    paymentAuthRequestId?: string,
  ) {
    // El dinero se suma con Decimal, no con `Number`: los totales de CP traen
    // centavos (68 de las cuentas en producción vienen de OG con retenciones) y
    // la resta en coma flotante deja residuos del tipo `234567.88000000012`.
    // Ese residuo decide el estado: `newBalance <= 0` es lo que marca la CP como
    // pagada, y un `1e-10` la dejaría en PARTIAL para siempre.
    const newPaidAmount = new Prisma.Decimal(paidAmount as never).add(dto.amount);
    const newBalance = new Prisma.Decimal(totalAmount as never).sub(newPaidAmount);
    const newStatus = newBalance.lessThanOrEqualTo(0)
      ? AccountPayableStatus.PAID
      : AccountPayableStatus.PARTIAL;

    let cashMovementId: string | undefined;

    const effectiveCashSessionId = dto.cashSessionId ?? cashSessionId;

    if (effectiveCashSessionId) {
      const session = await this.prisma.cashSession.findUnique({
        where: { id: effectiveCashSessionId },
      });
      if (!session || session.status !== 'OPEN') {
        throw new BadRequestException('La sesión de caja indicada no está activa o no existe');
      }

      const receiptNumber = await this.consecutivesService.generateNumber('CASH_RECEIPT', locationId);
      const cashMovement = await this.prisma.cashMovement.create({
        data: {
          amount: dto.amount,
          movementType: 'EXPENSE',
          paymentMethod: dto.paymentMethod,
          description: `Pago Cuenta por Pagar ${apNumber}`,
          receiptNumber,
          cashSessionId: effectiveCashSessionId,
          performedById: registeredById,
          referenceType: 'ACCOUNT_PAYABLE',
          referenceId: id,
        },
      });
      cashMovementId = cashMovement.id;
    }

    const payment = await this.repository.createPayment({
      amount: dto.amount,
      paymentMethod: dto.paymentMethod,
      paymentDate: new Date(dto.paymentDate),
      reference: dto.reference,
      notes: dto.notes,
      bankEntity: dto.bankEntity,
      receiptFileId: dto.receiptFileId,
      receiptFileId2: dto.receiptFileId2,
      accountPayable: { connect: { id } },
      registeredBy: { connect: { id: registeredById } },
      ...(cashMovementId && { cashMovement: { connect: { id: cashMovementId } } }),
      ...(paymentAuthRequestId && {
        paymentAuthRequest: { connect: { id: paymentAuthRequestId } },
      }),
    });

    await this.repository.update(id, {
      paidAmount: newPaidAmount,
      balance: newBalance,
      status: newStatus,
    });

    return payment;
  }

  async getPaymentHistory(id: string) {
    await this.findOne(id);
    return this.repository.getPaymentHistory(id);
  }

  /**
   * Anula un pago registrado de una Cuenta por Pagar.
   *
   * Antes borraba la fila del pago y ajustaba el saldo, y eso tenía tres
   * problemas, todos con dinero de por medio:
   *
   * 1. **No anulaba el movimiento de caja.** 185 de los 187 pagos de CP tienen
   *    uno asociado. La CP volvía a deber, pero la caja seguía registrando la
   *    salida: el arqueo quedaba descuadrado y sin rastro de por qué.
   * 2. **Borraba el pago**, con quién lo registró, cuándo y con qué soporte. Es
   *    lo contrario de lo que se decidió para los pagos de OP tras el caso
   *    OP-2026-1504: la fila sobrevive anulada, no desaparece.
   * 3. **Las dos escrituras iban sueltas.** Si la segunda fallaba, el pago
   *    desaparecía y la CP seguía diciendo que estaba pagada.
   *
   * Ahora hace lo mismo que el flujo de reversión con aprobación
   * (`accounts-payable-payment-reversal-requests`), que ya tenía el modelo
   * correcto: marca `isReversed`, anula el `CashMovement` y recalcula el saldo,
   * todo en una transacción.
   *
   * El saldo se **recalcula** desde los pagos vivos en vez de restarle el monto
   * al acumulado: así una CP que ya venía descuadrada se corrige sola al anular,
   * en vez de arrastrar el error.
   */
  async deletePayment(id: string, paymentId: string, userId: string) {
    const ap = await this.findOne(id);
    const payment = await this.repository.findPaymentById(paymentId);
    if (!payment || payment.accountPayableId !== id) {
      throw new NotFoundException(`Pago con id ${paymentId} no encontrado`);
    }
    if (payment.isReversed) {
      throw new BadRequestException('El pago ya fue anulado');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.accountPayablePayment.update({
        where: { id: paymentId },
        data: { isReversed: true, reversedAt: new Date() },
      });

      // La plata salió de una caja que puede estar cerrada: la anulación es
      // administrativa y no exige sesión abierta, igual que en la reversión.
      if (payment.cashMovementId) {
        await tx.cashMovement.update({
          where: { id: payment.cashMovementId },
          data: {
            isVoided: true,
            voidedById: userId,
            voidedAt: new Date(),
            voidReason: `Anulación de pago de la CP ${ap.apNumber}`,
          },
        });
      }

      const vivos = await tx.accountPayablePayment.findMany({
        where: { accountPayableId: id, isReversed: false },
        select: { amount: true },
      });

      const paidAmount = vivos.reduce(
        (sum, p) => sum.add(p.amount),
        new Prisma.Decimal(0),
      );
      const totalAmount = new Prisma.Decimal(ap.totalAmount);
      const balance = totalAmount.sub(paidAmount);

      await tx.accountPayable.update({
        where: { id },
        data: {
          paidAmount,
          balance,
          status: paidAmount.lessThanOrEqualTo(0)
            ? AccountPayableStatus.PENDING
            : AccountPayableStatus.PARTIAL,
        },
      });
    });

    return { success: true };
  }

  async getSummary() {
    return this.repository.getSummary();
  }

  async findByExpenseOrderId(expenseOrderId: string) {
    return this.repository.findByExpenseOrderId(expenseOrderId);
  }

  async syncFromExpenseOrder(
    id: string,
    data: {
      totalAmount?: number;
      subtotalAmount?: number;
      expenseTypeId?: string;
      expenseSubcategoryId?: string;
      applyIva?: boolean;
      ivaRate?: number;
      retefuenteRate?: number;
      reteICARate?: number;
      reteIVARate?: number;
    },
  ) {
    const ap = await this.repository.findById(id);
    if (!ap) return;

    const updateData: Record<string, unknown> = {};

    if (data.expenseTypeId !== undefined) updateData.expenseType = { connect: { id: data.expenseTypeId } };
    if (data.expenseSubcategoryId !== undefined) updateData.expenseSubcategory = { connect: { id: data.expenseSubcategoryId } };
    if (data.applyIva !== undefined) updateData.applyIva = data.applyIva;
    if (data.ivaRate !== undefined) updateData.ivaRate = data.ivaRate;
    if (data.retefuenteRate !== undefined) updateData.retefuenteRate = normalizeRate(data.retefuenteRate);
    if (data.reteICARate !== undefined) updateData.reteICARate = normalizeRate(data.reteICARate);
    if (data.reteIVARate !== undefined) updateData.reteIVARate = data.reteIVARate;

    if (data.subtotalAmount !== undefined) updateData.subtotalAmount = data.subtotalAmount;

    if (data.totalAmount !== undefined) {
      updateData.totalAmount = data.totalAmount;
      updateData.balance = new Prisma.Decimal(data.totalAmount).sub(ap.paidAmount);
    }

    if (Object.keys(updateData).length > 0) {
      await this.repository.update(id, updateData);
    }
  }

  async createFromExpenseOrder(
    expenseOrderId: string,
    description: string,
    totalAmount: number,
    createdById: string,
    subtotalAmount?: number,
  ) {
    const existing = await this.repository.findByExpenseOrderId(expenseOrderId);
    if (existing) return existing;

    const expenseOrder = await this.prisma.expenseOrder.findUnique({
      where: { id: expenseOrderId },
      select: {
        locationId: true,
        expenseTypeId: true,
        expenseSubcategoryId: true,
        applyIva: true,
        ivaRate: true,
        retefuenteRate: true,
        reteICARate: true,
        reteIVARate: true,
      },
    });

    if (!expenseOrder) throw new BadRequestException(`No se encontró la Orden de Gasto ${expenseOrderId}`);

    // La CP hereda la sede de su OG (docs/PLAN_SEDES.md §2). Antes tenía su
    // propio generador (`CP-{año}-001`); ahora usa la numeración común.
    const apNumber = await this.consecutivesService.generateNumber('ACCOUNT_PAYABLE', expenseOrder.locationId);
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    return this.repository.create({
      apNumber,
      location: { connect: { id: expenseOrder.locationId } },
      expenseType: { connect: { id: expenseOrder.expenseTypeId } },
      expenseSubcategory: { connect: { id: expenseOrder.expenseSubcategoryId } },
      description,
      subtotalAmount: subtotalAmount ?? totalAmount,
      totalAmount,
      paidAmount: 0,
      balance: totalAmount,
      applyIva: expenseOrder.applyIva,
      ivaRate: expenseOrder.ivaRate,
      retefuenteRate: expenseOrder.retefuenteRate,
      reteICARate: expenseOrder.reteICARate,
      reteIVARate: expenseOrder.reteIVARate,
      dueDate,
      isRecurring: false,
      status: AccountPayableStatus.PENDING,
      createdBy: { connect: { id: createdById } },
      expenseOrder: { connect: { id: expenseOrderId } },
    });
  }

  // ─── Attachments ─────────────────────────────────────────────────────────────

  async addAttachment(id: string, dto: CreateAttachmentDto, uploadedById: string) {
    await this.findOne(id);
    return this.repository.createAttachment({
      fileUrl: dto.fileUrl,
      fileName: dto.fileName,
      fileType: dto.fileType,
      accountPayable: { connect: { id } },
      uploadedBy: { connect: { id: uploadedById } },
    });
  }

  async removeAttachment(id: string, attachmentId: string) {
    await this.findOne(id);
    const attachment = await this.repository.findAttachmentById(attachmentId);
    if (!attachment || attachment.accountPayableId !== id) {
      throw new NotFoundException(`Adjunto con id ${attachmentId} no encontrado`);
    }
    await this.repository.deleteAttachment(attachmentId);
    return { success: true };
  }

  // ─── Installments ─────────────────────────────────────────────────────────────

  async setInstallments(id: string, dto: SetInstallmentsDto, userId: string) {
    const ap = await this.findOne(id);

    if (ap.status === AccountPayableStatus.CANCELLED) {
      throw new BadRequestException('No se puede definir un plan de cuotas en una cuenta anulada');
    }

    const total = dto.installments.reduce((sum, i) => sum + i.amount, 0);
    const apTotal = Number(ap.totalAmount);
    if (Math.abs(total - apTotal) > 1) {
      throw new BadRequestException(
        `La suma de las cuotas (${total}) no coincide con el total de la cuenta (${apTotal})`,
      );
    }

    return this.repository.setInstallments(id, dto.installments, userId);
  }

  async getInstallments(id: string) {
    await this.findOne(id);
    return this.repository.findInstallments(id);
  }

  async toggleInstallmentPaid(id: string, installmentId: string, dto: UpdateInstallmentDto, userId: string) {
    await this.findOne(id);
    const installment = await this.repository.findInstallmentById(installmentId);
    if (!installment || installment.accountPayableId !== id) {
      throw new NotFoundException(`Cuota con id ${installmentId} no encontrada`);
    }

    return this.repository.updateInstallment(installmentId, {
      isPaid: dto.isPaid,
      paidAt: dto.isPaid ? new Date() : null,
      paidBy: dto.isPaid ? { connect: { id: userId } } : { disconnect: true },
    });
  }

  async deleteInstallment(id: string, installmentId: string) {
    await this.findOne(id);
    const installment = await this.repository.findInstallmentById(installmentId);
    if (!installment || installment.accountPayableId !== id) {
      throw new NotFoundException(`Cuota con id ${installmentId} no encontrada`);
    }
    await this.repository.deleteInstallment(installmentId);
    return { success: true };
  }

  /**
   * Medianoche en Colombia: marca vencidas las CP cuyo día de vencimiento ya
   * terminó.
   *
   * Antes corría a medianoche UTC (7:00 p. m. en Colombia) y comparaba contra
   * `now`, así que una CP pasaba a vencida la noche de su propio día de
   * vencimiento. El corte es el inicio de hoy en hora Colombia: `dueDate` se
   * guarda como la medianoche de ese día (05:00 UTC), y compararlo contra `now`
   * a las 00:00 la habría vencido desde el primer segundo de su día.
   */
  @Cron('0 0 * * *', { timeZone: BUSINESS_TIMEZONE })
  async markOverdueAccounts() {
    this.logger.log('Ejecutando tarea: marcar cuentas vencidas como OVERDUE');
    const result = await this.repository.markOverdue(startOfDay(businessToday())!);
    this.logger.log(`Cuentas marcadas como OVERDUE: ${result.count}`);
  }
}
