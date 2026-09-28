import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ConsecutivesService } from '../consecutives/consecutives.service';
import { CashMovementRepository } from './cash-movement.repository';
import {
  CreateCashMovementDto,
  FilterCashMovementsDto,
  VoidCashMovementDto,
} from './dto';
import { CashSessionStatus, Prisma } from '../../generated/prisma';
import { INVERSE_MOVEMENT_TYPE } from './cash-movement.helpers';
import {
  ACTIVE_PAYMENT_WHERE,
  computeNetPaidAmount,
  computeOrderBalance,
  sumActivePayments,
} from '../../common/utils/order-balance.util';
import { CreditBalanceService } from '../credit-balance/credit-balance.service';
import { lockOrderForUpdate } from '../../common/utils/order-lock.util';

@Injectable()
export class CashMovementService {
  constructor(
    private readonly repository: CashMovementRepository,
    private readonly consecutivesService: ConsecutivesService,
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly creditBalanceService: CreditBalanceService,
  ) {}

  async findAll(filters: FilterCashMovementsDto) {
    return this.repository.findAll(filters);
  }

  async findOne(id: string) {
    const movement = await this.repository.findById(id);
    if (!movement) {
      throw new NotFoundException(`Movimiento de caja ${id} no encontrado`);
    }
    return movement;
  }

