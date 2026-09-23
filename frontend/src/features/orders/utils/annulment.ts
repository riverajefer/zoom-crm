import type { Order } from '../../../types/order.types';

type AnnulmentMoney = Pick<
  Order,
  'total' | 'paidAmount' | 'appliedCreditAmount' | 'reversedAmount'
>;

export interface AnnulmentAmounts {
  /** Lo que el cliente pagó y no ha usado como saldo en otras órdenes. */
  unusedPaid: number;
  /** Lo máximo que la empresa puede retener al anular. */
  maxRetainable: number;
}

const toNumber = (value: string | undefined): number =>
  parseFloat(value || '0') || 0;

/**
 * Dinero en juego al anular una orden.
 *
 * Anular marca como anulada toda la venta menos lo que retiene la empresa, así
 * que lo pagado que no se retiene queda como saldo a favor del cliente. El tope
 * de lo retenible es lo pagado sin usar, sin pasar de lo que la venta aún vale
 * tras devoluciones anteriores.
 *
 * Copia de `computeMaxRetainableOnAnnul` del backend
 * (`common/utils/order-balance.util.ts`): si cambias una, cambia la otra.
 */
export const getAnnulmentAmounts = (order: AnnulmentMoney): AnnulmentAmounts => {
  const liveSale = toNumber(order.total) - toNumber(order.reversedAmount);
  const unusedPaid = Math.max(
    0,
    toNumber(order.paidAmount) - toNumber(order.appliedCreditAmount),
  );

  return {
    unusedPaid,
    maxRetainable: Math.max(0, Math.min(liveSale, unusedPaid)),
  };
};
