import { computeAvailableRefund } from './refundAvailability';

/**
 * Cuentas de una anulación parcial por ítems.
 *
 * El usuario dice qué se cae y cuánto retiene la empresa; todo lo demás se
 * deduce. Es la copia en la UI de lo que hace `RefundRequestsService.create`
 * con `computeItemsSaleValue` y `computeAvailableOverpayment`
 * (`backend/src/common/utils/order-balance.util.ts`): si las cuentas se separan,
 * el formulario propone montos que el servicio rechaza.
 */
export interface PartialAnnulmentInput {
  /** Suma de `cantidad anulada * precio unitario` de los ítems elegidos. */
  itemsAmount: number;
  /** De lo que valían esos ítems, lo que se queda la empresa. */
  retainedAmount: number;
  orderSubtotal: number;
  orderTotal: number;
  /** Saldo de la orden hoy: positivo = el cliente debe, negativo = saldo a favor. */
  currentBalance: number;
  /** Abono neto del cliente. */
  paidAmount: number;
}

export interface PartialAnnulmentAmounts {
  /** Lo que valen los ítems dentro del total (con IVA y descuentos prorrateados). */
  itemsSaleValue: number;
  /** Venta que deja de existir: valor de los ítems menos lo retenido. */
  reversedAmount: number;
  /** Lo máximo que puede salir de la caja hacia el cliente. */
  availableToRefund: number;
  /** Saldo de la orden después de anular, antes de devolver dinero. */
  balanceAfter: number;
}

/** Cantidad del ítem que todavía no se ha anulado. */
export const getAliveQuantity = (item: {
  quantity: number | string;
  annulledQuantity?: string;
}): number =>
  Math.max(
    0,
    (Number(item.quantity) || 0) - (parseFloat(item.annulledQuantity ?? '0') || 0),
  );

/**
 * Lo que valen unos ítems dentro del total de la orden: su parte del subtotal,
 * llevada al total. Anular todos los ítems anula exactamente el total.
 */
export const computeItemsSaleValue = (
  itemsAmount: number,
  orderTotal: number,
  orderSubtotal: number,
): number =>
  orderSubtotal > 0 ? Math.round((itemsAmount * orderTotal) / orderSubtotal) : 0;

export const computePartialAnnulment = ({
  itemsAmount,
  retainedAmount,
  orderSubtotal,
  orderTotal,
  currentBalance,
  paidAmount,
}: PartialAnnulmentInput): PartialAnnulmentAmounts => {
  const itemsSaleValue = computeItemsSaleValue(
    itemsAmount,
    orderTotal,
    orderSubtotal,
  );
  const reversedAmount = Math.max(0, itemsSaleValue - retainedAmount);

  return {
    itemsSaleValue,
    reversedAmount,
    availableToRefund: computeAvailableRefund({
      currentBalance,
      reversedAmount,
      paidAmount,
    }),
    balanceAfter: currentBalance - reversedAmount,
  };
};