  async createMovement(dto: CreateCashMovementDto, userId: string) {
    // Validate session exists and is open
    const session = await this.prisma.cashSession.findUnique({
      where: { id: dto.cashSessionId },
      select: { id: true, status: true, cashRegister: { select: { locationId: true } } },
    });
    if (!session) {
      throw new NotFoundException(`Sesión de caja ${dto.cashSessionId} no encontrada`);
    }
    if (session.status !== CashSessionStatus.OPEN) {
      throw new BadRequestException(
        'No se pueden registrar movimientos en una sesión cerrada',
      );
    }

    // El recibo se numera en la sede de la caja (docs/PLAN_SEDES.md §3).
    const receiptNumber = await this.consecutivesService.generateNumber(
      'CASH_RECEIPT',
      session.cashRegister.locationId,
    );
    const amount = new Prisma.Decimal(dto.amount);

    const movementId = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Create the movement
      const movement = await tx.cashMovement.create({
        data: {
          cashSessionId: dto.cashSessionId,
          receiptNumber,
          movementType: dto.movementType,
          paymentMethod: dto.paymentMethod || 'CASH',
          amount,
          description: dto.description,
          referenceType: dto.referenceType,
          referenceId: dto.referenceId,
          performedById: userId,
        },
        select: { id: true },
      });

      // If linked to an order, create Payment and update order balance
      if (dto.referenceType === 'ORDER' && dto.referenceId) {
        // Bloquea la OP antes de leerla: ver `lockOrderForUpdate`.
        await lockOrderForUpdate(tx, dto.referenceId);
        const order = await tx.order.findUnique({
          where: { id: dto.referenceId },
          select: {
            id: true,
            total: true,
            paidAmount: true,
            appliedCreditAmount: true,
            reversedAmount: true,
            balance: true,
            status: true,
          },
        });
        if (!order) {
          throw new NotFoundException(`Orden ${dto.referenceId} no encontrada`);
        }

        const paymentAmount = amount;
        if (paymentAmount.greaterThan(order.balance)) {
          throw new BadRequestException(
            `El monto ($${paymentAmount}) excede el saldo pendiente de la orden ($${order.balance})`,
          );
        }

        // Create linked Payment record
        await tx.payment.create({
          data: {
            orderId: dto.referenceId,
            amount: paymentAmount,
            paymentMethod: dto.paymentMethod || 'CASH',
            receivedById: userId,
            cashMovementId: movement.id,
          },
        });

        // Update order balance
        const newPaidAmount = new Prisma.Decimal(order.paidAmount.toString()).add(paymentAmount);
        const newBalance = computeOrderBalance({
          total: order.total,
          paidAmount: newPaidAmount,
          appliedCreditAmount: order.appliedCreditAmount,
          reversedAmount: order.reversedAmount,
        });
        await tx.order.update({
          where: { id: dto.referenceId },
          data: { paidAmount: newPaidAmount, balance: newBalance },
        });
      }

      return movement.id;
    });

    const created = await this.repository.findById(movementId);

    setImmediate(() => {
      this.auditLogsService
        .logCreate('CashMovement', movementId, created, userId)
        .catch(() => {});
    });

    return created;
  }

  /**
   * Sesión donde debe caer el contramovimiento de una anulación.
   *
   * Si la sesión original sigue abierta, es ella misma. Si ya cerró, se busca la
   * sesión abierta de la misma caja: nunca se reabre un cierre firmado, la
   * corrección se registra donde el dinero sí se puede mover hoy.
   */
  private async resolveCounterSessionId(movement: {
    cashSessionId: string;
    cashSession?: { status: string; cashRegisterId: string } | null;
  }): Promise<string> {
    if (movement.cashSession?.status === CashSessionStatus.OPEN) {
      return movement.cashSessionId;
    }

    const openSession = movement.cashSession
      ? await this.prisma.cashSession.findFirst({
          where: {
            cashRegisterId: movement.cashSession.cashRegisterId,
            status: CashSessionStatus.OPEN,
          },
          orderBy: { openedAt: 'desc' },
          select: { id: true },
        })
      : null;

    if (!openSession) {
      throw new BadRequestException(
        'La caja de este movimiento ya está cerrada y no hay una sesión abierta ' +
          'donde registrar la reversa. Abre la caja y vuelve a intentarlo.',
      );
    }

    return openSession.id;
  }

  /**
   * Marca un pago como anulado y recalcula la orden desde los pagos que quedan
   * vivos.
   *
   * El pago no se borra: la fila sobrevive para que el Historial de Pagos siga
   * contando qué pasó y quién lo autorizó. Por eso el recálculo suma solo los no
   * anulados en vez de restar el monto del pago: restar acumula deriva si el
   * mismo pago se toca dos veces, sumar desde la fuente no.
   */
  async voidPaymentAndRecalculate(
    tx: Prisma.TransactionClient,
    paymentId: string,
    userId: string,
    voidReason: string,
  ): Promise<void> {
    const payment = await tx.payment.update({
      where: { id: paymentId },
      data: {
        isVoided: true,
        voidedById: userId,
        voidedAt: new Date(),
        voidReason,
      },
      select: { orderId: true },
    });

    // El saldo a favor que este pago hubiera aplicado a otras órdenes se
    // devuelve: ese dinero ya no existe.
    await this.creditBalanceService.releaseCredit(tx, paymentId);

    // Bloquea la OP antes de leerla: ver `lockOrderForUpdate`.
    await lockOrderForUpdate(tx, payment.orderId);
    const order = await tx.order.findUnique({
      where: { id: payment.orderId },
      select: {
        total: true,
        appliedCreditAmount: true,
        refundedAmount: true,
        reversedAmount: true,
      },
    });
    if (!order) return;

    const payments = await tx.payment.findMany({
      where: { orderId: payment.orderId, ...ACTIVE_PAYMENT_WHERE },
      select: { amount: true },
    });

    const paidAmount = computeNetPaidAmount(
      sumActivePayments(payments),
      order.refundedAmount,
    );

    await tx.order.update({
      where: { id: payment.orderId },
      data: {
        paidAmount,
        balance: computeOrderBalance({
          total: order.total,
          paidAmount,
          appliedCreditAmount: order.appliedCreditAmount,
          reversedAmount: order.reversedAmount,
        }),
      },
    });
  }

  /**
   * Anula un pago que no tiene movimiento de caja: los que se registran fuera
   * del horario de caja o salen de saldo a favor. No hay arqueo que revertir,
   * así que no hace falta sesión abierta ni contramovimiento.
   */
  async voidPaymentWithoutMovement(
    paymentId: string,
    userId: string,
    voidReason: string,
  ): Promise<void> {
    await this.prisma.$transaction((tx) =>
      this.voidPaymentAndRecalculate(tx, paymentId, userId, voidReason),
    );
  }

  async voidMovement(id: string, dto: VoidCashMovementDto, userId: string) {
    const movement = await this.repository.findById(id);
    if (!movement) {
      throw new NotFoundException(`Movimiento de caja ${id} no encontrado`);
    }
    if (movement.isVoided) {
      throw new BadRequestException('El movimiento ya está anulado');
    }

    // La reversa va a la sesión donde el dinero todavía se puede mover.
    //
    // Si la sesión original sigue abierta, ahí mismo. Si ya cerró, la reversa se
    // registra en la sesión abierta hoy de la misma caja: el cuadre que alguien
    // ya firmó no se toca, y la corrección queda fechada el día en que de verdad
    // ocurrió. Antes esto se rechazaba de plano, y como los errores casi siempre
    // se detectan al día siguiente, la gente terminaba editando montos a mano
    // sobre sesiones cerradas (así nació el pago fantasma de OP-2026-1504).
    const counterSessionId = await this.resolveCounterSessionId(movement);

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Mark original as voided
      await tx.cashMovement.update({
        where: { id },
        data: {
          isVoided: true,
          voidedById: userId,
          voidedAt: new Date(),
          voidReason: dto.voidReason,
        },
      });

      // Create counter-movement (reversal). Lleva el tipo inverso para que se
      // lea como reversa y no como un movimiento más del mismo signo; queda
      // fuera de los cálculos de saldo (ver EXCLUDE_REVERSALS).
      const counter = await tx.cashMovement.create({
        data: {
          cashSessionId: counterSessionId,
          receiptNumber: `${movement.receiptNumber}-ANUL`,
          movementType: INVERSE_MOVEMENT_TYPE[movement.movementType],
          paymentMethod: movement.paymentMethod,
          amount: movement.amount,
          description:
            counterSessionId === movement.cashSessionId
              ? `ANULACIÓN: ${movement.description}`
              : // La reversa cae en una caja distinta a la del movimiento: sin
                // esta pista, quien lea el arqueo de hoy no entiende de dónde
                // salió un egreso que no corresponde a nada de hoy.
                `ANULACIÓN (de caja cerrada del ${movement.createdAt.toLocaleDateString('es-CO')}): ${movement.description}`,
          referenceType: movement.referenceType,
          referenceId: movement.referenceId,
          performedById: userId,
          isVoided: false,
        },
        select: { id: true },
      });

      // Link original → counter
      await tx.cashMovement.update({
        where: { id },
        data: { counterMovementId: counter.id },
      });

      // If movement was linked to an order payment, revert order balance
      if (movement.linkedPayment) {
        await this.voidPaymentAndRecalculate(
          tx,
          movement.linkedPayment.id,
          userId,
          dto.voidReason,
        );
      }
    });

    const voided = await this.repository.findById(id);

    setImmediate(() => {
      this.auditLogsService
        .logUpdate('CashMovement', id, movement, voided, userId)
        .catch(() => {});
    });

    return voided;
  }
}
