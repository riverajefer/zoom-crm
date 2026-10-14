import { Prisma } from '../../generated/prisma';
import {
  PENDING_APPROVAL_PAYMENT_WHERE,
  computeSpendableOverpayment,
} from '../../common/utils/order-balance.util';

/**
 * Campos de una OP necesarios para saber cuánto saldo a favor aporta.
 *
 * Lo comparten el pago con saldo a favor (`CreditBalanceService`) y todas las
 * pantallas que muestran el saldo del cliente (ficha, listado, formulario de
 * OP). Si cada uno lo calculara por su lado, la pantalla ofrecería un saldo que
 * el pago después rechaza, o al revés.
 */
export const CREDIT_SOURCE_ORDER_SELECT = {
  total: true,
  paidAmount: true,
  appliedCreditAmount: true,
  reversedAmount: true,
  payments: {
    where: PENDING_APPROVAL_PAYMENT_WHERE,
    select: { amount: true },
  },
} satisfies Prisma.OrderSelect;

export type CreditSourceOrder = Prisma.OrderGetPayload<{
  select: typeof CREDIT_SOURCE_ORDER_SELECT;
}>;

/**
 * Saldo a favor gastable de una OP: su excedente sin los pagos que Caja aún no
 * aprueba.
 */
export function computeCreditSourceAvailable(
  order: CreditSourceOrder,
): Prisma.Decimal {
  return computeSpendableOverpayment({
    total: order.total,
    paidAmount: order.paidAmount,
    appliedCreditAmount: order.appliedCreditAmount,
    reversedAmount: order.reversedAmount,
    pendingPaidAmount: order.payments.reduce(
      (sum, payment) => sum.add(payment.amount),
      new Prisma.Decimal(0),
    ),
  });
}

/**
 * Saldo a favor total del cliente, para mostrarlo en pantalla.
 */
export function sumClientCreditBalance(
  orders: CreditSourceOrder[] | undefined,
): number {
  return (orders ?? [])
    .reduce(
      (sum, order) => sum.add(computeCreditSourceAvailable(order)),
      new Prisma.Decimal(0),
    )
    .toNumber();
}
