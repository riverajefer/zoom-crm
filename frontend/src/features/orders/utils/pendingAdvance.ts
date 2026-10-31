import type { Order } from '../../../types/order.types';

export interface PendingAdvanceInfo {
  /** Hay al menos un abono registrado pero aún no aprobado por Caja */
  hasPendingAdvance: boolean;
  /** Monto total de los abonos pendientes de aprobación */
  pendingAmount: number;
  /** IDs de los pagos que están pendientes de aprobación */
  pendingPaymentIds: string[];
  /** Abono realmente aplicado (aprobado por Caja) */
  appliedPaidAmount: number;
  /** Saldo a cobrar sin descontar los abonos pendientes, neto de devoluciones */
  effectiveBalance: number;
}

/**
 * Parte del excedente de esta orden que ya se usó para pagar otras órdenes.
 * Ese saldo ya no está disponible: ni como saldo a favor ni para devolución.
 */
const getAppliedCredit = (order: Order): number =>
  parseFloat(order.appliedCreditAmount || '0') || 0;

/**
 * Valor de venta anulado por devoluciones ya pagadas.
 *
 * Reduce lo que la orden vale, no lo que el cliente abonó. Sin restarlo, una OP
 * a la que se le devolvió la plata sigue mostrando como saldo a cobrar un
 * trabajo que ya no existe: es el mismo saldo fantasma que el backend evita en
 * `computeOrderBalance`, y esta es la copia de esa fórmula que vive en la UI.
 */
const getReversedAmount = (order: Order): number =>
  parseFloat(order.reversedAmount || '0') || 0;

/**
 * Los abonos registrados al crear la orden quedan pendientes de aprobación por
 * Caja, pero el backend ya los suma a `paidAmount` (y los descuenta de
 * `balance`) desde el momento del registro. Para efectos de presentación no
 * deben considerarse aplicados hasta que Caja los apruebe.
 */
export const getPendingAdvanceInfo = (order: Order): PendingAdvanceInfo => {
  const total = parseFloat(order.total || '0');
  const paidAmount = parseFloat(order.paidAmount || '0');

  const pendingPaymentIds = (order.advancePaymentApprovals || [])
    .filter((approval) => approval.status === 'PENDING' && approval.paymentId)
    .map((approval) => approval.paymentId as string);

  let pendingAmount = (order.payments || [])
    .filter((payment) => pendingPaymentIds.includes(payment.id))
    .reduce((sum, payment) => sum + parseFloat(payment.amount || '0'), 0);

  // Respaldo: la orden está marcada como pendiente pero no se pudo asociar el
  // pago (p. ej. la solicitud no vino en la respuesta).
  if (pendingAmount === 0 && order.advancePaymentStatus === 'PENDING') {
    pendingAmount = paidAmount;
  }

  // Nunca puede haber más pendiente que lo abonado.
  pendingAmount = Math.min(Math.max(pendingAmount, 0), Math.max(paidAmount, 0));

  const appliedPaidAmount = paidAmount - pendingAmount;
  const balance =
    total -
    getReversedAmount(order) -
    appliedPaidAmount +
    getAppliedCredit(order);

  return {
    hasPendingAdvance: pendingAmount > 0,
    pendingAmount,
    pendingPaymentIds,
    appliedPaidAmount,
    // Una OP anulada no se cobra, pero su saldo a favor sigue siendo del cliente.
    effectiveBalance:
      order.status === 'ANULADO' ? Math.min(balance, 0) : balance,
  };
};
