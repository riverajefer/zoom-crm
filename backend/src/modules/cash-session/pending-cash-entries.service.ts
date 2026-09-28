import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../../database/prisma.service';
import { ACTIVE_PAYMENT_WHERE } from '../../common/utils/order-balance.util';
import { ConsecutivesService } from '../consecutives/consecutives.service';
import { getRequestLocation } from '../../common/utils/location-context';

/**
 * Cola de abonos que se registraron sin caja abierta.
 *
 * Cobrar y abrir caja no son simultáneos: una comercial que recibe una
 * transferencia un sábado no puede quedarse sin registrar el abono. Antes esos
 * pagos quedaban con `cashMovementId = null` para siempre y nunca entraban al
 * arqueo. Ahora se marcan con `pendingCashEntry` y esta clase los ingresa a la
 * primera sesión de caja que se abra.
 *
 * El movimiento se crea con la fecha de la sesión que lo recibe, no la del
 * abono: el dinero entra a la caja cuando la caja existe. La fecha real del
 * pago queda en la descripción para poder rastrearlo.
 */
@Injectable()
export class PendingCashEntriesService {
  private readonly logger = new Logger(PendingCashEntriesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly consecutivesService: ConsecutivesService,
  ) {}

  /**
   * Si hay alguna sesión de caja abierta ahora mismo.
   *
   * Devuelve solo un booleano a propósito: lo consultan las comerciales desde
   * el formulario de OP para saber si su abono va a entrar directo a caja o a
   * la cola, y ellas no tienen permiso para ver datos de caja. Sin montos, sin
   * ids y sin sesiones, no hay nada que proteger.
   */
  async isAnySessionOpen(): Promise<{ isOpen: boolean }> {
    // La caja que importa es la de la sede activa: ahí entra el abono (§4).
    const locationId = getRequestLocation()?.locationId;
    const open = await this.prisma.cashSession.findFirst({
      where: { status: 'OPEN', ...(locationId && { cashRegister: { locationId } }) },
      select: { id: true },
    });
    return { isOpen: open !== null };
  }

  /** Abonos en cola de la sede activa; en "Todas", los de todas (§4). */
  private pendingWhere(): Prisma.PaymentWhereInput {
    const locationId = getRequestLocation()?.locationId;
    return {
      pendingCashEntry: true,
      ...ACTIVE_PAYMENT_WHERE,
      ...(locationId && { order: { locationId } }),
    };
  }

  /** Cuántos abonos esperan entrar a caja, y por cuánto. */
  async getPendingSummary() {
    const [aggregate, payments] = await Promise.all([
      this.prisma.payment.aggregate({
        where: this.pendingWhere(),
        _count: true,
        _sum: { amount: true },
      }),
      this.prisma.payment.findMany({
        where: this.pendingWhere(),
        select: {
          id: true,
          amount: true,
          paymentMethod: true,
          paymentDate: true,
          reference: true,
          order: { select: { id: true, orderNumber: true } },
          receivedBy: { select: { firstName: true, lastName: true, email: true } },
        },
        orderBy: { paymentDate: 'asc' },
      }),
    ]);

    return {
      count: aggregate._count,
      totalAmount: aggregate._sum.amount ?? new Prisma.Decimal(0),
      payments,
    };
  }

  /**
   * Ingresa a `cashSessionId` todos los abonos en cola. Se llama al abrir una
   * sesión, dentro de su misma transacción: si la apertura falla, la cola queda
   * intacta.
   *
   * Devuelve cuántos se ingresaron. No lanza si la cola está vacía.
   */
  async flushInto(
    tx: Prisma.TransactionClient,
    cashSessionId: string,
    performedById: string,
    /** Sede de la caja: solo entran los abonos de OP de esa sede (§4). */
    locationId: string,
  ): Promise<number> {
    // Un abono anulado mientras esperaba caja no entra al arqueo: ese dinero
    // ya no existe, y crearle el movimiento lo resucitaría como ingreso.
    const pending = await tx.payment.findMany({
      where: { pendingCashEntry: true, ...ACTIVE_PAYMENT_WHERE, order: { locationId } },
      select: {
        id: true,
        amount: true,
        paymentMethod: true,
        paymentDate: true,
        cashMovementId: true,
        order: { select: { orderNumber: true, id: true, locationId: true } },
      },
      orderBy: { paymentDate: 'asc' },
    });

    if (pending.length === 0) return 0;

    let ingresados = 0;

    for (const payment of pending) {
      // Defensa: si por cualquier motivo ya tiene movimiento, solo se baja la
      // bandera. Crear otro duplicaría el ingreso en el arqueo.
      if (payment.cashMovementId) {
        await tx.payment.update({
          where: { id: payment.id },
          data: { pendingCashEntry: false },
        });
        continue;
      }

      const receiptNumber = await this.consecutivesService.generateNumber(
        'CASH_RECEIPT',
        payment.order.locationId,
      );

      const fecha = payment.paymentDate.toISOString().slice(0, 10);
      const movement = await tx.cashMovement.create({
        data: {
          cashSessionId,
          receiptNumber,
          movementType: 'INCOME',
          paymentMethod: payment.paymentMethod,
          amount: payment.amount,
          description:
            `Abono a Orden ${payment.order?.orderNumber ?? ''} ` +
            `(registrado el ${fecha}, sin caja abierta)`,
          referenceType: 'ORDER',
          referenceId: payment.order?.id,
          performedById,
        },
        select: { id: true },
      });

      await tx.payment.update({
        where: { id: payment.id },
        data: { cashMovementId: movement.id, pendingCashEntry: false },
      });

      ingresados++;
    }

    this.logger.log(
      `Se ingresaron ${ingresados} abono(s) pendientes a la sesión ${cashSessionId}`,
    );

    return ingresados;
  }
}
