import { OrderStatus } from '../../generated/prisma';

/**
 * Flujo secuencial estricto de estados de orden:
 * DRAFT → CONFIRMED → IN_PRODUCTION → READY → PAID → DELIVERED | DELIVERED_ON_CREDIT → WARRANTY
 *
 * "Entregada a Crédito" es la excepción: se entrega sin pago completo.
 */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.DRAFT]: [OrderStatus.CONFIRMED, OrderStatus.ANULADO],
  [OrderStatus.CONFIRMED]: [OrderStatus.IN_PRODUCTION, OrderStatus.ANULADO],
  [OrderStatus.IN_PRODUCTION]: [OrderStatus.READY, OrderStatus.ANULADO],
  [OrderStatus.READY]: [OrderStatus.PAID, OrderStatus.DELIVERED_ON_CREDIT, OrderStatus.ANULADO],
  [OrderStatus.PAID]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [OrderStatus.WARRANTY],
  [OrderStatus.DELIVERED_ON_CREDIT]: [OrderStatus.WARRANTY, OrderStatus.ANULADO],
  [OrderStatus.WARRANTY]: [OrderStatus.DELIVERED],
  [OrderStatus.RETURNED]: [],
  [OrderStatus.ANULADO]: [],
};

/**
 * `RETURNED` ("Devolución de dinero") no aparece en `ALLOWED_TRANSITIONS` a
 * propósito: no es un estado que el usuario elija en el selector, sino la
 * consecuencia de que Caja pague una devolución que anula la venta completa.
 * Lo pone el sistema desde `RefundRequestsService.execute()`, y es terminal.
 */

export function getValidNextStatuses(currentStatus: OrderStatus): OrderStatus[] {
  return ALLOWED_TRANSITIONS[currentStatus] || [];
}

export function isValidTransition(currentStatus: OrderStatus, newStatus: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[currentStatus]?.includes(newStatus) ?? false;
}

/**
 * Retrocesos permitidos: un solo paso hacia atrás, y solo entre estados en los
 * que la OP sigue viva y sin entregar.
 *
 * Quedan fuera a propósito:
 * - Volver a `DRAFT`: un borrador se puede eliminar y admite agregar ítems, y la
 *   OP ya puede tener pagos.
 * - Salir de `DELIVERED`, `DELIVERED_ON_CREDIT` o `WARRANTY`: la entrega es lo
 *   que hace comisionar la OP, y esa comisión puede estar ya liquidada.
 * - Salir de `ANULADO` o `RETURNED`: son terminales.
 *
 * Un retroceso siempre exige motivo, y autorización del administrador para
 * quien no lo es. No toca la OT: una OT completada sigue completada.
 */
export const BACKWARD_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus>> = {
  [OrderStatus.IN_PRODUCTION]: OrderStatus.CONFIRMED,
  [OrderStatus.READY]: OrderStatus.IN_PRODUCTION,
  [OrderStatus.PAID]: OrderStatus.READY,
};

export function isBackwardTransition(currentStatus: OrderStatus, newStatus: OrderStatus): boolean {
  return BACKWARD_TRANSITIONS[currentStatus] === newStatus;
}
