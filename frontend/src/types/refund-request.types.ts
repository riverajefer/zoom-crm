export type RefundRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type RefundPaymentMethod = 'CASH' | 'TRANSFER' | 'CARD';

/**
 * Por qué se devuelve la plata. `CREDIT_BALANCE` es el caso viejo —el cliente
 * pagó de más—, que no anula venta. Los demás son reversiones: el trabajo no se
 * entregó o no cumplió.
 */
export type RefundReason =
  | 'CREDIT_BALANCE'
  | 'QUALITY'
  | 'DELIVERY_DELAY'
  | 'FORCE_MAJEURE'
  | 'CLIENT_WITHDRAWAL'
  | 'OTHER';

export const REFUND_REASON_LABELS: Record<RefundReason, string> = {
  CREDIT_BALANCE: 'Saldo a favor del cliente',
  QUALITY: 'El trabajo no cumplió (calidad)',
  DELIVERY_DELAY: 'Incumplimiento en el tiempo de entrega',
  FORCE_MAJEURE: 'Fuerza mayor (corte de luz, falla de máquina)',
  CLIENT_WITHDRAWAL: 'El cliente desistió de la compra',
  OTHER: 'Otro motivo',
};

export interface RefundRequestUser {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}

export interface RefundRequestOrder {
  id: string;
  orderNumber: string;
  status?: string;
  subtotal?: string;
  discountAmount?: string;
  total?: string;
  paidAmount?: string;
  balance?: string;
  reversedAmount?: string;
  reversedNetAmount?: string;
  client?: { id: string; name: string };
}

export interface RefundRequestCashMovement {
  id: string;
  receiptNumber?: string;
  amount: string;
  paymentMethod: RefundPaymentMethod;
  movementType?: string;
  createdAt?: string;
}

/** Ítem de la orden que una solicitud anula, total o parcialmente. */
export interface RefundRequestItem {
  id: string;
  /** Null si el ítem se borró de la orden después de pedir la anulación. */
  orderItemId: string | null;
  description: string;
  quantity: string;
  unitPrice?: string;
  /** quantity * unitPrice, sin IVA ni descuentos. */
  amount: string;
}

export interface RefundRequest {
  id: string;
  orderId: string;
  /** Dinero que sale de la caja hacia el cliente. '0' si solo se anulan ítems. */
  refundAmount: string;
  /** Valor de la venta que se anula. '0' en una devolución de saldo a favor. */
  reversedAmount: string;
  /** De lo que valían los ítems anulados, lo que retiene la empresa. */
  retainedAmount?: string;
  /** Ítems anulados. Vacío en las devoluciones por monto. */
  items?: RefundRequestItem[];
  refundReason: RefundReason;
  paymentMethod: RefundPaymentMethod;
  bankEntity?: string | null;
  /**
   * Comprobante adjuntado al solicitar (solo transferencias). Documenta una
   * transferencia que ya se había hecho.
   */
  receiptFileId?: string | null;
  /** Comprobante que adjuntó Caja al pagar. Son dos momentos distintos. */
  executionReceiptFileId?: string | null;
  observation: string;
  status: RefundRequestStatus;

  requestedById: string;
  requestedBy?: RefundRequestUser;
  requestedAt: string;

  reviewedById?: string;
  reviewedBy?: RefundRequestUser;
  reviewedAt?: string;
  reviewNotes?: string;

  executedAt?: string;
  executedById?: string;
  executedBy?: RefundRequestUser;
  cashMovementId?: string;
  cashMovement?: RefundRequestCashMovement;

  order?: RefundRequestOrder;

  createdAt: string;
  updatedAt: string;
}

export interface CreateRefundRequestDto {
  orderId: string;
  refundAmount: number;
  reversedAmount?: number;
  /**
   * Anulación por ítems. Con ítems el servidor calcula la venta anulada y
   * `refundAmount` puede ser 0 (sin `paymentMethod`).
   */
  items?: { orderItemId: string; quantity: number }[];
  retainedAmount?: number;
  refundReason?: RefundReason;
  paymentMethod?: RefundPaymentMethod;
  bankEntity?: string | null;
  receiptFileId?: string;
  observation: string;
}

export interface ApproveRefundRequestDto {
  reviewNotes?: string;
}

export interface ExecuteRefundRequestDto {
  /** Comprobante de la transferencia que Caja acaba de hacer. */
  receiptFileId?: string;
}

export interface RejectRefundRequestDto {
  reviewNotes: string;
}
