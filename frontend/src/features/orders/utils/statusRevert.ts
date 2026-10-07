import type { Order, OrderStatus } from '../../../types/order.types';

/**
 * Devolver la OP a Producción o a Confirmada no reabre su OT: una OT completada
 * es terminal. Quien retrocede tiene que saberlo antes de confirmar.
 */
export const revertLeavesCompletedWorkOrder = (
  order: Pick<Order, 'workOrders'>,
  targetStatus: OrderStatus,
): boolean =>
  (targetStatus === 'IN_PRODUCTION' || targetStatus === 'CONFIRMED') &&
  !!order.workOrders?.some((wo) => wo.status === 'COMPLETED');

export const COMPLETED_WORK_ORDER_NOTICE =
  'La orden de trabajo de esta orden ya está completada y no se reabre: solo cambia el estado de la orden de pedido.';
