/**
 * Tipos del historial unificado de aprobaciones y solicitudes de autorización
 * de una OP (anticipos, descuentos, propiedad de cliente, edición y anulación
 * de pagos, devoluciones de dinero, y solicitudes de edición general).
 */

export type OrderAuthEventType =
  | 'ADVANCE_PAYMENT'
  | 'DISCOUNT'
  | 'CLIENT_OWNERSHIP'
  | 'PAYMENT_EDIT'
  | 'PAYMENT_VOID'
  | 'EDIT_REQUEST'
  | 'REFUND'
  // Solo Zoom: anulación / entrega a crédito y cambio de asesor.
  | 'STATUS_CHANGE'
  | 'ADVISOR_CHANGE';

export type OrderAuthEventStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXPIRED';

interface AuthHistoryUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}

export interface OrderAuthHistoryEvent {
  id: string;
  type: OrderAuthEventType;
  status: OrderAuthEventStatus;
  reason: string | null;
  /** Monto asociado (anticipo, descuento, edición de pago); null si no aplica. */
  amount: string | null;
  /** Asesor destino (solo propiedad de cliente); null si no aplica. */
  advisor: AuthHistoryUser | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewNotes: string | null;
  requestedBy: AuthHistoryUser;
  reviewedBy: AuthHistoryUser | null;
  /**
   * El evento se ejecutó sin pasar por aprobación (solo `PAYMENT_VOID`): Caja o
   * Contabilidad anulando con la caja abierta. Cambia cómo se lee la línea de
   * revisión: nadie aprobó nada, alguien lo hizo.
   */
  direct?: boolean;
  /** Estado al que se pidió o se hizo el cambio (solo `STATUS_CHANGE`). */
  requestedStatus?: string;
  /**
   * Valor de venta anulado (solo `REFUND`); null si fue un simple saldo a favor.
   * Devolver un excedente y dar de baja un trabajo se leen muy distinto.
   */
  reversedAmount?: string | null;
  /**
   * Anulación por ítems (solo `REFUND`): qué se cayó y cuánto retuvo la empresa.
   * Vacío y null en las devoluciones por monto.
   */
  annulledItems?: { description: string; quantity: string; amount: string }[];
  retainedAmount?: string | null;
  /**
   * Tercer hito de una devolución (solo `REFUND`): gerencia autoriza y Caja
   * paga. "Autorizada" no significa que el dinero ya salió; null mientras siga
   * pendiente de pago.
   */
  executedAt?: string | null;
  executedBy?: AuthHistoryUser | null;
  /**
   * Comprobante adjuntado al solicitar (solo `REFUND` por transferencia). En
   * efectivo el soporte es el recibo de caja, así que no hay archivo.
   */
  receiptFileId?: string | null;
  /** Comprobante que adjuntó Caja al pagar. Son dos momentos distintos. */
  executionReceiptFileId?: string | null;
}
