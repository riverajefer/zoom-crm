import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma';
import {
  computeAvailableOverpayment,
  computeOrderBalance,
} from '../../common/utils/order-balance.util';
import { lockOrderForUpdate } from '../../common/utils/order-lock.util';

export interface CreditSource {
  orderId: string;
  orderNumber: string;
  orderDate: Date;
  available: Prisma.Decimal;
}

/**
 * Gestiona el saldo a favor del cliente (excedentes de OPs sobrepagadas) cuando se
 * usa como medio de pago de otra OP.
 *
 * El saldo NO es un monedero aparte: vive en las OPs con balance negativo. Aplicarlo
 * consiste en marcar cuánto del excedente de cada OP de origen quedó consumido
 * (`appliedCreditAmount`) y dejar la traza en `CreditBalanceApplication` para poder
 * revertirlo si el pago se elimina o se edita.
 */
@Injectable()
export class CreditBalanceService {
  private readonly logger = new Logger(CreditBalanceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * OPs del cliente con saldo a favor disponible, de la más antigua a la más reciente
   * (se consume FIFO). Excluye, opcionalmente, la OP destino.
   *
   * Las anuladas SÍ cuentan: anular no toca los pagos, y si el excedente de una OP
   * anulada no se pudiera usar, el cliente lo perdería — una OP anulada tampoco
   * admite devolución ni puede salir de ese estado. Además la ficha del cliente ya
   * mostraba ese saldo; el pago lo rechazaba.
   */
  async listCreditSources(
    clientId: string,
    options: { excludeOrderId?: string; tx?: Prisma.TransactionClient } = {},
  ): Promise<CreditSource[]> {
    const db = options.tx ?? this.prisma;

    const orders = await db.order.findMany({
      where: {
        clientId,
        ...(options.excludeOrderId && { id: { not: options.excludeOrderId } }),
      },
      select: {
        id: true,
        orderNumber: true,
        orderDate: true,
        total: true,
        paidAmount: true,
        appliedCreditAmount: true,
        reversedAmount: true,
      },
      orderBy: { orderDate: 'asc' },
    });

    return orders
      .map((order) => ({
        orderId: order.id,
        orderNumber: order.orderNumber,
        orderDate: order.orderDate,
        available: computeAvailableOverpayment({
          total: order.total,
          paidAmount: order.paidAmount,
          appliedCreditAmount: order.appliedCreditAmount,
          reversedAmount: order.reversedAmount,
        }),
      }))
      .filter((source) => source.available.greaterThan(0));
  }

  /**
   * Saldo a favor total disponible del cliente.
   */
  async getAvailableCredit(
    clientId: string,
    options: { excludeOrderId?: string; tx?: Prisma.TransactionClient } = {},
  ): Promise<Prisma.Decimal> {
    const sources = await this.listCreditSources(clientId, options);
    return sources.reduce(
      (sum, source) => sum.add(source.available),
      new Prisma.Decimal(0),
    );
  }

  /**
   * Valida que el cliente tenga saldo a favor suficiente antes de crear el pago.
   * Se usa para fallar temprano, antes de tocar la base de datos.
   */
  async assertEnoughCredit(
    clientId: string,
    amount: Prisma.Decimal | number | string,
    options: { excludeOrderId?: string; tx?: Prisma.TransactionClient } = {},
  ): Promise<void> {
    const requested = new Prisma.Decimal(amount.toString());
    if (requested.lessThanOrEqualTo(0)) {
      throw new BadRequestException(
        'El monto a aplicar del saldo a favor debe ser mayor a cero',
      );
    }

    const available = await this.getAvailableCredit(clientId, options);
    if (requested.greaterThan(available)) {
      throw new BadRequestException(
        `El saldo a favor disponible del cliente (${available.toString()}) es insuficiente para aplicar ${requested.toString()}`,
      );
    }
  }

  /**
   * Aplica `amount` del saldo a favor del cliente al pago indicado, consumiendo las
   * OPs de origen en orden FIFO. Debe ejecutarse dentro de una transacción.
   */
  async applyCredit(
    tx: Prisma.TransactionClient,
    params: {
      clientId: string;
      paymentId: string;
      amount: Prisma.Decimal | number | string;
      targetOrderId: string;
    },
  ): Promise<void> {
    let pending = new Prisma.Decimal(params.amount.toString());

    if (pending.lessThanOrEqualTo(0)) {
      throw new BadRequestException(
        'El monto a aplicar del saldo a favor debe ser mayor a cero',
      );
    }

    const sources = await this.listCreditSources(params.clientId, {
      excludeOrderId: params.targetOrderId,
      tx,
    });

    const available = sources.reduce(
      (sum, source) => sum.add(source.available),
      new Prisma.Decimal(0),
    );

    if (pending.greaterThan(available)) {
      throw new BadRequestException(
        `El saldo a favor disponible del cliente (${available.toString()}) es insuficiente para aplicar ${pending.toString()}`,
      );
    }

    for (const source of sources) {
      if (pending.lessThanOrEqualTo(0)) break;

      const taken = Prisma.Decimal.min(pending, source.available);

      await tx.creditBalanceApplication.create({
        data: {
          paymentId: params.paymentId,
          sourceOrderId: source.orderId,
          amount: taken,
        },
      });

      await this.bumpAppliedCredit(tx, source.orderId, taken);
      pending = pending.sub(taken);
    }
  }

  /**
   * Revierte todas las aplicaciones de saldo a favor asociadas a un pago y devuelve
   * el excedente a las OPs de origen. Debe llamarse ANTES de eliminar el pago (el
   * borrado en cascada se llevaría la traza). Debe ejecutarse dentro de una transacción.
   */
  async releaseCredit(
    tx: Prisma.TransactionClient,
    paymentId: string,
  ): Promise<void> {
    const applications = await tx.creditBalanceApplication.findMany({
      where: { paymentId },
      select: { id: true, sourceOrderId: true, amount: true },
    });

    if (applications.length === 0) return;

    for (const application of applications) {
      await this.bumpAppliedCredit(
        tx,
        application.sourceOrderId,
        new Prisma.Decimal(application.amount).negated(),
      );
    }

    await tx.creditBalanceApplication.deleteMany({ where: { paymentId } });
  }

  /**
   * Rehace la aplicación de saldo de un pago tras editarlo: libera lo aplicado y,
   * si el pago sigue siendo CREDIT_BALANCE, vuelve a aplicar el monto vigente.
   */
  async resyncCredit(
    tx: Prisma.TransactionClient,
    params: {
      paymentId: string;
      clientId: string;
      targetOrderId: string;
      amount: Prisma.Decimal | number | string;
      isCreditBalance: boolean;
    },
  ): Promise<void> {
    await this.releaseCredit(tx, params.paymentId);

    if (!params.isCreditBalance) return;

    const amount = new Prisma.Decimal(params.amount.toString());
    if (amount.lessThanOrEqualTo(0)) return;

    await this.applyCredit(tx, {
      clientId: params.clientId,
      paymentId: params.paymentId,
      amount,
      targetOrderId: params.targetOrderId,
    });
  }

  /**
   * Suma `delta` al crédito ya aplicado de una OP y recalcula su saldo pendiente.
   */
  private async bumpAppliedCredit(
    tx: Prisma.TransactionClient,
    orderId: string,
    delta: Prisma.Decimal,
  ): Promise<void> {
    // Bloquea la OP antes de leerla: ver `lockOrderForUpdate`.
    await lockOrderForUpdate(tx, orderId);
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        total: true,
        paidAmount: true,
        appliedCreditAmount: true,
        reversedAmount: true,
      },
    });

    if (!order) {
      this.logger.warn(
        `No se pudo ajustar el saldo a favor: la orden ${orderId} ya no existe`,
      );
      return;
    }

    let applied = new Prisma.Decimal(order.appliedCreditAmount).add(delta);
    if (applied.lessThan(0)) applied = new Prisma.Decimal(0);

    await tx.order.update({
      where: { id: orderId },
      data: {
        appliedCreditAmount: applied,
        balance: computeOrderBalance({
          total: order.total,
          paidAmount: order.paidAmount,
          appliedCreditAmount: applied,
          reversedAmount: order.reversedAmount,
        }),
      },
    });
  }
}
